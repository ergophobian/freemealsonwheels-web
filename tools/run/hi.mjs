import puppeteer from 'puppeteer-core';
const [,, out, view, extra = ''] = process.argv;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(`http://localhost:4321/${extra}`, { waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 8000));
await p.evaluate((v) => document.querySelector(`[data-open="${v}"], [data-station="${v}"]`).click(), view);
await new Promise((r) => setTimeout(r, 5000));
for (let i = 0; i < 3; i++) { await p.screenshot({ path: out.replace('.png', `-${i}.png`) }); await new Promise((r) => setTimeout(r, 700)); }
console.log('errors:', errs.slice(0, 5)); await b.close();
