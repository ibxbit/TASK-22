const mongoose = require('mongoose');

const STATUSES = ['matched', 'missing_invoice', 'missing_settlement', 'amount_mismatch', 'orphaned_invoice', 'orphaned_settlement'];

// One record per order per reconciliation run.
// Stores both the expected and actual amounts so discrepancies
// are self-contained and auditable without querying other collections.
const reconciliationLedgerSchema = new mongoose.Schema({
  // Run context
  runId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationLog', required: true },
  runDate: { type: Date, required: true },

  // Subjects
  orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order',       default: null },
  invoiceId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice',     default: null },
  ledgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },

  // Reconciliation outcome
  status:            { type: String, enum: STATUSES, required: true },
  invoiceAmount:     { type: Number, default: null },
  settlementAmount:  { type: Number, default: null },
  discrepancyAmount: { type: Number, default: 0 },
  notes:             { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Per-order history across runs
reconciliationLedgerSchema.index({ orderId: 1, runDate: -1 });
// Run-level reporting
reconciliationLedgerSchema.index({ runId: 1, status: 1 });
// System-wide discrepancy dashboard
reconciliationLedgerSchema.index({ status: 1, runDate: -1 });

module.exports = mongoose.model('ReconciliationLedger', reconciliationLedgerSchema);
