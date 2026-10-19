import puppeteer from 'puppeteer-core';
const [,, outDir, w = '1440', h = '900', ...views] = process.argv;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage(); await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(process.env.URL ?? 'http://localhost:4321/', { waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 8000));
await p.screenshot({ path: `${outDir}/p-${w}-home.png` });
for (const v of views) {
  await p.evaluate((v) => { document.querySelector('#pop-close')?.click(); document.querySelectorAll('[data-close]').forEach((b) => b.click()); }, v);
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate((v) => document.querySelector(`[data-open="${v}"], [data-station="${v}"]`).click(), v);
  await new Promise((r) => setTimeout(r, 4200));
  await p.screenshot({ path: `${outDir}/p-${w}-${v}.png` });
}
console.log('errors:', errs.slice(0, 5));
await b.close();
