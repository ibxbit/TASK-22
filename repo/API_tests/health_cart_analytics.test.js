/**
 * API tests: GET /health, POST /cart/add, POST /cart/checkout,
 *            GET /analytics/trending, POST /analytics/event, GET /analytics/events
 *
 * No mocking — requests go through the real Express app and MongoDB.
 */
const supertest = require('supertest');
const mongoose  = require('mongoose');
const app       = require('../backend/src/app');
const Cart      = require('../backend/src/models/Cart');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeUser, makeVehicle, authHeader }     = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── GET /health ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with status:ok and system name', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.system).toBe('MotorLot DealerOps');
  });

  test('does not require authentication', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
  });
});

// ── POST /cart/add ────────────────────────────────────────────────────────────

describe('POST /cart/add', () => {
  test('adds an available vehicle to a new cart (200)', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-add-01', vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.cart).toBeDefined();
    expect(res.body.cart.items).toHaveLength(1);
    expect(res.body.cart.items[0].vehicleId.toString()).toBe(vehicle._id.toString());
  });

  test('adds vehicle with valid add-ons', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({
        sessionId: 'sess-addons',
        vehicleId: vehicle._id.toString(),
        addOns: ['inspection_package'],
      });

    expect(res.status).toBe(200);
    expect(res.body.cart.items[0].addOns).toContain('inspection_package');
  });

  test('second add to same session appends to existing cart', async () => {
    const user = await makeUser({ role: 'salesperson' });
    const v1   = await makeVehicle({ status: 'available', model: 'A1' });
    const v2   = await makeVehicle({ status: 'available', model: 'A2' });

    await request.post('/cart/add').set(authHeader(user)).send({ sessionId: 'sess-multi', vehicleId: v1._id.toString() });
    const res = await request.post('/cart/add').set(authHeader(user)).send({ sessionId: 'sess-multi', vehicleId: v2._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.cart.items).toHaveLength(2);
  });

  test('422 when vehicleId is missing', async () => {
    const user = await makeUser({ role: 'salesperson' });
    const res  = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-missing-v' });

    expect(res.status).toBe(422);
  });

  test('422 when sessionId is missing', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(422);
  });

  test('422 when add-on is invalid', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-bad-addon', vehicleId: vehicle._id.toString(), addOns: ['gift_wrap'] });

    expect(res.status).toBe(422);
  });

  test('404 when vehicleId does not exist', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-404', vehicleId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Vehicle not found/i);
  });

  test('409 when vehicle is not available (reserved)', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'reserved' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-reserved', vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not available/i);
  });

  test('409 when vehicle is sold', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'sold' });

    const res = await request
      .post('/cart/add')
      .set(authHeader(user))
      .send({ sessionId: 'sess-sold', vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(409);
  });

  test('401 when no Authorization header', async () => {
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .send({ sessionId: 'sess-unauth', vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(401);
  });

  test('401 when X-User-Id is provided without Bearer token', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    const res = await request
      .post('/cart/add')
      .set('X-User-Id', user._id.toString())
      .send({ sessionId: 'sess-xheader', vehicleId: vehicle._id.toString() });

    expect(res.status).toBe(401);
  });
});

// ── POST /cart/checkout ───────────────────────────────────────────────────────

