const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../app');
const Order    = require('../../models/Order');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, makeOrder, authHeader }       = require('./helpers/fixtures');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ─── POST /auth/token ─────────────────────────────────────────────────────────

describe('POST /auth/token', () => {
  it('returns a JWT and user object for a valid userId', async () => {
    const user = await makeUser({ role: 'salesperson' });

    const res = await request(app)
      .post('/auth/token')
      .send({ userId: user._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.expiresIn).toBe(3600);
  });

  it('returned token is a three-part JWT (header.payload.sig)', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .post('/auth/token')
      .send({ userId: user._id.toString() });

    expect(res.status).toBe(200);
    const parts = res.body.token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('user object in response includes id, name, role, dealershipId', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .post('/auth/token')
      .send({ userId: user._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.user.id.toString()).toBe(user._id.toString());
    expect(res.body.user.name).toBe(user.name);
    expect(res.body.user.role).toBe('manager');
  });

  it('returns 401 for a userId that does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .post('/auth/token')
      .send({ userId: fakeId.toString() });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTruthy();
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userId/i);
  });

  it('returns 400 when userId is not a valid ObjectId', async () => {
    const res = await request(app)
      .post('/auth/token')
      .send({ userId: 'not-an-objectid' });

    expect(res.status).toBe(400);
  });

  it('admin user receives role=admin in token response', async () => {
    const admin = await makeUser({ role: 'admin' });

    const res = await request(app)
      .post('/auth/token')
      .send({ userId: admin._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});

// ─── Protected route requires valid Bearer token ──────────────────────────────

describe('Protected routes enforce Bearer token auth', () => {
  it('protected endpoint returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/analytics/events');
    expect(res.status).toBe(401);
  });

  it('protected endpoint returns 401 when Authorization header is malformed', async () => {
    const res = await request(app)
      .get('/analytics/events')
      .set('Authorization', 'NotBearer abc123');
    expect(res.status).toBe(401);
  });

  it('protected endpoint returns 401 when token is tampered/invalid', async () => {
    const user = await makeUser({ role: 'manager' });
    const tokenRes = await request(app)
      .post('/auth/token')
      .send({ userId: user._id.toString() });

    const tampered = tokenRes.body.token.slice(0, -5) + 'XXXXX';

    const res = await request(app)
      .get('/analytics/events')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  it('protected endpoint returns 401 when token is expired', async () => {
    const { sign } = require('../../config/jwt');
    const user = await makeUser({ role: 'manager' });
    const expired = sign(
      { userId: user._id.toString(), role: user.role, dealershipId: null },
      -1
    );

    const res = await request(app)
      .get('/analytics/events')
      .set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
  });

  it('protected endpoint returns 200 with a valid token from POST /auth/token', async () => {
    const user = await makeUser({ role: 'manager' });
    const tokenRes = await request(app)
      .post('/auth/token')
      .send({ userId: user._id.toString() });

    const res = await request(app)
      .get('/analytics/events')
      .set('Authorization', `Bearer ${tokenRes.body.token}`);

    expect(res.status).toBe(200);
  });

  it('authHeader fixture produces a token that authenticates successfully', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .get('/analytics/events')
      .set(authHeader(user));

    expect(res.status).toBe(200);
  });

  it('X-User-Id header alone is rejected (401)', async () => {
    const user = await makeUser({ role: 'manager' });

    const res = await request(app)
      .get('/analytics/events')
      .set('X-User-Id', user._id.toString());

    expect(res.status).toBe(401);
  });
});
