const request       = require('supertest');
const mongoose      = require('mongoose');
const app           = require('../../app');
const Order         = require('../../models/Order');
const OrderAuditLog = require('../../models/OrderAuditLog');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeOrder, makeCompletedPayment, makeUser, authHeader } = require('./helpers/fixtures');

let testUser;

beforeAll(async () => {
  await connect();
  testUser = await makeUser({ role: 'manager' });
});
afterAll(() => disconnect());
beforeEach(() => clearCollections().then(() => {
  // Re-create the test user after collections are cleared
  return makeUser({ role: 'manager' }).then(u => { testUser = u; });
}));

function doTransition(orderId, toState) {
  const path = `/orders/${orderId}/transition`;
  const body = { toState };
  return request(app)
    .patch(path)
    .set(authHeader(testUser))
    .send(body);
}

function getOrderReq(orderId) {
  return request(app)
    .get(`/orders/${orderId}`)
    .set(authHeader(testUser));
}

function getAuditReq(orderId) {
  return request(app)
    .get(`/orders/${orderId}/audit`)
    .set(authHeader(testUser));
}

// ─── Valid transitions ────────────────────────────────────────────────────────

describe('valid transitions', () => {
  it('created → cancelled', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'cancelled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
  });

  it('created → reserved (vehicle available)', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('reserved');
  });

  it('reserved → invoiced', async () => {
    const { order } = await makeOrder('reserved');
    const res = await doTransition(order._id, 'invoiced');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('invoiced');
  });

  it('reserved → cancelled', async () => {
    const { order } = await makeOrder('reserved');
    const res = await doTransition(order._id, 'cancelled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
  });

  it('invoiced → cancelled', async () => {
    const { order } = await makeOrder('invoiced');
    const res = await doTransition(order._id, 'cancelled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
  });

  it('invoiced → settled (with completed payment)', async () => {
    const { order } = await makeOrder('invoiced');
    await makeCompletedPayment(order._id);
    const res = await doTransition(order._id, 'settled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('settled');
  });

  it('settled → fulfilled', async () => {
    const { order } = await makeOrder('settled');
    const res = await doTransition(order._id, 'fulfilled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('fulfilled');
  });

  it('settled → cancelled', async () => {
    const { order } = await makeOrder('settled');
    const res = await doTransition(order._id, 'cancelled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('cancelled');
  });

  it('full lifecycle: created → reserved → invoiced → settled → fulfilled', async () => {
    const { order } = await makeOrder('created');

    let res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('reserved');

    res = await doTransition(order._id, 'invoiced');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('invoiced');

    await makeCompletedPayment(order._id);

    res = await doTransition(order._id, 'settled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('settled');

    res = await doTransition(order._id, 'fulfilled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('fulfilled');
  });
});

// ─── Invalid transitions ──────────────────────────────────────────────────────

describe('invalid transitions', () => {
  it('created → invoiced (skip) is rejected 422', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'invoiced');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('created → settled (skip) is rejected 422', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'settled');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('created → fulfilled (skip) is rejected 422', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'fulfilled');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('reserved → settled (skip invoiced) is rejected 422', async () => {
    const { order } = await makeOrder('reserved');
    const res = await doTransition(order._id, 'settled');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('invoiced → reserved (backward) is rejected 422', async () => {
    const { order } = await makeOrder('invoiced');
    const res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('fulfilled → cancelled (from terminal) is rejected 422', async () => {
    const { order } = await makeOrder('fulfilled');
    const res = await doTransition(order._id, 'cancelled');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('fulfilled → reserved (from terminal) is rejected 422', async () => {
    const { order } = await makeOrder('fulfilled');
    const res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('cancelled → reserved (from terminal) is rejected 422', async () => {
    const { order } = await makeOrder('cancelled');
    const res = await doTransition(order._id, 'reserved');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Invalid transition/);
  });

  it('cancelled → created (backward from terminal) is rejected', async () => {
    const { order } = await makeOrder('cancelled');
    const res = await doTransition(order._id, 'created');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('unknown toState is rejected', async () => {
    const { order } = await makeOrder('created');
    const res = await doTransition(order._id, 'flying');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('non-existent orderId returns error', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await doTransition(fakeId, 'reserved');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('malformed orderId returns error', async () => {
    const res = await doTransition('not-an-id', 'reserved');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('transitioning to current state returns 200 without changing status', async () => {
    const { order } = await makeOrder('invoiced');

    const res1 = await doTransition(order._id, 'invoiced');
    const res2 = await doTransition(order._id, 'invoiced');
    const res3 = await doTransition(order._id, 'invoiced');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);

    [res1, res2, res3].forEach(r => expect(r.body.order.status).toBe('invoiced'));

    const finalOrder = await Order.findById(order._id).lean();
    expect(finalOrder.status).toBe('invoiced');
  });

  it('idempotent transitions do not write audit log entries', async () => {
    const { order } = await makeOrder('reserved');

    await doTransition(order._id, 'reserved');
    await doTransition(order._id, 'reserved');

    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    expect(logs.length).toBe(0);
  });

  it('transitioning to current state for fulfilled returns current state', async () => {
    const { order } = await makeOrder('fulfilled');

    const res = await doTransition(order._id, 'fulfilled');
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('fulfilled');
  });
});

// ─── GET /orders/:id — validTransitions ──────────────────────────────────────

describe('GET /orders/:id validTransitions', () => {
  const VALID = {
    created:   ['reserved', 'cancelled'],
    reserved:  ['invoiced', 'cancelled'],
    invoiced:  ['settled',  'cancelled'],
    settled:   ['fulfilled','cancelled'],
    fulfilled: [],
    cancelled: [],
  };

  for (const [status, expected] of Object.entries(VALID)) {
    it(`validTransitions for '${status}' matches state machine map`, async () => {
      const { order } = await makeOrder(status);

      const res = await getOrderReq(order._id);

      expect(res.status).toBe(200);
      expect(res.body.validTransitions.sort()).toEqual(expected.sort());
    });
  }

  it('returns 404 for unknown orderId', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await getOrderReq(fakeId);
    expect(res.status).toBe(404);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe('audit log', () => {
  it('each transition creates one audit log entry', async () => {
    const { order } = await makeOrder('created');

    await doTransition(order._id, 'cancelled');

    const res = await getAuditReq(order._id);
    expect(res.status).toBe(200);

    const logs = res.body.logs;
    expect(logs.length).toBe(1);
    expect(logs[0].fromState).toBe('created');
    expect(logs[0].toState).toBe('cancelled');
    expect(logs[0].isRollback).toBe(false);
  });

  it('audit entries are ordered by timestamp ascending', async () => {
    const { order } = await makeOrder('created');

    await doTransition(order._id, 'reserved');
    await doTransition(order._id, 'invoiced');
    await doTransition(order._id, 'cancelled');

    const res = await getAuditReq(order._id);
    const logs = res.body.logs;

    expect(logs.length).toBe(3);

    for (let i = 1; i < logs.length; i++) {
      expect(new Date(logs[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(logs[i - 1].timestamp).getTime());
    }
  });

  it('audit log records the from/to states for each step of full lifecycle', async () => {
    const { order } = await makeOrder('created');

    await doTransition(order._id, 'reserved');
    await doTransition(order._id, 'invoiced');
    await makeCompletedPayment(order._id);
    await doTransition(order._id, 'settled');
    await doTransition(order._id, 'fulfilled');

    const res  = await getAuditReq(order._id);
    const logs = res.body.logs;

    expect(logs.length).toBe(4);
    expect(logs[0]).toMatchObject({ fromState: 'created',   toState: 'reserved'  });
    expect(logs[1]).toMatchObject({ fromState: 'reserved',  toState: 'invoiced'  });
    expect(logs[2]).toMatchObject({ fromState: 'invoiced',  toState: 'settled'   });
    expect(logs[3]).toMatchObject({ fromState: 'settled',   toState: 'fulfilled' });
  });
});

// ─── Concurrent transitions ───────────────────────────────────────────────────

describe('concurrent transitions', () => {
  it('two conflicting concurrent transitions leave order in exactly one valid state', async () => {
    const { order } = await makeOrder('created');

    const [toReserved, toCancelled] = await Promise.all([
      doTransition(order._id, 'reserved'),
      doTransition(order._id, 'cancelled'),
    ]);

    const statuses = [toReserved.status, toCancelled.status];
    expect(statuses.some(s => s === 200)).toBe(true);

    const finalOrder = await Order.findById(order._id).lean();
    expect(['reserved', 'cancelled']).toContain(finalOrder.status);
  });

  it('three concurrent requests to same target converge to that state', async () => {
    const { order } = await makeOrder('invoiced');

    const results = await Promise.all([
      doTransition(order._id, 'cancelled'),
      doTransition(order._id, 'cancelled'),
      doTransition(order._id, 'cancelled'),
    ]);

    results.forEach(r => expect(r.status).toBe(200));

    const finalOrder = await Order.findById(order._id).lean();
    expect(finalOrder.status).toBe('cancelled');
  });

  it('final state is never left in a pre-transition ghost state', async () => {
    const { order } = await makeOrder('settled');

    await Promise.all([
      doTransition(order._id, 'fulfilled'),
      doTransition(order._id, 'cancelled'),
      doTransition(order._id, 'fulfilled'),
    ]);

    const finalOrder = await Order.findById(order._id).lean();
    expect(['fulfilled', 'cancelled']).toContain(finalOrder.status);
  });
});
