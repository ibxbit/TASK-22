'use strict';

/**
 * Unit tests for taxService.
 *   - getRates()  — async, queries MongoDB TaxRate collection
 *   - calculate() — pure function, no DB
 */

const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const TaxRate   = require('../backend/src/models/TaxRate');
const { getRates, calculate } = require('../backend/src/services/taxService');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── getRates ──────────────────────────────────────────────────────────────────

describe('getRates — lookup', () => {
  test('returns exact match when state + county both match', async () => {
    await TaxRate.create({ state: 'CA', county: 'Los Angeles', stateTax: 7, countyTax: 1, totalRate: 8 });
    const rate = await getRates('CA', 'Los Angeles');
    expect(rate.state).toBe('CA');
    expect(rate.county).toBe('Los Angeles');
    expect(rate.stateTax).toBe(7);
    expect(rate.countyTax).toBe(1);
  });

  test('returns state-wide fallback (county: null) when county-specific is missing', async () => {
    await TaxRate.create({ state: 'CA', county: null, stateTax: 7.25, countyTax: 0, totalRate: 7.25 });
    const rate = await getRates('CA', 'Unknown County');
    expect(rate.state).toBe('CA');
    expect(rate.county).toBeNull();
    expect(rate.stateTax).toBe(7.25);
  });

  test('throws when neither county-specific nor state-wide rate exists', async () => {
    await expect(getRates('ZZ', 'Nowhere')).rejects.toThrow(/No tax rate found/);
  });

  test('throws when state-wide rate exists for a different state', async () => {
    await TaxRate.create({ state: 'TX', county: null, stateTax: 6.25, countyTax: 0, totalRate: 6.25 });
    await expect(getRates('CA', null)).rejects.toThrow(/No tax rate found/);
  });

  test('county matching is case-insensitive', async () => {
    await TaxRate.create({ state: 'TX', county: 'Travis', stateTax: 6.25, countyTax: 2, totalRate: 8.25 });
    const rate = await getRates('TX', 'travis');
    expect(rate.county).toBe('Travis');
  });

  test('county matching is case-insensitive (all-caps input)', async () => {
    await TaxRate.create({ state: 'TX', county: 'Travis', stateTax: 6.25, countyTax: 2, totalRate: 8.25 });
    const rate = await getRates('TX', 'TRAVIS');
    expect(rate.county).toBe('Travis');
  });

  test('state input is normalized to uppercase before lookup', async () => {
    await TaxRate.create({ state: 'NY', county: null, stateTax: 4, countyTax: 0, totalRate: 4 });
    const rate = await getRates('ny', null);
    expect(rate.state).toBe('NY');
  });

  test('prefers county-specific rate over state-wide fallback', async () => {
    await TaxRate.create({ state: 'WA', county: null,  stateTax: 6.5, countyTax: 0,   totalRate: 6.5 });
    await TaxRate.create({ state: 'WA', county: 'King', stateTax: 6.5, countyTax: 2.1, totalRate: 8.6 });
    const rate = await getRates('WA', 'King');
    expect(rate.county).toBe('King');
    expect(rate.countyTax).toBe(2.1);
  });

  test('returns null-county record when county arg is null or omitted', async () => {
    await TaxRate.create({ state: 'FL', county: null, stateTax: 6, countyTax: 0, totalRate: 6 });
    const rate = await getRates('FL', null);
    expect(rate.county).toBeNull();
    expect(rate.stateTax).toBe(6);
  });

  test('state with leading/trailing whitespace is normalized', async () => {
    await TaxRate.create({ state: 'OR', county: null, stateTax: 0, countyTax: 0, totalRate: 0 });
    const rate = await getRates('  OR  ', null);
    expect(rate.state).toBe('OR');
  });
});

// ── calculate ─────────────────────────────────────────────────────────────────

describe('calculate — pure function', () => {
  test('computes state and county tax amounts from subtotal', () => {
    const result = calculate(1000, { stateTax: 7, countyTax: 1 });
    expect(result.stateAmount).toBe(70);
    expect(result.countyAmount).toBe(10);
    expect(result.totalTax).toBe(80);
  });

  test('handles zero county tax', () => {
    const result = calculate(200, { stateTax: 5, countyTax: 0 });
    expect(result.countyAmount).toBe(0);
    expect(result.totalTax).toBe(10);
  });

  test('handles zero subtotal', () => {
    const result = calculate(0, { stateTax: 7, countyTax: 1 });
    expect(result.stateAmount).toBe(0);
    expect(result.countyAmount).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  test('rounds each component independently to 2 decimal places', () => {
    // 333.33 * 7.1% = 23.66643 → rounds to 23.67
    const result = calculate(333.33, { stateTax: 7.1, countyTax: 1.1 });
    const expectedState  = parseFloat(((333.33 * 7.1)  / 100).toFixed(2));
    const expectedCounty = parseFloat(((333.33 * 1.1)  / 100).toFixed(2));
    const expectedTotal  = parseFloat((expectedState + expectedCounty).toFixed(2));
    expect(result.stateAmount).toBe(expectedState);
    expect(result.countyAmount).toBe(expectedCounty);
    expect(result.totalTax).toBe(expectedTotal);
  });

  test('total is the sum of the two independently-rounded components', () => {
    const result = calculate(99.99, { stateTax: 8, countyTax: 2 });
    const expectedTotal = parseFloat((result.stateAmount + result.countyAmount).toFixed(2));
    expect(result.totalTax).toBe(expectedTotal);
  });

  test('returns object with exactly stateAmount, countyAmount, totalTax', () => {
    const result = calculate(100, { stateTax: 5, countyTax: 2 });
    expect(Object.keys(result).sort()).toEqual(['countyAmount', 'stateAmount', 'totalTax']);
  });

  test('large subtotal rounds correctly', () => {
    const result = calculate(50000, { stateTax: 7.25, countyTax: 1 });
    expect(result.stateAmount).toBe(3625);
    expect(result.countyAmount).toBe(500);
    expect(result.totalTax).toBe(4125);
  });
});
