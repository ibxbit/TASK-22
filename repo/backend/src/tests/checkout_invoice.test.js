const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../app');
const TaxRate  = require('../../models/TaxRate');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, makeOrder, authHeader }       = require('./helpers/fixtures');

let manager;
let dealershipId;

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  dealershipId = new mongoose.Types.ObjectId();
  manager = await makeUser({ role: 'manager', dealershipId });
  // Seed a tax rate so invoice preview can resolve tax
  await TaxRate.create({
    state:     'CA',
    county:    'Los Angeles',
    stateTax:  7.25,
    countyTax: 1.0,
    totalRate: 8.25,
  });
});

function previewUrl(orderId, state = 'CA', county = 'Los Angeles') {
  return `/finance/invoice-preview/${orderId}?state=${encodeURIComponent(state)}&county=${encodeURIComponent(county)}`;
}

// ─── Response shape contract ──────────────────────────────────────────────────

describe('GET /finance/invoice-preview/:orderId — response shape', () => {
  it('returns a preview object at res.body.preview (not top-level)', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    expect(res.status).toBe(200);
    expect(res.body.preview).toBeDefined();
    expect(res.body.orderId).toBeUndefined(); // NOT at top-level
  });

  it('preview contains orderId, subtotal, total, lineItems, tax, generatedAt', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    expect(res.status).toBe(200);
    const { preview } = res.body;
    expect(preview).toHaveProperty('orderId');
    expect(preview).toHaveProperty('subtotal');
    expect(preview).toHaveProperty('total');
    expect(preview).toHaveProperty('lineItems');
    expect(preview).toHaveProperty('tax');
    expect(preview).toHaveProperty('generatedAt');
  });

  it('preview.tax contains totalTaxAmount (not totalTax)', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    expect(res.status).toBe(200);
    const { tax } = res.body.preview;
    expect(tax).toHaveProperty('totalTaxAmount');
    expect(tax.totalTax).toBeUndefined(); // old incorrect field name must not appear
  });

  it('preview.tax contains stateRate, countyRate, totalRate', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    const { tax } = res.body.preview;
    expect(tax).toHaveProperty('stateRate');
    expect(tax).toHaveProperty('countyRate');
    expect(tax).toHaveProperty('totalRate');
  });

  it('preview.total equals subtotal + totalTaxAmount', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    const { preview } = res.body;
    const expected = parseFloat((preview.subtotal + preview.tax.totalTaxAmount).toFixed(2));
    expect(preview.total).toBeCloseTo(expected, 2);
  });

  it('preview.lineItems is an array with at least one entry', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    expect(Array.isArray(res.body.preview.lineItems)).toBe(true);
    expect(res.body.preview.lineItems.length).toBeGreaterThanOrEqual(1);
  });

  it('generatedAt is a valid ISO 8601 timestamp', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager));

    expect(res.status).toBe(200);
    const ts = new Date(res.body.preview.generatedAt);
    expect(ts.getTime()).not.toBeNaN();
  });
});

// ─── Missing query parameters ─────────────────────────────────────────────────

describe('GET /finance/invoice-preview/:orderId — required params', () => {
  it('returns 400 when state query param is missing', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(`/finance/invoice-preview/${order._id}?county=Los Angeles`)
      .set(authHeader(manager));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/state/i);
  });

  it('returns 400 when county query param is missing', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(`/finance/invoice-preview/${order._id}?state=CA`)
      .set(authHeader(manager));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/county/i);
  });

  it('returns 400 when both state and county are missing', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app)
      .get(`/finance/invoice-preview/${order._id}`)
      .set(authHeader(manager));

    expect(res.status).toBe(400);
  });
});

// ─── Not found and auth ───────────────────────────────────────────────────────

describe('GET /finance/invoice-preview/:orderId — error cases', () => {
  it('returns 404 for a non-existent orderId', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(previewUrl(fakeId))
      .set(authHeader(manager));

    expect(res.status).toBe(404);
  });

  it('returns 401 without Bearer token', async () => {
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId } });

    const res = await request(app).get(previewUrl(order._id));
    expect(res.status).toBe(401);
  });

  it('returns 403 for an order belonging to a different dealership', async () => {
    const dealerB = new mongoose.Types.ObjectId();
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .get(previewUrl(order._id))
      .set(authHeader(manager)); // manager belongs to dealershipId, not dealerB

    expect(res.status).toBe(403);
  });
});
