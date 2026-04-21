const mongoose = require('mongoose');

// Unified audit log for all entity mutations.
// Covers order state changes, document actions, payments, admin ops.
// Each entry is immutable — never updated, only appended.
const auditLogSchema = new mongoose.Schema({
  // Actor
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dealershipId:{ type: mongoose.Schema.Types.ObjectId, default: null },

  // Action
  action:     { type: String, required: true, trim: true },
  entityType: { type: String, required: true, trim: true },
  entityId:   { type: mongoose.Schema.Types.ObjectId, required: true },

  // State diff — store before/after for full reconstructability
  before:     { type: mongoose.Schema.Types.Mixed, default: null },
  after:      { type: mongoose.Schema.Types.Mixed, default: null },

  // Extra context (request metadata, failure reasons, etc.)
  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },

  // Network context
  ipAddress:  { type: String, default: null },

  // Immutable — no updatedAt
  timestamp:  { type: Date, default: Date.now, immutable: true },
}, { timestamps: false });

// Primary query: full history of an entity
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: 1 });
// User activity timeline
auditLogSchema.index({ userId: 1, timestamp: -1 });
// Action-level reporting
auditLogSchema.index({ action: 1, timestamp: -1 });
// Dealership-scoped audit
auditLogSchema.index({ dealershipId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
