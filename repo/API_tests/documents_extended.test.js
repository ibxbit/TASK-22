/**
 * API tests: POST /documents/upload, GET /documents/:id/download,
 *            POST /documents/:id/share, POST /documents/:id/submit,
 *            POST /documents/:id/approve
 *
 * No mocking — requests go through the real Express app and MongoDB.
 * Upload tests send a real PDF buffer (valid magic bytes: %PDF).
 * Download tests write a real temp file so res.download() can serve it.
 */
const fs        = require('fs');
const os        = require('os');
const path      = require('path');
const mongoose  = require('mongoose');
const supertest = require('supertest');
const app       = require('../backend/src/app');
const Document  = require('../backend/src/models/Document');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const {
  makeUser, makeDocument, authHeader,
} = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

// Minimal valid PDF — starts with %PDF magic bytes (0x25 0x50 0x44 0x46)
const PDF_BUFFER = Buffer.from('%PDF-1.4 placeholder content for test suite');

const tempFiles = [];

function makeTempFile(content = PDF_BUFFER) {
  const fp = path.join(
    os.tmpdir(),
    `doctest-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`,
  );
  fs.writeFileSync(fp, content);
  tempFiles.push(fp);
  return fp;
}

beforeAll(() => connect());
afterAll(async () => {
  await disconnect();
  for (const f of tempFiles) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
});
beforeEach(() => clearCollections());

async function adminHeader() {
  const admin = await makeUser({ role: 'admin' });
  return { admin, hdr: authHeader(admin) };
}

// Creates a Document record whose filePath points to a real file on disk.
async function makeDownloadableDoc(user) {
  const fp = makeTempFile();
  return makeDocument(user._id, user.dealershipId, {
    filePath: fp,
    type:     'title',
    name:     'download-test.pdf',
    status:   'draft',
  });
}

// ── POST /documents/upload ────────────────────────────────────────────────────

describe('POST /documents/upload', () => {
  test('admin uploads a valid PDF and receives 201 with document metadata', async () => {
    const { admin, hdr } = await adminHeader();

    const res = await request
      .post('/documents/upload')
      .set(hdr)
      .attach('file', PDF_BUFFER, { filename: 'title.pdf', contentType: 'application/pdf' })
      .field('type', 'title')
      .field('name', 'My Title Doc');

    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.type).toBe('title');
    expect(res.body.document.name).toBe('My Title Doc');
    expect(res.body.document.mimeType).toBe('application/pdf');
    expect(res.body.document.dealershipId.toString()).toBe(admin.dealershipId.toString());
    expect(res.body.document.uploadedBy.toString()).toBe(admin._id.toString());
  });

  test('admin uploads buyers_order type successfully', async () => {
    const { hdr } = await adminHeader();

    const res = await request
      .post('/documents/upload')
      .set(hdr)
      .attach('file', PDF_BUFFER, { filename: 'buyers.pdf', contentType: 'application/pdf' })
      .field('type', 'buyers_order');

    expect(res.status).toBe(201);
    expect(res.body.document.type).toBe('buyers_order');
  });

  test('400 when no file is attached', async () => {
    const { hdr } = await adminHeader();

    const res = await request
      .post('/documents/upload')
      .set(hdr)
      .field('type', 'title')
      .field('name', 'No File');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file is required/i);
  });

  test('400 when document type is not in allowed enum', async () => {
    const { hdr } = await adminHeader();

    const res = await request
      .post('/documents/upload')
      .set(hdr)
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' })
      .field('type', 'invoice')
      .field('name', 'Bad Type Doc');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid document type/i);
  });

  test('403 when salesperson has no RolePolicy granting edit on title type', async () => {
    const sp = await makeUser({ role: 'salesperson' });

    const res = await request
      .post('/documents/upload')
      .set(authHeader(sp))
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' })
      .field('type', 'title')
      .field('name', 'Forbidden');

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request
      .post('/documents/upload')
      .attach('file', PDF_BUFFER, { filename: 'test.pdf', contentType: 'application/pdf' })
      .field('type', 'title');

    expect(res.status).toBe(401);
  });
});

// ── GET /documents/:id/download ───────────────────────────────────────────────

