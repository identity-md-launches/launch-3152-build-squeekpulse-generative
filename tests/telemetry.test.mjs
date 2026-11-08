import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { parseStatus, parseEconomy, visualSignal, wheelIsFresh, TelemetryFeed } from '../src/telemetry.js';
import { statusFixture, economyFixture } from './fixtures.mjs';

test('converts milli-RPM and confirmed billionth-block units; ignores optimistic progress', () => {
  const result = parseStatus(statusFixture());
  assert.equal(result.rpm, 42.5);
  assert.equal(result.progress, .375);
  assert.equal(result.running, true);
  assert.equal(result.blockHeight, '3205');
});

test('converts economy base units using the supplied decimals', () => {
  const result = parseEconomy(economyFixture());
  assert.equal(result.mined, 12_000_000);
  assert.equal(result.cap, 2_100_000_000);
  assert.equal(result.round, '701');
});

test('rejects absent, nonnumeric, malformed and HTTP-200 unavailable payloads', () => {
  for (const raw of [null, {}, { measurement: { rpmMilli: 'bad' } }, statusFixture({ rpmMilli: null }), statusFixture({ observedAt: 'invalid' })]) assert.throws(() => parseStatus(raw));
  for (const raw of [null, {}, economyFixture({ status: 'unavailable' }), economyFixture({ asset: { decimals: 37 } }), economyFixture({ supply: { capBaseUnits: '0' } })]) assert.throws(() => parseEconomy(raw));
});

test('respects upstream freshness, observation age, and implausible future timestamps', () => {
  const now = Date.now();
  const fresh = parseStatus(statusFixture());
  assert.equal(wheelIsFresh(fresh, now), true);
  assert.equal(wheelIsFresh({ ...fresh, observedAt: now - 121_000 }, now), false);
  assert.equal(wheelIsFresh({ ...fresh, freshness: 'stale' }, now), false);
  assert.equal(wheelIsFresh({ ...fresh, observedAt: now + 31_000 }, now), false);
});

test('RPM, running state, confirmed progress and mined supply affect the visual signal', () => {
  const state = { wheel: parseStatus(statusFixture()), economy: parseEconomy(economyFixture()), wheelState: 'fresh', economyState: 'fresh', pending: false, updatedAt: Date.now() };
  const active = visualSignal(state, true);
  const resting = visualSignal({ ...state, wheel: { ...state.wheel, running: false, rpm: 0, progress: .8 } }, true);
  assert.ok(active.speed > resting.speed);
  assert.ok(active.energy > resting.energy);
  assert.notEqual(active.hue, resting.hue);
  assert.ok(active.glow > visualSignal({ ...state, economy: { ...state.economy, mined: 0 } }, true).glow);
  assert.equal(active.ambient, false);
});

test('unavailable or stale wheel data and the influence switch use an explicit ambient signal', () => {
  const state = { wheel: null, economy: null, wheelState: 'offline', economyState: 'offline', pending: false, updatedAt: null };
  assert.equal(visualSignal(state, true).ambient, true);
  const withWheel = { ...state, wheel: parseStatus(statusFixture()), wheelState: 'fresh' };
  assert.equal(visualSignal(withWheel, false).ambient, true);
  assert.equal(visualSignal({ ...withWheel, wheelState: 'stale' }, true).ambient, true);
  assert.equal(visualSignal({ ...withWheel, wheel: { ...withWheel.wheel, observedAt: Date.now() - 150_000 } }, true).ambient, true);
});

test('failure of one source preserves its last reading as stale and leaves the other fresh', async () => {
  let outage = false;
  const fetcher = async (url) => {
    if (String(url).endsWith('/v1/status')) return Response.json(statusFixture());
    return Response.json(outage ? { status: 'unavailable', reason: 'controlled_test' } : economyFixture());
  };
  const feed = new TelemetryFeed(() => {}, { fetcher });
  await feed.refresh();
  const mined = feed.state.economy.mined;
  assert.equal(feed.state.wheelState, 'fresh');
  outage = true;
  await feed.refresh();
  assert.equal(feed.state.economyState, 'stale');
  assert.equal(feed.state.economy.mined, mined);
  assert.equal(feed.state.wheelState, 'fresh');
});

test('initial network errors show no fabricated readings; a retry recovers both feeds', async () => {
  let offline = true;
  const fetcher = async (url) => {
    if (offline) throw new Error('controlled offline test');
    return Response.json(String(url).endsWith('/v1/status') ? statusFixture() : economyFixture());
  };
  const feed = new TelemetryFeed(() => {}, { fetcher });
  await feed.refresh();
  assert.equal(feed.state.wheel, null); assert.equal(feed.state.economy, null);
  assert.equal(feed.state.wheelState, 'offline'); assert.equal(feed.state.economyState, 'offline');
  offline = false;
  await feed.refresh();
  assert.equal(feed.state.wheelState, 'fresh'); assert.equal(feed.state.economyState, 'fresh');
});

test('short-interval polling repeats, coalesces refreshes, and stops cleanly', async () => {
  let calls = 0, active = 0, maxActive = 0;
  const fetcher = async (url) => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await delay(5);
    active--;
    return Response.json(String(url).endsWith('/v1/status') ? statusFixture() : economyFixture());
  };
  const feed = new TelemetryFeed(() => {}, { fetcher, interval: 15 });
  feed.start();
  await Promise.all([feed.refresh(), feed.refresh()]);
  await delay(85);
  feed.stop();
  await delay(15);
  const stopped = calls;
  await delay(40);
  assert.ok(stopped >= 6); assert.equal(calls, stopped); assert.equal(maxActive, 2);
});

test('freshness is re-evaluated between polls', async () => {
  const feed = new TelemetryFeed(() => {}, { fetcher: async (url) => Response.json(String(url).endsWith('/v1/status') ? statusFixture() : economyFixture()) });
  await feed.refresh();
  feed.state.wheel.observedAt = Date.now() - 121_000;
  feed.state.economy.generatedAt = Date.now() - 121_000;
  feed.checkAge();
  assert.equal(feed.state.wheelState, 'stale'); assert.equal(feed.state.economyState, 'stale');
});
