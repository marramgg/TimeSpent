// Drives the child's game through the real UI for a school week: the routine, school, the evening and bedtime.
// Checks the things a five-year-old needs — cards that speak, a grid that fits the phone, and a bed card
// that says which morning it buys.
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const E = require('../src/engine.js');
const fail = (m) => { console.error(m); process.exit(1); };

// A grown-up's save from before the child's game existed. Picking the child and tapping "Keep playing" used to load
// this and offer to cook and eat: the picker only ever applied to new games.
const GROWNUP_SAVE = JSON.stringify({
  v: 5, avatar: '\u{1F43B}', seed: 123, day: 3, time: 8 * 60, coins: 6, loc: 'home',
  tummy: 3, happy: 4, fridge: 4, lunchbox: 0, wardrobe: {}, toys: [], wish: null, wishReadyTold: false,
  timeline: [], today: { earned: 0, spent: 0 }, flags: {}, phase: 'day', msgs: [], lastBand: 'breakfast',
  totals: { earned: 0, spent: 0 }, slept: 600, bedAt: null,
});

// Every way into a game leads to the game that was picked, whatever is already saved on the device.
async function startRoutes(browser) {
  const run = async (name, seed, steps) => {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(file); await page.waitForTimeout(250);
    if (seed) { await page.evaluate((v) => localStorage.setItem('timespent.save.v1', v), seed); await page.reload(); await page.waitForTimeout(300); }
    await page.evaluate(() => { TS.settings.voice = false; });
    for (const sel of steps) {
      await page.evaluate((q) => { const el = document.querySelector(q); if (el && !el.classList.contains('hidden')) el.click(); }, sel);
      await page.waitForTimeout(250);
    }
    const out = await page.evaluate(() => TS.state && { mode: TS.state.mode, day: TS.state.day, acts: TS.engine.actions(TS.state).map(a => a.id) });
    await ctx.close();
    if (errs.length) fail(`${name}: page errors ${errs}`);
    return out;
  };
  const cook = (o) => o && o.acts.includes('cook');

  const fresh = await run('fresh', null, ['[data-mode="child"]', '#btnPlay', '#btnWakeEarly']);
  if (!fresh || fresh.mode !== 'child' || cook(fresh)) fail('a fresh child game is not the child game: ' + JSON.stringify(fresh));

  const grown = await run('grown-up', null, ['[data-mode="adult"]', '#btnPlay']);
  if (!grown || grown.mode !== 'adult' || !cook(grown)) fail('the grown-up game is not the grown-up game: ' + JSON.stringify(grown));

  // the reported bug: an old grown-up save must never be what "Keep playing" gives you after picking the child
  const kept = await run('old save + child + keep playing', GROWNUP_SAVE, ['[data-mode="child"]', '#btnContinue', '#btnPlay', '#btnWakeEarly']);
  if (!kept || kept.mode !== 'child' || cook(kept)) fail('picking the child still continued a grown-up save: ' + JSON.stringify(kept));

  // and the grown-up's own day is still there, untouched, on the other tile
  const back = await run('old save + grown-up + keep playing', GROWNUP_SAVE, ['[data-mode="adult"]', '#btnContinue']);
  if (!back || back.mode !== 'adult' || back.day !== 3) fail('the saved grown-up day was lost: ' + JSON.stringify(back));
  console.log('start routes ok');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.TS_CHROMIUM || undefined });
  await startRoutes(browser);
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(file); await page.waitForTimeout(400);
  await page.evaluate(() => { TS.settings.voice = false; });

  // the child game is the default, and day 1 starts by asking about the real morning
  const mode = await page.evaluate(() => TS.settings.mode);
  if (mode !== 'child') fail('the child game should be the default');
  await page.screenshot({ path: `${out}/child-start.png` });
  await page.click('#btnPlay'); await page.waitForTimeout(300);
  if (!await page.evaluate(() => document.getElementById('wakeAsk').classList.contains('open'))) fail('day 1 did not ask about waking up');
  await page.screenshot({ path: `${out}/child-wake-question.png` });
  await page.click('#btnWakeEarly'); await page.waitForTimeout(400);
  if (await page.evaluate(() => TS.state.time) !== E.CHILD.wakeEarly) fail('an early answer should start the day at 7:00');

  const idle = async () => { for (let i = 0; i < 120; i++) { if (!await page.evaluate(() => TS.isBusy())) return; await page.waitForTimeout(80); } fail('stuck busy'); };
  const st = () => page.evaluate(() => { const s = TS.state; return { day: s.day, time: s.time, loc: s.loc, coins: s.coins, tummy: s.tummy, happy: s.happy, phase: s.phase, chores: s.chores, wake: s.wake }; });
  const acts = () => page.evaluate(() => TS.engine.actions(TS.state).filter(a => a.enabled).map(a => a.id));
  const act = (id) => page.evaluate((i) => TS.act(i), id);
  const go = (dest) => page.evaluate((d) => TS.travel(d, 'walk'), dest);

  // no action card may sit entirely below the fold on a 390x664 phone
  const fits = async (where) => {
    const bad = await page.evaluate(() => {
      const box = document.getElementById('actions').getBoundingClientRect();
      return [...document.querySelectorAll('#actions .action')].filter(el => el.getBoundingClientRect().top >= Math.min(box.bottom, innerHeight)).length;
    });
    if (bad) fail(`${bad} card(s) below the fold ${where}`);
  };

  const days = [], shot = {};
  for (let guard = 0; guard < 500; guard++) {
    await idle();
    const s = await st();
    if (s.day > 5) break;
    if (s.phase === 'summary') {
      if (!await page.evaluate(() => document.getElementById('summary').classList.contains('open'))) { await page.waitForTimeout(400); continue; }
      if (s.day === 2) await page.screenshot({ path: `${out}/child-summary.png` });
      days.push({ day: s.day, health: s.tummy, happy: s.happy });
      await page.click('#btnSleep'); await page.waitForTimeout(6200);
      if (!await page.evaluate(() => document.getElementById('morning').classList.contains('open'))) fail('the morning did not arrive');
      await page.click('#btnWake'); await page.waitForTimeout(300);
      continue;
    }
    const a = await acts();
    const first = (...ids) => ids.find(id => a.includes(id));
    if (s.loc === 'home' && s.day === 1 && s.time === E.CHILD.wakeEarly) { await fits('in the morning'); await page.screenshot({ path: `${out}/child-morning.png` }); }
    if (s.loc === 'school') {
      if (a.includes('school')) { if (!shot.school) { shot.school = true; await fits('at school'); await page.screenshot({ path: `${out}/child-school.png` }); } await act('school'); }
      else await go('home');
      continue;
    }
    if (s.loc !== 'home') { await go('home'); continue; }
    if (s.time < E.CHILD.lunchAt) {
      const morning = first('breakfast', 'teethAM', 'dress');
      if (morning) { await act(morning); continue; }
      if (!E.isWeekend(s.day)) {
        if (s.time + E.CHILD.walk >= E.CHILD.schoolIn - 15) await go('school'); else await act('playHome');
        continue;
      }
    }
    if (s.time >= 18 * 60 && s.day === 2 && !shot.evening) { shot.evening = true; await fits('in the evening'); await page.screenshot({ path: `${out}/child-evening.png` }); }
    const evening = first('wash', 'tidy', 'lunch', 'dinner', 'bath', 'teethPM');
    if (evening) { await act(evening); continue; }
    if (a.includes('bed') && s.time >= E.CHILD.goodBed) { await act('bed'); continue; }
    await act('playHome');
  }

  const final = await st();
  console.log('final', JSON.stringify(final));
  console.log('days', JSON.stringify(days));
  if (final.day <= 5) fail('the school week never finished');
  if (final.tummy < 3 || final.happy < 3) fail('a child who keeps the routine should end the week well');

  // the bed card must say which morning it buys, out loud
  const bed = await page.evaluate(() => {
    TS.state.time = TS.engine.CHILD.goodBed; TS.render();
    const el = [...document.querySelectorAll('#actions .action')].find(x => x.dataset.act === 'bed');
    const said = []; const real = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (u) => said.push(u.text); TS.settings.voice = true;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    TS.settings.voice = false; speechSynthesis.speak = real;
    return { chip: el.querySelector('.cchip').textContent.trim(), said: said[0] || '' };
  });
  console.log('bed card', JSON.stringify(bed));
  if (!/7/.test(bed.chip)) fail('the bed card does not show the wake-up time');
  if (!bed.said || bed.said.length < 4) fail('the bed card did not speak');

  console.log(errors.length ? errors : 'no page errors');
  if (errors.length) process.exit(1);
  await page.reload(); await page.waitForTimeout(400); await page.click('#btnContinue'); await page.waitForTimeout(500);
  const after = await st();
  console.log('after reload', JSON.stringify({ day: after.day, time: after.time, phase: after.phase }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
