// Deliberately synthetic input for controlled tests, never imported by the website.
export function statusFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    measurement: { freshness: 'online', observedAt: new Date().toISOString(), staleAfterSeconds: 120, coreStatus: 'SPINNING', rpmMilli: 42500, ...overrides },
    builder: { status: 'available', anchor: { blockProgress: '375000000', blockHeight: '3205' }, projected: { blockProgress: '999999999' } },
  };
}
export function economyFixture(overrides = {}) {
  return {
    schemaVersion: 3, status: 'available', generatedAt: new Date().toISOString(),
    asset: { symbol: 'SQK', decimals: 18 },
    supply: { miningMintedBaseUnits: '12000000000000000000000000', capBaseUnits: '2100000000000000000000000000' },
    lifecycle: { currentRound: '701' }, ...overrides,
  };
}
