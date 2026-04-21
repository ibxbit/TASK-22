const mongoose = require('mongoose');

const orderAuditLogSchema = new mongoose.Schema({
  orderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  fromState:     { type: String, required: true },
  toState:       { type: String, required: true },
  isRollback:    { type: Boolean, default: false },
  failureReason: { type: String, default: null },
  metadata:      { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp:     { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('OrderAuditLog', orderAuditLogSchema);
