const mongoose = require('mongoose');

const DATA_SCOPES = ['profile', 'orders', 'documents', 'consent', 'analytics', 'all'];

const deletionRequestSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scope:       [{ type: String, enum: DATA_SCOPES }],
  status:      { type: String, enum: ['pending', 'processing', 'completed', 'cancelled'], default: 'pending' },
  requestedAt: { type: Date, default: Date.now, immutable: true },
  scheduledAt: { type: Date, required: true },   // requestedAt + 30 days
  executedAt:  { type: Date, default: null },
  notes:       { type: String, default: null },
}, { timestamps: false });

deletionRequestSchema.index({ userId: 1, status: 1 });
deletionRequestSchema.index({ scheduledAt: 1, status: 1 }); // for the nightly hold-expiry job

module.exports = mongoose.model('DeletionRequest', deletionRequestSchema);
