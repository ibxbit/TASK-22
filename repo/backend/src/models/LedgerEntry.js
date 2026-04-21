const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/encryptionService');

const METHODS = ['cash', 'cashiers_check', 'inhouse_financing'];

const ledgerEntrySchema = new mongoose.Schema({
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  method:    { type: String, enum: METHODS, required: true },
  amount:    { type: Number, required: true },
  direction: { type: String, enum: ['debit', 'credit'], required: true },
  reference: { type: String, default: null },
  status:    { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' },
  metadata:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

ledgerEntrySchema.index({ orderId: 1, createdAt: 1 });
// Exactly one completed debit per order — duplicate-key on retry signals idempotent success
ledgerEntrySchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { direction: 'debit', status: 'completed' } }
);

// Matches the `version:iv:tag:ciphertext` format produced by encryptionService
const ENCRYPTED_RE = /^v\w+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;
const isEncrypted = v => typeof v === 'string' && ENCRYPTED_RE.test(v);

function _encrypt(doc) {
  if (doc.reference != null && !isEncrypted(doc.reference)) {
    doc.reference = encrypt(String(doc.reference));
  }
  if (doc.metadata && typeof doc.metadata === 'object') {
    doc.metadata = encrypt(JSON.stringify(doc.metadata));
    doc.markModified('metadata');
  }
}

function _decrypt(doc) {
  if (doc.reference && isEncrypted(doc.reference)) {
    try { doc.reference = decrypt(doc.reference); } catch {}
  }
  const m = doc.metadata;
  if (m && isEncrypted(String(m))) {
    try { doc.metadata = JSON.parse(decrypt(String(m))); } catch { doc.metadata = {}; }
  }
}

ledgerEntrySchema.pre('save',  function (next) { _encrypt(this); next(); });
ledgerEntrySchema.post('save', function ()      { _decrypt(this); });
ledgerEntrySchema.post('init', function ()      { _decrypt(this); });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