describe('GET /documents/:id/download', () => {
  test('admin downloads a document successfully (200)', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDownloadableDoc(admin);

    const res = await request
      .get(`/documents/${doc._id}/download`)
      .set(hdr);

    expect(res.status).toBe(200);
  });

  test('403 when salesperson has no download permission', async () => {
    const { admin } = await adminHeader();
    const sp  = await makeUser({ role: 'salesperson', dealershipId: admin.dealershipId });
    const doc = await makeDownloadableDoc(admin);

    const res = await request
      .get(`/documents/${doc._id}/download`)
      .set(authHeader(sp));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const { admin } = await adminHeader();
    const doc = await makeDownloadableDoc(admin);

    const res = await request.get(`/documents/${doc._id}/download`);
    expect(res.status).toBe(401);
  });

  test('404 when document does not exist', async () => {
    const { hdr } = await adminHeader();
    const fakeId  = new mongoose.Types.ObjectId();

    const res = await request
      .get(`/documents/${fakeId}/download`)
      .set(hdr);

    expect(res.status).toBe(404);
  });
});

// ── POST /documents/:id/share ─────────────────────────────────────────────────

describe('POST /documents/:id/share', () => {
  test('admin shares a document (200) and receives a shareLink', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request
      .post(`/documents/${doc._id}/share`)
      .set(hdr);

    expect(res.status).toBe(200);
    expect(res.body.shareLink).toBeDefined();
    expect(res.body.shareLink).toContain(doc._id.toString());
    expect(res.body.document).toBeDefined();
  });

  test('403 when salesperson has no share permission', async () => {
    const { admin } = await adminHeader();
    const sp  = await makeUser({ role: 'salesperson', dealershipId: admin.dealershipId });
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request
      .post(`/documents/${doc._id}/share`)
      .set(authHeader(sp));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const { admin } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request.post(`/documents/${doc._id}/share`);
    expect(res.status).toBe(401);
  });

  test('404 when document does not exist', async () => {
    const { hdr } = await adminHeader();
    const fakeId  = new mongoose.Types.ObjectId();

    const res = await request
      .post(`/documents/${fakeId}/share`)
      .set(hdr);

    expect(res.status).toBe(404);
  });
});

// ── POST /documents/:id/submit ────────────────────────────────────────────────

describe('POST /documents/:id/submit', () => {
  test('admin submits a draft document → status becomes submitted (200)', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId, { status: 'draft' });

    const res = await request
      .post(`/documents/${doc._id}/submit`)
      .set(hdr);

    expect(res.status).toBe(200);
    expect(res.body.document.status).toBe('submitted');
  });

  test('status is persisted as submitted in the database', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId, { status: 'draft' });

    await request.post(`/documents/${doc._id}/submit`).set(hdr);

    const updated = await Document.findById(doc._id).lean();
    expect(updated.status).toBe('submitted');
  });

  test('403 when salesperson has no submit permission', async () => {
    const { admin } = await adminHeader();
    const sp  = await makeUser({ role: 'salesperson', dealershipId: admin.dealershipId });
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request
      .post(`/documents/${doc._id}/submit`)
      .set(authHeader(sp));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const { admin } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request.post(`/documents/${doc._id}/submit`);
    expect(res.status).toBe(401);
  });
});

// ── POST /documents/:id/approve ───────────────────────────────────────────────

describe('POST /documents/:id/approve', () => {
  test('admin approves a submitted document → status becomes approved (200)', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId, { status: 'submitted' });

    const res = await request
      .post(`/documents/${doc._id}/approve`)
      .set(hdr);

    expect(res.status).toBe(200);
    expect(res.body.document.status).toBe('approved');
  });

  test('status is persisted as approved in the database', async () => {
    const { admin, hdr } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId, { status: 'submitted' });

    await request.post(`/documents/${doc._id}/approve`).set(hdr);

    const updated = await Document.findById(doc._id).lean();
    expect(updated.status).toBe('approved');
  });

  test('403 when salesperson has no approve permission', async () => {
    const { admin } = await adminHeader();
    const sp  = await makeUser({ role: 'salesperson', dealershipId: admin.dealershipId });
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request
      .post(`/documents/${doc._id}/approve`)
      .set(authHeader(sp));

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const { admin } = await adminHeader();
    const doc = await makeDocument(admin._id, admin.dealershipId);

    const res = await request.post(`/documents/${doc._id}/approve`);
    expect(res.status).toBe(401);
  });

  test('finance role receives 403 when no approve RolePolicy exists', async () => {
    const { admin } = await adminHeader();
    const finance = await makeUser({ role: 'finance', dealershipId: admin.dealershipId });
    const doc     = await makeDocument(admin._id, admin.dealershipId, { status: 'submitted' });

    const res = await request
      .post(`/documents/${doc._id}/approve`)
      .set(authHeader(finance));

    expect(res.status).toBe(403);
  });
});
