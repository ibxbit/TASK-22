/**
 * API tests: GET /finance/tax-rates, POST /finance/tax-rates
 *
 * No mocking — requests go through the real Express app and MongoDB.
 */
const supertest = require('supertest');
const app       = require('../backend/src/app');
const TaxRate   = require('../backend/src/models/TaxRate');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeUser, authHeader } = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── Helpers ───────────────────────────────────────────────────────────────────

async function adminHeader() {
  const admin = await makeUser({ role: 'admin' });
  return authHeader(admin);
}

async function seedRate(state, county, stateTax = 7.25, countyTax = 1.0) {
  return TaxRate.create({
    state,
    county:    county || null,
    stateTax,
    countyTax,
    totalRate: parseFloat((stateTax + countyTax).toFixed(4)),
  });
}

// ── GET /finance/tax-rates ────────────────────────────────────────────────────

describe('GET /finance/tax-rates', () => {
  test('returns empty rates array when no rates exist', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request
      .get('/finance/tax-rates')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.rates).toEqual([]);
  });

  test('returns all tax rates sorted by state then county', async () => {
    await seedRate('TX', 'Travis',      8.25, 2.0);
    await seedRate('CA', 'Los Angeles', 7.25, 1.0);
    await seedRate('CA', 'Alameda',     7.25, 1.5);

    const user = await makeUser({ role: 'manager' });
    const res  = await request.get('/finance/tax-rates').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(3);
    // CA should come before TX alphabetically
    expect(res.body.rates[0].state).toBe('CA');
    expect(res.body.rates[2].state).toBe('TX');
  });

  test('filters by state query param', async () => {
    await seedRate('CA', 'Los Angeles', 7.25, 1.0);
    await seedRate('TX', 'Travis',      8.25, 2.0);

    const user = await makeUser({ role: 'manager' });
    const res  = await request.get('/finance/tax-rates?state=CA').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0].state).toBe('CA');
  });

  test('state filter is case-insensitive (uppercased internally)', async () => {
    await seedRate('CA', 'Sacramento', 7.25, 0.5);

    const user = await makeUser({ role: 'manager' });
    const res  = await request.get('/finance/tax-rates?state=ca').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(1);
  });

  test('returns zero results for state with no rates', async () => {
    await seedRate('CA', 'LA', 7.25, 1.0);

    const user = await makeUser({ role: 'manager' });
    const res  = await request.get('/finance/tax-rates?state=WY').set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  test('each rate includes state, county, stateTax, countyTax, totalRate', async () => {
    await seedRate('CA', 'Los Angeles', 7.25, 1.0);

    const user = await makeUser({ role: 'salesperson' });
    const res  = await request.get('/finance/tax-rates').set(authHeader(user));

    const rate = res.body.rates[0];
    expect(rate).toHaveProperty('state',     'CA');
    expect(rate).toHaveProperty('county',    'Los Angeles');
    expect(rate).toHaveProperty('stateTax',  7.25);
    expect(rate).toHaveProperty('countyTax', 1.0);
    expect(rate).toHaveProperty('totalRate', 8.25);
  });

  test('401 when unauthenticated', async () => {
    const res = await request.get('/finance/tax-rates');
    expect(res.status).toBe(401);
  });
});

// ── POST /finance/tax-rates ───────────────────────────────────────────────────

describe('POST /finance/tax-rates', () => {
  test('admin creates a new tax rate (200, upsert)', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'CA', county: 'Los Angeles', stateTax: 7.25, countyTax: 1.0 });

    expect(res.status).toBe(200);
    expect(res.body.rate).toBeDefined();
    expect(res.body.rate.state).toBe('CA');
    expect(res.body.rate.county).toBe('Los Angeles');
    expect(res.body.rate.stateTax).toBe(7.25);
    expect(res.body.rate.countyTax).toBe(1.0);
    expect(res.body.rate.totalRate).toBeCloseTo(8.25, 4);
  });

  test('totalRate is computed as stateTax + countyTax', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'TX', county: 'Travis', stateTax: 6.25, countyTax: 2.0 });

    expect(res.status).toBe(200);
    expect(res.body.rate.totalRate).toBeCloseTo(8.25, 4);
  });

  test('upserts an existing rate (updates stateTax/countyTax for same state+county)', async () => {
    const adminHdr = await adminHeader();

    await request.post('/finance/tax-rates').set(adminHdr)
      .send({ state: 'CA', county: 'Orange', stateTax: 7.25, countyTax: 0.5 });
    const res = await request.post('/finance/tax-rates').set(adminHdr)
      .send({ state: 'CA', county: 'Orange', stateTax: 7.25, countyTax: 1.25 });

    expect(res.status).toBe(200);
    expect(res.body.rate.countyTax).toBe(1.25);
    expect(res.body.rate.totalRate).toBeCloseTo(8.5, 4);

    const count = await TaxRate.countDocuments({ state: 'CA', county: 'Orange' });
    expect(count).toBe(1);
  });

  test('state is stored uppercase regardless of input case', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'ca', county: 'Alameda', stateTax: 7.25, countyTax: 1.5 });

    expect(res.status).toBe(200);
    expect(res.body.rate.state).toBe('CA');
  });

  test('county can be null (state-level rate)', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'WA', stateTax: 6.5 });

    expect(res.status).toBe(200);
    expect(res.body.rate.county).toBeNull();
    expect(res.body.rate.stateTax).toBe(6.5);
  });

  test('countyTax defaults to 0 when not provided', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'OR', county: 'Multnomah', stateTax: 0 });

    expect(res.status).toBe(200);
    expect(res.body.rate.countyTax).toBe(0);
  });

  test('422 when state exceeds 2 characters (Joi validation)', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'CALIFORNIA', county: 'LA', stateTax: 7.25 });

    expect(res.status).toBe(422);
  });

  test('422 when stateTax is missing', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .set(await adminHeader())
      .send({ state: 'CA', county: 'LA' });

    expect(res.status).toBe(422);
  });

  test('403 when manager tries to create a tax rate', async () => {
    const mgr = await makeUser({ role: 'manager' });

    const res = await request
      .post('/finance/tax-rates')
      .set(authHeader(mgr))
      .send({ state: 'CA', county: 'LA', stateTax: 7.25, countyTax: 1.0 });

    expect(res.status).toBe(403);
  });

  test('403 when salesperson tries to create a tax rate', async () => {
    const sp = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/finance/tax-rates')
      .set(authHeader(sp))
      .send({ state: 'CA', county: 'LA', stateTax: 7.25, countyTax: 1.0 });

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request
      .post('/finance/tax-rates')
      .send({ state: 'CA', county: 'LA', stateTax: 7.25, countyTax: 1.0 });

    expect(res.status).toBe(401);
  });
});
