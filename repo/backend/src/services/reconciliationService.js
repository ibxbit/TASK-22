const Order                 = require('../models/Order');
const Invoice               = require('../models/Invoice');
const LedgerEntry           = require('../models/LedgerEntry');
const ReconciliationLog     = require('../models/ReconciliationLog');
const DiscrepancyTicket     = require('../models/DiscrepancyTicket');
const ReconciliationLedger  = require('../models/ReconciliationLedger');

const INVOICED_STATES = ['invoiced', 'settled', 'fulfilled'];
const SETTLED_STATES  = ['settled', 'fulfilled'];

async function runReconciliation() {
  const log = await ReconciliationLog.create({ startedAt: new Date(), status: 'running' });

  try {
    // Load all data in parallel — no N+1 queries
    // Only debit entries represent settlements; credits are refunds and must not
    // be mistaken for a settlement when checking settled/fulfilled orders.
    const [activeOrders, allOrders, invoices, ledgerEntries] = await Promise.all([
      Order.find({ status: { $in: INVOICED_STATES } }).lean(),
      Order.find({}, '_id').lean(),
      Invoice.find({}).lean(),
      LedgerEntry.find({ direction: 'debit', status: { $in: ['completed', 'refunded'] } }).lean(),
    ]);

    // Build O(1) lookup maps
    const invoiceByOrder  = new Map(invoices.map(i => [i.orderId.toString(), i]));
    const ledgerByOrder   = new Map(ledgerEntries.map(e => [e.orderId.toString(), e]));
    const allOrderIds     = new Set(allOrders.map(o => o._id.toString()));

    const discrepancies = [];
    const ledgerRecords = [];
    const runDate       = log.startedAt;

    // Check 1 — invoiced/settled/fulfilled order with no invoice
    for (const order of activeOrders) {
      const oid     = order._id.toString();
      const invoice = invoiceByOrder.get(oid);
      const entry   = ledgerByOrder.get(oid);

      if (!invoice) {
        discrepancies.push({
          reconciliationLogId: log._id,
          type:        'missing_invoice',
          orderId:     order._id,
          description: `Order ${oid} is '${order.status}' but has no invoice`,
        });
        ledgerRecords.push({
          runId: log._id, runDate, orderId: order._id,
          status: 'missing_invoice', notes: `Status: ${order.status}`,
        });
        continue;
      }

      if (SETTLED_STATES.includes(order.status)) {
        // Check 2 — settled/fulfilled order with no active debit entry (or refunded)
        if (!entry || entry.status === 'refunded') {
          discrepancies.push({
            reconciliationLogId: log._id,
            type:        'missing_settlement',
            orderId:     order._id,
            description: `Order ${oid} is '${order.status}' but has no active settlement ledger entry`,
          });
          ledgerRecords.push({
            runId: log._id, runDate, orderId: order._id,
            invoiceId: invoice._id, invoiceAmount: invoice.amount,
            status: 'missing_settlement',
            notes: entry ? 'Debit entry exists but is refunded' : null,
          });
          continue;
        }

        // Check 3 — invoice amount ≠ ledger entry amount
        if (invoice.amount !== entry.amount) {
          discrepancies.push({
            reconciliationLogId: log._id,
            type:          'amount_mismatch',
            orderId:       order._id,
            invoiceId:     invoice._id,
            ledgerEntryId: entry._id,
            description:   `Order ${oid}: invoice ${invoice.amount} ≠ settlement ${entry.amount}`,
          });
          ledgerRecords.push({
            runId: log._id, runDate, orderId: order._id,
            invoiceId: invoice._id, ledgerEntryId: entry._id,
            invoiceAmount: invoice.amount, settlementAmount: entry.amount,
            discrepancyAmount: Math.abs(invoice.amount - entry.amount),
            status: 'amount_mismatch',
          });
          continue;
        }
      }

      // All checks passed for this order
      ledgerRecords.push({
        runId: log._id, runDate, orderId: order._id,
        invoiceId:        invoice?._id   ?? null,
        ledgerEntryId:    entry?._id     ?? null,
        invoiceAmount:    invoice?.amount ?? null,
        settlementAmount: entry?.amount   ?? null,
        discrepancyAmount: 0,
        status: 'matched',
      });
    }

    // Check 4 — invoice references an order that no longer exists
    for (const invoice of invoices) {
      if (!allOrderIds.has(invoice.orderId.toString())) {
        discrepancies.push({
          reconciliationLogId: log._id,
          type:        'orphaned_invoice',
          invoiceId:   invoice._id,
          description: `Invoice ${invoice._id} references non-existent order ${invoice.orderId}`,
        });
        ledgerRecords.push({
          runId: log._id, runDate,
          invoiceId: invoice._id, invoiceAmount: invoice.amount,
          status: 'orphaned_invoice',
          notes:  `Referenced orderId: ${invoice.orderId}`,
        });
      }
    }

    // Check 5 — ledger entry references an order that no longer exists
    for (const entry of ledgerEntries) {
      if (!allOrderIds.has(entry.orderId.toString())) {
        discrepancies.push({
          reconciliationLogId: log._id,
          type:          'orphaned_settlement',
          ledgerEntryId: entry._id,
          description:   `LedgerEntry ${entry._id} references non-existent order ${entry.orderId}`,
        });
        ledgerRecords.push({
          runId: log._id, runDate,
          ledgerEntryId: entry._id, settlementAmount: entry.amount,
          status: 'orphaned_settlement',
          notes:  `Referenced orderId: ${entry.orderId}`,
        });
      }
    }

    // Every discrepancy must produce a ticket — no silent drops
    const tickets = discrepancies.length > 0
      ? await DiscrepancyTicket.insertMany(discrepancies)
      : [];

    // Full per-entity audit trail for every run
    if (ledgerRecords.length > 0) {
      await ReconciliationLedger.insertMany(ledgerRecords);
    }

    log.status           = 'completed';
    log.completedAt      = new Date();
    log.totalChecked     = activeOrders.length + invoices.length + ledgerEntries.length;
    log.discrepancyCount = tickets.length;
    await log.save();

    return log.toObject();
  } catch (err) {
    log.status       = 'failed';
    log.completedAt  = new Date();
    log.errorMessage = err.message;
    await log.save();
    throw err;
  }
}

module.exports = { runReconciliation };
