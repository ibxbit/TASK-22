const supertest  = require('supertest');
const mongoose   = require('mongoose');
const app        = require('../backend/src/app');
const Experiment = require('../backend/src/models/Experiment');
const ExperimentAssignment = require('../backend/src/models/ExperimentAssignment');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeUser, authHeader } = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── Helpers ───────────────────────────────────────────────────────────────────

async function adminHeader() {
  const admin = await makeUser({ role: 'admin' });
  return authHeader(admin);
}

async function managerHeader() {
  const mgr = await makeUser({ role: 'manager' });
  return authHeader(mgr);
}

function baseExperimentBody(overrides = {}) {
  return {
    name: `API-Exp-${Math.random().toString(36).slice(2)}`,
    scope: 'listing_layout',
    variants: [
      { key: 'control',   label: 'Control',   weight: 60, config: {} },
      { key: 'variant_a', label: 'Variant A', weight: 40, config: {} },
    ],
    rollbackVariantKey: 'control',
    ...overrides,
  };
}

async function createActiveExperiment(adminHdr) {
  const body = baseExperimentBody();
  const createRes = await request.post('/experiments').set(adminHdr).send(body);
  const expId = createRes.body.experiment._id;
  await request.patch(`/experiments/${expId}/status`).set(adminHdr).send({ status: 'active' });
  return expId;
}

// ── Full lifecycle flow ───────────────────────────────────────────────────────

describe('A/B experiment full lifecycle', () => {
  test('create → activate → assign → rollback → assign-after-rollback', async () => {
    const adminHdr = await adminHeader();

    // 1. Create
    const createRes = await request
      .post('/experiments')
      .set(adminHdr)
      .send(baseExperimentBody({ name: 'Lifecycle Test' }));
    expect(createRes.status).toBe(201);
    const expId = createRes.body.experiment._id;

    // 2. Activate
    const activateRes = await request
      .patch(`/experiments/${expId}/status`)
      .set(adminHdr)
      .send({ status: 'active' });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.experiment.status).toBe('active');

    // 3. Assign — should get a variant
    const assignRes = await request
      .post('/experiments/assign')
      .set(adminHdr)
      .send({ sessionId: 'lifecycle-sess', experimentId: expId });
    expect(assignRes.status).toBe(200);
    expect(['control', 'variant_a']).toContain(assignRes.body.variantKey);

    // 4. Rollback
    const rollbackRes = await request
      .post(`/experiments/${expId}/rollback`)
      .set(adminHdr);
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.experiment.status).toBe('rolled_back');
    expect(rollbackRes.body.rolledBack).toBe(true);

    // 5. Assign after rollback — all sessions get rollback variant
    const postRollbackRes = await request
      .post('/experiments/assign')
      .set(adminHdr)
      .send({ sessionId: 'lifecycle-sess', experimentId: expId });
    expect(postRollbackRes.status).toBe(200);
    expect(postRollbackRes.body.variantKey).toBe('control');
    expect(postRollbackRes.body.forced).toBe(true);
  });

  test('experiment appears in list with correct status after rollback', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    await request.post(`/experiments/${expId}/rollback`).set(adminHdr);

    const listRes = await request.get('/experiments').set(adminHdr);
    const found = listRes.body.experiments.find(e => e._id === expId);

    expect(found).toBeDefined();
    expect(found.status).toBe('rolled_back');
  });

  test('create → list → get → results flow', async () => {
    const adminHdr = await adminHeader();
    const body = baseExperimentBody({ name: 'Flow Test' });

    const createRes = await request.post('/experiments').set(adminHdr).send(body);
    const expId = createRes.body.experiment._id;

    const listRes = await request.get('/experiments').set(adminHdr);
    expect(listRes.body.experiments.some(e => e._id === expId)).toBe(true);

    const getRes = await request.get(`/experiments/${expId}`).set(adminHdr);
    expect(getRes.body.experiment.name).toBe('Flow Test');

    const resultsRes = await request.get(`/experiments/${expId}/results`).set(adminHdr);
    expect(resultsRes.status).toBe(200);
    expect(Array.isArray(resultsRes.body.distribution)).toBe(true);
  });
});

// ── Rollback controls ─────────────────────────────────────────────────────────

