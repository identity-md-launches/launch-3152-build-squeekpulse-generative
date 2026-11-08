/** @typedef {'nebula'|'vortex'|'rain'|'pulse'} Mode */
/** @typedef {{speed: number, energy: number, hue: number, glow: number, ambient: boolean}} Signal */
/** @typedef {{angle: number, radius: number, spread: number, phase: number, size: number, x: number, y: number, lastX: number, lastY: number}} Particle */

export const MODES = /** @type {const} */ ({
  nebula: { name: 'Nebula', description: 'A soft constellation, always becoming.', number: '01' },
  vortex: { name: 'Vortex', description: 'A spiral pulled into its own orbit.', number: '02' },
  rain: { name: 'Rain', description: 'A quiet downpour of little lights.', number: '03' },
  pulse: { name: 'Pulse', description: 'Ripples of energy, radiating outward.', number: '04' },
});

/** @param {number} seed */
function randomGenerator(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

export class ParticleField {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is unavailable');
    this.ctx = context;
    /** @type {Mode} */ this.mode = 'nebula';
    this.density = 1600;
    this.intensity = 1;
    this.trails = 65;
    /** @type {Signal} */ this.signal = { speed: .42, energy: .48, hue: 166, glow: .5, ambient: true };
    /** @type {Particle[]} */ this.particles = [];
    this.width = 1; this.height = 1;
    this.time = 17;
    this.lastFrame = 0;
    this.frameId = 0;
    this.paused = false;
    this.visible = true;
    this.seed = Math.floor(Math.random() * 2 ** 30);
    this.pointer = { x: 0, y: 0, active: false };
    this.burst = { x: .5, y: .5, life: 0 };
    this.frames = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.reseed();
    this.tick = this.tick.bind(this);
    this.schedule();
    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
      if (this.paused) this.render(0);
    });
    canvas.addEventListener('pointerleave', () => { this.pointer.active = false; });
    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.burst = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, life: 1 };
      if (this.paused) this.render(0);
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.clear(); this.render(0);
  }

  clear() { this.ctx.fillStyle = '#0b0f0e'; this.ctx.fillRect(0, 0, this.width, this.height); }

  reseed() {
    const random = randomGenerator(++this.seed);
    this.particles = Array.from({ length: this.density }, () => ({
      angle: random() * Math.PI * 2,
      radius: Math.pow(random(), .66),
      spread: (random() - .5),
      phase: random() * Math.PI * 2,
      size: .5 + random() ** 3 * 1.4,
      x: random(), y: random(), lastX: -999, lastY: -999,
    }));
    this.clear(); this.render(0);
  }

  /** @param {Mode} mode */
  setMode(mode) { this.mode = mode; this.reseed(); }
  /** @param {number} density */
  setDensity(density) { this.density = density; this.reseed(); }
  /** @param {boolean} value */
  setPaused(value) { this.paused = value; cancelAnimationFrame(this.frameId); this.frameId = 0; this.lastFrame = 0; if (!value) this.schedule(); }
  /** @param {boolean} value */
  setVisible(value) { this.visible = value; cancelAnimationFrame(this.frameId); this.frameId = 0; this.lastFrame = 0; if (value) this.schedule(); }
  schedule() { if (!this.paused && this.visible && !this.frameId) this.frameId = requestAnimationFrame(this.tick); }

  /** @param {number} now */
  tick(now) {
    this.frameId = 0;
    if (this.paused || !this.visible) return;
    // Cap simulation delta after tab suspension; movement is independent of display refresh rate.
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, .05) : 1 / 60;
    this.lastFrame = now;
    this.time += dt * this.signal.speed * this.intensity;
    this.render(dt);
    this.frames++;
    this.schedule();
  }

  /** @param {number} dt */
  render(dt) {
    const ctx = this.ctx, w = this.width, h = this.height, t = this.time;
    const cx = w * .5, cy = h * .51;
    const scale = Math.min(w * .46, h * .72);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Exponential fade stays consistent on 60Hz and 120Hz displays.
    const fade = dt === 0 ? 1 : 1 - Math.pow(1 - (.32 - this.trails / 100 * .3), dt * 60);
    ctx.fillStyle = `rgba(11,15,14,${fade})`;
    ctx.fillRect(0, 0, w, h);

    // A quiet coordinate grid keeps the organic field in an instrument-like frame.
    ctx.strokeStyle = 'rgba(125,155,130,.035)'; ctx.lineWidth = .7;
    ctx.beginPath();
    for (let x = 48; x < w; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 32; y < h; y += 64) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    const runningScale = .9 + this.signal.energy * .12;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      let x = 0, y = 0;
      if (this.mode === 'nebula') {
        // Three tilted ribbons fold around a porous center, with an outer dust halo.
        const arm = Math.floor(p.phase / (Math.PI * 2) * 3);
        const theta = p.angle + t * (.065 + .13 * (1 - p.radius));
        const swirl = theta + p.radius * 3.4 + arm * 2.094;
        const radius = scale * (.08 + p.radius * .94);
        const wave = Math.sin(theta * 3 + t * .12 + p.phase) * .12;
        const px = Math.cos(swirl) * radius;
        const py = Math.sin(swirl) * radius * (.38 + wave) + p.spread * scale * .2 * p.radius;
        x = cx + (px * .94 - py * .35) * runningScale;
        y = cy + (px * .29 + py * .96) * runningScale;
      } else if (this.mode === 'vortex') {
        const angle = p.angle + t * (.25 + (1 - p.radius) * .8) - p.radius * 7;
        const radius = scale * (.06 + p.radius * .88);
        x = cx + Math.cos(angle) * radius;
        y = cy + Math.sin(angle) * radius * .76;
      } else if (this.mode === 'rain') {
        const fall = (p.y + t * (.06 + p.radius * .09)) % 1;
        x = p.x * w + Math.sin(fall * 3 + p.phase + t * .07) * 14;
        y = fall * (h + 80) - 40;
      } else {
        const ring = (p.radius + t * .075) % 1;
        const radius = scale * ring;
        const wave = Math.sin(p.angle * 6 + t * .6) * 4 * ring;
        x = cx + Math.cos(p.angle) * (radius + wave);
        y = cy + Math.sin(p.angle) * (radius + wave) * .8;
      }
      if (this.pointer.active) {
        const dx = x - this.pointer.x, dy = y - this.pointer.y;
        const distance = Math.hypot(dx, dy);
        const influence = Math.max(0, 1 - distance / 155);
        x += dx * influence * .34; y += dy * influence * .34;
      }
      if (this.burst.life > 0) {
        const dx = x - this.burst.x * w, dy = y - this.burst.y * h;
        const distance = Math.hypot(dx, dy) || 1;
        const ripple = Math.sin(distance / 28 - (1 - this.burst.life) * 12) * 15 * this.burst.life * Math.max(0, 1 - distance / 250);
        x += dx / distance * ripple; y += dy / distance * ripple;
      }
      const hue = this.signal.hue + (p.radius - .5) * 82 + Math.sin(p.phase) * 17;
      const opacity = (.22 + (1 - p.radius) * .55) * (.65 + this.signal.energy * .35);
      const lightness = 57 + this.signal.glow * 16 + (1 - p.radius) * 12;
      ctx.fillStyle = `hsla(${hue},${55 + p.radius * 22}%,${lightness}%,${opacity})`;
      const size = p.size * (.7 + this.signal.glow * .3);
      if (this.mode === 'rain') {
        ctx.fillRect(x, y, size * .8, size * (2 + this.signal.speed * 2));
      } else {
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      }
      // Small bright stars have soft halos without a blur for every particle.
      if (p.size > 1.65) {
        ctx.fillStyle = `hsla(${hue},70%,70%,.035)`;
        ctx.beginPath(); ctx.arc(x, y, size * 4, 0, Math.PI * 2); ctx.fill();
      }
      p.lastX = x; p.lastY = y;
    }
    if (dt > 0) this.burst.life = Math.max(0, this.burst.life - dt * .7);
    ctx.globalCompositeOperation = 'source-over';
    // Opaque quiet zones behind the overlaid labels preserve contrast in every mode.
    const topMask = ctx.createLinearGradient(0, 0, 0, 80);
    topMask.addColorStop(0, '#0b0f0e'); topMask.addColorStop(.7, '#0b0f0e'); topMask.addColorStop(1, 'rgba(11,15,14,0)');
    ctx.fillStyle = topMask; ctx.fillRect(0, 0, w, 80);
    const bottomMask = ctx.createLinearGradient(0, h - 80, 0, h);
    bottomMask.addColorStop(0, 'rgba(11,15,14,0)'); bottomMask.addColorStop(.4, '#0b0f0e'); bottomMask.addColorStop(1, '#0b0f0e');
    ctx.fillStyle = bottomMask; ctx.fillRect(0, h - 80, w, 80);
  }

  destroy() { cancelAnimationFrame(this.frameId); this.resizeObserver.disconnect(); }
}

/** @param {HTMLCanvasElement} canvas @param {Mode} mode */
export function drawPreview(canvas, mode) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const random = randomGenerator(17);
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 340; i++) {
    const a = random() * Math.PI * 2, r = Math.sqrt(random()), phase = random();
    let x, y;
    if (mode === 'nebula') { x = w / 2 + Math.cos(a + r * 4) * r * w * .42; y = h / 2 + Math.sin(a + r * 4) * r * h * .32 + (x - w / 2) * .16; }
    else if (mode === 'vortex') { x = w / 2 + Math.cos(a - r * 7) * r * h * .65; y = h / 2 + Math.sin(a - r * 7) * r * h * .43; }
    else if (mode === 'rain') { x = random() * w; y = random() * h; }
    else { const ring = Math.round(r * 4) / 4; x = w / 2 + Math.cos(a) * ring * h * .7; y = h / 2 + Math.sin(a) * ring * h * .43; }
    ctx.fillStyle = `hsla(${145 + r * 65},60%,70%,${.15 + phase * .5})`;
    ctx.fillRect(x, y, 1 + phase, mode === 'rain' ? 3 + phase * 3 : 1 + phase);
  }
}
