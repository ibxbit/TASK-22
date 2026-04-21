const Experiment           = require('../models/Experiment');
const { getOrCreateAssignment, getVariantDistribution } = require('../services/experimentService');

const VALID_STATUSES = ['draft', 'active', 'paused', 'rolled_back'];

async function createExperiment(req, res) {
  try {
    const { name, scope, variants, rollbackVariantKey = 'control' } = req.body;

    if (!name || !scope || !variants?.length) {
      return res.status(400).json({ error: 'name, scope, and variants are required' });
    }

    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0);
    if (totalWeight !== 100) {
      return res.status(400).json({ error: `Variant weights must sum to 100, got ${totalWeight}` });
    }

    if (!variants.some(v => v.key === rollbackVariantKey)) {
      return res.status(400).json({ error: `Rollback variant key '${rollbackVariantKey}' not found in variants` });
    }

    const experiment = await Experiment.create({ name, scope, variants, rollbackVariantKey });
    return res.status(201).json({ experiment: experiment.toObject() });
  } catch (err) {
    const isDupe = err.code === 11000;
    return res.status(isDupe ? 409 : 500).json({ error: isDupe ? 'Experiment name already exists' : err.message });
  }
}

async function listExperiments(req, res) {
  try {
    const { scope, status } = req.query;
    const filter = {};
    if (scope)  filter.scope  = scope;
    if (status) filter.status = status;

    const experiments = await Experiment.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ experiments });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getExperiment(req, res) {
  try {
    const experiment = await Experiment.findById(req.params.id).lean();
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    return res.json({ experiment });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const experiment = await Experiment.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).lean();

    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    return res.json({ experiment });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function rollback(req, res) {
  try {
    const experiment = await Experiment.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'rolled_back' } },
      { new: true }
    ).lean();

    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });
    return res.json({ experiment, rolledBack: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function assign(req, res) {
  const { sessionId, experimentId } = req.body;

  if (!sessionId || !experimentId) {
    return res.status(400).json({ error: 'sessionId and experimentId are required' });
  }

  try {
    const result = await getOrCreateAssignment(sessionId, experimentId);
    return res.json({
      variantKey: result.variant.key,
      label:      result.variant.label,
      config:     result.variant.config,
      forced:     result.forced,
    });
  } catch (err) {
    // Safety net: never break the caller — return a minimal safe response
    console.error('[experiment] assign failed, returning safe fallback:', err.message);
    return res.json({ variantKey: 'control', label: 'Control', config: {}, forced: true, fallback: true });
  }
}

async function getResults(req, res) {
  try {
    const experiment = await Experiment.findById(req.params.id).lean();
    if (!experiment) return res.status(404).json({ error: 'Experiment not found' });

    const distribution = await getVariantDistribution(req.params.id);
    return res.json({ experiment: { name: experiment.name, status: experiment.status }, distribution });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createExperiment, listExperiments, getExperiment, updateStatus, rollback, assign, getResults };
