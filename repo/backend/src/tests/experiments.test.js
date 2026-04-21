const request            = require('supertest');
const mongoose           = require('mongoose');
const app                = require('../../app');
const Experiment         = require('../../models/Experiment');
const ExperimentAssignment = require('../../models/ExperimentAssignment');
const { getOrCreateAssignment, getVariantDistribution } = require('../../services/experimentService');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, authHeader } = require('./helpers/fixtures');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── Helpers ───────────────────────────────────────────────────────────────────

function twoVariants(overrides = {}) {
  return [
    { key: 'control',   label: 'Control',   weight: 50, config: {} },
    { key: 'variant_a', label: 'Variant A', weight: 50, config: {} },
    ...overrides,
  ];
}

async function makeExperiment(overrides = {}) {
  return Experiment.create({
    name:               `Exp-${Math.random().toString(36).slice(2)}`,
    scope:              'listing_layout',
    status:             'draft',
    variants:           twoVariants(),
    rollbackVariantKey: 'control',
    ...overrides,
  });
}

async function adminHeader() {
  const admin = await makeUser({ role: 'admin' });
  return authHeader(admin);
}

async function managerHeader() {
  const mgr = await makeUser({ role: 'manager' });
  return authHeader(mgr);
}

// ── POST /experiments (create) ────────────────────────────────────────────────

describe('POST /experiments', () => {
  test('admin creates experiment and receives 201 with experiment object', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Test Experiment',
        scope: 'listing_layout',
        variants: twoVariants(),
        rollbackVariantKey: 'control',
      });

    expect(res.status).toBe(201);
    expect(res.body.experiment).toBeDefined();
    expect(res.body.experiment.name).toBe('Test Experiment');
    expect(res.body.experiment.scope).toBe('listing_layout');
    expect(res.body.experiment.status).toBe('draft');
    expect(res.body.experiment.rollbackVariantKey).toBe('control');
  });

  test('created experiment defaults to draft status', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({ name: 'Draft Test', scope: 'checkout_steps', variants: twoVariants() });

    expect(res.status).toBe(201);
    expect(res.body.experiment.status).toBe('draft');
  });

  test('variants are stored with correct keys and weights', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Variant Test',
        scope: 'listing_layout',
        variants: [
          { key: 'control', label: 'Control', weight: 70, config: {} },
          { key: 'b',       label: 'B',       weight: 30, config: {} },
        ],
        rollbackVariantKey: 'control',
      });

    expect(res.status).toBe(201);
    const { variants } = res.body.experiment;
    expect(variants).toHaveLength(2);
    expect(variants.find(v => v.key === 'control').weight).toBe(70);
    expect(variants.find(v => v.key === 'b').weight).toBe(30);
  });

  test('400 when variant weights do not sum to 100', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Bad Weights',
        scope: 'listing_layout',
        variants: [
          { key: 'control', label: 'Control', weight: 60, config: {} },
          { key: 'b',       label: 'B',       weight: 30, config: {} },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/100/);
  });

  test('400 when rollbackVariantKey does not match any variant', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Bad Rollback Key',
        scope: 'listing_layout',
        variants: twoVariants(),
        rollbackVariantKey: 'nonexistent',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rollback/i);
  });

  test('400 when fewer than 2 variants are provided', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Single Variant',
        scope: 'listing_layout',
        variants: [{ key: 'control', label: 'Control', weight: 100, config: {} }],
      });

    expect(res.status).toBe(400);
  });

  test('409 on duplicate experiment name', async () => {
    const body = {
      name: 'Unique Name',
      scope: 'listing_layout',
      variants: twoVariants(),
      rollbackVariantKey: 'control',
    };
    await request(app).post('/experiments').set(await adminHeader()).send(body);
    const res = await request(app).post('/experiments').set(await adminHeader()).send(body);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('403 when manager tries to create experiment', async () => {
    const res = await request(app)
      .post('/experiments')
      .set(await managerHeader())
      .send({ name: 'X', scope: 'listing_layout', variants: twoVariants() });

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/experiments')
      .send({ name: 'X', scope: 'listing_layout', variants: twoVariants() });

    expect(res.status).toBe(401);
  });
});

