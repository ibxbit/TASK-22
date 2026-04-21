const Experiment           = require('../models/Experiment');
const ExperimentAssignment = require('../models/ExperimentAssignment');

// djb2 hash — deterministic, no external deps
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash;
}

function selectVariant(sessionId, experiment) {
  const bucket = djb2(`${sessionId}:${experiment._id.toString()}`) % 100;
  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant;
  }
  return experiment.variants[0]; // safety — only reached if weights don't sum to 100
}

function getRollbackVariant(experiment) {
  return experiment.variants.find(v => v.key === experiment.rollbackVariantKey)
    || experiment.variants[0];
}

/**
 * Returns the variant for a given session.
 *
 * - rolled_back / paused → rollback variant for everyone (no DB write)
 * - active               → existing assignment or new deterministic one
 * - draft                → throws (not assignable)
 *
 * Never throws to the HTTP layer — callers wrap in try/catch and fall back to rollback.
 */
async function getOrCreateAssignment(sessionId, experimentId) {
  const experiment = await Experiment.findById(experimentId).lean();
  if (!experiment) throw new Error('Experiment not found');

  if (experiment.status === 'draft') {
    throw new Error(`Experiment '${experiment.name}' is in draft state and not yet assignable`);
  }

  // Immediate rollback: return rollback variant, skip stored assignment
  if (experiment.status === 'rolled_back' || experiment.status === 'paused') {
    return { variant: getRollbackVariant(experiment), experiment, forced: true };
  }

  // Active: find or create a stable assignment
  const existing = await ExperimentAssignment.findOne({ experimentId, sessionId }).lean();
  if (existing) {
    const variant = experiment.variants.find(v => v.key === existing.variantKey)
      || getRollbackVariant(experiment);
    return { variant, experiment, forced: false };
  }

  const variant = selectVariant(sessionId, experiment);
  await ExperimentAssignment.findOneAndUpdate(
    { experimentId, sessionId },
    { $setOnInsert: { variantKey: variant.key } },
    { upsert: true }
  );

  return { variant, experiment, forced: false };
}

async function getVariantDistribution(experimentId) {
  const mongoose = require('mongoose');
  return ExperimentAssignment.aggregate([
    { $match: { experimentId: new mongoose.Types.ObjectId(experimentId) } },
    { $group: { _id: '$variantKey', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
}

module.exports = { getOrCreateAssignment, getVariantDistribution };
