const supertest = require('supertest');
const mongoose  = require('mongoose');
const app       = require('../backend/src/app');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeOrder, makeUser, authHeader } = require('../backend/src/tests/helpers/fixtures');
const OrderAuditLog = require('../backend/src/models/OrderAuditLog');

const request = supertest(app);

let managerUser;

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  managerUser = await makeUser({ role: 'manager' });
});

function signedGet(path) {
  return request.get(path).set(authHeader(managerUser));
}

function signedPatch(path, body) {
  return request.patch(path).set(authHeader(managerUser)).send(body);
}

// ── GET /orders/:id ───────────────────────────────────────────────────────────

describe('GET /orders/:id', () => {
  test('returns order by id', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedGet(`/orders/${order._id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('order');
    expect(res.body.order._id.toString()).toBe(order._id.toString());
  });

  test('returns 404 for unknown id', async () => {
    const res = await signedGet(`/orders/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
  });

  test('401 when no Authorization header', async () => {
    const { order } = await makeOrder('created');
    const res = await request.get(`/orders/${order._id}`);
    expect(res.status).toBe(401);
  });

  test('401 when Authorization header is malformed (not Bearer)', async () => {
    const { order } = await makeOrder('created');
    const res = await request
      .get(`/orders/${order._id}`)
      .set('Authorization', `Basic ${managerUser._id}`);
    expect(res.status).toBe(401);
  });

  test('401 when token is tampered', async () => {
    const { order } = await makeOrder('created');
    const goodHeader = authHeader(managerUser);
    const tampered = goodHeader.Authorization.slice(0, -5) + 'XXXXX';
    const res = await request
      .get(`/orders/${order._id}`)
      .set('Authorization', tampered);
    expect(res.status).toBe(401);
  });

  test('403 when order belongs to different dealership', async () => {
    const otherDealer = await makeUser({ role: 'manager' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: otherDealer.dealershipId } });
    const res = await signedGet(`/orders/${order._id}`);
    expect(res.status).toBe(403);
  });
});

// ── PATCH /orders/:id/transition ─────────────────────────────────────────────

describe('PATCH /orders/:id/transition', () => {
  test('valid transition: created → reserved', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('reserved');
  });

  test('valid transition: reserved → invoiced', async () => {
    const { order } = await makeOrder('reserved', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'invoiced' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('invoiced');
  });

  test('valid transition: any state → cancelled', async () => {
    for (const state of ['created', 'reserved', 'invoiced', 'settled']) {
      const { order } = await makeOrder(state, { orderOverrides: { dealershipId: managerUser.dealershipId } });
      const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'cancelled' });
      expect(res.status).toBe(200);
      expect(res.body.order.status).toBe('cancelled');
    }
  });

  test('invalid transition: skip states returns 422', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'settled' });
    expect(res.status).toBe(422);
  });

  test('invalid transition: from terminal state returns 422', async () => {
    const { order } = await makeOrder('fulfilled', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'cancelled' });
    expect(res.status).toBe(422);
  });

  test('missing toState returns 422 (validation error)', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, {});
    expect(res.status).toBe(422);
  });

  test('unknown order id returns 404', async () => {
    const res = await signedPatch(`/orders/${new mongoose.Types.ObjectId()}/transition`, { toState: 'reserved' });
    expect(res.status).toBe(404);
  });

  test('idempotent: transitioning to current state is a no-op (200)', async () => {
    const { order } = await makeOrder('reserved', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('reserved');
  });

  test('idempotent: no duplicate audit entries written', async () => {
    const { order } = await makeOrder('reserved', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    expect(logs).toHaveLength(0);
  });

  test('audit log is written for successful transition', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    const log = await OrderAuditLog.findOne({ orderId: order._id }).lean();
    expect(log).not.toBeNull();
    expect(log.fromState).toBe('created');
    expect(log.toState).toBe('reserved');
  });

  test('401 when no Authorization header', async () => {
    const { order } = await makeOrder('created');
    const res = await request
      .patch(`/orders/${order._id}/transition`)
      .send({ toState: 'reserved' });
    expect(res.status).toBe(401);
  });

  test('401 when X-User-Id header only (no Bearer token)', async () => {
    const { order } = await makeOrder('created');
    const res = await request
      .patch(`/orders/${order._id}/transition`)
      .set('X-User-Id', managerUser._id.toString())
      .send({ toState: 'reserved' });
    expect(res.status).toBe(401);
  });

  test('403 when role is salesperson (not allowed to transition)', async () => {
    const spUser = await makeUser({ role: 'salesperson' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: spUser.dealershipId } });
    const res = await request
      .patch(`/orders/${order._id}/transition`)
      .set(authHeader(spUser))
      .send({ toState: 'reserved' });
    expect(res.status).toBe(403);
  });

  test('403 tenant isolation: cannot transition order of different dealership', async () => {
    const otherDealer = await makeUser({ role: 'manager' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: otherDealer.dealershipId } });
    const res = await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    expect(res.status).toBe(403);
  });
});

// ── GET /orders/:id/audit ─────────────────────────────────────────────────────

describe('GET /orders/:id/audit', () => {
  test('returns audit log in chronological order', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    await signedPatch(`/orders/${order._id}/transition`, { toState: 'reserved' });
    await signedPatch(`/orders/${order._id}/transition`, { toState: 'invoiced' });
    const res = await signedGet(`/orders/${order._id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    expect(res.body.logs[0].toState).toBe('reserved');
    expect(res.body.logs[1].toState).toBe('invoiced');
  });

  test('returns empty audit log for new order', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: managerUser.dealershipId } });
    const res = await signedGet(`/orders/${order._id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(0);
  });

  test('returns 404 for unknown order id', async () => {
    const res = await signedGet(`/orders/${new mongoose.Types.ObjectId()}/audit`);
    expect(res.status).toBe(404);
  });

  test('401 when no Authorization header', async () => {
    const { order } = await makeOrder('created');
    const res = await request.get(`/orders/${order._id}/audit`);
    expect(res.status).toBe(401);
  });
});
