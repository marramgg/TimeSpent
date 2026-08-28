// Later-game states: PT language, rain day, wish, settings, night clock. Usage: node test/shots2.js [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'pt-PT' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(file); await page.waitForTimeout(500);
  const idle = async () => { for (let i = 0; i < 80; i++) { const b = await page.evaluate(() => window.TS && window.TS.isBusy()); if (!b) return; await page.waitForTimeout(100); } };
  const tap = async (sel) => { await idle(); await page.click(sel); await page.waitForTimeout(150); await idle(); await page.waitForTimeout(250); };
  await page.screenshot({ path: `${out}/pt-1-start.png` });
  await page.click('#btnPlay'); await page.waitForTimeout(600);
  // jump to day 4 (rain) with a wish and some coins
  await page.evaluate(() => { const s = TS.state; s.day = 4; s.weather = 'rain'; s.coins = 7; s.wish = 'bike'; s.toys = ['ball']; s.msgs = [{ key: 'morning', day: 4 }, { key: 'weatherRain' }]; TS.settings.voice = false; });
  await page.evaluate(() => TS.act('rest')); await idle(); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/pt-2-rain-day4.png` });
  await tap('[data-place="shops"]');
  await page.screenshot({ path: `${out}/pt-3-travel-rain.png` });
  await tap('[data-mode="walk"]');
  await page.screenshot({ path: `${out}/pt-4-wet.png` });
  await page.evaluate(() => { TS.state.time = 9 * 60; });
  await tap('[data-act="rest"]'); await tap('[data-act="shop"]'); await tap('[data-stall="toys"]');
  await page.screenshot({ path: `${out}/pt-5-toys.png` });
  await page.click('[data-stall="clothes"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/pt-6-clothes.png` });
  await page.click('.close[data-close="shopSheet"]'); await page.waitForTimeout(300);
  await idle();
  // settings via hold
  const gear = await page.$('#gear'); const box = await gear.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1400); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/pt-7-settings.png` });
  const open = await page.evaluate(() => document.getElementById('settings').classList.contains('open'));
  await page.click('.close[data-close="settings"]'); await page.waitForTimeout(200);
  // reload → continue screen
  await page.reload(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/pt-8-continue.png` });
  const st = await page.evaluate(() => ({ hasContinue: !document.getElementById('btnContinue').classList.contains('hidden'), lang: TS.settings.lang }));
  console.log('settings opened by hold:', open, JSON.stringify(st), errors.length ? errors : 'no errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
