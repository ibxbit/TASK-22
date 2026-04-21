const mongoose = require('mongoose');

const experimentAssignmentSchema = new mongoose.Schema({
  experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experiment', required: true },
  sessionId:    { type: String, required: true, index: true },
  variantKey:   { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

// One assignment per session per experiment
experimentAssignmentSchema.index({ experimentId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model('ExperimentAssignment', experimentAssignmentSchema);
