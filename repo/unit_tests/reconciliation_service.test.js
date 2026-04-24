'use strict';

/**
 * Unit tests for reconciliationService.runReconciliation.
 * Exercises all five discrepancy check types and the clean "all matched" path.
 */

const mongoose = require('mongoose');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeOrder, makeCompletedPayment }       = require('../backend/src/tests/helpers/fixtures');
const Invoice              = require('../backend/src/models/Invoice');
const DiscrepancyTicket    = require('../backend/src/models/DiscrepancyTicket');
const ReconciliationLedger = require('../backend/src/models/ReconciliationLedger');
const ReconciliationLog    = require('../backend/src/models/ReconciliationLog');
const LedgerEntry          = require('../backend/src/models/LedgerEntry');
const { runReconciliation } = require('../backend/src/services/reconciliationService');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

function uid() { return Math.random().toString(36).slice(2, 10); }

async function makeInvoice(orderId, amount = 20000) {
  return Invoice.create({ orderId, amount, status: 'paid', paidAt: new Date() });
}

describe('runReconciliation — happy path', () => {
  test('creates a ReconciliationLog with status=completed after a clean run', async () => {
    const log = await runReconciliation();
    expect(log.status).toBe('completed');
    expect(log.discrepancyCount).toBe(0);
    expect(log.completedAt).toBeTruthy();
  });

  test('returns log with correct shape on empty database', async () => {
    const log = await runReconciliation();
    expect(log).toHaveProperty('totalChecked');
    expect(log).toHaveProperty('discrepancyCount');
    expect(log).toHaveProperty('startedAt');
    expect(log).toHaveProperty('completedAt');
    expect(log.discrepancyCount).toBe(0);
  });

  test('matched order produces a ReconciliationLedger entry with status=matched', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    await makeCompletedPayment(order._id, 20000);

    await runReconciliation();

    const ledger = await ReconciliationLedger.findOne({ orderId: order._id }).lean();
    expect(ledger).toBeTruthy();
    expect(ledger.status).toBe('matched');
    expect(ledger.discrepancyAmount).toBe(0);
  });

  test('invoiced-only order (no settlement required) is marked matched when invoice exists', async () => {
    const { order } = await makeOrder('invoiced');
    await makeInvoice(order._id);

    await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket).toBeNull();
  });
});

describe('runReconciliation — Check 1: missing invoice', () => {
  test('invoiced order with no invoice creates missing_invoice ticket', async () => {
    const { order } = await makeOrder('invoiced');

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket).toBeTruthy();
    expect(ticket.type).toBe('missing_invoice');
    expect(log.discrepancyCount).toBe(1);
  });

  test('settled order with no invoice creates missing_invoice ticket', async () => {
    const { order } = await makeOrder('settled');

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket.type).toBe('missing_invoice');
  });

  test('fulfilled order with no invoice creates missing_invoice ticket', async () => {
    const { order } = await makeOrder('fulfilled');

    await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket.type).toBe('missing_invoice');
  });

  test('created order (not in INVOICED_STATES) is not flagged even without invoice', async () => {
    // 'created' is not in ['invoiced', 'settled', 'fulfilled'] — should be ignored
    await makeOrder('created');

    const log = await runReconciliation();

    expect(log.discrepancyCount).toBe(0);
  });

  test('missing_invoice produces a ReconciliationLedger record with status=missing_invoice', async () => {
    const { order } = await makeOrder('invoiced');

    await runReconciliation();

    const ledger = await ReconciliationLedger.findOne({ orderId: order._id }).lean();
    expect(ledger).toBeTruthy();
    expect(ledger.status).toBe('missing_invoice');
  });
});

describe('runReconciliation — Check 2: missing settlement', () => {
  test('settled order with invoice but no debit ledger entry creates missing_settlement ticket', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    // No ledger entry

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket).toBeTruthy();
    expect(ticket.type).toBe('missing_settlement');
    expect(log.discrepancyCount).toBe(1);
  });

  test('fulfilled order with invoice but refunded debit entry creates missing_settlement ticket', async () => {
    const { order } = await makeOrder('fulfilled');
    await makeInvoice(order._id, 20000);
    // Create a refunded debit entry (not an active settlement)
    await LedgerEntry.create({
      orderId:   order._id,
      method:    'cash',
      amount:    20000,
      direction: 'debit',
      reference: `REF-${uid()}`,
      status:    'refunded',
      metadata:  {},
    });

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket.type).toBe('missing_settlement');
  });

  test('invoiced order (not settled) with invoice is NOT flagged for missing settlement', async () => {
    const { order } = await makeOrder('invoiced');
    await makeInvoice(order._id, 20000);

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket).toBeNull();
    expect(log.discrepancyCount).toBe(0);
  });
});

