const request          = require('supertest');
const mongoose         = require('mongoose');
const app              = require('../../app');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const {
  makeUser,
  makeDocument,
  makeRolePolicy,
  makeDocumentPermission,
  authHeader,
} = require('./helpers/fixtures');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ─── Request helpers ──────────────────────────────────────────────────────────

function getDoc(user, docId) {
  return request(app).get(`/documents/${docId}`).set(authHeader(user));
}

function editDoc(user, docId, name = 'Updated') {
  return request(app).put(`/documents/${docId}`).set(authHeader(user)).send({ name });
}

function deleteDoc(user, docId) {
  return request(app).delete(`/documents/${docId}`).set(authHeader(user));
}

function listDocs(user) {
  return request(app).get('/documents').set(authHeader(user));
}

// ─── Authentication guard ─────────────────────────────────────────────────────

describe('authentication', () => {
  it('rejects request with no Authorization header', async () => {
    const user = await makeUser({ role: 'admin' });
    const doc  = await makeDocument(user._id, user.dealershipId);

    const res = await request(app).get(`/documents/${doc._id}`);
    expect(res.status).toBe(401);
  });

  it('rejects request with an invalid/tampered token', async () => {
    const user = await makeUser({ role: 'admin' });
    const doc  = await makeDocument(user._id, user.dealershipId);

    const res = await request(app)
      .get(`/documents/${doc._id}`)
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  it('rejects request with a malformed Authorization value', async () => {
    const user = await makeUser({ role: 'admin' });
    const doc  = await makeDocument(user._id, user.dealershipId);

    const res = await request(app)
      .get(`/documents/${doc._id}`)
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
  });
});

// ─── Admin role ───────────────────────────────────────────────────────────────

describe('admin role', () => {
  it('admin can read any document type in their dealership', async () => {
    const admin = await makeUser({ role: 'admin' });

    for (const type of ['title', 'buyers_order', 'inspection_pdf']) {
      const doc = await makeDocument(admin._id, admin.dealershipId, { type });
      const res = await getDoc(admin, doc._id);
      expect(res.status).toBe(200);
      expect(res.body.document._id).toBe(doc._id.toString());
    }
  });

  it('admin can edit documents in their dealership without a policy', async () => {
    const admin = await makeUser({ role: 'admin' });
    const doc   = await makeDocument(admin._id, admin.dealershipId);

    const res = await editDoc(admin, doc._id, 'Admin rename');
    expect(res.status).toBe(200);
    expect(res.body.document.name).toBe('Admin rename');
  });

  it('admin can delete documents in their dealership', async () => {
    const admin = await makeUser({ role: 'admin' });
    const doc   = await makeDocument(admin._id, admin.dealershipId);

    const res = await deleteDoc(admin, doc._id);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
  });

  it('admin is denied access to a cross-dealership document', async () => {
    const admin       = await makeUser({ role: 'admin' });
    const otherAdmin  = await makeUser({ role: 'admin' });
    const doc         = await makeDocument(otherAdmin._id, otherAdmin.dealershipId);

    const res = await getDoc(admin, doc._id);
    expect(res.status).toBe(403);
  });

  it('admin sees all document types in listDocuments', async () => {
    const admin = await makeUser({ role: 'admin' });

    await makeDocument(admin._id, admin.dealershipId, { type: 'title' });
    await makeDocument(admin._id, admin.dealershipId, { type: 'buyers_order' });
    await makeDocument(admin._id, admin.dealershipId, { type: 'inspection_pdf' });

    const res = await listDocs(admin);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(3);
  });
});

// ─── Role-based policies ──────────────────────────────────────────────────────

describe('role-based policies', () => {
  it('user with no policy for the document type is denied', async () => {
    const sp  = await makeUser({ role: 'salesperson' });
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });

  it('user with own-role read policy can read', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(200);
  });

  it('user with read-only policy cannot edit', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    const editRes = await editDoc(sp, doc._id);
    expect(editRes.status).toBe(403);
  });

  it('user with edit policy can both read and edit', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'buyers_order', ['read', 'edit']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });

    expect((await getDoc(sp, doc._id)).status).toBe(200);
    expect((await editDoc(sp, doc._id)).status).toBe(200);
  });

  it('inspector with read policy can read but not delete inspection_pdf', async () => {
    const inspector = await makeUser({ role: 'inspector' });
    await makeRolePolicy(inspector.dealershipId, 'inspector', 'inspection_pdf', ['read']);
    const doc = await makeDocument(inspector._id, inspector.dealershipId, { type: 'inspection_pdf' });

    expect((await getDoc(inspector, doc._id)).status).toBe(200);
    expect((await deleteDoc(inspector, doc._id)).status).toBe(403);
  });

  it('policy for wrong document type does not grant access', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'buyers_order', ['read', 'edit']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });

  it('policy from a different dealership does not grant access', async () => {
    const sp    = await makeUser({ role: 'salesperson' });
    const other = new mongoose.Types.ObjectId();
    await makeRolePolicy(other, 'salesperson', 'title', ['read']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });
});

// ─── Role chain inheritance ───────────────────────────────────────────────────

