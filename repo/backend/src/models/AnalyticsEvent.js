const mongoose = require('mongoose');

const CATEGORIES = ['listing', 'search', 'cart', 'checkout', 'document', 'payment', 'system'];

// Append-only event store. Never update — only insert.
// properties field is intentionally flexible (Mixed) to allow
// diverse event shapes without schema changes.
const analyticsEventSchema = new mongoose.Schema({
  // Session context
  sessionId:    { type: String, required: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dealershipId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Event classification
  eventType:  { type: String, required: true, trim: true },
  category:   { type: String, enum: CATEGORIES, required: true },

  // Optional entity reference
  entityType: { type: String, default: null },
  entityId:   { type: mongoose.Schema.Types.ObjectId, default: null },

  // Event-specific payload
  properties: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Immutable — no updatedAt
  timestamp:  { type: Date, default: Date.now, immutable: true },
}, { timestamps: false });

// Session timeline
analyticsEventSchema.index({ sessionId: 1, timestamp: 1 });
// Event-type analytics
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
// Dealership reporting
analyticsEventSchema.index({ dealershipId: 1, category: 1, timestamp: -1 });
// Entity-level engagement (e.g., how many views a listing got)
analyticsEventSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