describe('rollback controls', () => {
  test('rollback endpoint returns rolledBack=true and experiment with status=rolled_back', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    const res = await request.post(`/experiments/${expId}/rollback`).set(adminHdr);

    expect(res.status).toBe(200);
    expect(res.body.rolledBack).toBe(true);
    expect(res.body.experiment.status).toBe('rolled_back');
  });

  test('after rollback, all new sessions get rollbackVariantKey variant', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);
    await request.post(`/experiments/${expId}/rollback`).set(adminHdr);

    for (let i = 0; i < 5; i++) {
      const res = await request
        .post('/experiments/assign')
        .set(adminHdr)
        .send({ sessionId: `rollback-sess-${i}`, experimentId: expId });

      expect(res.body.variantKey).toBe('control');
      expect(res.body.forced).toBe(true);
    }
  });

  test('no new assignment records are written after rollback', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);
    await request.post(`/experiments/${expId}/rollback`).set(adminHdr);

    const before = await ExperimentAssignment.countDocuments({ experimentId: expId });

    for (let i = 0; i < 3; i++) {
      await request
        .post('/experiments/assign')
        .set(adminHdr)
        .send({ sessionId: `no-write-${i}`, experimentId: expId });
    }

    const after = await ExperimentAssignment.countDocuments({ experimentId: expId });
    expect(after).toBe(before);
  });

  test('403 when salesperson tries rollback', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    const sp = await makeUser({ role: 'salesperson' });
    const res = await request.post(`/experiments/${expId}/rollback`).set(authHeader(sp));
    expect(res.status).toBe(403);
  });
});

// ── Results endpoint ──────────────────────────────────────────────────────────

describe('GET /experiments/:id/results', () => {
  test('distribution is empty before any assignments', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    const res = await request.get(`/experiments/${expId}/results`).set(adminHdr);
    expect(res.status).toBe(200);
    expect(res.body.distribution).toHaveLength(0);
  });

  test('distribution reflects actual assignment counts', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    // Create some assignments via API
    for (let i = 0; i < 4; i++) {
      await request
        .post('/experiments/assign')
        .set(adminHdr)
        .send({ sessionId: `dist-sess-${i}`, experimentId: expId });
    }

    const res = await request.get(`/experiments/${expId}/results`).set(adminHdr);
    const total = res.body.distribution.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(4);
  });
});

// ── RBAC enforcement ──────────────────────────────────────────────────────────

describe('RBAC enforcement', () => {
  test('salesperson cannot create an experiment (403)', async () => {
    const sp = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/experiments')
      .set(authHeader(sp))
      .send(baseExperimentBody());

    expect(res.status).toBe(403);
  });

  test('salesperson cannot update experiment status (403)', async () => {
    const adminHdr = await adminHeader();
    const expId    = await createActiveExperiment(adminHdr);

    const sp = await makeUser({ role: 'salesperson' });
    const res = await request
      .patch(`/experiments/${expId}/status`)
      .set(authHeader(sp))
      .send({ status: 'paused' });

    expect(res.status).toBe(403);
  });

  test('unauthenticated request to list experiments returns 401', async () => {
    const res = await request.get('/experiments');
    expect(res.status).toBe(401);
  });

  test('unauthenticated rollback returns 401', async () => {
    const exp = await Experiment.create({
      name: 'Unauth Test',
      scope: 'listing_layout',
      status: 'active',
      variants: [
        { key: 'control',   label: 'Control',   weight: 50 },
        { key: 'variant_a', label: 'Variant A', weight: 50 },
      ],
      rollbackVariantKey: 'control',
    });

    const res = await request.post(`/experiments/${exp._id}/rollback`);
    expect(res.status).toBe(401);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('input validation', () => {
  test('422 when scope is invalid', async () => {
    const res = await request
      .post('/experiments')
      .set(await adminHeader())
      .send({ ...baseExperimentBody(), scope: 'invalid_scope' });

    expect(res.status).toBe(422);
  });

  test('400 when variant weights do not sum to 100', async () => {
    const res = await request
      .post('/experiments')
      .set(await adminHeader())
      .send({
        name: 'Bad Weights',
        scope: 'listing_layout',
        variants: [
          { key: 'control',   label: 'Control',   weight: 70 },
          { key: 'variant_a', label: 'Variant A', weight: 20 },
        ],
      });

    expect(res.status).toBe(400);
  });

  test('409 on duplicate experiment name', async () => {
    const adminHdr = await adminHeader();
    const body = baseExperimentBody({ name: 'Unique API Name' });

    await request.post('/experiments').set(adminHdr).send(body);
    const res = await request.post('/experiments').set(adminHdr).send(body);
    expect(res.status).toBe(409);
  });
});
