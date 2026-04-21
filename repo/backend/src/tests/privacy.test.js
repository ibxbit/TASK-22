const request         = require('supertest');
const mongoose        = require('mongoose');
const app             = require('../../app');
const ConsentRecord   = require('../../models/ConsentRecord');
const DeletionRequest = require('../../models/DeletionRequest');
const AnalyticsEvent  = require('../../models/AnalyticsEvent');
const AuditLog        = require('../../models/AuditLog');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, authHeader }                  = require('./helpers/fixtures');

const RETENTION_DAYS = 30;

let testUser;
let dealershipId;

beforeAll(async () => {
  await connect();
  dealershipId = new mongoose.Types.ObjectId();
});
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  testUser = await makeUser({ role: 'salesperson', dealershipId });
});

async function makeConsent(userId, overrides = {}) {
  return ConsentRecord.create({
    userId,
    dealershipId,
    type:         'data_processing',
    version:      '1.0',
    consentGiven: true,
    ipAddress:    '10.0.0.1',
    userAgent:    'TestAgent/1.0',
    ...overrides,
  });
}

function deletionBody(scope = ['all'], notes = null) {
  const body = { scope };
  if (notes) body.notes = notes;
  return body;
}

// ─── POST /privacy/consent ───────────────────────────────────────────────────

describe('POST /privacy/consent', () => {
  it('creates a consent record and returns 201', async () => {
    const body = { type: 'data_processing', version: '1.0', consentGiven: true };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record).toBeDefined();
    expect(res.body.record.type).toBe('data_processing');
    expect(res.body.record.version).toBe('1.0');
    expect(res.body.record.consentGiven).toBe(true);
  });

  it('consent record is scoped to the authenticated user', async () => {
    const body = { type: 'marketing', version: '2.0', consentGiven: false };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record.userId.toString()).toBe(testUser._id.toString());
  });

  it('consent record stores dealershipId from authenticated user', async () => {
    const body = { type: 'financing_terms', version: '1.1', consentGiven: true };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record.dealershipId.toString()).toBe(dealershipId.toString());
  });

  it('consent record with consentGiven=false is accepted', async () => {
    const body = { type: 'marketing', version: '1.0', consentGiven: false };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record.consentGiven).toBe(false);
  });

  it('consent record with optional orderId is accepted', async () => {
    const fakeOrderId = new mongoose.Types.ObjectId();
    const body = { type: 'vehicle_sale', version: '1.0', consentGiven: true, orderId: fakeOrderId.toString() };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record.orderId.toString()).toBe(fakeOrderId.toString());
  });

  it('consent record with consentText is stored', async () => {
    const body = { type: 'warranty', version: '1.0', consentGiven: true, consentText: 'I agree to terms' };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.record.consentText).toBe('I agree to terms');
  });

  it('created consent is retrievable via GET /privacy/consent', async () => {
    const body = { type: 'data_processing', version: '1.0', consentGiven: true };
    await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    const getRes = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(getRes.status).toBe(200);
    expect(getRes.body.records).toHaveLength(1);
    expect(getRes.body.records[0].type).toBe('data_processing');
  });

  it('returns 422 when type is missing', async () => {
    const body = { version: '1.0', consentGiven: true };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(422);
  });

  it('returns 422 when consentGiven is missing', async () => {
    const body = { type: 'data_processing', version: '1.0' };
    const res = await request(app)
      .post('/privacy/consent')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(422);
  });

  it('returns 401 without Bearer token', async () => {
    const body = { type: 'data_processing', version: '1.0', consentGiven: true };
    const res = await request(app)
      .post('/privacy/consent')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('multiple consent records for different types accumulate correctly', async () => {
    const types = ['data_processing', 'marketing', 'financing_terms'];
    for (const type of types) {
      await request(app)
        .post('/privacy/consent')
        .set(authHeader(testUser))
        .send({ type, version: '1.0', consentGiven: true });
    }

    const getRes = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(getRes.status).toBe(200);
    expect(getRes.body.records).toHaveLength(3);
    const returnedTypes = getRes.body.records.map(r => r.type).sort();
    expect(returnedTypes).toEqual(types.sort());
  });
});

// ─── GET /privacy/consent ────────────────────────────────────────────────────

