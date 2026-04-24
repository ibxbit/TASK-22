'use strict';

/**
 * Isolated unit tests for Express middleware:
 *   - requireRole     — RBAC role enforcement
 *   - validate        — Joi request validation
 *   - errorHandler    — centralized error serialization
 *   - fileValidator   — computeHash (pure) + validateUpload behavior
 *
 * These tests mock req/res/next objects; no real HTTP or Mongo involved.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const Joi  = require('joi');

const requireRole    = require('../../middleware/requireRole');
const validate       = require('../../middleware/validate');
const errorHandler   = require('../../middleware/errorHandler');
const { validateUpload, computeHash } = require('../../middleware/fileValidator');

// ── helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return { headers: {}, body: {}, query: {}, params: {}, ...overrides };
}

// ── requireRole ───────────────────────────────────────────────────────────────

describe('requireRole middleware', () => {
  test('calls next() when user has an allowed role', () => {
    const mw  = requireRole(['admin', 'manager']);
    const req  = mockReq({ user: { role: 'admin' } });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 403 when user role is not in the allowed list', () => {
    const mw  = requireRole(['admin']);
    const req  = mockReq({ user: { role: 'salesperson' } });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('salesperson') }),
    );
  });

  test('returns 401 when req.user is not set', () => {
    const mw  = requireRole(['admin']);
    const req  = mockReq({ user: null });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('allows all roles listed in the allowed array', () => {
    const allowed = ['admin', 'manager', 'finance'];
    allowed.forEach(role => {
      const mw  = requireRole(allowed);
      const req  = mockReq({ user: { role } });
      const res  = mockRes();
      const next = jest.fn();
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  test('403 response mentions the forbidden role', () => {
    const mw  = requireRole(['admin']);
    const req  = mockReq({ user: { role: 'inspector' } });
    const res  = mockRes();

    mw(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/inspector/);
  });
});

// ── validate ──────────────────────────────────────────────────────────────────

describe('validate middleware', () => {
  const schema = Joi.object({
    name:  Joi.string().required(),
    count: Joi.number().integer().min(1).default(1),
  });

  test('calls next() and replaces req.body with coerced value on success', () => {
    const mw  = validate(schema);
    const req  = mockReq({ body: { name: 'Alice', count: '3', extraField: 'dropped' } });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.count).toBe(3);              // string → number
    expect(req.body.extraField).toBeUndefined(); // unknown stripped
  });

  test('returns 422 VALIDATION_ERROR when required field is missing', () => {
    const mw  = validate(schema);
    const req  = mockReq({ body: {} });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeInstanceOf(Array);
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  test('validation error details include field name', () => {
    const mw  = validate(schema);
    const req  = mockReq({ body: { count: 0 } }); // count < 1 and name missing
    const res  = mockRes();

    mw(req, res, jest.fn());

    const details = res.json.mock.calls[0][0].error.details;
    const fields  = details.map(d => d.field);
    expect(fields).toContain('name');
  });

  test('validates req.query when source="query"', () => {
    const querySchema = Joi.object({ page: Joi.number().integer().min(1).required() });
    const mw  = validate(querySchema, 'query');
    const req  = mockReq({ query: { page: 'abc' } });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('fills default values (count defaults to 1 when omitted)', () => {
    const mw  = validate(schema);
    const req  = mockReq({ body: { name: 'Test' } });
    const res  = mockRes();
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.count).toBe(1);
  });

  test('collects all validation errors (abortEarly: false)', () => {
    const strictSchema = Joi.object({ a: Joi.string().required(), b: Joi.number().required() });
    const mw = validate(strictSchema);
    const req = mockReq({ body: {} });
    const res = mockRes();

    mw(req, res, jest.fn());

    const details = res.json.mock.calls[0][0].error.details;
    expect(details.length).toBeGreaterThanOrEqual(2);
  });
});

// ── errorHandler ──────────────────────────────────────────────────────────────

describe('errorHandler middleware', () => {
  const req  = { method: 'POST', path: '/test' };

  function makeMongooseValidationError() {
    const err = new Error('Validation failed');
    err.name   = 'ValidationError';
    err.errors = {
      name: { path: 'name', message: 'Name is required' },
      age:  { path: 'age',  message: 'Age must be positive' },
    };
    return err;
  }

  test('returns 422 with VALIDATION_ERROR for Mongoose ValidationError', () => {
    const res  = mockRes();
    errorHandler(makeMongooseValidationError(), req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0];
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toHaveLength(2);
  });

  test('returns 400 with INVALID_ID for Mongoose CastError', () => {
    const err  = new Error('Cast failed');
    err.name   = 'CastError';
    err.path   = '_id';
    err.value  = 'notAnObjectId';
    const res  = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_ID');
  });

  test('returns 409 with DUPLICATE_KEY for MongoDB duplicate key error (code 11000)', () => {
    const err      = new Error('E11000 duplicate key');
    err.code       = 11000;
    err.keyValue   = { email: 'test@test.com' };
    const res      = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe('DUPLICATE_KEY');
  });

  test('returns 400 with FILE_TOO_LARGE for multer LIMIT_FILE_SIZE error', () => {
    const err  = new Error('File too large');
    err.code   = 'LIMIT_FILE_SIZE';
    const res  = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('FILE_TOO_LARGE');
  });

  test('returns 400 with UNSUPPORTED_FILE_TYPE for multer file filter rejection', () => {
    const err    = new Error('Unsupported file type');
    const res    = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  test('returns 500 with INTERNAL_ERROR for unhandled errors', () => {
    const err  = new Error('Something went wrong');
    const res  = mockRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error.code).toBe('INTERNAL_ERROR');
  });

  test('success field is always false', () => {
    const err = new Error('generic error');
    const res = mockRes();
    errorHandler(err, req, res, jest.fn());
    expect(res.json.mock.calls[0][0].success).toBe(false);
  });

  test('DUPLICATE_KEY message includes the duplicated field name', () => {
    const err    = new Error('E11000 duplicate key');
    err.code     = 11000;
    err.keyValue = { username: 'alice' };
    const res    = mockRes();
    errorHandler(err, req, res, jest.fn());
    expect(res.json.mock.calls[0][0].error.message).toMatch(/username/);
  });
});

// ── fileValidator — computeHash ───────────────────────────────────────────────

describe('fileValidator — computeHash', () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `test-hash-${Date.now()}.bin`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('returns a 64-char lowercase hex SHA-256 hash', () => {
    fs.writeFileSync(tmpFile, 'hello world');
    const hash = computeHash(tmpFile);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('same file content always produces the same hash', () => {
    fs.writeFileSync(tmpFile, 'deterministic content');
    const h1 = computeHash(tmpFile);
    const h2 = computeHash(tmpFile);
    expect(h1).toBe(h2);
  });

  test('different file contents produce different hashes', () => {
    const tmpFile2 = path.join(os.tmpdir(), `test-hash2-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile,  'content A');
    fs.writeFileSync(tmpFile2, 'content B');
    const h1 = computeHash(tmpFile);
    const h2 = computeHash(tmpFile2);
    expect(h1).not.toBe(h2);
    if (fs.existsSync(tmpFile2)) fs.unlinkSync(tmpFile2);
  });
});

// ── fileValidator — validateUpload ────────────────────────────────────────────

describe('fileValidator — validateUpload', () => {
  const uploadsDir = path.join(__dirname, '../../../uploads');
  let tmpFile;

  beforeEach(() => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    tmpFile = path.join(uploadsDir, `test-upload-${Date.now()}.bin`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  test('calls next() when no file is attached', () => {
    const req  = mockReq({ file: undefined });
    const res  = mockRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('returns 400 INVALID_FILE_TYPE for a disallowed MIME type', () => {
    fs.writeFileSync(tmpFile, 'data');
    const req = mockReq({
      file:    { path: tmpFile, mimetype: 'text/plain', size: 4 },
      headers: {},
    });
    const res  = mockRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_FILE_TYPE');
    // File should be removed (not quarantined) for MIME rejection
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  test('returns 400 INVALID_FILE_CONTENT when PDF magic bytes are absent (spoofed MIME)', () => {
    // Write non-PDF bytes but claim PDF MIME type
    fs.writeFileSync(tmpFile, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]));
    const req = mockReq({
      file:    { path: tmpFile, mimetype: 'application/pdf', size: 5 },
      headers: {},
    });
    const res  = mockRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('INVALID_FILE_CONTENT');
  });

  test('calls next() and attaches req.fileHash for a valid PDF', () => {
    // Write minimal valid PDF magic bytes: %PDF
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]); // %PDF-1.4
    fs.writeFileSync(tmpFile, pdfBytes);

    const req = mockReq({
      file:    { path: tmpFile, mimetype: 'application/pdf', size: pdfBytes.length },
      headers: {},
    });
    const res  = mockRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.fileHash).toHaveLength(64); // SHA-256 hex
  });

  test('returns 400 HASH_MISMATCH when X-File-Hash does not match computed hash', () => {
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    fs.writeFileSync(tmpFile, pdfBytes);

    const req = mockReq({
      file: { path: tmpFile, mimetype: 'application/pdf', size: pdfBytes.length },
      headers: { 'x-file-hash': 'a'.repeat(64) }, // wrong hash
    });
    const res  = mockRes();
    const next = jest.fn();

    validateUpload(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('HASH_MISMATCH');
  });
});
