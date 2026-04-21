const Order       = require('../models/Order');
const Invoice     = require('../models/Invoice');
const LedgerEntry = require('../models/LedgerEntry');
const { getAdapter }  = require('../adapters/adapterRegistry');
const { transition }  = require('./orderStateMachine');

const UNPAYABLE_STATES = new Set(['fulfilled', 'cancelled', 'settled']);

async function processPayment({ orderId, method, amount, details = {} }) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error('Order not found');

  if (UNPAYABLE_STATES.has(order.status)) {
    throw new Error(`Cannot process payment for order in '${order.status}' state`);
  }

  const adapter = getAdapter(method);
  adapter.validate({ amount, ...details });

  const result = await adapter.process({ amount, ...details });

  let entry;
  try {
    entry = await LedgerEntry.create({
      orderId,
      method,
      amount,
      direction: 'debit',
      reference: result.reference,
      status:    'completed',
      metadata:  result,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate completed debit — idempotent retry
      entry = await LedgerEntry.findOne({ orderId, direction: 'debit', status: 'completed' });
      const updated = await Order.findById(orderId).lean();
      return { ledgerEntry: entry.toObject(), orderStatus: updated.status };
    }
    throw err;
  }

  // Mark invoice paid — no-op if no invoice exists yet
  await Invoice.findOneAndUpdate(
    { orderId },
    { $set: { status: 'paid', paidAt: new Date() } }
  );

  // Advance order: invoiced → settled
  if (order.status === 'invoiced') {
    await transition(orderId, 'settled', { ledgerEntryId: entry._id.toString(), method });
  }

  const updated = await Order.findById(orderId).lean();
  return { ledgerEntry: entry.toObject(), orderStatus: updated.status };
}

async function refundPayment(ledgerEntryId, reason = '') {
  const original = await LedgerEntry.findById(ledgerEntryId);
  if (!original)                         throw new Error('Ledger entry not found');
  if (original.direction !== 'debit')    throw new Error('Only debit entries can be refunded');
  if (original.status === 'refunded')    throw new Error('Entry has already been refunded');
  if (original.status !== 'completed')   throw new Error(`Cannot refund entry in '${original.status}' status`);

  // Credit entry mirrors the original debit amount
  const credit = await LedgerEntry.create({
    orderId:   original.orderId,
    method:    original.method,
    amount:    original.amount,
    direction: 'credit',
    reference: `REFUND-${original._id}`,
    status:    'completed',
    metadata:  { originalEntryId: original._id.toString(), reason },
  });

  // Mark original as refunded
  original.status = 'refunded';
  await original.save();

  // Revert invoice to pending
  await Invoice.findOneAndUpdate(
    { orderId: original.orderId },
    { $set: { status: 'pending', paidAt: null } }
  );

  // If order was settled, cancel it — payment no longer holds
  const order = await Order.findById(original.orderId).lean();
  if (order && order.status === 'settled') {
    await transition(original.orderId, 'cancelled', { reason: `Payment refunded: ${reason}` });
  }

  const updatedOrder = await Order.findById(original.orderId).lean();
  return {
    credit:         credit.toObject(),
    refundedEntry:  original.toObject(),
    orderStatus:    updatedOrder?.status ?? null,
  };
}

async function getLedger(orderId) {
  const docs = await LedgerEntry.find({ orderId }).sort({ createdAt: 1 });
  return docs.map(d => d.toObject());
}

async function getWalletSummary(dealershipId = null) {
  const match = { status: { $in: ['completed', 'refunded'] } };

  if (dealershipId) {
    const Order = require('../models/Order');
    const orderIds = await Order.distinct('_id', { dealershipId });
    match.orderId = { $in: orderIds };
  }

  const rows = await LedgerEntry.aggregate([
    { $match: match },
    {
      $group: {
        _id:   { direction: '$direction', method: '$method' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let totalDebits  = 0;
  let totalCredits = 0;
  const byMethod   = {};

  for (const row of rows) {
    const { direction, method } = row._id;
    if (!byMethod[method]) byMethod[method] = { debits: 0, credits: 0, count: 0 };
    if (direction === 'debit') {
      byMethod[method].debits += row.total;
      totalDebits  += row.total;
    } else {
      byMethod[method].credits += row.total;
      totalCredits += row.total;
    }
    byMethod[method].count += row.count;
  }

  // Round all totals to 2 decimal places
  for (const m of Object.keys(byMethod)) {
    byMethod[m].debits  = parseFloat(byMethod[m].debits.toFixed(2));
    byMethod[m].credits = parseFloat(byMethod[m].credits.toFixed(2));
  }

  return {
    totalDebits:  parseFloat(totalDebits.toFixed(2)),
    totalCredits: parseFloat(totalCredits.toFixed(2)),
    netBalance:   parseFloat((totalDebits - totalCredits).toFixed(2)),
    byMethod,
  };
}

module.exports = { processPayment, refundPayment, getLedger, getWalletSummary };