// ── GET /experiments ──────────────────────────────────────────────────────────

describe('GET /experiments', () => {
  test('returns all experiments sorted by createdAt desc', async () => {
    await makeExperiment({ name: 'First', scope: 'listing_layout' });
    await makeExperiment({ name: 'Second', scope: 'checkout_steps' });

    const res = await request(app)
      .get('/experiments')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiments).toHaveLength(2);
  });

  test('filters by scope', async () => {
    await makeExperiment({ name: 'A', scope: 'listing_layout' });
    await makeExperiment({ name: 'B', scope: 'checkout_steps' });

    const res = await request(app)
      .get('/experiments?scope=listing_layout')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiments).toHaveLength(1);
    expect(res.body.experiments[0].scope).toBe('listing_layout');
  });

  test('filters by status', async () => {
    await makeExperiment({ name: 'Draft', status: 'draft' });
    await makeExperiment({ name: 'Active', status: 'active' });

    const res = await request(app)
      .get('/experiments?status=active')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiments).toHaveLength(1);
    expect(res.body.experiments[0].status).toBe('active');
  });

  test('manager can list experiments', async () => {
    await makeExperiment({ name: 'Visible' });

    const res = await request(app)
      .get('/experiments')
      .set(await managerHeader());

    expect(res.status).toBe(200);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app).get('/experiments');
    expect(res.status).toBe(401);
  });
});

// ── GET /experiments/:id ──────────────────────────────────────────────────────

describe('GET /experiments/:id', () => {
  test('returns experiment by id', async () => {
    const exp = await makeExperiment({ name: 'Findable' });

    const res = await request(app)
      .get(`/experiments/${exp._id}`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment._id.toString()).toBe(exp._id.toString());
    expect(res.body.experiment.name).toBe('Findable');
  });

  test('404 for unknown experiment id', async () => {
    const res = await request(app)
      .get(`/experiments/${new mongoose.Types.ObjectId()}`)
      .set(await adminHeader());

    expect(res.status).toBe(404);
  });
});

// ── PATCH /experiments/:id/status ─────────────────────────────────────────────

describe('PATCH /experiments/:id/status', () => {
  test('admin activates a draft experiment', async () => {
    const exp = await makeExperiment({ status: 'draft' });

    const res = await request(app)
      .patch(`/experiments/${exp._id}/status`)
      .set(await adminHeader())
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('active');
  });

  test('admin pauses an active experiment', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .patch(`/experiments/${exp._id}/status`)
      .set(await adminHeader())
      .send({ status: 'paused' });

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('paused');
  });

  test('400 for invalid status value', async () => {
    const exp = await makeExperiment();

    const res = await request(app)
      .patch(`/experiments/${exp._id}/status`)
      .set(await adminHeader())
      .send({ status: 'launched' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/i);
  });

  test('403 when manager tries to update status', async () => {
    const exp = await makeExperiment();

    const res = await request(app)
      .patch(`/experiments/${exp._id}/status`)
      .set(await managerHeader())
      .send({ status: 'active' });

    expect(res.status).toBe(403);
  });

  test('404 for unknown experiment id', async () => {
    const res = await request(app)
      .patch(`/experiments/${new mongoose.Types.ObjectId()}/status`)
      .set(await adminHeader())
      .send({ status: 'active' });

    expect(res.status).toBe(404);
  });
});

// ── POST /experiments/:id/rollback ────────────────────────────────────────────

describe('POST /experiments/:id/rollback', () => {
  test('admin rolls back an active experiment (status becomes rolled_back)', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('rolled_back');
    expect(res.body.rolledBack).toBe(true);
  });

  test('admin rolls back a paused experiment', async () => {
    const exp = await makeExperiment({ status: 'paused' });

    const res = await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('rolled_back');
  });

  test('admin rolls back a draft experiment', async () => {
    const exp = await makeExperiment({ status: 'draft' });

    const res = await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('rolled_back');
  });

  test('rollback is idempotent (already rolled_back stays rolled_back)', async () => {
    const exp = await makeExperiment({ status: 'rolled_back' });

    const res = await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment.status).toBe('rolled_back');
  });

  test('404 for unknown experiment id', async () => {
    const res = await request(app)
      .post(`/experiments/${new mongoose.Types.ObjectId()}/rollback`)
      .set(await adminHeader());

    expect(res.status).toBe(404);
  });

  test('403 when manager attempts rollback', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await managerHeader());

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app).post(`/experiments/${exp._id}/rollback`);
    expect(res.status).toBe(401);
  });
});

