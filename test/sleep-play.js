// Night rules through the real UI: the 21:00 nudge, staying up, forced sleep at midnight, the extra-sleep bonus,
// and old saves (v3, v4) migrating. Screenshots go to test/shots (or argv[2]). Usage: node test/sleep-play.js [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.TS_CHROMIUM || undefined });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::|fonts/.test(m.text())) errors.push('console: ' + m.text()); });
  const fail = (msg) => { throw new Error(msg); };
  const idle = async () => { for (let i = 0; i < 200; i++) { const b = await page.evaluate(() => TS.isBusy()); if (!b) return; await page.waitForTimeout(60); } fail('stuck busy'); };
  const st = () => page.evaluate(() => { const s = TS.state; return { day: s.day, time: s.time, loc: s.loc, coins: s.coins, happy: s.happy, phase: s.phase, slept: s.slept, bedAt: s.bedAt, v: s.v }; });
  const act = async (id) => { await page.evaluate((i) => TS.act(i), id); await idle(); };
  const travel = async (d, m) => { await page.evaluate(([dd, mm]) => TS.travel(dd, mm), [d, m]); await idle(); };
  const bubble = () => page.evaluate(() => document.getElementById('bubbleText').textContent);
  const bedChip = () => page.evaluate(() => document.querySelector('[data-act="bed"] .cchip').textContent);
  const shot = (name) => page.screenshot({ path: `${out}/sleep-${name}.png` });

  await page.goto(file); await page.waitForTimeout(300);
  await page.evaluate(() => { TS.settings.voice = false; TS.settings.sound = false; });
  await page.click('#btnPlay'); await page.waitForTimeout(300);

  // ---- day 1 (no lunchbox yet): work both shifts, come home, then stay up ----
  await act('cook'); await travel('bakery', 'walk');
  while ((await st()).time < 9 * 60) await act('rest');
  await act('work'); await act('cafe'); await act('work'); await travel('home', 'walk'); await act('cook');
  let s = await st(); if (s.phase !== 'day') fail('day 1 ended early: ' + JSON.stringify(s));

  while ((await st()).time < 21 * 60) await act('rest');
  s = await st(); if (s.phase !== 'day') fail('21:00 should not end the day');
  if (!/bedtime/i.test(await bubble())) fail('no bedtime nudge: ' + await bubble());
  await shot('1-bedtime-nudge');
  if (!/10 h/.test(await bedChip())) fail('bed at 21:00 should say 10 h, got ' + await bedChip());

  // stay up to midnight: the day ends on the spot, and that is a short night
  while ((await st()).phase === 'day') await act('rest');
  s = await st();
  if (s.bedAt !== 24 * 60) fail('midnight should end the day, got ' + JSON.stringify(s));
  await page.waitForTimeout(2800);
  const sumSleep = await page.evaluate(() => document.getElementById('sumSleep').textContent);
  if (!/7 hours/.test(sumSleep)) fail('summary should say 7 hours: ' + sumSleep);
  if (/sleepy|slow/i.test(sumSleep)) fail('a short night must not threaten a slow tomorrow: ' + sumSleep);
  await shot('2-summary-short-night');

  await page.click('#btnSleep'); await page.waitForTimeout(6000);
  await page.click('#btnWake'); await page.waitForTimeout(400);

  // ---- day 2: nothing is carried over — no chip, no slowdown ----
  s = await st();
  if (s.day !== 2 || s.slept !== 7 * 60) fail('bad day 2: ' + JSON.stringify(s));
  if (await page.evaluate(() => !!document.getElementById('sleepyChip'))) fail('the sleepy chip should no longer exist');
  const walk = await page.evaluate(() => TS.engine.travelOptions(TS.state).find(o => o.mode === 'walk').minutes);
  if (walk !== 60) fail('walking must never be slowed, got ' + walk);
  const cook = await page.evaluate(() => TS.engine.actions(TS.state).find(a => a.id === 'cook').minutes);
  if (cook !== 30) fail('cooking must never be slowed, got ' + cook);
  await shot('3-morning-after-a-short-night');

  // ---- an early night pays a happiness bonus ----
  await page.evaluate(() => { TS.state.time = 19 * 60; TS.state.happy = 2; });
  await act('rest'); // re-render at 19:30
  if (!/11½ h|11 h/.test(await bedChip())) fail('bed at 19:30 should be about 11½ h, got ' + await bedChip());
  await page.evaluate(() => { TS.state.time = 19 * 60; });
  await act('rest');
  const before = (await st()).happy;
  await page.evaluate(() => TS.act('bed')); await page.waitForTimeout(2600);
  const sum2 = await page.evaluate(() => document.getElementById('sumSleep').textContent);
  if (!/happier/i.test(sum2)) fail('an early night should promise a happier morning: ' + sum2);
  await shot('4-summary-long-night');
  await page.click('#btnSleep'); await page.waitForTimeout(6000);
  await page.click('#btnWake'); await page.waitForTimeout(400);
  const after = (await st()).happy;
  if (!(after > before)) fail(`extra sleep should wake you happier (${before} -> ${after})`);

  // ---- old saves migrate: v4 carried sleep debt, weather and a clothes wardrobe, all gone now ----
  const v4 = { v: 4, avatar: '🦊', seed: 42, day: 5, time: 18 * 60, coins: 9, loc: 'home', tummy: 4, happy: 8, fridge: 6, lunchbox: 0,
    wardrobe: { raincoat: true, hat: true }, toys: ['ball', 'raincoat'], wish: 'jacket', wishReadyTold: false,
    weather: 'rain', forecast: 'cold', timeline: [], today: { earned: 8, spent: 0 }, flags: { firstWork: true }, phase: 'day',
    msgs: [], lastBand: 'dinner', totals: { earned: 30, spent: 21 }, owed: 120, slept: 6 * 60, bedAt: null };
  await page.goto(file); await page.waitForTimeout(300); // start screen: nothing running, so leaving won't re-save over the injected one
  await page.evaluate((save) => { localStorage.setItem('timespent.save.v1', JSON.stringify(save));
    localStorage.setItem('timespent.settings.v1', JSON.stringify({ lang: 'en', clock24: false, sound: false, voice: false, avatar: '🦊' })); }, v4);
  await page.reload(); await page.waitForTimeout(300); await page.click('#btnContinue'); await page.waitForTimeout(400);
  const m = await page.evaluate(() => { const s = TS.state; return { v: s.v, day: s.day, time: s.time, owed: s.owed, weather: s.weather, happy: s.happy, toys: s.toys, wardrobe: s.wardrobe, wish: s.wish }; });
  if (m.v !== 5) fail('v4 save did not migrate: ' + JSON.stringify(m));
  if (m.owed !== undefined || m.weather !== undefined) fail('debt and weather should be dropped: ' + JSON.stringify(m));
  if (m.happy > 6) fail('happy should be rescaled to 0-6: ' + JSON.stringify(m));
  if (m.toys.includes('raincoat') || m.wardrobe.raincoat) fail('clothes should be dropped: ' + JSON.stringify(m));
  if (!m.wardrobe.hat) fail('the party hat should survive: ' + JSON.stringify(m));
  if (m.wish !== null) fail('a wish for a removed item should be cleared: ' + JSON.stringify(m));
  await act('cook'); await act('rest'); // 19:00: bed card shows 12 h
  if (!/12 h/.test(await bedChip())) fail('migrated save bed card: ' + await bedChip());
  await shot('5-migrated-v4-save');

  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
  console.log('SLEEP UI OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
