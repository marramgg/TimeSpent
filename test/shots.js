// Screenshots + scripted playthrough at iPhone / iPad sizes. Usage: node test/shots.js [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'shots');
require('fs').mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

const targets = [
  { name: 'iphone', device: devices['iPhone 13'] },
  { name: 'ipad-portrait', device: devices['iPad (gen 7)'] },
  { name: 'ipad-landscape', device: devices['iPad (gen 7) landscape'] },
];

(async () => {
  const browser = await chromium.launch();
  for (const tgt of targets) {
    const ctx = await browser.newContext({ ...tgt.device, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(file);
    const idle = async () => { for (let i = 0; i < 60; i++) { const b = await page.evaluate(() => window.TS && window.TS.isBusy()); if (!b) return; await page.waitForTimeout(100); } };
    const tap = async (sel) => { await idle(); await page.click(sel); await page.waitForTimeout(150); await idle(); await page.waitForTimeout(250); };
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${tgt.name}-1-start.png` });
    await page.click('#btnPlay');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${tgt.name}-2-home.png` });
    // hover preview on a card, then cook breakfast and pack a lunchbox
    await page.hover('[data-act="cook"]'); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tgt.name}-2b-preview.png` });
    await tap('[data-act="cook"]'); await tap('[data-act="pack"]');
    await page.screenshot({ path: `${out}/${tgt.name}-3-after-cook.png` });
    // travel sheet
    await page.click('[data-place="bakery"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tgt.name}-5-travel-mode.png` });
    await tap('[data-mode="walk"]');
    await page.screenshot({ path: `${out}/${tgt.name}-6-bakery.png` });
    // morning shift in one tap, then the lunchbox
    await tap('[data-act="work"]');
    await page.screenshot({ path: `${out}/${tgt.name}-7-worked.png` });
    await tap('[data-act="lunchbox"]');
    // to shops by bus
    await tap('[data-place="shops"]'); await tap('[data-mode="bus"]'); await tap('[data-act="shop"]');
    await page.screenshot({ path: `${out}/${tgt.name}-8-shop.png` });
    await tap('[data-buy="meals"]');
    await page.screenshot({ path: `${out}/${tgt.name}-9-bought.png` });
    // (the shop sheet closes itself after a purchase) — walk home, cook dinner, then wait for bedtime
    await tap('[data-place="home"]'); await tap('[data-mode="walk"]');
    await tap('[data-act="cook"]');
    await page.screenshot({ path: `${out}/${tgt.name}-9b-home-evening.png` });
    await tap('[data-act="rest"]'); await tap('[data-act="rest"]');
    // wait until bedtime
    for (let i = 0; i < 30; i++) {
      const phase = await page.evaluate(() => window.TS.state.phase);
      if (phase !== 'day') break;
      await tap('[data-act="rest"]');
    }
    await page.waitForTimeout(2300);
    await page.screenshot({ path: `${out}/${tgt.name}-10-summary.png` });
    await page.click('#btnSleep'); await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${tgt.name}-11-night.png` });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${out}/${tgt.name}-12-morning.png` });
    await page.click('#btnWake'); await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tgt.name}-13-day2.png` });
    const st = await page.evaluate(() => ({ day: TS.state.day, time: TS.state.time, coins: TS.state.coins, loc: TS.state.loc, fridge: TS.state.fridge }));
    console.log(tgt.name, JSON.stringify(st), errors.length ? errors : 'no errors');
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