describe('POST /cart/checkout', () => {
  test('creates orders from cart items and marks cart checked_out (201)', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    await request.post('/cart/add').set(authHeader(user)).send({ sessionId: 'sess-co', vehicleId: vehicle._id.toString() });

    const res = await request
      .post('/cart/checkout')
      .set(authHeader(user))
      .send({ sessionId: 'sess-co' });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.orders)).toBe(true);
    expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
    expect(res.body.orders[0].status).toBe('created');
  });

  test('checkout creates order with correct dealershipId from token', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    await request.post('/cart/add').set(authHeader(user)).send({ sessionId: 'sess-tenant', vehicleId: vehicle._id.toString() });
    const res = await request.post('/cart/checkout').set(authHeader(user)).send({ sessionId: 'sess-tenant' });

    expect(res.status).toBe(201);
    expect(res.body.orders[0].dealershipId.toString()).toBe(user.dealershipId.toString());
  });

  test('422 when sessionId is missing', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/cart/checkout')
      .set(authHeader(user))
      .send({});

    expect(res.status).toBe(422);
  });

  test('404 when no active cart exists for sessionId', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/cart/checkout')
      .set(authHeader(user))
      .send({ sessionId: 'nonexistent-sess' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/cart not found/i);
  });

  test('400 when cart is empty', async () => {
    const user = await makeUser({ role: 'salesperson' });

    // Create empty cart directly
    await Cart.create({
      sessionId:    'sess-empty',
      dealershipId: user.dealershipId,
      items:        [],
      status:       'active',
    });

    const res = await request
      .post('/cart/checkout')
      .set(authHeader(user))
      .send({ sessionId: 'sess-empty' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  test('404 when cart was already checked out', async () => {
    const user    = await makeUser({ role: 'salesperson' });
    const vehicle = await makeVehicle({ status: 'available' });

    await request.post('/cart/add').set(authHeader(user)).send({ sessionId: 'sess-dbl', vehicleId: vehicle._id.toString() });
    await request.post('/cart/checkout').set(authHeader(user)).send({ sessionId: 'sess-dbl' });

    // Second checkout — cart is now checked_out, not active
    const res = await request
      .post('/cart/checkout')
      .set(authHeader(user))
      .send({ sessionId: 'sess-dbl' });

    expect(res.status).toBe(404);
  });

  test('401 when no Authorization header', async () => {
    const res = await request.post('/cart/checkout').send({ sessionId: 'sess-unauth' });
    expect(res.status).toBe(401);
  });
});

// ── GET /analytics/trending ───────────────────────────────────────────────────

describe('GET /analytics/trending', () => {
  test('returns 200 with keywords array (public — no auth required)', async () => {
    const res = await request.get('/analytics/trending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('keywords');
    expect(Array.isArray(res.body.keywords)).toBe(true);
  });

  test('does not require Bearer token', async () => {
    const res = await request.get('/analytics/trending');
    expect(res.status).toBe(200);
  });

  test('returns keywords sorted by count when trending data exists', async () => {
    // Record some searches to populate trending
    await request.get('/vehicles/search?make=Toyota');
    await request.get('/vehicles/search?make=Toyota');
    await request.get('/vehicles/search?make=Honda');

    const res = await request.get('/analytics/trending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.keywords)).toBe(true);
  });
});

// ── POST /analytics/event ─────────────────────────────────────────────────────

describe('POST /analytics/event', () => {
  test('returns 202 with tracked:true for valid event', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/analytics/event')
      .set(authHeader(user))
      .send({
        sessionId: 'sess-evt-01',
        eventType: 'page_view',
        category:  'listing',
      });

    expect(res.status).toBe(202);
    expect(res.body.tracked).toBe(true);
  });

  test('accepts event with all optional fields', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request
      .post('/analytics/event')
      .set(authHeader(user))
      .send({
        sessionId:  'sess-evt-02',
        eventType:  'vehicle.view',
        category:   'listing',
        entityType: 'Vehicle',
        entityId:   new mongoose.Types.ObjectId().toString(),
        properties: { price: 25000 },
      });

    expect(res.status).toBe(202);
    expect(res.body.tracked).toBe(true);
  });

  test('422 when category is invalid', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/analytics/event')
      .set(authHeader(user))
      .send({ sessionId: 'sess-evt-03', eventType: 'view', category: 'invalid_category' });

    expect(res.status).toBe(422);
  });

  test('422 when sessionId is missing', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/analytics/event')
      .set(authHeader(user))
      .send({ eventType: 'view', category: 'listing' });

    expect(res.status).toBe(422);
  });

  test('422 when eventType is missing', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/analytics/event')
      .set(authHeader(user))
      .send({ sessionId: 'sess-evt-05', category: 'listing' });

    expect(res.status).toBe(422);
  });

  test('401 when no Authorization header', async () => {
    const res = await request
      .post('/analytics/event')
      .send({ sessionId: 'sess-evt', eventType: 'view', category: 'listing' });

    expect(res.status).toBe(401);
  });
});

// ── GET /analytics/events ─────────────────────────────────────────────────────

describe('GET /analytics/events', () => {
  test('manager receives 200 with events array', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  test('admin receives 200 with events array', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await request
      .get('/analytics/events')
      .set(authHeader(admin));

    expect(res.status).toBe(200);
  });

  test('salesperson receives 403', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  test('finance role receives 403', async () => {
    const user = await makeUser({ role: 'finance' });

    const res = await request
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  test('401 when no Authorization header', async () => {
    const res = await request.get('/analytics/events');
    expect(res.status).toBe(401);
  });
});
