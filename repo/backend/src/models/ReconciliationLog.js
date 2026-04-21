const mongoose = require('mongoose');

const reconciliationLogSchema = new mongoose.Schema({
  status:           { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  startedAt:        { type: Date, required: true },
  completedAt:      { type: Date, default: null },
  totalChecked:     { type: Number, default: 0 },
  discrepancyCount: { type: Number, default: 0 },
  errorMessage:     { type: String, default: null },
});

module.exports = mongoose.model('ReconciliationLog', reconciliationLogSchema);
