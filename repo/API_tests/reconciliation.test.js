/**
 * API tests: POST /reconciliation/run, GET /reconciliation/logs,
 *            GET /reconciliation/logs/:runId/ledger,
 *            GET /reconciliation/tickets, PATCH /reconciliation/tickets/:id/resolve
 *
 * No mocking — requests go through the real Express app and MongoDB.
 */
const supertest          = require('supertest');
const mongoose           = require('mongoose');
const app                = require('../backend/src/app');
const ReconciliationLog    = require('../backend/src/models/ReconciliationLog');
const ReconciliationLedger = require('../backend/src/models/ReconciliationLedger');
const DiscrepancyTicket    = require('../backend/src/models/DiscrepancyTicket');
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

async function makeLog(overrides = {}) {
  return ReconciliationLog.create({
    startedAt:   new Date(),
    status:      'completed',
    completedAt: new Date(),
    totalChecked: 0,
    discrepancyCount: 0,
    ...overrides,
  });
}

async function makeTicket(logId, overrides = {}) {
  return DiscrepancyTicket.create({
    reconciliationLogId: logId,
    type:                'missing_invoice',
    description:         'Test ticket',
    status:              'open',
    ...overrides,
  });
}

async function makeLedgerEntry(runId, overrides = {}) {
  return ReconciliationLedger.create({
    runId,
    runDate:  new Date(),
    status:   'matched',
    ...overrides,
  });
}

// ── POST /reconciliation/run ──────────────────────────────────────────────────

describe('POST /reconciliation/run', () => {
  test('admin triggers a run and receives 201 with log', async () => {
    const res = await request
      .post('/reconciliation/run')
      .set(await adminHeader());

    expect(res.status).toBe(201);
    expect(res.body.log).toBeDefined();
    expect(res.body.log.status).toBe('completed');
    expect(res.body.log.startedAt).toBeDefined();
  });

  test('run creates a ReconciliationLog record in the database', async () => {
    const adminHdr = await adminHeader();
    await request.post('/reconciliation/run').set(adminHdr);

    const logs = await ReconciliationLog.find({}).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('completed');
  });

  test('consecutive runs create separate log records', async () => {
    const adminHdr = await adminHeader();
    await request.post('/reconciliation/run').set(adminHdr);
    await request.post('/reconciliation/run').set(adminHdr);

    const logs = await ReconciliationLog.find({}).lean();
    expect(logs).toHaveLength(2);
  });

  test('403 when manager triggers a run', async () => {
    const mgr = await makeUser({ role: 'manager' });

    const res = await request
      .post('/reconciliation/run')
      .set(authHeader(mgr));

    expect(res.status).toBe(403);
  });

  test('403 when finance role triggers a run', async () => {
    const user = await makeUser({ role: 'finance' });

    const res = await request
      .post('/reconciliation/run')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request.post('/reconciliation/run');
    expect(res.status).toBe(401);
  });
});

// ── GET /reconciliation/logs ──────────────────────────────────────────────────

describe('GET /reconciliation/logs', () => {
  test('returns empty logs array when no runs have occurred', async () => {
    const res = await request
      .get('/reconciliation/logs')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual([]);
  });

  test('returns logs sorted by startedAt descending (newest first)', async () => {
    await makeLog({ startedAt: new Date('2025-01-01') });
    await makeLog({ startedAt: new Date('2025-06-01') });

    const res = await request
      .get('/reconciliation/logs')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    const dates = res.body.logs.map(l => new Date(l.startedAt).getTime());
    expect(dates[0]).toBeGreaterThan(dates[1]);
  });

  test('each log includes status, startedAt, totalChecked, discrepancyCount', async () => {
    await makeLog({ totalChecked: 10, discrepancyCount: 2, status: 'completed' });

    const res = await request
      .get('/reconciliation/logs')
      .set(await adminHeader());

    const log = res.body.logs[0];
    expect(log).toHaveProperty('status');
    expect(log).toHaveProperty('startedAt');
    expect(log).toHaveProperty('totalChecked');
    expect(log).toHaveProperty('discrepancyCount');
    expect(log.totalChecked).toBe(10);
    expect(log.discrepancyCount).toBe(2);
  });

  test('403 when manager accesses logs', async () => {
    const mgr = await makeUser({ role: 'manager' });

    const res = await request
      .get('/reconciliation/logs')
      .set(authHeader(mgr));

    expect(res.status).toBe(403);
  });

  test('403 when salesperson accesses logs', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request
      .get('/reconciliation/logs')
      .set(authHeader(user));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request.get('/reconciliation/logs');
    expect(res.status).toBe(401);
  });
});

// ── GET /reconciliation/logs/:runId/ledger ────────────────────────────────────

