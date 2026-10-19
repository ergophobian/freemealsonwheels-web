// Screenshot an arbitrary camera: node cam.mjs <out.png> "<px,py,pz,lx,ly,lz,fov>" [query]
import puppeteer from 'puppeteer-core';
const [,, out, cam, q = ''] = process.argv;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${process.env.URL ?? 'http://localhost:4321/'}?cam=${cam}${q ? '&' + q : ''}`, { waitUntil: 'networkidle0', timeout: 120000 });
await new Promise((r) => setTimeout(r, 10000));
await p.screenshot({ path: out }); console.log('errors:', errs.slice(0, 5)); await b.close();
