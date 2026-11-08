import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional asset authoring tool; neither the website nor its build needs Playwright.
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const font = (await readFile('assets/space-grotesk-latin.woff2')).toString('base64');
  const logo = (await readFile('assets/favicon.svg')).toString('base64');
  const engine = `data:text/javascript;base64,${(await readFile('src/particles.js')).toString('base64')}`;
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    @font-face{font-family:Space;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:300 700}
    *{box-sizing:border-box}body{margin:0;background:#101210;color:#f0f2ec;font-family:Space,Arial,sans-serif}
    .frame{position:absolute;inset:20px;border:1px solid #292e28;border-radius:22px;overflow:hidden;background:#0b0f0e}
    .brand{position:absolute;inset:47px auto auto 44px;display:flex;gap:14px;align-items:center;font-size:28px;font-weight:500}
    .brand img{width:44px;height:44px}.brand span span{font-weight:400}
    canvas{position:absolute;right:-45px;top:90px;width:735px;height:470px}
    .copy{position:absolute;left:46px;top:185px}h1{font-size:64px;font-weight:500;line-height:1.12;letter-spacing:-3px;margin:0}
    h1 span{color:#c4f582}p{font-size:18px;line-height:1.5;color:#a0aa9d;margin-top:26px;max-width:360px}
    .modes{position:absolute;bottom:42px;left:46px;font-size:15px;color:#a0aa9d}
    .mark{position:absolute;right:46px;bottom:42px;color:#c4f582;font-size:18px}
  </style></head><body><div class="frame"><canvas id="social-art"></canvas>
  <div class="brand"><img alt="" src="data:image/svg+xml;base64,${logo}"><span>Squeek<span>Pulse</span></span></div>
  <div class="copy"><h1>Art, powered<br>by a <span>hamster.</span></h1><p>A living particle canvas.<br>A real wheel behind every ripple.</p></div>
  <div class="modes">Nebula &nbsp;·&nbsp; Vortex &nbsp;·&nbsp; Rain &nbsp;·&nbsp; Pulse</div><div class="mark">One tiny wheel. Infinite possibilities.</div></div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async (engineUrl) => {
    const { ParticleField } = await import(engineUrl);
    const field = new ParticleField(document.querySelector('canvas'));
    field.seed = 2026; field.density = 2200; field.reseed();
    field.signal = { speed: .8, energy: .7, hue: 163, glow: .6, ambient: true };
  }, engine);
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'assets/social.png' });
  console.log('Created assets/social.png (1200×630) using the actual particle renderer and local font.');
} finally { await browser.close(); }
