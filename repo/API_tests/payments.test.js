const supertest   = require('supertest');
const mongoose    = require('mongoose');
const app         = require('../backend/src/app');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeOrder, makeUser, makeCompletedPayment, authHeader } = require('../backend/src/tests/helpers/fixtures');
const LedgerEntry = require('../backend/src/models/LedgerEntry');

const request = supertest(app);

let financeUser;

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  financeUser = await makeUser({ role: 'finance' });
});

function signedGet(path) {
  return request.get(path).set(authHeader(financeUser));
}

function signedPost(path, body) {
  return request.post(path).set(authHeader(financeUser)).send(body);
}

// ── POST /payments ────────────────────────────────────────────────────

describe('POST /payments', () => {
  test('creates payment and returns ledger entry (201)', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const res = await signedPost('/payments', {
      orderId: order._id,
      method:  'cash',
      amount:  12000,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('ledgerEntry');
    expect(res.body.ledgerEntry.direction).toBe('debit');
    expect(res.body.ledgerEntry.status).toBe('completed');
  });

  test('422 for missing orderId (validation)', async () => {
    const res = await signedPost('/payments', { method: 'cash', amount: 1000 });
    expect(res.status).toBe(422);
  });

  test('422 for missing amount (validation)', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const res = await signedPost('/payments', { orderId: order._id, method: 'cash' });
    expect(res.status).toBe(422);
  });

  test('404 for non-existent order', async () => {
    const res = await signedPost('/payments', {
      orderId: new mongoose.Types.ObjectId(),
      method:  'cash',
      amount:  1000,
    });
    expect(res.status).toBe(404);
  });

  test('400 for fulfilled order', async () => {
    const { order } = await makeOrder('fulfilled', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const res = await signedPost('/payments', {
      orderId: order._id,
      method:  'cash',
      amount:  1000,
    });
    expect(res.status).toBe(400);
  });

  test('401 when no Authorization header', async () => {
    const { order } = await makeOrder('created');
    const res = await request.post('/payments').send({ orderId: order._id, method: 'cash', amount: 1000 });
    expect(res.status).toBe(401);
  });

  test('401 when X-User-Id header only (no Bearer token)', async () => {
    const { order } = await makeOrder('created');
    const res = await request
      .post('/payments')
      .set('X-User-Id', financeUser._id.toString())
      .send({ orderId: order._id, method: 'cash', amount: 1000 });
    expect(res.status).toBe(401);
  });

  test('403 when salesperson tries to pay (wrong role)', async () => {
    const spUser = await makeUser({ role: 'salesperson' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: spUser.dealershipId } });
    const res = await request
      .post('/payments')
      .set(authHeader(spUser))
      .send({ orderId: order._id, method: 'cash', amount: 1000 });
    expect(res.status).toBe(403);
  });

  test('403 tenant isolation: cannot pay for order of different dealership', async () => {
    const otherDealer = await makeUser({ role: 'finance' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: otherDealer.dealershipId } });
    const res = await request
      .post('/payments')
      .set(authHeader(financeUser))
      .send({ orderId: order._id, method: 'cash', amount: 1000 });
    expect(res.status).toBe(403);
  });
});

// ── GET /payments/wallet ──────────────────────────────────────────────────────

describe('GET /payments/wallet', () => {
  test('returns summary with zero totals when empty', async () => {
    const res = await signedGet('/payments/wallet');
    expect(res.status).toBe(200);
    expect(res.body.totalDebits).toBe(0);
    expect(res.body.totalCredits).toBe(0);
    expect(res.body.netBalance).toBe(0);
  });

  test('reflects payments in totals', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    await makeCompletedPayment(order._id, 10000);
    const res = await signedGet('/payments/wallet');
    expect(res.status).toBe(200);
    expect(res.body.totalDebits).toBe(10000);
  });

  test('401 when unauthenticated', async () => {
    const res = await request.get('/payments/wallet');
    expect(res.status).toBe(401);
  });
});

// ── GET /payments/ledger/:orderId ─────────────────────────────────────────────

describe('GET /payments/ledger/:orderId', () => {
  test('returns ledger entries for order', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    await makeCompletedPayment(order._id, 5000);
    const res = await signedGet(`/payments/ledger/${order._id}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].amount).toBe(5000);
  });

  test('returns empty array when no entries', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const res = await signedGet(`/payments/ledger/${order._id}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });

  test('401 when unauthenticated', async () => {
    const { order } = await makeOrder('created');
    const res = await request.get(`/payments/ledger/${order._id}`);
    expect(res.status).toBe(401);
  });

  test('403 tenant isolation: cannot view ledger of different dealership', async () => {
    const otherDealer = await makeUser({ role: 'finance' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: otherDealer.dealershipId } });
    const res = await signedGet(`/payments/ledger/${order._id}`);
    expect(res.status).toBe(403);
  });
});

// ── POST /payments/:id/refund ─────────────────────────────────────────────────

describe('POST /payments/:id/refund', () => {
  test('refunds a completed debit entry', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const entry = await makeCompletedPayment(order._id, 6000);
    const refundPath = `/payments/${entry._id}/refund`;
    const res = await request
      .post(refundPath)
      .set(authHeader(financeUser))
      .send({ reason: 'customer request' });
    expect(res.status).toBe(200);
    expect(res.body.credit.direction).toBe('credit');
    expect(res.body.credit.amount).toBe(6000);
    expect(res.body.refundedEntry.status).toBe('refunded');
  });

  test('400 when entry not found', async () => {
    const refundPath = `/payments/${new mongoose.Types.ObjectId()}/refund`;
    const res = await request
      .post(refundPath)
      .set(authHeader(financeUser))
      .send({});
    expect(res.status).toBe(400);
  });

  test('400 when refunding already-refunded entry', async () => {
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: financeUser.dealershipId } });
    const entry = await makeCompletedPayment(order._id, 1000);
    const refundPath = `/payments/${entry._id}/refund`;
    await request.post(refundPath).set(authHeader(financeUser)).send({});
    const res = await request.post(refundPath).set(authHeader(financeUser)).send({});
    expect(res.status).toBe(400);
  });

  test('401 when unauthenticated', async () => {
    const { order } = await makeOrder('created');
    const entry = await makeCompletedPayment(order._id, 1000);
    const res = await request.post(`/payments/${entry._id}/refund`).send({});
    expect(res.status).toBe(401);
  });

  test('403 when salesperson tries to refund (wrong role)', async () => {
    const spUser = await makeUser({ role: 'salesperson' });
    const { order } = await makeOrder('created', { orderOverrides: { dealershipId: spUser.dealershipId } });
    const entry = await makeCompletedPayment(order._id, 1000);
    const res = await request
      .post(`/payments/${entry._id}/refund`)
      .set(authHeader(spUser))
      .send({});
    expect(res.status).toBe(403);
  });
});
