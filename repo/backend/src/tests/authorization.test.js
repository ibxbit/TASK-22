const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../app');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, makeOrder, authHeader } = require('./helpers/fixtures');
const { sign } = require('../../config/jwt');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// Helper: create a Bearer header with an explicit null dealershipId in the JWT
// (User model requires dealershipId, so we sign directly instead of using makeUser)
async function nullDealerHeader(role = 'manager') {
  const user = await makeUser({ role });
  const token = sign({ userId: user._id.toString(), role, dealershipId: null }, 3600);
  return { Authorization: `Bearer ${token}` };
}

// ─── Tenant isolation: orders ─────────────────────────────────────────────────

describe('Tenant isolation — orders', () => {
  it('manager cannot read an order from a different dealership', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const dealerB = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .get(`/orders/${order._id}`)
      .set(authHeader(userA));

    expect(res.status).toBe(403);
  });

  it('manager can read an order that belongs to their own dealership', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: dealerA } });

    const res = await request(app)
      .get(`/orders/${order._id}`)
      .set(authHeader(userA));

    expect(res.status).toBe(200);
    expect(res.body.order._id).toBe(order._id.toString());
  });

  it('admin can read an order from any dealership', async () => {
    const dealerB = new mongoose.Types.ObjectId();
    const admin   = await makeUser({ role: 'admin' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .get(`/orders/${order._id}`)
      .set(authHeader(admin));

    expect(res.status).toBe(200);
  });

  it('order with null dealershipId is denied to non-admin manager', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: null } });

    const res = await request(app)
      .get(`/orders/${order._id}`)
      .set(authHeader(userA));

    expect(res.status).toBe(403);
  });

  it('manager cannot transition an order from a different dealership', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const dealerB = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .patch(`/orders/${order._id}/transition`)
      .set(authHeader(userA))
      .send({ toState: 'reserved' });

    expect(res.status).toBe(403);
  });
});

// ─── Tenant isolation: payments ───────────────────────────────────────────────

describe('Tenant isolation — payments', () => {
  it('manager cannot process a payment for an order in a different dealership', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const dealerB = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .post('/payments')
      .set(authHeader(userA))
      .send({ orderId: order._id.toString(), method: 'cash', amount: 5000 });

    expect(res.status).toBe(403);
  });

  it('manager can process a payment for their own dealership order', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId: dealerA } });

    const res = await request(app)
      .post('/payments')
      .set(authHeader(userA))
      .send({ orderId: order._id.toString(), method: 'cash', amount: 5000 });

    expect(res.status).toBe(201);
  });
});

// ─── Role-based access: reconciliation ───────────────────────────────────────

describe('RBAC — reconciliation (admin only)', () => {
  it('salesperson is denied access to reconciliation logs (403)', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request(app)
      .get('/reconciliation/logs')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  it('manager is denied access to reconciliation logs (403)', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .get('/reconciliation/logs')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  it('admin can access reconciliation logs', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await request(app)
      .get('/reconciliation/logs')
      .set(authHeader(admin));

    expect([200, 204]).toContain(res.status);
  });

  it('unauthenticated request to reconciliation is rejected 401', async () => {
    const res = await request(app).get('/reconciliation/logs');
    expect(res.status).toBe(401);
  });
});

// ─── Role-based access: analytics events ─────────────────────────────────────

describe('RBAC — analytics events', () => {
  it('salesperson cannot list analytics events (403)', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request(app)
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  it('manager can list analytics events', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(200);
  });

  it('admin can list analytics events', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await request(app)
      .get('/analytics/events')
      .set(authHeader(admin));

    expect(res.status).toBe(200);
  });

  it('unauthenticated request to analytics events is rejected 401', async () => {
    const res = await request(app).get('/analytics/events');
    expect(res.status).toBe(401);
  });

  it('GET /analytics/trending is public (no auth required)', async () => {
    const res = await request(app).get('/analytics/trending');
    expect(res.status).toBe(200);
  });
});

// ─── Finance: invoice preview tenant isolation ────────────────────────────────

describe('Finance — invoice preview tenant isolation', () => {
  it('manager cannot preview invoice for an order in a different dealership', async () => {
    const dealerA = new mongoose.Types.ObjectId();
    const dealerB = new mongoose.Types.ObjectId();
    const userA   = await makeUser({ role: 'manager', dealershipId: dealerA });
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId: dealerB } });

    const res = await request(app)
      .get(`/finance/invoice-preview/${order._id}?state=CA&county=Los+Angeles`)
      .set(authHeader(userA));

    expect(res.status).toBe(403);
  });

  it('invoice preview requires state and county query params', async () => {
    const dealer = new mongoose.Types.ObjectId();
    const user   = await makeUser({ role: 'manager', dealershipId: dealer });
    const { order } = await makeOrder('invoiced', { orderOverrides: { dealershipId: dealer } });

    const res = await request(app)
      .get(`/finance/invoice-preview/${order._id}`)
      .set(authHeader(user));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('unauthenticated invoice preview request is rejected 401', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/finance/invoice-preview/${fakeId}?state=CA&county=LA`);

    expect(res.status).toBe(401);
  });
});

// ─── Experiments: write access (admin only) ───────────────────────────────────

describe('RBAC — experiments', () => {
  it('salesperson cannot create an experiment (403)', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request(app)
      .post('/experiments')
      .set(authHeader(user))
      .send({
        name: 'Test Exp',
        scope: 'listing_layout',
        variants: [
          { key: 'control', label: 'Control', weight: 50 },
          { key: 'variant_a', label: 'Variant A', weight: 50 },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('unauthenticated request to create experiment is rejected 401', async () => {
    const res = await request(app)
      .post('/experiments')
      .send({ name: 'X', scope: 'listing_layout', variants: [] });

    expect(res.status).toBe(401);
  });
});

// ─── Null dealershipId bypass prevention ─────────────────────────────────────
// User model requires dealershipId, so we sign JWTs directly with null dealershipId
// to test the server-side defensive code path.

describe('Null dealershipId bypass prevention', () => {
  it('token with null dealershipId cannot access cross-tenant orders', async () => {
    const header = await nullDealerHeader('manager');
    const { order } = await makeOrder('created', {
      orderOverrides: { dealershipId: new mongoose.Types.ObjectId() },
    });

    const res = await request(app)
      .get(`/orders/${order._id}`)
      .set(header);

    expect(res.status).toBe(403);
  });

  it('token with null dealershipId cannot transition orders', async () => {
    const header = await nullDealerHeader('manager');
    const { order } = await makeOrder('created', {
      orderOverrides: { dealershipId: new mongoose.Types.ObjectId() },
    });

    const res = await request(app)
      .patch(`/orders/${order._id}/transition`)
      .set(header)
      .send({ toState: 'reserved' });

    expect(res.status).toBe(403);
  });

  it('token with null dealershipId cannot process payments for any order', async () => {
    const header = await nullDealerHeader('manager');
    const { order } = await makeOrder('invoiced', {
      orderOverrides: { dealershipId: new mongoose.Types.ObjectId() },
    });

    const res = await request(app)
      .post('/payments')
      .set(header)
      .send({ orderId: order._id.toString(), method: 'cash', amount: 5000 });

    expect(res.status).toBe(403);
  });
});
