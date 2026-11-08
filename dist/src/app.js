import { TelemetryFeed, visualSignal } from './telemetry.js';
import { ParticleField, MODES, drawPreview } from './particles.js';

/** @typedef {import('./particles.js').Mode} Mode */
/** @typedef {import('./telemetry.js').FeedState} FeedState */

/** @param {string} id @returns {HTMLElement} */
function element(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el;
}
/** @param {string} id @returns {HTMLInputElement} */
function input(id) { return /** @type {HTMLInputElement} */ (element(id)); }
/** @param {string} id @param {string} value */
function text(id, value) { element(id).textContent = value; }
const format = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const canvas = /** @type {HTMLCanvasElement} */ (element('art-canvas'));
const stage = element('canvas-stage');
const dialog = /** @type {HTMLDialogElement} */ (element('about-dialog'));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduceMotion.matches;
let follow = true;
/** @type {Mode} */ let mode = 'nebula';
/** @type {ParticleField|null} */ let field = null;
/** @type {FeedState|null} */ let currentFeed = null;
let previousConnection = '';
/** @type {ReturnType<typeof setTimeout>|undefined} */ let toastTimer;

try {
  field = new ParticleField(canvas);
  field.setPaused(paused);
} catch {
  element('canvas-error').hidden = false;
  for (const id of ['pause', 'save', 'shuffle', 'fullscreen']) /** @type {HTMLButtonElement} */ (element(id)).disabled = true;
}

/** Announcements are reserved for actions and state changes, never each sensor update.
 * @param {string} message
 */
function announce(message) { text('announcement', message); }
/** @param {string} message @param {boolean} [persistent] */
function toast(message, persistent = false) {
  clearTimeout(toastTimer);
  text('toast', message);
  if (!persistent) toastTimer = setTimeout(() => text('toast', ''), 4500);
}

function renderPause() {
  text('pause-label', paused ? 'Resume' : 'Pause');
  element('pause').setAttribute('aria-pressed', String(paused));
  element('pause-icon').setAttribute('href', paused ? '#i-play' : '#i-pause');
  element('paused-indicator').hidden = !paused;
  stage.dataset.paused = String(paused);
}
function togglePause() {
  paused = !paused;
  field?.setPaused(paused);
  renderPause();
  announce(paused ? 'Animation paused. Telemetry continues updating.' : 'Animation resumed.');
}
renderPause();
element('pause').addEventListener('click', togglePause);
canvas.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); togglePause(); } });
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) {
    paused = true; field?.setPaused(true); renderPause();
    announce('Animation paused for your reduced motion preference. Select Resume to play.');
  }
});

/** @param {Mode} next @param {boolean} [notify] */
function setMode(next, notify = true) {
  mode = next;
  field?.setMode(next);
  document.querySelectorAll('.mode-button').forEach((button) => button.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (button).dataset.mode === next)));
  text('scene-name', MODES[next].name);
  const edition = document.querySelector('.scene-edition');
  if (edition) edition.textContent = `${MODES[next].number} / 04`;
  text('mode-description', MODES[next].description);
  canvas.setAttribute('aria-label', `${MODES[next].name} particle artwork. Move your pointer to bend the field, or tap to create a ripple. Press Space to pause or resume.`);
  stage.dataset.mode = next;
  if (notify) announce(`${MODES[next].name} selected. ${MODES[next].description}`);
}
document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    const next = /** @type {Mode} */ (/** @type {HTMLElement} */ (button).dataset.mode);
    if (next in MODES) setMode(next);
  });
});
document.querySelectorAll('canvas.mode-preview').forEach((preview) => {
  const thumbnail = /** @type {HTMLCanvasElement} */ (preview);
  drawPreview(thumbnail, /** @type {Mode} */ (thumbnail.dataset.preview));
});

/** @param {string} id */
function updateSlider(id) {
  const control = input(id), value = Number(control.value);
  control.style.setProperty('--range-progress', `${(value - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100}%`);
  if (id === 'density') {
    text('density-value', format.format(value)); text('particle-count', format.format(value));
    control.setAttribute('aria-valuetext', `${format.format(value)} particles`);
    if (field && field.density !== value) field.setDensity(value);
  } else if (id === 'intensity') {
    text('intensity-value', `${(value / 100).toFixed(value % 10 === 0 ? 1 : 2)}×`);
    control.setAttribute('aria-valuetext', `${(value / 100).toFixed(2)} times normal intensity`);
    if (field) field.intensity = value / 100;
  } else if (id === 'trails') {
    text('trails-value', `${value}%`);
    control.setAttribute('aria-valuetext', `${value} percent`);
    if (field) { field.trails = value; if (paused) field.render(0); }
  }
}
for (const id of ['density', 'intensity', 'trails']) {
  updateSlider(id);
  input(id).addEventListener('input', () => updateSlider(id));
}