describe('runReconciliation — Check 3: amount mismatch', () => {
  test('settled order where invoice amount differs from ledger amount creates amount_mismatch ticket', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    await makeCompletedPayment(order._id, 18000); // different amount

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket).toBeTruthy();
    expect(ticket.type).toBe('amount_mismatch');
    expect(log.discrepancyCount).toBe(1);
  });

  test('amount_mismatch ticket description mentions orderId', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    await makeCompletedPayment(order._id, 19000);

    await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ orderId: order._id });
    expect(ticket.description).toContain(order._id.toString());
  });

  test('amount_mismatch ledger record has correct discrepancyAmount', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    await makeCompletedPayment(order._id, 18000);

    await runReconciliation();

    const ledger = await ReconciliationLedger.findOne({
      orderId: order._id,
      status:  'amount_mismatch',
    }).lean();
    expect(ledger).toBeTruthy();
    expect(ledger.discrepancyAmount).toBe(2000);
  });

  test('matching amounts do not create a ticket', async () => {
    const { order } = await makeOrder('settled');
    await makeInvoice(order._id, 20000);
    await makeCompletedPayment(order._id, 20000);

    const log = await runReconciliation();

    expect(log.discrepancyCount).toBe(0);
  });
});

describe('runReconciliation — Check 4: orphaned invoice', () => {
  test('invoice referencing a non-existent order creates orphaned_invoice ticket', async () => {
    const phantomOrderId = new mongoose.Types.ObjectId();
    await Invoice.create({ orderId: phantomOrderId, amount: 5000, status: 'pending' });

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ invoiceId: { $exists: true }, type: 'orphaned_invoice' });
    expect(ticket).toBeTruthy();
    expect(ticket.type).toBe('orphaned_invoice');
    expect(log.discrepancyCount).toBe(1);
  });
});

describe('runReconciliation — Check 5: orphaned ledger entry', () => {
  test('debit ledger entry referencing a non-existent order creates orphaned_settlement ticket', async () => {
    const phantomOrderId = new mongoose.Types.ObjectId();
    await LedgerEntry.create({
      orderId:   phantomOrderId,
      method:    'cash',
      amount:    5000,
      direction: 'debit',
      reference: `REF-${uid()}`,
      status:    'completed',
      metadata:  {},
    });

    const log = await runReconciliation();

    const ticket = await DiscrepancyTicket.findOne({ type: 'orphaned_settlement' });
    expect(ticket).toBeTruthy();
    expect(log.discrepancyCount).toBe(1);
  });
});

describe('runReconciliation — multi-discrepancy run', () => {
  test('each discrepancy type creates exactly one ticket', async () => {
    // One missing_invoice case
    const { order: o1 } = await makeOrder('invoiced');

    // One amount_mismatch case
    const { order: o2 } = await makeOrder('settled');
    await makeInvoice(o2._id, 20000);
    await makeCompletedPayment(o2._id, 15000);

    const log = await runReconciliation();

    expect(log.discrepancyCount).toBe(2);
    const tickets = await DiscrepancyTicket.find({}).lean();
    expect(tickets).toHaveLength(2);
    const types = tickets.map(t => t.type).sort();
    expect(types).toEqual(['amount_mismatch', 'missing_invoice']);
  });

  test('ReconciliationLog totalChecked reflects orders + invoices + ledger entries queried', async () => {
    const { order: o1 } = await makeOrder('settled');
    const { order: o2 } = await makeOrder('invoiced');
    await makeInvoice(o1._id, 20000);
    await makeInvoice(o2._id, 20000);
    await makeCompletedPayment(o1._id, 20000);

    const log = await runReconciliation();

    // totalChecked = activeOrders(2) + invoices(2) + ledgerEntries(1)
    expect(log.totalChecked).toBe(2 + 2 + 1);
  });
});