describe('GET /privacy/consent', () => {
  it('returns empty records when user has no consents', async () => {
    const res = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.records).toEqual([]);
  });

  it('returns all consent records for the authenticated user', async () => {
    await makeConsent(testUser._id, { type: 'data_processing' });
    await makeConsent(testUser._id, { type: 'marketing', consentGiven: false });

    const res = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(2);
    const types = res.body.records.map(r => r.type).sort();
    expect(types).toEqual(['data_processing', 'marketing']);
  });

  it('does not leak records of another user', async () => {
    const other = await makeUser({ role: 'salesperson', dealershipId });
    await makeConsent(other._id, { type: 'marketing' });

    const res = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0);
  });

  it('returns records ordered by givenAt descending (newest first)', async () => {
    await makeConsent(testUser._id, { givenAt: new Date('2025-01-01') });
    await makeConsent(testUser._id, { givenAt: new Date('2025-06-01') });

    const res = await request(app)
      .get('/privacy/consent')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    const dates = res.body.records.map(r => new Date(r.givenAt).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });

  it('returns 401 without Bearer token', async () => {
    const res = await request(app).get('/privacy/consent');
    expect(res.status).toBe(401);
  });
});

// ─── GET /privacy/export ─────────────────────────────────────────────────────

describe('GET /privacy/export', () => {
  it('returns export envelope with user, documents, consentRecords, analyticsEvents, auditLogs', async () => {
    const res = await request(app)
      .get('/privacy/export')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('exportedAt');
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('documents');
    expect(res.body).toHaveProperty('consentRecords');
    expect(res.body).toHaveProperty('analyticsEvents');
    expect(res.body).toHaveProperty('auditLogs');
  });

  it('export.user matches the authenticated user', async () => {
    const res = await request(app)
      .get('/privacy/export')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.user._id).toBe(testUser._id.toString());
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('export includes consent records belonging to the user', async () => {
    await makeConsent(testUser._id, { type: 'financing_terms' });

    const res = await request(app)
      .get('/privacy/export')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.consentRecords).toHaveLength(1);
    expect(res.body.consentRecords[0].type).toBe('financing_terms');
  });

  it('export consentRecords are consistent with GET /privacy/consent', async () => {
    await makeConsent(testUser._id, { type: 'data_processing' });
    await makeConsent(testUser._id, { type: 'marketing' });

    const [exportRes, consentRes] = await Promise.all([
      request(app).get('/privacy/export').set(authHeader(testUser)),
      request(app).get('/privacy/consent').set(authHeader(testUser)),
    ]);

    expect(exportRes.status).toBe(200);
    expect(consentRes.status).toBe(200);
    expect(exportRes.body.consentRecords).toHaveLength(consentRes.body.records.length);
  });

  it('exportedAt is a valid ISO 8601 timestamp', async () => {
    const res = await request(app)
      .get('/privacy/export')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    const ts = new Date(res.body.exportedAt);
    expect(ts.getTime()).not.toBeNaN();
  });

  it('returns 401 without Bearer token', async () => {
    const res = await request(app).get('/privacy/export');
    expect(res.status).toBe(401);
  });
});

// ─── POST /privacy/deletion-request ─────────────────────────────────────────

describe('POST /privacy/deletion-request', () => {
  it('creates a deletion request with status=pending and 30-day scheduledAt', async () => {
    const body   = deletionBody(['all']);
    const before = Date.now();

    const res = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    const { request: req } = res.body;
    expect(req.status).toBe('pending');
    expect(req.scope).toContain('all');

    const requestedAt  = new Date(req.requestedAt).getTime();
    const scheduledAt  = new Date(req.scheduledAt).getTime();
    const expectedHold = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    expect(scheduledAt - requestedAt).toBeCloseTo(expectedHold, -3);
    expect(requestedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns a human-readable message containing the 30-day hold duration', async () => {
    const body = deletionBody(['profile']);
    const res  = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/30/);
  });

  it('scoped deletion request (not all) is accepted', async () => {
    const body = deletionBody(['profile', 'documents']);
    const res  = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.request.scope).toEqual(['profile', 'documents']);
  });

  it('returns 409 when a pending deletion request already exists', async () => {
    const body = deletionBody(['all']);
    await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    const res2 = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res2.status).toBe(409);
    expect(res2.body.error).toMatch(/pending/i);
  });

  it('allows a new request after the previous one is cancelled', async () => {
    const body   = deletionBody(['all']);
    const create = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    const requestId = create.body.request._id;
    await DeletionRequest.findByIdAndUpdate(requestId, { status: 'cancelled' });

    const res2 = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res2.status).toBe(201);
  });

  it('returns 401 without Bearer token', async () => {
    const body = deletionBody(['all']);
    const res  = await request(app)
      .post('/privacy/deletion-request')
      .send(body);
    expect(res.status).toBe(401);
  });
});

// ─── GET /privacy/deletion-requests ─────────────────────────────────────────