element('shuffle').addEventListener('click', () => { field?.reseed(); announce('A new particle arrangement is ready.'); });
input('live-influence').addEventListener('change', () => {
  follow = input('live-influence').checked;
  if (currentFeed) renderFeed(currentFeed);
  announce(follow ? 'The canvas follows fresh wheel readings.' : 'Ambient motion enabled. Telemetry is still visible.');
});
element('reset').addEventListener('click', () => {
  setMode('nebula', false);
  for (const [id, value] of [['density', '1600'], ['intensity', '100'], ['trails', '65']]) { input(id).value = value; updateSlider(id); }
  follow = true; input('live-influence').checked = true;
  if (currentFeed) renderFeed(currentFeed);
  toast('Canvas settings reset.');
});

/** @param {string} id @param {boolean} stale @param {string} caption */
function metricState(id, stale, caption) {
  const metric = element(id).closest('.metric');
  if (metric instanceof HTMLElement) {
    metric.dataset.stale = String(stale);
    metric.querySelector('p')?.replaceChildren(caption);
  }
}

/** @param {FeedState} state */
function renderFeed(state) {
  currentFeed = state;
  const wheelFresh = state.wheelState === 'fresh';
  const economyFresh = state.economyState === 'fresh';
  const wheel = state.wheel, economy = state.economy;
  const signal = visualSignal(state, follow);
  if (field) field.signal = signal;
  stage.dataset.signal = signal.ambient ? 'ambient' : 'wheel';
  stage.dataset.energy = String(signal.energy);
  stage.dataset.hue = String(signal.hue);
  stage.dataset.speed = String(signal.speed);

  text('rpm', wheel ? wheel.rpm.toFixed(1) : '–');
  text('wheel-state', wheel ? wheelFresh ? wheel.running === true ? 'Running' : wheel.running === false ? 'Resting' : 'Unknown' : 'Stale' : 'Unavailable');
  element('wheel-dot').dataset.state = wheelFresh && wheel?.running ? 'running' : 'resting';
  text('block-progress', wheel?.progress != null ? (wheel.progress * 100).toFixed(1) : '–');
  text('mined', economy ? compact.format(economy.mined) : '–');
  if (economy) element('mined').title = `${format.format(economy.mined)} SQK mined of ${format.format(economy.cap)} SQK lifetime cap`;

  metricState('rpm', !!wheel && !wheelFresh, !wheel ? 'Waiting for wheel data' : !wheelFresh ? 'Stale reading; ambient motion active' : 'Sets the pace of the particles');
  metricState('wheel-state', !!wheel && !wheelFresh, !wheel ? 'Wheel feed is unavailable' : !wheelFresh ? `Last observed ${timeFormat.format(wheel.observedAt)}` : wheel.running ? 'A little energy goes a long way' : wheel.running === false ? 'The field takes a gentle breath' : 'Wheel state is not recognized');
  metricState('block-progress', !!wheel && !wheelFresh, wheel?.progress == null ? 'Confirmed progress unavailable' : !wheelFresh ? 'Last confirmed progress; stale feed' : 'Shifts the colors of the field');
  metricState('mined', !!economy && !economyFresh, !economy ? 'Waiting for economy data' : !economyFresh ? `Stale · ${timeFormat.format(economy.generatedAt)}` : 'Adds a little light to the canvas');

  const progressBar = element('block-bar');
  const barFill = progressBar.querySelector('span');
  if (barFill) barFill.style.inlineSize = `${(wheel?.progress ?? 0) * 100}%`;
  if (wheel?.progress != null) {
    progressBar.setAttribute('aria-valuenow', (wheel.progress * 100).toFixed(1));
    progressBar.setAttribute('aria-valuetext', `${(wheel.progress * 100).toFixed(1)} percent${wheelFresh ? '' : ', stale reading'}`);
    progressBar.title = `Confirmed block ${wheel.blockHeight ?? 'unknown'}`;
  } else {
    progressBar.removeAttribute('aria-valuenow'); progressBar.setAttribute('aria-valuetext', 'Confirmed progress unavailable');
  }

  let connection, connectionState;
  if (state.wheelState === 'connecting' && state.economyState === 'connecting') { connection = 'Connecting to SqueekChain'; connectionState = 'connecting'; }
  else if (!follow) { connection = 'Ambient · Live influence off'; connectionState = 'ambient'; }
  else if (wheelFresh && economyFresh) { connection = 'Live SqueekChain feed'; connectionState = 'live'; }
  else if (wheelFresh) { connection = `Wheel live · Economy ${economy ? 'stale' : 'unavailable'}`; connectionState = 'stale'; }
  else { connection = `Ambient · Wheel ${wheel ? 'stale' : 'unavailable'}`; connectionState = wheel ? 'stale' : 'offline'; }
  text('connection-label', connection);
  element('connection').dataset.state = connectionState;
  if (connection !== previousConnection) { previousConnection = connection; announce(connection); }
  const issues = [];
  if (!['fresh', 'connecting'].includes(state.wheelState)) issues.push(wheel ? 'Wheel reading is stale. Ambient motion is active.' : 'Wheel feed unavailable. The canvas is drifting in ambient mode.');
  if (!['fresh', 'connecting'].includes(state.economyState)) issues.push(economy ? 'Economy reading is stale; the last mined value is shown.' : 'Economy feed unavailable. Mined SQK will appear when it returns.');
  if (!follow && issues.length) issues[0] = issues[0].replace('Ambient motion is active.', '');
  element('data-notice').hidden = issues.length === 0;
  text('data-notice-text', issues.join(' '));
  text('updated-label', state.updatedAt ? `Last received ${timeFormat.format(state.updatedAt)}` : state.pending ? 'Waiting for the first reading' : 'No readings received');
  for (const id of ['refresh', 'retry']) {
    const button = /** @type {HTMLButtonElement} */ (element(id));
    button.disabled = state.pending;
    button.setAttribute('aria-busy', String(state.pending));
  }
}

