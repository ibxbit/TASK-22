const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeOrder }  = require('../backend/src/tests/helpers/fixtures');
const {
  transition,
  transitionWithRollback,
  TRANSITIONS,
  getValidTransitions,
} = require('../backend/src/services/orderStateMachine');
const Order         = require('../backend/src/models/Order');
const OrderAuditLog = require('../backend/src/models/OrderAuditLog');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── Pure / synchronous helpers ──────────────────────────────────────────────

describe('TRANSITIONS map', () => {
  test('all expected states are present', () => {
    const states = Object.keys(TRANSITIONS);
    expect(states).toEqual(expect.arrayContaining(['created','reserved','invoiced','settled','fulfilled','cancelled']));
  });

  test('fulfilled has no valid next states', () => {
    expect(TRANSITIONS.fulfilled).toEqual([]);
  });

  test('cancelled has no valid next states', () => {
    expect(TRANSITIONS.cancelled).toEqual([]);
  });

  test('created can go to reserved or cancelled', () => {
    expect(TRANSITIONS.created).toEqual(expect.arrayContaining(['reserved','cancelled']));
  });
});

describe('getValidTransitions', () => {
  test('returns array of allowed targets', () => {
    expect(getValidTransitions('created')).toEqual(expect.arrayContaining(['reserved','cancelled']));
  });

  test('returns empty array for terminal states', () => {
    expect(getValidTransitions('fulfilled')).toEqual([]);
    expect(getValidTransitions('cancelled')).toEqual([]);
  });

  test('returns empty array for unknown state', () => {
    expect(getValidTransitions('nonexistent')).toEqual([]);
  });
});

// ── DB-backed transition() ───────────────────────────────────────────────────

describe('transition()', () => {
  test('advances order through full happy path', async () => {
    const { order } = await makeOrder('created');
    await transition(order._id, 'reserved');
    await transition(order._id, 'invoiced');
    await transition(order._id, 'settled');
    await transition(order._id, 'fulfilled');
    const final = await Order.findById(order._id).lean();
    expect(final.status).toBe('fulfilled');
  });

  test('returns updated order with new status', async () => {
    const { order } = await makeOrder('created');
    const result = await transition(order._id, 'reserved');
    expect(result.status).toBe('reserved');
  });

  test('writes audit log entry on transition', async () => {
    const { order } = await makeOrder('created');
    await transition(order._id, 'reserved');
    const log = await OrderAuditLog.findOne({ orderId: order._id }).lean();
    expect(log).not.toBeNull();
    expect(log.fromState).toBe('created');
    expect(log.toState).toBe('reserved');
  });

  test('is idempotent — no audit entry written when already in target state', async () => {
    const { order } = await makeOrder('reserved');
    await transition(order._id, 'reserved');
    const logs = await OrderAuditLog.find({ orderId: order._id }).lean();
    expect(logs).toHaveLength(0);
  });

  test('throws on invalid transition (skip)', async () => {
    const { order } = await makeOrder('created');
    await expect(transition(order._id, 'settled')).rejects.toThrow(/Invalid transition/);
  });

  test('throws on transition from terminal state', async () => {
    const { order } = await makeOrder('fulfilled');
    await expect(transition(order._id, 'cancelled')).rejects.toThrow(/Invalid transition/);
  });

  test('throws when order not found', async () => {
    const { Types } = require('mongoose');
    await expect(transition(new Types.ObjectId(), 'reserved')).rejects.toThrow(/not found/i);
  });

  test('can cancel from any non-terminal state', async () => {
    for (const state of ['created', 'reserved', 'invoiced', 'settled']) {
      const { order } = await makeOrder(state);
      const result = await transition(order._id, 'cancelled');
      expect(result.status).toBe('cancelled');
    }
  });
});

// ── transitionWithRollback() ─────────────────────────────────────────────────

describe('transitionWithRollback()', () => {
  test('advances state and runs side effect on success', async () => {
    const { order } = await makeOrder('created');
    let sideEffectRan = false;
    await transitionWithRollback(order._id, 'reserved', async () => { sideEffectRan = true; });
    expect(sideEffectRan).toBe(true);
    const updated = await Order.findById(order._id).lean();
    expect(updated.status).toBe('reserved');
  });

  test('reverts to fromState when side effect throws', async () => {
    const { order } = await makeOrder('created');
    await expect(
      transitionWithRollback(order._id, 'reserved', async () => {
        throw new Error('inventory unavailable');
      })
    ).rejects.toThrow('inventory unavailable');
    const reverted = await Order.findById(order._id).lean();
    expect(reverted.status).toBe('created');
  });

  test('writes rollback audit entry with isRollback=true', async () => {
    const { order } = await makeOrder('created');
    await expect(
      transitionWithRollback(order._id, 'reserved', async () => { throw new Error('fail'); })
    ).rejects.toThrow();
    const rollbackLog = await OrderAuditLog.findOne({ orderId: order._id, isRollback: true }).lean();
    expect(rollbackLog).not.toBeNull();
    expect(rollbackLog.fromState).toBe('reserved');
    expect(rollbackLog.toState).toBe('created');
  });

  test('is idempotent — side effect not re-run when already in target state', async () => {
    const { order } = await makeOrder('reserved');
    let callCount = 0;
    await transitionWithRollback(order._id, 'reserved', async () => { callCount++; });
    expect(callCount).toBe(0);
  });

  test('error is propagated after rollback', async () => {
    const { order } = await makeOrder('created');
    const err = new Error('side effect blew up');
    await expect(
      transitionWithRollback(order._id, 'reserved', async () => { throw err; })
    ).rejects.toThrow('side effect blew up');
  });

  test('successful transition leaves no rollback audit entry', async () => {
    const { order } = await makeOrder('created');
    await transitionWithRollback(order._id, 'reserved', async () => {});
    const rollbackLog = await OrderAuditLog.findOne({ orderId: order._id, isRollback: true }).lean();
    expect(rollbackLog).toBeNull();
  });
});
