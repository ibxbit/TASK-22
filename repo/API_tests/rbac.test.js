const supertest  = require('supertest');
const mongoose   = require('mongoose');
const app        = require('../backend/src/app');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const {
  makeUser,
  makeDocument,
  makeRolePolicy,
  makeDocumentPermission,
  authHeader,
} = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

function getDoc(user, docId) {
  return request.get(`/documents/${docId}`).set(authHeader(user));
}

function editDoc(user, docId, body) {
  return request.put(`/documents/${docId}`).set(authHeader(user)).send(body);
}

function listDocs(user) {
  return request.get('/documents').set(authHeader(user));
}

function setPermission(user, docId, body) {
  return request.post(`/documents/${docId}/permissions`).set(authHeader(user)).send(body);
}

// ── Authentication guard ──────────────────────────────────────────────────────

describe('auth guard', () => {
  test('returns 401 when no Authorization header', async () => {
    const res = await request.get('/documents');
    expect(res.status).toBe(401);
  });

  test('returns 401 for tampered/invalid Bearer token', async () => {
    const res = await request
      .get('/documents')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  test('returns 401 when X-User-Id is supplied without Bearer token', async () => {
    const user = await makeUser({ role: 'admin' });
    const res = await request
      .get('/documents')
      .set('X-User-Id', user._id.toString());
    expect(res.status).toBe(401);
  });
});

// ── listDocuments ─────────────────────────────────────────────────────────────

describe('GET /documents', () => {
  test('admin sees all documents in own dealership', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const admin = await makeUser({ role: 'admin', dealershipId });
    await makeDocument(admin._id, dealershipId, { type: 'title' });
    await makeDocument(admin._id, dealershipId, { type: 'buyers_order' });
    const res = await listDocs(admin);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(2);
  });

  test('admin does not see documents from other dealerships', async () => {
    const dealershipA = new mongoose.Types.ObjectId();
    const dealershipB = new mongoose.Types.ObjectId();
    const admin = await makeUser({ role: 'admin', dealershipId: dealershipA });
    const other = await makeUser({ role: 'admin', dealershipId: dealershipB });
    await makeDocument(other._id, dealershipB, { type: 'title' });
    const res = await listDocs(admin);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(0);
  });

  test('salesperson sees documents allowed by role policy', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read']);
    await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeDocument(user._id, dealershipId, { type: 'inspection_pdf' });
    const res = await listDocs(user);
    expect(res.status).toBe(200);
    expect(res.body.documents.every(d => d.type === 'title')).toBe(true);
  });

  test('user sees document granted by direct user override', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'inspection_pdf' });
    await makeDocumentPermission(doc._id, { subjectType: 'user', userId: user._id, actions: ['read'] });
    const res = await listDocs(user);
    expect(res.status).toBe(200);
    const ids = res.body.documents.map(d => d._id.toString());
    expect(ids).toContain(doc._id.toString());
  });

  test('user with no policies sees empty list', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    await makeDocument(user._id, dealershipId);
    const res = await listDocs(user);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(0);
  });
});

// ── GET /documents/:id ────────────────────────────────────────────────────────

describe('GET /documents/:id', () => {
  test('admin can read any document in dealership', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const admin = await makeUser({ role: 'admin', dealershipId });
    const doc   = await makeDocument(admin._id, dealershipId);
    const res = await getDoc(admin, doc._id);
    expect(res.status).toBe(200);
    expect(res.body.document._id.toString()).toBe(doc._id.toString());
  });

  test('cross-dealership read is denied (403)', async () => {
    const dealershipA = new mongoose.Types.ObjectId();
    const dealershipB = new mongoose.Types.ObjectId();
    const userA = await makeUser({ role: 'admin', dealershipId: dealershipA });
    const userB = await makeUser({ role: 'salesperson', dealershipId: dealershipB });
    const doc   = await makeDocument(userB._id, dealershipB);
    const res = await getDoc(userA, doc._id);
    expect(res.status).toBe(403);
  });

  test('role with policy can read', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read']);
    const res = await getDoc(user, doc._id);
    expect(res.status).toBe(200);
  });

  test('role without read permission is denied', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['edit']);
    const res = await getDoc(user, doc._id);
    expect(res.status).toBe(403);
  });

  test('user-level override grants read', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    await makeDocumentPermission(doc._id, { subjectType: 'user', userId: user._id, actions: ['read'] });
    const res = await getDoc(user, doc._id);
    expect(res.status).toBe(200);
  });
});

// ── PUT /documents/:id ────────────────────────────────────────────────────────

describe('PUT /documents/:id', () => {
  test('403 when role policy does not include edit', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read']);
    const res = await editDoc(user, doc._id, { name: 'new' });
    expect(res.status).toBe(403);
  });

  test('200 when role policy includes edit', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'manager', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'manager', 'title', ['read', 'edit']);
    const res = await editDoc(user, doc._id, { name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.document.name).toBe('Updated Name');
  });

  test('401 when no Bearer token for mutation', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'admin', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    const res = await request
      .put(`/documents/${doc._id}`)
      .send({ name: 'no auth' });
    expect(res.status).toBe(401);
  });
});

// ── Role chain inheritance via API ────────────────────────────────────────────

describe('role chain inheritance', () => {
  test('salesperson inherits manager read policy via chain', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'manager', 'title', ['read']);
    const res = await getDoc(user, doc._id);
    expect(res.status).toBe(200);
  });

  test('own policy blocks inheritance of broader parent policy', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read']);
    await makeRolePolicy(dealershipId, 'manager',     'title', ['read','edit']);
    const res = await editDoc(user, doc._id, { name: 'x' });
    expect(res.status).toBe(403);
  });
});

// ── Admin/internal route protection ──────────────────────────────────────────

describe('admin-only routes', () => {
  test('salesperson cannot set document permissions (403)', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const sp  = await makeUser({ role: 'salesperson', dealershipId });
    const doc = await makeDocument(sp._id, dealershipId, { type: 'title' });
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read', 'edit']);

    const body = { subjectType: 'role', role: 'salesperson', actions: ['read'] };
    const res = await setPermission(sp, doc._id, body);
    expect(res.status).toBe(403);
  });

  test('401 without token for permission endpoint', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const admin = await makeUser({ role: 'admin', dealershipId });
    const doc   = await makeDocument(admin._id, dealershipId);
    const res = await request
      .post(`/documents/${doc._id}/permissions`)
      .send({ subjectType: 'role', role: 'salesperson', actions: ['read'] });
    expect(res.status).toBe(401);
  });
});