describe('GET /reconciliation/logs/:runId/ledger', () => {
  test('returns all ledger records for a run', async () => {
    const log = await makeLog();
    await makeLedgerEntry(log._id, { status: 'matched' });
    await makeLedgerEntry(log._id, { status: 'missing_invoice' });

    const res = await request
      .get(`/reconciliation/logs/${log._id}/ledger`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
  });

  test('returns empty records when run has no ledger entries', async () => {
    const log = await makeLog();

    const res = await request
      .get(`/reconciliation/logs/${log._id}/ledger`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });

  test('filters by valid status query param', async () => {
    const log = await makeLog();
    await makeLedgerEntry(log._id, { status: 'matched' });
    await makeLedgerEntry(log._id, { status: 'missing_invoice' });

    const res = await request
      .get(`/reconciliation/logs/${log._id}/ledger?status=matched`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(1);
    expect(res.body.records[0].status).toBe('matched');
  });

  test('400 for invalid status filter value', async () => {
    const log = await makeLog();

    const res = await request
      .get(`/reconciliation/logs/${log._id}/ledger?status=bogus`)
      .set(await adminHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status filter/i);
  });

  test('returns empty array for non-existent runId (not 404)', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request
      .get(`/reconciliation/logs/${fakeId}/ledger`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });

  test('403 when manager accesses ledger', async () => {
    const log = await makeLog();
    const mgr = await makeUser({ role: 'manager' });

    const res = await request
      .get(`/reconciliation/logs/${log._id}/ledger`)
      .set(authHeader(mgr));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const log = await makeLog();
    const res = await request.get(`/reconciliation/logs/${log._id}/ledger`);
    expect(res.status).toBe(401);
  });
});

// ── GET /reconciliation/tickets ───────────────────────────────────────────────

describe('GET /reconciliation/tickets', () => {
  test('returns open tickets by default (no status query param)', async () => {
    const log = await makeLog();
    await makeTicket(log._id, { status: 'open' });
    await makeTicket(log._id, { status: 'resolved' });

    const res = await request
      .get('/reconciliation/tickets')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].status).toBe('open');
  });

  test('returns empty tickets array when none exist', async () => {
    const res = await request
      .get('/reconciliation/tickets')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(0);
  });

  test('filters by status=resolved', async () => {
    const log = await makeLog();
    await makeTicket(log._id, { status: 'open' });
    await makeTicket(log._id, { status: 'resolved' });

    const res = await request
      .get('/reconciliation/tickets?status=resolved')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].status).toBe('resolved');
  });

  test('status=all returns both open and resolved tickets', async () => {
    const log = await makeLog();
    await makeTicket(log._id, { status: 'open' });
    await makeTicket(log._id, { status: 'resolved' });

    const res = await request
      .get('/reconciliation/tickets?status=all')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(2);
  });

  test('filters by type', async () => {
    const log = await makeLog();
    await makeTicket(log._id, { type: 'missing_invoice', status: 'open' });
    await makeTicket(log._id, { type: 'amount_mismatch', status: 'open' });

    const res = await request
      .get('/reconciliation/tickets?type=missing_invoice')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].type).toBe('missing_invoice');
  });

  test('filters by logId', async () => {
    const logA = await makeLog();
    const logB = await makeLog();
    await makeTicket(logA._id, { status: 'open' });
    await makeTicket(logB._id, { status: 'open' });

    const res = await request
      .get(`/reconciliation/tickets?logId=${logA._id}&status=all`)
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].reconciliationLogId.toString()).toBe(logA._id.toString());
  });

  test('400 for invalid status filter', async () => {
    const res = await request
      .get('/reconciliation/tickets?status=pending')
      .set(await adminHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/i);
  });

  test('400 for invalid type filter', async () => {
    const res = await request
      .get('/reconciliation/tickets?type=fake_type')
      .set(await adminHeader());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid type/i);
  });

  test('403 when manager accesses tickets', async () => {
    const mgr = await makeUser({ role: 'manager' });

    const res = await request
      .get('/reconciliation/tickets')
      .set(authHeader(mgr));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request.get('/reconciliation/tickets');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /reconciliation/tickets/:id/resolve ─────────────────────────────────

describe('PATCH /reconciliation/tickets/:id/resolve', () => {
  test('admin resolves an open ticket (200, status=resolved)', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id, { status: 'open' });

    const res = await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .set(await adminHeader())
      .send({ resolution: 'Manually verified — correct' });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('resolved');
    expect(res.body.ticket.resolution).toBe('Manually verified — correct');
    expect(res.body.ticket.resolvedAt).toBeDefined();
  });

  test('resolve is idempotent for already-resolved ticket', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id, { status: 'open' });

    const adminHdr = await adminHeader();
    await request.patch(`/reconciliation/tickets/${ticket._id}/resolve`).set(adminHdr).send({});
    const res = await request.patch(`/reconciliation/tickets/${ticket._id}/resolve`).set(adminHdr).send({});

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('resolved');
  });

  test('resolution note is stored when provided', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id);

    const res = await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .set(await adminHeader())
      .send({ resolution: 'Confirmed OK after manual review' });

    expect(res.body.ticket.resolution).toBe('Confirmed OK after manual review');
  });

  test('resolves without a resolution note (resolution field is optional)', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id);

    const res = await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .set(await adminHeader())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('resolved');
  });

  test('404 when ticket does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request
      .patch(`/reconciliation/tickets/${fakeId}/resolve`)
      .set(await adminHeader())
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Ticket not found/i);
  });

  test('403 when manager tries to resolve a ticket', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id);
    const mgr    = await makeUser({ role: 'manager' });

    const res = await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .set(authHeader(mgr))
      .send({});

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id);

    const res = await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .send({});

    expect(res.status).toBe(401);
  });

  test('ticket is persisted as resolved in database after resolve', async () => {
    const log    = await makeLog();
    const ticket = await makeTicket(log._id, { status: 'open' });

    await request
      .patch(`/reconciliation/tickets/${ticket._id}/resolve`)
      .set(await adminHeader())
      .send({ resolution: 'DB check' });

    const updated = await DiscrepancyTicket.findById(ticket._id).lean();
    expect(updated.status).toBe('resolved');
    expect(updated.resolution).toBe('DB check');
  });
});
