const request       = require('supertest');
const app           = require('../../app');
const Order         = require('../../models/Order');
const Vehicle       = require('../../models/Vehicle');
const OrderAuditLog = require('../../models/OrderAuditLog');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeOrder, makeCompletedPayment, makeUser, authHeader } = require('./helpers/fixtures');

let testUser;

beforeAll(async () => {
  await connect();
  testUser = await makeUser({ role: 'manager' });
});
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  testUser = await makeUser({ role: 'manager' });
});

function doTransition(orderId, toState) {
  return request(app)
    .patch(`/orders/${orderId}/transition`)
    .set(authHeader(testUser))
    .send({ toState });
}

// ─── reserveInventory rollback ────────────────────────────────────────────────

describe('reserveInventory rollback', () => {
  it('reverts order to created when vehicle is already reserved', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    const res = await doTransition(order._id, 'reserved');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/available/i);

    const final = await Order.findById(order._id).lean();
    expect(final.status).toBe('created');
  });

  it('reverts order to created when vehicle status is sold', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'sold' });

    const res = await doTransition(order._id, 'reserved');

    expect(res.status).toBe(500);

    const final = await Order.findById(order._id).lean();
    expect(final.status).toBe('created');
  });

  it('order is not stuck in reserved after failed reserveInventory', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    await doTransition(order._id, 'reserved');

    const stuck = await Order.findById(order._id).lean();
    expect(stuck.status).toBe('created');

    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'available' });
    const retry = await doTransition(order._id, 'reserved');
    expect(retry.status).toBe(200);
    expect(retry.body.order.status).toBe('reserved');
  });

  it('propagates the side-effect error message to the HTTP caller', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    const res = await doTransition(order._id, 'reserved');

    expect(res.body.error).toBeTruthy();
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it('creates a rollback audit entry with isRollback=true', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    await doTransition(order._id, 'reserved');

    const logs = await OrderAuditLog.find({ orderId: order._id }).sort({ timestamp: 1 }).lean();

    expect(logs.length).toBeGreaterThanOrEqual(2);

    const rollbackEntry = logs.find(l => l.isRollback === true);
    expect(rollbackEntry).toBeDefined();
    expect(rollbackEntry.fromState).toBe('reserved');
    expect(rollbackEntry.toState).toBe('created');
    expect(rollbackEntry.failureReason).toBeTruthy();
  });

  it('rollback audit entry contains the original failure reason', async () => {
    const { order, vehicle } = await makeOrder('created');
    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    await doTransition(order._id, 'reserved');

    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    const rollbackEntry = logs.find(l => l.isRollback === true);

    expect(rollbackEntry.failureReason).toMatch(/available/i);
  });

  it('vehicle status is NOT left as reserved after failed rollback', async () => {
    const { order, vehicle } = await makeOrder('created');

    await Vehicle.findByIdAndUpdate(vehicle._id, { status: 'reserved' });

    await doTransition(order._id, 'reserved');

    const finalVehicle = await Vehicle.findById(vehicle._id).lean();
    expect(finalVehicle.status).toBe('reserved');
  });
});

// ─── verifyPayment rollback ───────────────────────────────────────────────────

describe('verifyPayment rollback', () => {
  it('reverts order to invoiced when no completed payment exists', async () => {
    const { order } = await makeOrder('invoiced');

    const res = await doTransition(order._id, 'settled');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/No completed payment/i);

    const final = await Order.findById(order._id).lean();
    expect(final.status).toBe('invoiced');
  });

  it('order is not stuck in settled after verifyPayment failure', async () => {
    const { order } = await makeOrder('invoiced');

    await doTransition(order._id, 'settled');

    const afterFail = await Order.findById(order._id).lean();
    expect(afterFail.status).toBe('invoiced');

    await makeCompletedPayment(order._id);
    const retry = await doTransition(order._id, 'settled');
    expect(retry.status).toBe(200);
    expect(retry.body.order.status).toBe('settled');
  });

  it('creates a rollback audit entry with correct from/to states', async () => {
    const { order } = await makeOrder('invoiced');

    await doTransition(order._id, 'settled');

    const logs = await OrderAuditLog.find({ orderId: order._id }).sort({ timestamp: 1 }).lean();
    const rollbackEntry = logs.find(l => l.isRollback === true);

    expect(rollbackEntry).toBeDefined();
    expect(rollbackEntry.fromState).toBe('settled');
    expect(rollbackEntry.toState).toBe('invoiced');
    expect(rollbackEntry.failureReason).toMatch(/No completed payment/i);
  });

  it('propagates the payment-missing error to the caller', async () => {
    const { order } = await makeOrder('invoiced');

    const res = await doTransition(order._id, 'settled');

    expect(res.body.error).toMatch(/No completed payment/i);
  });
});

// ─── Successful side effects — no rollback ────────────────────────────────────

describe('successful side effects produce no rollback', () => {
  it('no rollback audit entry when reserveInventory succeeds', async () => {
    const { order, vehicle } = await makeOrder('created');
    expect(vehicle.status).toBe('available');

    const res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('reserved');

    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    const rollback = logs.find(l => l.isRollback === true);
    expect(rollback).toBeUndefined();
  });

  it('no rollback audit entry when verifyPayment succeeds', async () => {
    const { order } = await makeOrder('invoiced');
    await makeCompletedPayment(order._id);

    const res = await doTransition(order._id, 'settled');
    expect(res.status).toBe(200);

    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    const rollback = logs.find(l => l.isRollback === true);
    expect(rollback).toBeUndefined();
  });

  it('vehicle is marked reserved in DB after successful reserveInventory', async () => {
    const { order, vehicle } = await makeOrder('created');

    await doTransition(order._id, 'reserved');

    const updatedVehicle = await Vehicle.findById(vehicle._id).lean();
    expect(updatedVehicle.status).toBe('reserved');
  });
});

// ─── Sequential failure–retry cycle ──────────────────────────────────────────

describe('failure then success cycle', () => {
  it('order can be settled after initially failing due to missing payment', async () => {
    const { order } = await makeOrder('invoiced');

    const fail = await doTransition(order._id, 'settled');
    expect(fail.status).toBe(500);

    const fail2 = await doTransition(order._id, 'settled');
    expect(fail2.status).toBe(500);

    await makeCompletedPayment(order._id);
    const ok = await doTransition(order._id, 'settled');
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe('settled');
  });

  it('audit log correctly captures multiple failed attempts and final success', async () => {
    const { order } = await makeOrder('invoiced');

    await doTransition(order._id, 'settled');
    await makeCompletedPayment(order._id);
    await doTransition(order._id, 'settled');

    const logs = await OrderAuditLog.find({ orderId: order._id }).sort({ timestamp: 1 }).lean();

    expect(logs.length).toBeGreaterThanOrEqual(3);

    const rollbacks = logs.filter(l => l.isRollback === true);
    const forwards  = logs.filter(l => l.isRollback === false);

    expect(rollbacks.length).toBeGreaterThanOrEqual(1);
    expect(forwards.length).toBeGreaterThanOrEqual(2);

    const lastEntry = logs[logs.length - 1];
    expect(lastEntry.toState).toBe('settled');
    expect(lastEntry.isRollback).toBe(false);
  });
});
