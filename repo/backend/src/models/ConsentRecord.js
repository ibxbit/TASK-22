const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/encryptionService');

const CONSENT_TYPES = ['data_processing', 'marketing', 'financing_terms', 'warranty', 'vehicle_sale'];

const consentRecordSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dealershipId: { type: mongoose.Schema.Types.ObjectId, required: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  type:         { type: String, enum: CONSENT_TYPES, required: true },
  version:      { type: String, required: true, trim: true },
  consentGiven: { type: Boolean, required: true },
  consentText:  { type: String, default: null },

  // Stored encrypted — PII captured for legal traceability
  ipAddress:    { type: String, default: null },
  userAgent:    { type: String, default: null },

  givenAt:      { type: Date, default: Date.now, immutable: true },
  revokedAt:    { type: Date, default: null },
}, { timestamps: false });

consentRecordSchema.index({ userId: 1, type: 1, givenAt: -1 });
consentRecordSchema.index({ orderId: 1, type: 1 });
consentRecordSchema.index({ dealershipId: 1, type: 1, givenAt: -1 });

const ENCRYPTED_RE = /^v\w+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/;
const isEncrypted = v => typeof v === 'string' && ENCRYPTED_RE.test(v);

function _encrypt(doc) {
  if (doc.ipAddress  && !isEncrypted(doc.ipAddress))  doc.ipAddress  = encrypt(doc.ipAddress);
  if (doc.userAgent  && !isEncrypted(doc.userAgent))  doc.userAgent  = encrypt(doc.userAgent);
}

function _decrypt(doc) {
  if (doc.ipAddress  && isEncrypted(doc.ipAddress))  try { doc.ipAddress  = decrypt(doc.ipAddress);  } catch {}
  if (doc.userAgent  && isEncrypted(doc.userAgent))  try { doc.userAgent  = decrypt(doc.userAgent);  } catch {}
}

consentRecordSchema.pre('save',  function (next) { _encrypt(this); next(); });
consentRecordSchema.post('save', function ()      { _decrypt(this); });
consentRecordSchema.post('init', function ()      { _decrypt(this); });

module.exports = mongoose.model('ConsentRecord', consentRecordSchema);
