// Drives the real UI through ~9 days using the TS test API, checking for errors and stuck states.
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(file); await page.waitForTimeout(400);
  await page.evaluate(() => { TS.settings.voice = false; });
  await page.click('#btnPlay'); await page.waitForTimeout(400);
  const idle = async () => { for (let i = 0; i < 100; i++) { const b = await page.evaluate(() => TS.isBusy()); if (!b) return; await page.waitForTimeout(80); } throw new Error('stuck busy'); };
  const st = () => page.evaluate(() => { const s = TS.state; return { day: s.day, time: s.time, loc: s.loc, coins: s.coins, tummy: s.tummy, happy: s.happy, fridge: s.fridge, phase: s.phase, toys: s.toys, wish: s.wish, weather: s.weather, wardrobe: s.wardrobe }; });
  const E = require('../src/engine.js');
  const shots = new Set();
  for (let guard = 0; guard < 400; guard++) {
    await idle();
    let s = await st();
    if (s.day > 9) break;
    if (s.phase === 'summary') {
      const open = await page.evaluate(() => document.getElementById('summary').classList.contains('open'));
      if (!open) { await page.waitForTimeout(500); continue; }
      if (!shots.has('summary' + s.day) && s.day === 3) { await page.screenshot({ path: `${out}/play-summary-day3.png` }); shots.add('summary' + s.day); }
      await page.click('#btnSleep'); await page.waitForTimeout(6000);
      const morningOpen = await page.evaluate(() => document.getElementById('morning').classList.contains('open'));
      if (!morningOpen) throw new Error('morning overlay did not open');
      s = await st();
      if (s.day === 6) await page.screenshot({ path: `${out}/play-morning-weekend.png` });
      await page.click('#btnWake'); await page.waitForTimeout(300);
      continue;
    }
    // simple policy through the UI API
    const acts = await page.evaluate(() => TS.engine.actions(TS.state).filter(a => a.enabled).map(a => a.id));
    const go = async (dest) => { const mode = s.toys.includes('bike') ? 'bike' : (s.coins > 6 ? 'bus' : 'walk'); await page.evaluate(([d, m]) => TS.travel(d, m), [dest, mode]); };
    if (s.tummy <= 1) {
      if (s.loc === 'home' && acts.includes('cook')) { await page.evaluate(() => TS.act('cook')); continue; }
      if (acts.includes('lunchbox')) { await page.evaluate(() => TS.act('lunchbox')); continue; }
      if (s.loc === 'bakery' && acts.includes('cafe')) { await page.evaluate(() => TS.act('cafe')); continue; }
      if (s.loc === 'shops' && acts.includes('restaurant')) { await page.evaluate(() => TS.act('restaurant')); continue; }
      if (s.fridge > 0 && s.loc !== 'home') { await go('home'); continue; }
      if (s.coins >= 2 && s.loc !== 'shops' && E.isOpen({ day: s.day, time: s.time }, 'shops')) { await go('shops'); continue; }
      if (s.loc === 'park' && acts.includes('icecream')) { await page.evaluate(() => TS.act('icecream')); continue; }
    }
    if (s.loc === 'home' && acts.includes('pack') && s.time < 9 * 60) { await page.evaluate(() => TS.act('pack')); continue; }
    if (s.loc === 'bakery' && !acts.includes('work') && s.time >= 13 * 60 && s.time < 13 * 60 + 30) { if (acts.includes('lunchbox')) { await page.evaluate(() => TS.act('lunchbox')); continue; } if (acts.includes('cafe')) { await page.evaluate(() => TS.act('cafe')); continue; } }
    if (s.happy <= 1 && s.day >= 2) { if (s.loc === 'park' && acts.includes('play')) { await page.evaluate(() => TS.act('play')); continue; } if (s.loc !== 'park') { await go('park'); continue; } }
    if (s.loc === 'shops' && E.isOpen({ day: s.day, time: s.time }, 'shops')) {
      const cat = await page.evaluate(() => ({ food: TS.engine.catalogue(TS.state, 'food'), toys: TS.engine.stallOpen(TS.state, 'toys') ? TS.engine.catalogue(TS.state, 'toys') : [], clothes: TS.engine.stallOpen(TS.state, 'clothes') ? TS.engine.catalogue(TS.state, 'clothes') : [] }));
      if (cat.food[0].enabled && s.fridge < 3) { await page.evaluate(() => TS.buy('meals')); continue; }
      if (cat.clothes.length) { const rc = cat.clothes.find(c => c.id === 'raincoat'); if (rc && rc.enabled) { await page.evaluate(() => TS.buy('raincoat')); await page.waitForTimeout(200); continue; } }
      if (cat.toys.length) {
        if (!s.wish) { await page.evaluate(() => TS.wish('bike')); await page.waitForTimeout(200); await page.screenshot({ path: `${out}/play-wish-set.png` }); continue; }
        const w = cat.toys.find(c => c.id === s.wish); if (w && w.enabled) { await page.evaluate((id) => TS.buy(id), s.wish); await idle(); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/play-bike-bought.png` }); continue; }
      }
    }
    if (s.fridge === 0 && s.coins >= 3 && s.loc !== 'shops' && E.isOpen({ day: s.day, time: s.time }, 'shops') && s.time < 17 * 60) { await go('shops'); continue; }
    if (s.loc === 'bakery' && acts.includes('work')) { await page.evaluate(() => TS.act('work')); continue; }
    if (!E.isWeekend(s.day) && s.time < 15 * 60 && s.loc !== 'bakery' && s.happy > 1 && s.tummy > 1) { await go('bakery'); continue; }
    if (s.loc === 'bakery' && s.time < 9 * 60) { await page.evaluate(() => TS.act('rest')); continue; }
    if (acts.includes('bed') && s.time >= 19 * 60) { await page.evaluate(() => TS.act('bed')); continue; }
    if (s.loc !== 'home' && s.time >= 17 * 60) { await go('home'); continue; }
    if (s.loc === 'home' && acts.includes('toy') && s.happy < 6) { await page.evaluate(() => TS.act('toy')); continue; }
    if (s.loc === 'park' && acts.includes('play')) { await page.evaluate(() => TS.act('play')); continue; }
    await page.evaluate(() => TS.act('rest'));
  }
  const final = await st();
  console.log('final', JSON.stringify(final));
  console.log(errors.length ? errors : 'no page errors');
  // reload and make sure continue restores the same day
  await page.reload(); await page.waitForTimeout(400); await page.click('#btnContinue'); await page.waitForTimeout(500);
  const after = await st(); console.log('after reload', JSON.stringify({ day: after.day, time: after.time, phase: after.phase, coins: after.coins }));
  await page.screenshot({ path: `${out}/play-after-reload.png` });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