describe('role chain inheritance', () => {
  it('salesperson inherits manager read policy when no own policy exists', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'manager', 'buyers_order', ['read']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(200);
  });

  it('salesperson own policy takes precedence over manager policy', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);
    await makeRolePolicy(sp.dealershipId, 'manager',     'title', ['read', 'edit']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    expect((await getDoc(sp,  doc._id)).status).toBe(200);
    expect((await editDoc(sp, doc._id)).status).toBe(403);
  });

  it('finance role inherits manager policy', async () => {
    const finance = await makeUser({ role: 'finance' });
    await makeRolePolicy(finance.dealershipId, 'manager', 'buyers_order', ['read']);
    const doc = await makeDocument(finance._id, finance.dealershipId, { type: 'buyers_order' });

    const res = await getDoc(finance, doc._id);
    expect(res.status).toBe(200);
  });

  it('cross-dealership document is denied even with a matching role policy', async () => {
    const sp          = await makeUser({ role: 'salesperson' });
    const otherDealer = await makeUser({ role: 'manager' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read', 'edit', 'delete']);
    const doc = await makeDocument(otherDealer._id, otherDealer.dealershipId, { type: 'title' });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });
});

// ─── Document-level permission overrides ─────────────────────────────────────

describe('document-level permission overrides', () => {
  it('user-level override grants action not in role policy', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocumentPermission(doc._id, {
      subjectType: 'user', userId: sp._id, actions: ['read', 'edit'],
    });

    const res = await editDoc(sp, doc._id, 'Override edit');
    expect(res.status).toBe(200);
  });

  it('user-level override restricts action allowed by role policy', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read', 'edit']);
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocumentPermission(doc._id, {
      subjectType: 'user', userId: sp._id, actions: ['download'],
    });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });

  it('role-level override grants access for the matching role', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'inspection_pdf' });
    await makeDocumentPermission(doc._id, {
      subjectType: 'role', role: 'salesperson', actions: ['read'],
    });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(200);
  });

  it('role-level override for a different role does not apply', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocumentPermission(doc._id, {
      subjectType: 'role', role: 'finance', actions: ['read'],
    });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });

  it('user-level override takes precedence over role-level override', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    const doc = await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocumentPermission(doc._id, {
      subjectType: 'role', role: 'salesperson', actions: ['read'],
    });
    await makeDocumentPermission(doc._id, {
      subjectType: 'user', userId: sp._id, actions: ['download'],
    });

    const res = await getDoc(sp, doc._id);
    expect(res.status).toBe(403);
  });
});

// ─── listDocuments filtering ──────────────────────────────────────────────────

describe('listDocuments filtering', () => {
  it('returns empty list when user has no policies and no overrides', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(0);
  });

  it('returns only document types permitted by role policy', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);

    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'inspection_pdf' });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].type).toBe('title');
  });

  it('includes types accessible via role chain (manager policy)', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'manager', 'buyers_order', ['read']);

    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].type).toBe('buyers_order');
  });

  it('includes documents accessible via user-level document override', async () => {
    const sp         = await makeUser({ role: 'salesperson' });
    const allowedDoc = await makeDocument(sp._id, sp.dealershipId, { type: 'inspection_pdf' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    await makeDocumentPermission(allowedDoc._id, {
      subjectType: 'user', userId: sp._id, actions: ['read'],
    });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0]._id.toString()).toBe(allowedDoc._id.toString());
  });

  it('includes documents accessible via role-level document override', async () => {
    const sp          = await makeUser({ role: 'salesperson' });
    const overrideDoc = await makeDocument(sp._id, sp.dealershipId, { type: 'buyers_order' });
    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });

    await makeDocumentPermission(overrideDoc._id, {
      subjectType: 'role', role: 'salesperson', actions: ['read'],
    });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0]._id.toString()).toBe(overrideDoc._id.toString());
  });

  it('does not return documents from a different dealership', async () => {
    const sp    = await makeUser({ role: 'salesperson' });
    const other = await makeUser({ role: 'salesperson' });
    await makeRolePolicy(sp.dealershipId, 'salesperson', 'title', ['read']);

    await makeDocument(sp._id, sp.dealershipId, { type: 'title' });
    await makeDocument(other._id, other.dealershipId, { type: 'title' });

    const res = await listDocs(sp);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
    expect(res.body.documents[0].dealershipId.toString())
      .toBe(sp.dealershipId.toString());
  });

  it('admin sees all documents in their dealership regardless of type', async () => {
    const admin = await makeUser({ role: 'admin' });

    await makeDocument(admin._id, admin.dealershipId, { type: 'title' });
    await makeDocument(admin._id, admin.dealershipId, { type: 'buyers_order' });
    await makeDocument(admin._id, admin.dealershipId, { type: 'inspection_pdf' });

    const res = await listDocs(admin);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(3);
  });

  it('admin does not see cross-dealership documents in list', async () => {
    const admin = await makeUser({ role: 'admin' });
    const other = await makeUser({ role: 'admin' });

    await makeDocument(admin._id, admin.dealershipId, { type: 'title' });
    await makeDocument(other._id, other.dealershipId, { type: 'title' });

    const res = await listDocs(admin);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });
});

// ─── Non-existent document ────────────────────────────────────────────────────

describe('non-existent document', () => {
  it('returns 404 for an unknown document ID even for admin', async () => {
    const admin  = await makeUser({ role: 'admin' });
    const fakeId = new mongoose.Types.ObjectId();

    const res = await getDoc(admin, fakeId);
    expect(res.status).toBe(404);
  });

  it('returns error for a malformed document ID', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await request(app)
      .get('/documents/not-an-id')
      .set(authHeader(admin));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