const feed = new TelemetryFeed(renderFeed);
feed.start();
for (const id of ['refresh', 'retry']) element(id).addEventListener('click', () => void feed.refresh());
let ageTimer = setInterval(() => feed.checkAge(), 2000);
document.addEventListener('visibilitychange', () => {
  field?.setVisible(!document.hidden);
  if (document.hidden) feed.stop(); else feed.start();
});
window.addEventListener('pagehide', () => { feed.stop(); clearInterval(ageTimer); field?.setVisible(false); });
window.addEventListener('pageshow', (e) => { if (e.persisted) { ageTimer = setInterval(() => feed.checkAge(), 2000); feed.start(); field?.setVisible(true); } });

/** @param {HTMLElement} container @param {KeyboardEvent} e */
function containFocus(container, e) {
  if (e.key !== 'Tab') return;
  const controls = [...container.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')];
  const first = /** @type {HTMLElement|undefined} */ (controls[0]);
  const last = /** @type {HTMLElement|undefined} */ (controls.at(-1));
  if (e.shiftKey && document.activeElement === first && last) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last && first) { e.preventDefault(); first.focus(); }
}
element('about-open').addEventListener('click', () => dialog.showModal());
for (const id of ['about-close', 'about-done']) element(id).addEventListener('click', () => dialog.close());
dialog.addEventListener('keydown', (e) => containFocus(dialog, e));
dialog.addEventListener('click', (e) => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });

/** @type {HTMLElement[]} */ let immersiveSiblings = [];
let previousOverflow = '';
/** Make the fullscreen fallback behave like a modal on browsers without the Fullscreen API.
 * @param {boolean} enabled
 */
function setImmersive(enabled) {
  if (enabled === stage.classList.contains('immersive')) return;
  stage.classList.toggle('immersive', enabled);
  if (enabled) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    for (let node = stage; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== node && !sibling.inert && !['announcement', 'toast'].includes(sibling.id)) {
          immersiveSiblings.push(sibling); sibling.inert = true;
        }
      }
    }
    canvas.focus({ preventScroll: true });
  } else {
    for (const sibling of immersiveSiblings) sibling.inert = false;
    immersiveSiblings = [];
    document.body.style.overflow = previousOverflow;
    element('fullscreen').focus({ preventScroll: true });
  }
}
stage.addEventListener('keydown', (e) => { if (stage.classList.contains('immersive')) containFocus(stage, e); });
function updateFullscreen() {
  const active = !!document.fullscreenElement || stage.classList.contains('immersive');
  element('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  element('fullscreen').title = active ? 'Exit fullscreen' : 'Enter fullscreen';
}
element('fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  else if (stage.classList.contains('immersive')) setImmersive(false);
  else if (stage.requestFullscreen && document.fullscreenEnabled) {
    try { await stage.requestFullscreen(); } catch { setImmersive(true); }
  } else setImmersive(true);
  updateFullscreen();
});
document.addEventListener('fullscreenchange', updateFullscreen);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setImmersive(false); updateFullscreen(); } });

element('save').addEventListener('click', () => {
  if (!field) return;
  const download = document.createElement('canvas');
  download.width = canvas.width; download.height = canvas.height;
  const ctx = download.getContext('2d');
  if (!ctx) { toast('Unable to save the image. Try again in a current browser.', true); return; }
  ctx.drawImage(canvas, 0, 0);
  download.toBlob((blob) => {
    if (!blob) { toast('Unable to save the image. Try again.', true); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `squeekpulse-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    toast('Your canvas is ready to save.');
  }, 'image/png');
});
