import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { statusFixture, economyFixture } from './fixtures.mjs';

// Optional validation tooling only. Supply a Playwright-compatible module as the first argument.
const { chromium } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : 'playwright');
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/preview/')) throw new Error('Not found');
    pathname = pathname.slice('/preview'.length);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const check = (name, detail) => { results.push({ name, passed: true, detail }); console.log(`PASS ${name}${detail ? ': ' + detail : ''}`); };
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [], failedLocal = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.url().startsWith(url) && r.status() >= 400) failedLocal.push(`${r.status()} ${r.url()}`); });
  let sourceState = 'running';
  let apiCalls = 0;
  await page.route('https://api.squeekchain.com/**', async (route) => {
    apiCalls++;
    const isWheel = route.request().url().endsWith('/v1/status');
    if (sourceState === 'offline') return route.abort('internetdisconnected');
    if (sourceState === 'economy-error' && !isWheel) return route.fulfill({ json: { status: 'unavailable', reason: 'controlled_test' } });
    const fixture = isWheel ? statusFixture(sourceState === 'resting' ? { coreStatus: 'IDLE', rpmMilli: 0 } : sourceState === 'stale' ? { observedAt: new Date(Date.now() - 180_000).toISOString() } : {}) : economyFixture();
    return route.fulfill({ json: fixture });
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Live SqueekChain feed');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('#rpm').textContent(), '42.5');
  assert.equal(await page.locator('#block-progress').textContent(), '37.5');
  assert.equal(await page.locator('#mined').textContent(), '12M');
  assert.equal(await page.locator('#wheel-state').textContent(), 'Running');
  const activeSpeed = Number(await page.locator('#canvas-stage').getAttribute('data-speed'));
  assert.ok(activeSpeed > 1);
  check('fresh telemetry', 'both endpoints requested; milli-RPM, confirmed progress, mined SQK and running state rendered');

  await mkdir('test/scratch/browser', { recursive: true });
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.waitForTimeout(80);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, main: document.querySelector('main').getBoundingClientRect().width, pauseBottom: document.querySelector('#pause').getBoundingClientRect().bottom, stageBottom: document.querySelector('#canvas-stage').getBoundingClientRect().bottom }));
    assert.ok(dimensions.scroll <= dimensions.width, `overflow at ${width}`);
    if (width === 390) { assert.ok(dimensions.stageBottom < 844); assert.ok(dimensions.pauseBottom < 844); }
    await page.screenshot({ path: `test/scratch/browser/${width}.png`, fullPage: true });
  }
  check('responsive layout', 'no horizontal overflow at 320, 390, 800, 1440; canvas and primary action inside first 390×844 screen');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok(await page.locator('.metric').first().evaluate((el) => el.getBoundingClientRect().width > 300));
  await page.screenshot({ path: 'test/scratch/browser/text-200.png', fullPage: true });
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  check('text enlargement', '200% root text size at 390 reflows without horizontal overflow');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('#pause').click();
  assert.equal(await page.locator('#pause-label').textContent(), 'Resume');
  const before = await page.locator('#art-canvas').evaluate((el) => el.toDataURL());
  await page.waitForTimeout(180);
  assert.equal(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()), before);
  await page.locator('#art-canvas').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#pause-label').textContent(), 'Pause');
  await page.waitForTimeout(100);
  assert.notEqual(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()), before);
  check('pause and keyboard resume', 'paused pixels are stable; Space on the canvas resumes motion');

  await page.locator('#pause').click();
  const modes = new Set();
  for (const mode of ['nebula', 'vortex', 'rain', 'pulse']) {
    await page.locator(`.mode-button[data-mode="${mode}"]`).click();
    assert.equal(await page.locator(`.mode-button[data-mode="${mode}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.mode-button[aria-pressed="true"]').count(), 1);
    assert.equal(await page.locator('#canvas-stage').getAttribute('data-mode'), mode);
    modes.add(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()));
    await page.screenshot({ path: `test/scratch/browser/mode-${mode}.png`, fullPage: true });
  }
  assert.equal(modes.size, 4);
  check('all four modes', 'Nebula, Vortex, Rain and Pulse render distinct canvas pixels and expose selected state');

  await page.locator('#density').fill('2400');
  assert.equal(await page.locator('#density-value').textContent(), '2,400');
  assert.equal(await page.locator('#particle-count').textContent(), '2,400');
  await page.locator('#intensity').fill('150');
  assert.equal(await page.locator('#intensity-value').textContent(), '1.5×');
  await page.locator('#trails').fill('90');
  assert.equal(await page.locator('#trails-value').textContent(), '90%');
  await page.locator('#density').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#density').inputValue(), '2500');
  await page.locator('#live-influence').uncheck();
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-signal'), 'ambient');
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-speed'), '0.42');
  await page.locator('#reset').click();
  assert.equal(await page.locator('#density').inputValue(), '1600');
  assert.equal(await page.locator('#intensity').inputValue(), '100');
  assert.equal(await page.locator('#trails').inputValue(), '65');
  assert.equal(await page.locator('#live-influence').isChecked(), true);
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-mode'), 'nebula');
  check('settings and reset', 'sliders, native keyboard stepping, live influence switch and reset work');

  const previousArrangement = await page.locator('#art-canvas').evaluate((el) => el.toDataURL());
  await page.locator('#shuffle').click();
  assert.notEqual(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()), previousArrangement);
  const box = await page.locator('#art-canvas').boundingBox();
  const beforePointer = await page.locator('#art-canvas').evaluate((el) => el.toDataURL());
  await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5);
  assert.notEqual(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()), beforePointer);
  check('reshuffle and pointer', 'new arrangements and pointer distortion change the artwork');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^squeekpulse-nebula-.*\.png$/);
  const downloadedPath = 'test/scratch/browser/saved-art.png';
  await download.saveAs(downloadedPath);
  const png = await readFile(downloadedPath);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 10000);
  check('save image', `real PNG download, ${png.length} bytes`);

  await page.locator('#about-open').click();
  assert.equal(await page.locator('#about-dialog').evaluate((el) => el.open), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#about-dialog').evaluate((el) => el.open), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'about-open');
  await page.locator('#about-open').click();
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('#about-dialog').contains(document.activeElement)));
  }
  await page.locator('#about-done').click();
  check('explanation dialog', 'native focus containment, Escape dismissal and focus return verified');

  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !!document.fullscreenElement || document.querySelector('#canvas-stage').classList.contains('immersive'));
  assert.equal(await page.locator('#fullscreen').getAttribute('aria-label'), 'Exit fullscreen');
  await page.locator('#fullscreen').click();
  await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector('#canvas-stage').classList.contains('immersive'));
  check('fullscreen', 'entry, label update, resize and exit work');

  await page.evaluate(() => Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false }));
  await page.locator('#fullscreen').click();
  assert.equal(await page.locator('#canvas-stage').evaluate((el) => el.classList.contains('immersive')), true);
  assert.equal(await page.locator('.controls').evaluate((el) => el.inert), true);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('#canvas-stage').contains(document.activeElement)));
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.controls').evaluate((el) => el.inert), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fullscreen');
  await page.evaluate(() => delete document.fullscreenEnabled);
  check('fullscreen fallback', 'without the Fullscreen API, background is inert, focus stays in the canvas and Escape restores focus');

  sourceState = 'resting';
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#wheel-state').textContent === 'Resting');
  assert.equal(await page.locator('#rpm').textContent(), '0.0');
  assert.ok(Number(await page.locator('#canvas-stage').getAttribute('data-speed')) < activeSpeed);
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-energy'), '0.36');
  check('resting telemetry', 'zero RPM slows the field and resting reduces energy');

  sourceState = 'economy-error';
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent.includes('Economy stale'));
  assert.equal(await page.locator('#mined').textContent(), '12M');
  assert.equal(await page.locator('#mined').evaluate((el) => el.closest('.metric').dataset.stale), 'true');
  assert.equal(await page.locator('#rpm').textContent(), '42.5');
  check('partial source failure', 'HTTP-200 unavailable economy retains last value marked stale; wheel stays live');

  sourceState = 'stale';
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent.includes('Wheel stale'));
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-signal'), 'ambient');
  assert.equal(await page.locator('#wheel-state').textContent(), 'Stale');
  assert.equal(await page.locator('#rpm').evaluate((el) => el.closest('.metric').dataset.stale), 'true');
  check('stale observation', 'aged sensor timestamps trigger explicit stale labeling and ambient motion');

  sourceState = 'offline';
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent.includes('Wheel unavailable'));
  assert.equal(await page.locator('#rpm').textContent(), '–');
  assert.equal(await page.locator('#mined').textContent(), '–');
  assert.ok(await page.locator('#data-notice').isVisible());
  assert.ok(await page.locator('#retry').isEnabled());
  sourceState = 'running';
  await page.locator('#retry').click();
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Live SqueekChain feed');
  check('offline and retry', 'no invented readings; ambient canvas remains usable; retry restores both sources');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('#canvas-stage').dataset.paused === 'true');
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-paused'), 'true');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#canvas-stage').dataset.paused === 'true');
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Live SqueekChain feed');
  await page.mouse.move(0, 0);
  const still = await page.locator('#art-canvas').evaluate((el) => el.toDataURL());
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#art-canvas').evaluate((el) => el.toDataURL()), still);
  await page.locator('#pause').click();
  assert.equal(await page.locator('#canvas-stage').getAttribute('data-paused'), 'false');
  check('reduced motion', 'starts paused and pixels stay stable; explicit Resume remains available');

  // Capture the keyboard ring on a real focused state, rather than inferring it from CSS.
  await page.locator('#pause').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'shuffle');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'test/scratch/browser/keyboard-focus.png' });
  check('keyboard path', 'focus travels from Pause to Reshuffle; visible ring captured');

  const pairs = await page.evaluate(() => {
    const background = (el) => {
      while (el) {
        const color = getComputedStyle(el).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
        el = el.parentElement;
      }
      return 'rgb(16, 18, 16)';
    };
    return [
      ['Body', 'body'], ['Secondary on page', '.intro p'], ['Secondary on surface', '.metric p'],
      ['Primary action', '#pause'], ['Selected mode', '.mode-button[aria-pressed="true"] .mode-label'],
      ['Canvas hint', '#canvas-hint'], ['Canvas title', '#scene-name'],
    ].map(([name, selector]) => {
      const el = document.querySelector(selector);
      return { name, foreground: getComputedStyle(el).color, background: background(el) };
    });
  });
  const luminance = (color) => {
    const c = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  for (const pair of pairs) {
    const a = luminance(pair.foreground), b = luminance(pair.background);
    pair.ratio = Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2));
    assert.ok(pair.ratio >= 4.5, `${pair.name}: ${pair.ratio}:1`);
  }
  await writeFile('test/scratch/browser/contrast.json', JSON.stringify(pairs, null, 2));
  check('rendered contrast', 'all seven measured foreground/opaque-background text pairs exceed 4.5:1');

  if (process.argv[3]) {
    await page.addScriptTag({ path: resolve(process.argv[3]) });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const audit = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
      await writeFile(`test/scratch/browser/axe-${width}.json`, JSON.stringify(audit, null, 2));
      assert.deepEqual(audit.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })), []);
    }
    await page.locator('#about-open').click();
    const modalAudit = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
    assert.deepEqual(modalAudit.violations.map((v) => v.id), []);
    await page.locator('#about-done').click();
    check('automated accessibility', 'axe WCAG 2.2 AA rule set: no violations at 390, 1440 or with the dialog open');
  }

  assert.deepEqual(errors, []);
  assert.deepEqual(failedLocal, []);
  check('console and local resources', 'zero uncaught page errors or missing local assets at /preview/');

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const touchPage = await touchContext.newPage();
  await touchPage.route('https://api.squeekchain.com/**', (route) => route.fulfill({ json: route.request().url().endsWith('/v1/status') ? statusFixture() : economyFixture() }));
  await touchPage.goto(url);
  await touchPage.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Live SqueekChain feed');
  await touchPage.locator('#pause').tap();
  assert.equal(await touchPage.locator('#pause-label').textContent(), 'Resume');
  const touchBefore = await touchPage.locator('#art-canvas').evaluate((el) => el.toDataURL());
  await touchPage.locator('#art-canvas').tap();
  assert.notEqual(await touchPage.locator('#art-canvas').evaluate((el) => el.toDataURL()), touchBefore);
  await touchPage.locator('.mode-button[data-mode="pulse"]').tap();
  assert.equal(await touchPage.locator('#canvas-stage').getAttribute('data-mode'), 'pulse');
  await touchContext.close();
  check('mobile touch', 'Pause and mode selection respond to taps; touching the field creates a visible ripple');

  const screenshotContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
  const shots = await screenshotContext.newPage();
  await shots.route('https://api.squeekchain.com/**', (route) => route.fulfill({ json: route.request().url().endsWith('/v1/status') ? statusFixture({ coreStatus: 'IDLE', rpmMilli: 0 }) : economyFixture() }));
  await shots.goto(url);
  await shots.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Live SqueekChain feed');
  await shots.evaluate(() => document.fonts.ready);
  await shots.waitForTimeout(400);
  await shots.screenshot({ path: 'test/scratch/browser/desktop-final.png', fullPage: true });
  await shots.setViewportSize({ width: 390, height: 844 });
  await shots.waitForTimeout(200);
  await shots.screenshot({ path: 'test/scratch/browser/mobile-final.png' });
  await shots.setViewportSize({ width: 320, height: 700 });
  await shots.screenshot({ path: 'test/scratch/browser/320-final.png', fullPage: true });
  await screenshotContext.close();
  await context.close();
  await writeFile('test/scratch/browser/results.json', JSON.stringify({ checks: results, apiCalls, productionSubpath: '/preview/' }, null, 2));
  console.log(`${results.length} browser checks passed.`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
