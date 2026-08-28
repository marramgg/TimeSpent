// Start-screen screenshots + overflow check: EN/PT, fresh / saved / "new game?" confirm. Usage: node test/start-shots.js [outdir]
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'start-shots');
require('fs').mkdirSync(out, { recursive: true });
const file = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');

const targets = [
  { name: 'iphone', device: devices['iPhone 13'] },
  { name: 'iphone-se', device: devices['iPhone SE'] },
  { name: 'ipad-portrait', device: devices['iPad (gen 7)'] },
  { name: 'ipad-landscape', device: devices['iPad (gen 7) landscape'] },
];

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const tgt of targets) {
    const ctx = await browser.newContext({ ...tgt.device, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errors.push('console: ' + m.text()); });
    const measure = async (label) => {
      const m = await page.evaluate(() => {
        const vh = window.innerHeight, s = document.querySelector('#start');
        const els = [...s.children].filter(e => getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return { cls: e.className.replace(/ ?hidden/, '') || e.id, top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
        return { vh, scroll: s.scrollHeight - s.clientHeight, els };
      });
      const flag = m.scroll > 0 ? `SCROLLS by ${m.scroll}px` : 'fits';
      if (m.scroll > 0 && tgt.name !== 'iphone-se') bad++;
      console.log(`${tgt.name} ${label}: ${flag}  ` + m.els.map(e => `${e.cls}:${e.top}-${e.bottom}`).join(' | '));
    };
    // serve the real Fredoka/Nunito faces from node_modules (Google Fonts is unreachable from the sandbox)
    const fm = path.join(__dirname, '..', 'node_modules', '@fontsource');
    const face = (fam, file, w) => `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};src:url(file://${fm}/${file}) format('woff2');}`;
    const css = [400, 600, 700].map(w => face('Fredoka', `fredoka/files/fredoka-latin-${w}-normal.woff2`, w)).join('') +
      [600, 700, 800].map(w => face('Nunito', `nunito/files/nunito-latin-${w}-normal.woff2`, w) + face('Nunito', `nunito/files/nunito-latin-ext-${w}-normal.woff2`, w)).join('');
    await page.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
    await page.goto(file); await page.waitForTimeout(900);
    console.log('   fonts:', await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + f.weight).join(',') || 'NONE LOADED'));
    await page.screenshot({ path: `${out}/${tgt.name}-1-fresh-en.png` });
    await measure('fresh EN');
    await page.click('[data-lang="pt"]'); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tgt.name}-1-fresh-pt.png` });
    await measure('fresh PT');
    await page.click('[data-lang="en"]'); await page.waitForTimeout(200);
    await page.click('#btnPlay'); await page.waitForTimeout(600);
    await page.reload(); await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${tgt.name}-2-saved.png` });
    await measure('saved');
    await page.click('#btnNew'); await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tgt.name}-3-confirm.png` });
    await measure('confirm');
    await page.click('#btnNewNo'); await page.waitForTimeout(200);
    const vis = await page.evaluate(() => ['btnContinue', 'btnNew', 'newConfirm', 'btnPlay'].map(id => id + '=' + (getComputedStyle(document.getElementById(id)).display !== 'none')).join(' '));
    console.log(`    after "No": ${vis}`, errors.length ? errors : '');
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? `PROBLEM: ${bad} start-screen states scroll on a supported size` : 'all supported sizes fit');
})().catch(e => { console.error(e); process.exit(1); });
