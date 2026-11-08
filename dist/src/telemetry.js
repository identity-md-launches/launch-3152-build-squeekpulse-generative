/**
 * @typedef {{rpm: number, running: boolean|null, observedAt: number, staleAfter: number,
 * freshness: string, progress: number|null, blockHeight: string|null}} WheelSnapshot
 * @typedef {{mined: number, cap: number, round: string|null, generatedAt: number}} EconomySnapshot
 * @typedef {'connecting'|'fresh'|'stale'|'offline'} SourceState
 * @typedef {{wheel: WheelSnapshot|null, economy: EconomySnapshot|null,
 * wheelState: SourceState, economyState: SourceState, updatedAt: number|null, pending: boolean}} FeedState
 */

export const API_BASE = 'https://api.squeekchain.com';
export const POLL_INTERVAL = 15_000;

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value) : {};
}

/** @param {unknown} value @returns {number|null} */
function numeric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** @param {unknown} value @returns {number} */
function timestamp(value) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new Error('Missing observation time');
  return time;
}

/** Parse public /v1/status; never use optimistic builder.projected as confirmed progress.
 * @param {unknown} raw @returns {WheelSnapshot}
 */
export function parseStatus(raw) {
  const data = object(raw);
  const m = object(data.measurement);
  const rpmMilli = numeric(m.rpmMilli);
  if (rpmMilli === null || typeof m.coreStatus !== 'string' || typeof m.freshness !== 'string') {
    throw new Error('Wheel telemetry is unavailable');
  }
  const builder = object(data.builder);
  const anchor = builder.status === 'available' ? object(builder.anchor) : {};
  const progressUnits = numeric(anchor.blockProgress);
  const coreStatus = m.coreStatus.toUpperCase();
  return {
    rpm: rpmMilli / 1000,
    running: ['SPINNING', 'RUNNING'].includes(coreStatus) ? true : ['IDLE', 'RESTING', 'STOPPED'].includes(coreStatus) ? false : null,
    observedAt: timestamp(m.observedAt),
    staleAfter: Math.max(1, Math.min(numeric(m.staleAfterSeconds) ?? 120, 600)) * 1000,
    freshness: m.freshness,
    progress: progressUnits === null || progressUnits > 1e9 ? null : progressUnits / 1e9,
    blockHeight: typeof anchor.blockHeight === 'string' && /^\d+$/.test(anchor.blockHeight) ? anchor.blockHeight : null,
  };
}

/** @param {unknown} raw @returns {EconomySnapshot} */
export function parseEconomy(raw) {
  const data = object(raw);
  const asset = object(data.asset);
  const supply = object(data.supply);
  const lifecycle = object(data.lifecycle);
  const decimals = numeric(asset.decimals);
  const minted = numeric(supply.miningMintedBaseUnits);
  const cap = numeric(supply.capBaseUnits);
  if (data.status !== 'available' || decimals === null || !Number.isInteger(decimals) || decimals > 36 || minted === null || cap === null || cap <= 0) {
    throw new Error('Economy telemetry is unavailable');
  }
  return {
    mined: minted / 10 ** decimals,
    cap: cap / 10 ** decimals,
    round: typeof lifecycle.currentRound === 'string' ? lifecycle.currentRound : null,
    generatedAt: timestamp(data.generatedAt),
  };
}

/** @param {WheelSnapshot} wheel @param {number} [now] */
export function wheelIsFresh(wheel, now = Date.now()) {
  return wheel.freshness === 'online' && now - wheel.observedAt <= wheel.staleAfter && wheel.observedAt - now <= 30_000;
}

/** @param {FeedState} state @param {boolean} follow @param {number} [now] */
export function visualSignal(state, follow, now = Date.now()) {
  const fresh = !!state.wheel && state.wheelState === 'fresh' && wheelIsFresh(state.wheel, now);
  const wheel = follow && fresh ? state.wheel : null;
  const economy = follow && state.economyState === 'fresh' && state.economy && now - state.economy.generatedAt <= 120_000 ? state.economy : null;
  return {
    speed: wheel ? .18 + Math.min(wheel.rpm / 35, 3) : .42,
    energy: wheel ? wheel.running === true ? 1 : .36 : .48,
    hue: wheel && wheel.progress !== null ? 140 + wheel.progress * 80 : 166,
    glow: economy ? .35 + Math.min(1, Math.log10(1 + economy.mined) / 9) * .65 : .5,
    ambient: !wheel,
  };
}

export class TelemetryFeed {
  /** @param {(state: FeedState) => void} onChange @param {{interval?: number, base?: string, fetcher?: typeof fetch}} [options] */
  constructor(onChange, options = {}) {
    this.onChange = onChange;
    this.interval = options.interval ?? POLL_INTERVAL;
    this.base = options.base ?? API_BASE;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    /** @type {FeedState} */
    this.state = { wheel: null, economy: null, wheelState: 'connecting', economyState: 'connecting', updatedAt: null, pending: false };
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    this.timer = undefined;
    /** @type {AbortController|null} */
    this.controller = null;
    this.active = false;
  }

  start() { if (this.active) return; this.active = true; void this.refresh(); }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
    this.controller?.abort();
  }

  /** Read each endpoint independently. A failed source retains its previous reading as stale. */
  async refresh() {
    if (this.state.pending) return;
    clearTimeout(this.timer);
    this.state.pending = true;
    this.onChange(this.state);
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    /** @param {string} path */
    const request = async (path) => {
      const res = await this.fetcher(`${this.base}${path}`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return /** @type {unknown} */ (await res.json());
    };
    const [wheel, economy] = await Promise.allSettled([
      request('/v1/status').then(parseStatus),
      request('/v1/economy/state').then(parseEconomy),
    ]);
    clearTimeout(timeout);
    if (wheel.status === 'fulfilled') {
      this.state.wheel = wheel.value;
      this.state.wheelState = wheelIsFresh(wheel.value) ? 'fresh' : 'stale';
    } else this.state.wheelState = this.state.wheel ? 'stale' : 'offline';
    if (economy.status === 'fulfilled') {
      this.state.economy = economy.value;
      const age = Date.now() - economy.value.generatedAt;
      this.state.economyState = age <= 120_000 && age >= -30_000 ? 'fresh' : 'stale';
    } else this.state.economyState = this.state.economy ? 'stale' : 'offline';
    if (wheel.status === 'fulfilled' || economy.status === 'fulfilled') this.state.updatedAt = Date.now();
    this.state.pending = false;
    this.controller = null;
    this.onChange(this.state);
    if (this.active) this.timer = setTimeout(() => void this.refresh(), this.interval);
  }

  /** Recheck freshness even when a request stalls or the device clock advances. */
  checkAge() {
    let changed = false;
    if (this.state.wheelState === 'fresh' && this.state.wheel && !wheelIsFresh(this.state.wheel)) {
      this.state.wheelState = 'stale'; changed = true;
    }
    if (this.state.economyState === 'fresh' && this.state.economy && Date.now() - this.state.economy.generatedAt > 120_000) {
      this.state.economyState = 'stale'; changed = true;
    }
    if (changed) this.onChange(this.state);
  }
}
