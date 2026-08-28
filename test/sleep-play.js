// Sleep rules through the real UI: stay up past 21:00, forced sleep at midnight, a sleepy (slow) morning, recovery,
// plus an old (v3) save migrating. Screenshots go to test/shots (or argv[2]). Usage: node test/sleep-play.js [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const E = require('../src/engine.js');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::|fonts/.test(m.text())) errors.push('console: ' + m.text()); });
  const fail = (msg) => { throw new Error(msg); };
  const idle = async () => { for (let i = 0; i < 200; i++) { const b = await page.evaluate(() => TS.isBusy()); if (!b) return; await page.waitForTimeout(60); } fail('stuck busy'); };
  const st = () => page.evaluate(() => { const s = TS.state; return { day: s.day, time: s.time, loc: s.loc, coins: s.coins, phase: s.phase, owed: s.owed, slept: s.slept, bedAt: s.bedAt, v: s.v }; });
  const act = async (id) => { await page.evaluate((i) => TS.act(i), id); await idle(); };
  const travel = async (d, m) => { await page.evaluate(([dd, mm]) => TS.travel(dd, mm), [d, m]); await idle(); };
  const bubble = () => page.evaluate(() => document.getElementById('bubbleText').textContent);
  const shot = (name) => page.screenshot({ path: `${out}/sleep-${name}.png` });

  await page.goto(file); await page.waitForTimeout(300);
  await page.evaluate(() => { TS.settings.voice = false; TS.settings.sound = false; });
  await page.click('#btnPlay'); await page.waitForTimeout(300);

  // ---- day 1: normal working day, then stay up ----
  await act('cook'); await act('pack'); await travel('bakery', 'walk'); await act('work'); await act('lunchbox'); await act('work'); await travel('home', 'walk'); await act('cook');
  let s = await st(); if (s.time !== 19 * 60) fail('expected 19:00, got ' + s.time);
  while ((await st()).time < 21 * 60) await act('rest');
  s = await st(); if (s.phase !== 'day') fail('21:00 should not end the day any more');
  if (!/bedtime/i.test(await bubble())) fail('no bedtime nudge: ' + await bubble());
  await page.waitForTimeout(200); await shot('1-bedtime-nudge');
  const bedChip = await page.evaluate(() => document.querySelector('[data-act="bed"] .cchip').textContent);
  if (!/10 h/.test(bedChip)) fail('bed card should say 10 h, got ' + bedChip);
  while ((await st()).time < 23 * 60) await act('rest');
  if (!/11 o'clock/.test(await bubble())) fail('no last call: ' + await bubble());
  await shot('2-last-call');
  await act('rest'); // 23:30: the bed card now warns
  const bedChip2 = await page.evaluate(() => { const c = document.querySelector('[data-act="bed"] .cchip'); return c.className + '|' + c.textContent; });
  if (!/spend/.test(bedChip2) || !/7½ h/.test(bedChip2)) fail('bed card should warn 7½ h, got ' + bedChip2);
  await shot('3-bed-card-warns');
  // a tap on a place at night is refused
  await page.click('[data-place="shops"]'); await page.waitForTimeout(100);
  if (!/night/i.test(await bubble())) fail('night travel should be refused: ' + await bubble());
  await act('rest'); // -> midnight
  s = await st(); if (s.phase !== 'summary' || s.bedAt !== 24 * 60) fail('midnight should end the day: ' + JSON.stringify(s));
  await page.waitForTimeout(3000);
  const sumOpen = await page.evaluate(() => document.getElementById('summary').classList.contains('open')); if (!sumOpen) fail('summary not open');
  const sumSleep = await page.evaluate(() => document.getElementById('sumSleep').textContent);
  if (!/7 hours/.test(sumSleep) || !/sleepy/i.test(sumSleep)) fail('summary sleep line wrong: ' + sumSleep);
  await shot('4-summary-midnight');
  await page.click('#btnSleep'); await page.waitForTimeout(6000);
  const morningOpen = await page.evaluate(() => document.getElementById('morning').classList.contains('open')); if (!morningOpen) fail('morning overlay did not open');
  const mText = await page.evaluate(() => document.getElementById('mText').textContent);
  if (!/only slept 7 hours/.test(mText) || !/nine o'clock at night/.test(mText)) fail('morning text wrong: ' + mText);
  await shot('5-sleepy-morning');
  await page.click('#btnWake'); await page.waitForTimeout(300);

  // ---- day 2: sleepy ----
  s = await st(); if (s.owed !== 60 || s.slept !== 7 * 60) fail('day 2 should owe 1 h: ' + JSON.stringify(s));
  const chipVisible = await page.evaluate(() => !document.getElementById('sleepyChip').classList.contains('hidden')); if (!chipVisible) fail('sleepy chip hidden');
  const zz = await page.evaluate(() => !!document.querySelector('#avatar .zz')); if (!zz) fail('no zz on avatar');
  const bedAt7 = await page.evaluate(() => { const c = document.querySelector('[data-act="bed"]'); return c && c.textContent; });
  if (!bedAt7 || !/24 h/.test(bedAt7)) fail('bed card should be there at 7:00 showing 24 h: ' + bedAt7);
  await page.evaluate(() => { TS.state.fridge = 6; }); // enough food for the day (no shopping in this script)
  await act('cook'); await act('pack');
  await page.click('[data-place="bakery"]'); await page.waitForTimeout(300);
  const walkDiscs = await page.evaluate(() => document.querySelector('[data-mode="walk"] .tchips').innerHTML);
  if (!/💤/.test(walkDiscs) || (walkDiscs.match(/<svg/g) || []).length !== 2) fail('walk should show 1 h + a purple ½ h: ' + walkDiscs.length);
  await shot('6-travel-sheet-slow');
  await page.click('[data-mode="walk"]'); await idle();
  s = await st(); if (s.time !== 9 * 60 + 30) fail('slow walk should arrive 9:30, got ' + s.time);
  if (!/half an hour longer/.test(await bubble())) fail('no slowToday message: ' + await bubble());
  const workLate = await page.evaluate(() => document.querySelector('[data-act="work"]').textContent);
  if (!/Late/.test(workLate)) fail('work card should say Late: ' + workLate);
  await shot('7-late-for-work');
  await act('work');
  if (!/slow today/.test(await bubble())) fail('no wasLateSleepy: ' + await bubble());
  await act('lunchbox'); await act('work'); await travel('home', 'bus'); await act('cook');
  s = await st(); if (s.time !== 19 * 60) fail('expected 19:00 on day 2, got ' + s.time);
  // bed at 21:00 clears the 1 h owed (10 h night >= 9 h needed)
  while ((await st()).time < 21 * 60) await act('rest');
  await act('bed'); await page.waitForTimeout(2500);
  const sumSleep2 = await page.evaluate(() => document.getElementById('sumSleep').textContent);
  if (!/10 hours/.test(sumSleep2) || !/caught up/i.test(sumSleep2) || !/\+1\)/.test(sumSleep2)) fail('summary 2 wrong (expect caught up + bonus +1): ' + sumSleep2);
  await shot('8-summary-caught-up');
  await page.click('#btnSleep'); await page.waitForTimeout(6000);
  const mText2 = await page.evaluate(() => document.getElementById('mText').textContent);
  if (!/not sleepy any more/.test(mText2)) fail('rested morning text wrong: ' + mText2);
  await page.click('#btnWake'); await page.waitForTimeout(300);
  if (!/extra happy today \(\+1\)/.test(await bubble())) fail('no extra-sleep message in the bubble: ' + await bubble());
  s = await st(); if (s.owed !== 0) fail('day 3 should owe nothing');
  const chipHidden = await page.evaluate(() => document.getElementById('sleepyChip').classList.contains('hidden')); if (!chipHidden) fail('sleepy chip should be hidden again');

  // ---- PT strings render too ----
  await page.evaluate(() => document.querySelector('#langSeg [data-lang="pt"]') && TS.settings); // (language switch lives in settings; use the API)
  await page.evaluate(() => { TS.settings.lang = 'pt'; });
  await page.reload(); await page.waitForTimeout(300); await page.click('#btnContinue'); await page.waitForTimeout(300);
  await page.evaluate(() => { TS.settings.voice = false; TS.settings.sound = false; });
  s = await st(); if (s.day !== 3) fail('reload lost the day');

  // ---- old v3 save migrates ----
  const v3 = { v: 3, avatar: '🦊', seed: 42, day: 5, time: 18 * 60, coins: 9, loc: 'home', tummy: 4, happy: 8, fridge: 6, lunchbox: 0, wardrobe: {}, toys: ['ball'], wish: null, wishReadyTold: false,
    weather: 'sun', forecast: 'sun', timeline: [], today: { earned: 8, spent: 0 }, flags: { firstWork: true }, phase: 'day', msgs: [], lastBand: 'dinner', totals: { earned: 30, spent: 21 } };
  await page.goto(file); await page.waitForTimeout(300); // start screen: no running game, so leaving the page won't re-save over the injected one
  await page.evaluate((save) => { localStorage.setItem('timespent.save.v1', JSON.stringify(save)); localStorage.setItem('timespent.settings.v1', JSON.stringify({ lang: 'en', clock24: true, sound: false, voice: false, avatar: '🦊' })); }, v3);
  await page.reload(); await page.waitForTimeout(300); await page.click('#btnContinue'); await page.waitForTimeout(300);
  s = await st(); if (s.v !== 4 || s.owed !== 0 || s.day !== 5 || s.time !== 18 * 60) fail('v3 save did not migrate: ' + JSON.stringify(s));
  await act('cook'); await act('rest'); // 19:00: bed card shows 12 h
  const bedChip3 = await page.evaluate(() => document.querySelector('[data-act="bed"] .cchip').textContent); if (!/12 h/.test(bedChip3)) fail('migrated save bed card: ' + bedChip3);

  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
  console.log('SLEEP UI OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
