const Order         = require('../models/Order');
const OrderAuditLog = require('../models/OrderAuditLog');

const ROLLBACK_TIMEOUT_MS = 5000;

// Every valid forward and terminal transition.
// No transition is possible unless it appears here.
const TRANSITIONS = {
  created:   ['reserved',  'cancelled'],
  reserved:  ['invoiced',  'cancelled'],
  invoiced:  ['settled',   'cancelled'],
  settled:   ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

const ALL_STATES = new Set(Object.keys(TRANSITIONS));

function isValidTransition(fromState, toState) {
  const allowed = TRANSITIONS[fromState];
  return Array.isArray(allowed) && allowed.includes(toState);
}

function getValidTransitions(state) {
  return TRANSITIONS[state] ?? [];
}

async function _writeAudit(orderId, fromState, toState, { isRollback = false, failureReason = null, metadata = {} } = {}) {
  await OrderAuditLog.create({ orderId, fromState, toState, isRollback, failureReason, metadata });
}

// Internal — only called by transitionWithRollback. Never exported.
//
// CAS revert: only writes if the order is still in `currentState` (the state
// we just advanced it to). If a concurrent legitimate transition already moved
// it further, the revert is skipped to avoid corrupting valid progress.
async function _forceRevert(orderId, toState, currentState, failureReason) {
  if (!ALL_STATES.has(toState)) {
    throw new Error(`_forceRevert: unknown revert target '${toState}'`);
  }

  await _writeAudit(orderId, currentState, toState, { isRollback: true, failureReason });

  const reverted = await Order.findOneAndUpdate(
    { _id: orderId, status: currentState },   // CAS: only revert if still in failed state
    { $set: { status: toState, failureReason } },
    { new: true }
  ).lean();

  if (!reverted) {
    // A concurrent transition moved the order on — log and leave it alone
    console.error(
      `[rollback] Order ${orderId}: CAS missed — expected '${currentState}', ` +
      `order was already advanced. Revert to '${toState}' skipped.`
    );
  }

  return reverted;
}

/**
 * Validated, idempotent, concurrency-safe state transition.
 *
 * Uses a compare-and-swap (findOneAndUpdate with status precondition) to
 * prevent two concurrent requests from both advancing the same order.
 * Returns immediately — without writing an audit entry — if the order is
 * already in toState (idempotent retry).
 */
async function transition(orderId, toState, metadata = {}) {
  if (!ALL_STATES.has(toState)) {
    throw new Error(`Unknown target state: ${toState}`);
  }

  // Read current state for validation before attempting CAS
  const current = await Order.findById(orderId).lean();
  if (!current) throw new Error('Order not found');

  // Idempotency guard — silent success, no audit entry
  if (current.status === toState) return current;

  if (!ALL_STATES.has(current.status)) {
    throw new Error(`Unknown state: ${current.status}`);
  }
  if (!isValidTransition(current.status, toState)) {
    throw new Error(`Invalid transition: ${current.status} → ${toState}`);
  }

  const fromState = current.status;

  // Write audit before the state change so a crash mid-save is visible in the log
  await _writeAudit(orderId, fromState, toState, { metadata });

  // CAS: only update if status is still fromState — prevents concurrent stomps
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: fromState },
    { $set: { status: toState, failureReason: null } },
    { new: true }
  ).lean();

  if (!updated) {
    // Race lost: another request changed the status between our read and write
    const reread = await Order.findById(orderId).lean();
    if (!reread) throw new Error('Order not found');
    if (reread.status === toState) return reread; // they wrote the same target — idempotent
    throw new Error(
      `Concurrent modification: expected '${fromState}', found '${reread.status}'`
    );
  }

  return updated;
}

/**
 * Transitions state then runs sideEffect() within ROLLBACK_TIMEOUT_MS.
 * If sideEffect throws or times out:
 *   - reverts to the pre-call state
 *   - persists failure reason on the order
 *   - writes a rollback audit entry
 *   - rethrows the error
 *
 * Idempotent: if the order is already in toState when called, the side
 * effect is NOT re-executed (avoids double-reserving inventory, etc.).
 */
async function transitionWithRollback(orderId, toState, sideEffect, metadata = {}) {
  const snapshot = await Order.findById(orderId).lean();
  if (!snapshot) throw new Error('Order not found');

  // Already in target state — skip both transition and side effect
  if (snapshot.status === toState) return snapshot;

  const fromState = snapshot.status;
  await transition(orderId, toState, metadata);

  let timer;
  const timeoutHandle = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Side effect timeout after ${ROLLBACK_TIMEOUT_MS}ms`)),
      ROLLBACK_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([sideEffect(), timeoutHandle]);
    clearTimeout(timer);
  } catch (sideEffectErr) {
    clearTimeout(timer);

    console.error(
      `[rollback] Order ${orderId}: side effect failed on '${toState}' — ` +
      `reverting to '${fromState}'. Reason: ${sideEffectErr.message}`
    );

    try {
      await _forceRevert(orderId, fromState, toState, sideEffectErr.message);
    } catch (revertErr) {
      // Rollback itself failed — log prominently so ops can intervene,
      // but still throw the original error so the caller gets the right signal.
      console.error(
        `[rollback] CRITICAL — Order ${orderId}: revert to '${fromState}' failed: ` +
        `${revertErr.message}. Order may be stuck in '${toState}'.`
      );
    }

    throw sideEffectErr;
  }

  return Order.findById(orderId).lean();
}

module.exports = { transition, transitionWithRollback, TRANSITIONS, getValidTransitions };