describe('GET /privacy/deletion-requests', () => {
  it('returns empty array when no deletion requests exist', async () => {
    const res = await request(app)
      .get('/privacy/deletion-requests')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.requests).toEqual([]);
  });

  it('returns all deletion requests for the authenticated user', async () => {
    const body = deletionBody(['all']);
    await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    const res = await request(app)
      .get('/privacy/deletion-requests')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].userId).toBe(testUser._id.toString());
  });

  it('does not return deletion requests of another user', async () => {
    const other = await makeUser({ role: 'salesperson', dealershipId });
    await DeletionRequest.create({
      userId:      other._id,
      requestedBy: other._id,
      scope:       ['all'],
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get('/privacy/deletion-requests')
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(0);
  });
});

// ─── DELETE /privacy/deletion-requests/:id ───────────────────────────────────

describe('DELETE /privacy/deletion-requests/:id', () => {
  it('cancels a pending deletion request', async () => {
    const body   = deletionBody(['all']);
    const create = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    const requestId = create.body.request._id;
    const path      = `/privacy/deletion-requests/${requestId}`;

    const res = await request(app)
      .delete(path)
      .set(authHeader(testUser));

    expect(res.status).toBe(200);
    expect(res.body.request.status).toBe('cancelled');
  });

  it('returns 409 when trying to cancel an already-cancelled request', async () => {
    const req = await DeletionRequest.create({
      userId:      testUser._id,
      requestedBy: testUser._id,
      scope:       ['all'],
      status:      'cancelled',
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const path = `/privacy/deletion-requests/${req._id}`;
    const res  = await request(app)
      .delete(path)
      .set(authHeader(testUser));

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cancelled/);
  });

  it('returns 409 when trying to cancel a completed request', async () => {
    const req = await DeletionRequest.create({
      userId:      testUser._id,
      requestedBy: testUser._id,
      scope:       ['all'],
      status:      'completed',
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() - 1),
      executedAt:  new Date(),
    });

    const path = `/privacy/deletion-requests/${req._id}`;
    const res  = await request(app)
      .delete(path)
      .set(authHeader(testUser));

    expect(res.status).toBe(409);
  });

  it('returns 404 for a request that belongs to another user', async () => {
    const other = await makeUser({ role: 'salesperson', dealershipId });
    const req   = await DeletionRequest.create({
      userId:      other._id,
      requestedBy: other._id,
      scope:       ['all'],
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const path = `/privacy/deletion-requests/${req._id}`;
    const res  = await request(app)
      .delete(path)
      .set(authHeader(testUser));

    expect(res.status).toBe(404);
  });

  it('returns 401 without Bearer token', async () => {
    const req = await DeletionRequest.create({
      userId:      testUser._id,
      requestedBy: testUser._id,
      scope:       ['all'],
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const path = `/privacy/deletion-requests/${req._id}`;
    const res  = await request(app).delete(path);

    expect(res.status).toBe(401);
  });
});

// ─── 30-day retention logic ──────────────────────────────────────────────────

describe('30-day retention hold', () => {
  it('scheduledAt is exactly RETENTION_DAYS after requestedAt', async () => {
    const body = deletionBody(['all']);
    const res  = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    const { requestedAt, scheduledAt } = res.body.request;
    const diffMs     = new Date(scheduledAt) - new Date(requestedAt);
    const expectedMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    expect(Math.abs(diffMs - expectedMs)).toBeLessThan(1000);
  });

  it('a newly created request is not yet due for execution', async () => {
    const body = deletionBody(['all']);
    const res  = await request(app)
      .post('/privacy/deletion-request')
      .set(authHeader(testUser))
      .send(body);

    expect(res.status).toBe(201);
    const scheduledAt = new Date(res.body.request.scheduledAt);
    expect(scheduledAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('deletionService only processes requests whose scheduledAt is in the past', async () => {
    const { processDueDeletions } = require('../../services/deletionService');

    await DeletionRequest.create({
      userId:      testUser._id,
      requestedBy: testUser._id,
      scope:       ['analytics'],
      status:      'pending',
      requestedAt: new Date(),
      scheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const result = await processDueDeletions();
    expect(result.total).toBe(0);
    expect(result.processed).toBe(0);

    const req = await DeletionRequest.findOne({ userId: testUser._id });
    expect(req.status).toBe('pending');
  });

  it('deletionService processes overdue requests and marks them completed', async () => {
    const { processDueDeletions } = require('../../services/deletionService');

    await DeletionRequest.create({
      userId:      testUser._id,
      requestedBy: testUser._id,
      scope:       ['analytics'],
      status:      'pending',
      requestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      scheduledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    });

    const result = await processDueDeletions();
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const req = await DeletionRequest.findOne({ userId: testUser._id });
    expect(req.status).toBe('completed');
    expect(req.executedAt).not.toBeNull();
  });
});
