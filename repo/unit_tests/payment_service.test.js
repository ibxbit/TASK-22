const mongoose   = require('mongoose');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeOrder, makeCompletedPayment } = require('../backend/src/tests/helpers/fixtures');
const { processPayment, refundPayment, getWalletSummary } = require('../backend/src/services/paymentService');
const LedgerEntry = require('../backend/src/models/LedgerEntry');
const Order       = require('../backend/src/models/Order');
const Invoice     = require('../backend/src/models/Invoice');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── processPayment() ──────────────────────────────────────────────────────────

describe('processPayment()', () => {
  test('creates a completed debit ledger entry', async () => {
    const { order } = await makeOrder('created');
    const { ledgerEntry } = await processPayment({
      orderId: order._id,
      method:  'cash',
      amount:  15000,
    });
    expect(ledgerEntry.direction).toBe('debit');
    expect(ledgerEntry.status).toBe('completed');
    expect(ledgerEntry.amount).toBe(15000);
  });

  test('advances invoiced order to settled', async () => {
    const { order } = await makeOrder('invoiced');
    const { orderStatus } = await processPayment({
      orderId: order._id,
      method:  'cash',
      amount:  20000,
    });
    expect(orderStatus).toBe('settled');
  });

  test('does not advance non-invoiced order', async () => {
    const { order } = await makeOrder('created');
    const { orderStatus } = await processPayment({
      orderId: order._id,
      method:  'cash',
      amount:  10000,
    });
    expect(orderStatus).toBe('created');
  });

  test('throws for fulfilled order', async () => {
    const { order } = await makeOrder('fulfilled');
    await expect(
      processPayment({ orderId: order._id, method: 'cash', amount: 1000 })
    ).rejects.toThrow(/Cannot process payment/);
  });

  test('throws for cancelled order', async () => {
    const { order } = await makeOrder('cancelled');
    await expect(
      processPayment({ orderId: order._id, method: 'cash', amount: 1000 })
    ).rejects.toThrow(/Cannot process payment/);
  });

  test('throws for non-existent order', async () => {
    await expect(
      processPayment({ orderId: new mongoose.Types.ObjectId(), method: 'cash', amount: 1000 })
    ).rejects.toThrow(/not found/i);
  });

  test('idempotent: duplicate debit returns existing entry', async () => {
    const { order } = await makeOrder('created');
    const first  = await processPayment({ orderId: order._id, method: 'cash', amount: 5000 });
    const second = await processPayment({ orderId: order._id, method: 'cash', amount: 5000 });
    expect(second.ledgerEntry._id.toString()).toBe(first.ledgerEntry._id.toString());
    const count = await LedgerEntry.countDocuments({ orderId: order._id, direction: 'debit', status: 'completed' });
    expect(count).toBe(1);
  });

  test('marks invoice as paid when invoice exists', async () => {
    const { order } = await makeOrder('invoiced');
    await Invoice.create({ orderId: order._id, amount: 20000, status: 'pending' });
    await processPayment({ orderId: order._id, method: 'cash', amount: 20000 });
    const inv = await Invoice.findOne({ orderId: order._id }).lean();
    expect(inv.status).toBe('paid');
    expect(inv.paidAt).not.toBeNull();
  });
});

// ── refundPayment() ───────────────────────────────────────────────────────────

describe('refundPayment()', () => {
  test('creates a credit entry mirroring the debit amount', async () => {
    const { order } = await makeOrder('created');
    const entry   = await makeCompletedPayment(order._id, 8000);
    const { credit } = await refundPayment(entry._id, 'customer changed mind');
    expect(credit.direction).toBe('credit');
    expect(credit.amount).toBe(8000);
    expect(credit.status).toBe('completed');
  });

  test('marks original entry as refunded', async () => {
    const { order } = await makeOrder('created');
    const entry = await makeCompletedPayment(order._id, 5000);
    await refundPayment(entry._id);
    const updated = await LedgerEntry.findById(entry._id).lean();
    expect(updated.status).toBe('refunded');
  });

  test('cancels settled order after refund', async () => {
    const { order } = await makeOrder('settled');
    const entry = await makeCompletedPayment(order._id, 20000);
    const { orderStatus } = await refundPayment(entry._id, 'policy return');
    expect(orderStatus).toBe('cancelled');
  });

  test('reverts invoice to pending after refund', async () => {
    const { order } = await makeOrder('created');
    await Invoice.create({ orderId: order._id, amount: 10000, status: 'paid', paidAt: new Date() });
    const entry = await makeCompletedPayment(order._id, 10000);
    await refundPayment(entry._id);
    const inv = await Invoice.findOne({ orderId: order._id }).lean();
    expect(inv.status).toBe('pending');
    expect(inv.paidAt).toBeNull();
  });

  test('throws when ledger entry not found', async () => {
    await expect(refundPayment(new mongoose.Types.ObjectId())).rejects.toThrow(/not found/i);
  });

  test('throws when refunding a credit entry', async () => {
    const { order } = await makeOrder('created');
    const credit = await LedgerEntry.create({
      orderId: order._id, method: 'cash', amount: 100,
      direction: 'credit', reference: 'REF-C1', status: 'completed', metadata: {},
    });
    await expect(refundPayment(credit._id)).rejects.toThrow(/Only debit/);
  });

  test('throws when entry already refunded', async () => {
    const { order } = await makeOrder('created');
    const entry = await makeCompletedPayment(order._id, 1000);
    await refundPayment(entry._id);
    await expect(refundPayment(entry._id)).rejects.toThrow(/already been refunded/);
  });
});

// ── getWalletSummary() ────────────────────────────────────────────────────────

describe('getWalletSummary()', () => {
  test('returns zeros when no entries exist', async () => {
    const summary = await getWalletSummary();
    expect(summary.totalDebits).toBe(0);
    expect(summary.totalCredits).toBe(0);
    expect(summary.netBalance).toBe(0);
  });

  test('sums debits correctly', async () => {
    const { order: order1 } = await makeOrder('created');
    const { order: order2 } = await makeOrder('created');
    await makeCompletedPayment(order1._id, 10000);
    await makeCompletedPayment(order2._id, 5000);
    const summary = await getWalletSummary();
    expect(summary.totalDebits).toBe(15000);
  });

  test('net balance accounts for credits', async () => {
    const { order } = await makeOrder('settled');
    const entry = await makeCompletedPayment(order._id, 20000);
    await refundPayment(entry._id);
    const summary = await getWalletSummary();
    // debit=20000, credit=20000 → net=0
    expect(summary.netBalance).toBe(0);
  });

  test('byMethod breakdown is accurate', async () => {
    const { order } = await makeOrder('created');
    await makeCompletedPayment(order._id, 7500);
    const summary = await getWalletSummary();
    expect(summary.byMethod).toHaveProperty('cash');
    expect(summary.byMethod.cash.debits).toBe(7500);
  });

  test('excludes pending/failed entries from totals', async () => {
    const { order } = await makeOrder('created');
    await LedgerEntry.create({
      orderId: order._id, method: 'cash', amount: 99999,
      direction: 'debit', reference: 'REF-PEND', status: 'pending', metadata: {},
    });
    const summary = await getWalletSummary();
    expect(summary.totalDebits).toBe(0);
  });
});