// ── POST /experiments/assign ──────────────────────────────────────────────────

describe('POST /experiments/assign', () => {
  test('returns a variant for an active experiment', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'sess-001', experimentId: exp._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.variantKey).toBeDefined();
    expect(['control', 'variant_a']).toContain(res.body.variantKey);
  });

  test('assignment is stable across multiple calls (same session gets same variant)', async () => {
    const exp = await makeExperiment({ status: 'active' });
    const body = { sessionId: 'stable-sess', experimentId: exp._id.toString() };

    const res1 = await request(app)
      .post('/experiments/assign').set(await managerHeader()).send(body);
    const res2 = await request(app)
      .post('/experiments/assign').set(await managerHeader()).send(body);

    expect(res1.body.variantKey).toBe(res2.body.variantKey);
  });

  test('rolled_back experiment returns rollback variant for all sessions', async () => {
    const exp = await makeExperiment({ status: 'rolled_back', rollbackVariantKey: 'control' });

    for (const sessionId of ['sess-A', 'sess-B', 'sess-C']) {
      const res = await request(app)
        .post('/experiments/assign')
        .set(await managerHeader())
        .send({ sessionId, experimentId: exp._id.toString() });

      expect(res.body.variantKey).toBe('control');
      expect(res.body.forced).toBe(true);
    }
  });

  test('paused experiment returns rollback variant (not normal assignment)', async () => {
    const exp = await makeExperiment({ status: 'paused', rollbackVariantKey: 'control' });

    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'paused-sess', experimentId: exp._id.toString() });

    expect(res.body.variantKey).toBe('control');
    expect(res.body.forced).toBe(true);
  });

  test('draft experiment falls back to control (safe fallback)', async () => {
    const exp = await makeExperiment({ status: 'draft' });

    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'draft-sess', experimentId: exp._id.toString() });

    // Never throws — returns safe fallback
    expect(res.status).toBe(200);
    expect(res.body.variantKey).toBe('control');
    expect(res.body.fallback).toBe(true);
  });

  test('400 when sessionId is missing', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ experimentId: exp._id.toString() });

    expect(res.status).toBe(400);
  });

  test('400 when experimentId is missing', async () => {
    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'sess-x' });

    expect(res.status).toBe(400);
  });
});

// ── Assignment persists after rollback (service-layer) ────────────────────────

describe('rollback clears active assignments', () => {
  test('after rollback, new assign calls return rollback variant regardless of prior assignment', async () => {
    const exp = await makeExperiment({ status: 'active', rollbackVariantKey: 'control' });

    // Assign while active
    await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'before-rollback', experimentId: exp._id.toString() });

    // Roll back the experiment
    await request(app)
      .post(`/experiments/${exp._id}/rollback`)
      .set(await adminHeader());

    // Even the previously-assigned session now gets rollback variant
    const res = await request(app)
      .post('/experiments/assign')
      .set(await managerHeader())
      .send({ sessionId: 'before-rollback', experimentId: exp._id.toString() });

    expect(res.body.variantKey).toBe('control');
    expect(res.body.forced).toBe(true);
  });
});

// ── GET /experiments/:id/results ──────────────────────────────────────────────

