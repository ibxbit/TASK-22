const mongoose = require('mongoose');

const TYPES = [
  'missing_invoice',
  'missing_settlement',
  'amount_mismatch',
  'orphaned_invoice',
  'orphaned_settlement',
];

const discrepancyTicketSchema = new mongoose.Schema({
  reconciliationLogId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationLog', required: true, index: true },
  type:                { type: String, enum: TYPES, required: true },
  orderId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Order',        default: null },
  invoiceId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice',      default: null },
  ledgerEntryId:       { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry',  default: null },
  description:         { type: String, required: true },
  status:     { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: { type: Date,   default: null },
  resolution: { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

discrepancyTicketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DiscrepancyTicket', discrepancyTicketSchema);