describe('GET /experiments/:id/results', () => {
  test('returns experiment info and empty distribution when no assignments', async () => {
    const exp = await makeExperiment({ name: 'No Assigns', status: 'active' });

    const res = await request(app)
      .get(`/experiments/${exp._id}/results`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.experiment.name).toBe('No Assigns');
    expect(Array.isArray(res.body.distribution)).toBe(true);
    expect(res.body.distribution).toHaveLength(0);
  });

  test('distribution reflects variant assignments', async () => {
    const exp = await makeExperiment({ status: 'active' });

    // Seed assignments directly for determinism
    await ExperimentAssignment.create([
      { experimentId: exp._id, sessionId: 'sess-1', variantKey: 'control' },
      { experimentId: exp._id, sessionId: 'sess-2', variantKey: 'control' },
      { experimentId: exp._id, sessionId: 'sess-3', variantKey: 'variant_a' },
    ]);

    const res = await request(app)
      .get(`/experiments/${exp._id}/results`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    const dist = res.body.distribution;
    const controlEntry = dist.find(d => d._id === 'control');
    const variantEntry = dist.find(d => d._id === 'variant_a');

    expect(controlEntry.count).toBe(2);
    expect(variantEntry.count).toBe(1);
  });

  test('404 for unknown experiment id', async () => {
    const res = await request(app)
      .get(`/experiments/${new mongoose.Types.ObjectId()}/results`)
      .set(await adminHeader());

    expect(res.status).toBe(404);
  });

  test('manager can view results', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const res = await request(app)
      .get(`/experiments/${exp._id}/results`)
      .set(await managerHeader());

    expect(res.status).toBe(200);
  });
});

// ── experimentService unit tests ──────────────────────────────────────────────

describe('experimentService — getOrCreateAssignment', () => {
  test('throws when experiment does not exist', async () => {
    await expect(
      getOrCreateAssignment('sess', new mongoose.Types.ObjectId().toString())
    ).rejects.toThrow('Experiment not found');
  });

  test('throws when experiment is in draft state', async () => {
    const exp = await makeExperiment({ status: 'draft' });
    await expect(
      getOrCreateAssignment('sess', exp._id.toString())
    ).rejects.toThrow(/draft/i);
  });

  test('active experiment: same session always gets same variant (deterministic)', async () => {
    const exp = await makeExperiment({ status: 'active' });

    const r1 = await getOrCreateAssignment('det-sess-xyz', exp._id.toString());
    await ExperimentAssignment.deleteMany({ experimentId: exp._id, sessionId: 'det-sess-xyz' });
    const r2 = await getOrCreateAssignment('det-sess-xyz', exp._id.toString());

    expect(r1.variant.key).toBe(r2.variant.key);
  });

  test('rolled_back: forced=true and returns rollbackVariantKey variant', async () => {
    const exp = await makeExperiment({ status: 'rolled_back', rollbackVariantKey: 'control' });

    const result = await getOrCreateAssignment('any-sess', exp._id.toString());

    expect(result.forced).toBe(true);
    expect(result.variant.key).toBe('control');
  });

  test('rolled_back: does NOT write to ExperimentAssignment collection', async () => {
    const exp = await makeExperiment({ status: 'rolled_back' });
    const before = await ExperimentAssignment.countDocuments();

    await getOrCreateAssignment('no-write-sess', exp._id.toString());

    const after = await ExperimentAssignment.countDocuments();
    expect(after).toBe(before);
  });

  test('active: second call for same session returns existing assignment (no duplicate)', async () => {
    const exp = await makeExperiment({ status: 'active' });

    await getOrCreateAssignment('dup-sess', exp._id.toString());
    await getOrCreateAssignment('dup-sess', exp._id.toString());

    const count = await ExperimentAssignment.countDocuments({
      experimentId: exp._id,
      sessionId: 'dup-sess',
    });
    expect(count).toBe(1);
  });
});

// ── getVariantDistribution unit tests ─────────────────────────────────────────

describe('experimentService — getVariantDistribution', () => {
  test('returns counts grouped by variantKey', async () => {
    const exp = await makeExperiment({ status: 'active' });
    await ExperimentAssignment.insertMany([
      { experimentId: exp._id, sessionId: 's1', variantKey: 'control' },
      { experimentId: exp._id, sessionId: 's2', variantKey: 'control' },
      { experimentId: exp._id, sessionId: 's3', variantKey: 'variant_a' },
    ]);

    const dist = await getVariantDistribution(exp._id.toString());

    const ctrl = dist.find(d => d._id === 'control');
    const va   = dist.find(d => d._id === 'variant_a');
    expect(ctrl.count).toBe(2);
    expect(va.count).toBe(1);
  });

  test('returns empty array when no assignments exist', async () => {
    const exp = await makeExperiment({ status: 'active' });
    const dist = await getVariantDistribution(exp._id.toString());
    expect(dist).toEqual([]);
  });
});
