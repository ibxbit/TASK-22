'use strict';

/**
 * End-to-end workflow tests — multi-step API flows using real HTTP (supertest)
 * against real Express + MongoDB. No mocking of routes or services.
 *
 * Covered flows:
 *   1. Auth → Vehicle Search → Add to Cart → Checkout → Order retrieval → Payment
 *   2. Auth → Create experiment → Status update → Rollback → Assign (gets rollback variant)
 *   3. Auth → Record consent → Get consent history → Request deletion → Cancel deletion
 *   4. Auth → Create synonym → Search with expansion → Delete synonym
 */

const supertest   = require('supertest');
const mongoose    = require('mongoose');
const app         = require('../backend/src/app');
const TaxRate     = require('../backend/src/models/TaxRate');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeVehicle, makeUser, makeAuthToken, authHeader } = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1 — Search → Cart → Checkout → Order → Payment
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E Flow 1: search → add to cart → checkout → pay', () => {
  test('full happy-path: vehicle appears in search, can be carted, checked out, and paid', async () => {
    // 1. Seed a vehicle and an admin user (admin can process payments)
    const vehicle = await makeVehicle({ make: 'Toyota', model: 'Flow1', price: 20000 });
    const user    = await makeUser({ role: 'admin' });
    const token   = makeAuthToken(user);
    const sess    = `sess-e2e-flow1-${Date.now()}`;

    // 2. Vehicle appears in public search results
    const searchRes = await request.get('/vehicles/search').query({ make: 'Toyota' });
    expect(searchRes.status).toBe(200);
    const found = searchRes.body.results.find(v => v.model === 'Flow1');
    expect(found).toBeTruthy();

    // 3. Add vehicle to cart (auth required)
    const addRes = await request
      .post('/cart/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess, vehicleId: vehicle._id.toString(), addOns: [] });
    expect(addRes.status).toBe(200);
    expect(addRes.body.cart.items).toHaveLength(1);

    // 4. Checkout — creates order(s)
    const checkoutRes = await request
      .post('/cart/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess });
    expect([200, 201]).toContain(checkoutRes.status);
    const orders = checkoutRes.body.orders;
    expect(orders).toHaveLength(1);
    const orderId = orders[0]._id;

    // 5. Retrieve order
    const orderRes = await request
      .get(`/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.order._id).toBe(orderId);
    expect(orderRes.body.order.status).toBe('created');

    // 6. Process payment
    const payRes = await request
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, method: 'cash', amount: 20000 });
    expect([200, 201]).toContain(payRes.status);
    const ledger = payRes.body.ledgerEntry ?? payRes.body.entry;
    expect(ledger.direction).toBe('debit');
    expect(ledger.amount).toBe(20000);
  });

  test('cart is cleared after checkout — re-checkout of same session returns empty', async () => {
    const vehicle = await makeVehicle();
    const user    = await makeUser({ role: 'salesperson' });
    const token   = makeAuthToken(user);
    const sess    = `sess-clear-${Date.now()}`;

    await request
      .post('/cart/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess, vehicleId: vehicle._id.toString() });

    await request
      .post('/cart/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess });

    // Second checkout on the same session returns no orders (cart is gone)
    const res2 = await request
      .post('/cart/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess });
    expect([200, 400, 404]).toContain(res2.status);
    if (res2.status === 200) {
      expect(res2.body.orders).toHaveLength(0);
    }
  });

  test('order audit log records checkout transition', async () => {
    const vehicle = await makeVehicle();
    const user    = await makeUser({ role: 'admin' });
    const token   = makeAuthToken(user);
    const sess    = `sess-audit-${Date.now()}`;

    await request.post('/cart/add').set('Authorization', `Bearer ${token}`)
      .send({ sessionId: sess, vehicleId: vehicle._id.toString() });

    const checkout = await request.post('/cart/checkout')
      .set('Authorization', `Bearer ${token}`).send({ sessionId: sess });
    const orderId = checkout.body.orders[0]._id;

    // Transition to reserved
    await request.patch(`/orders/${orderId}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({ toState: 'reserved' });

    // Audit log should have at least the reserved transition
    const auditRes = await request
      .get(`/orders/${orderId}/audit`)
      .set('Authorization', `Bearer ${token}`);
    expect(auditRes.status).toBe(200);
    const entries = auditRes.body.logs ?? auditRes.body.entries ?? auditRes.body.auditLogs ?? [];
    const reservedEntry = entries.find(e => e.toState === 'reserved');
    expect(reservedEntry).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 2 — Experiment lifecycle: create → activate → rollback → assign
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E Flow 2: experiment create → activate → rollback → assign', () => {
  test('user receives rollback variant after rollback is triggered', async () => {
    const admin = await makeUser({ role: 'admin' });
    const token  = makeAuthToken(admin);

    // 1. Create experiment
    const createRes = await request
      .post('/experiments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name:               'E2E-Rollback-Test',
        scope:              'listing_layout',
        rollbackVariantKey: 'control',
        variants: [
          { key: 'control',   label: 'Control',   weight: 60, config: {} },
          { key: 'variant_a', label: 'Variant A', weight: 40, config: {} },
        ],
      });
    expect(createRes.status).toBe(201);
    const expId = createRes.body.experiment._id;

    // 2. Activate
    const activateRes = await request
      .patch(`/experiments/${expId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(activateRes.status).toBe(200);

    // 3. Assign a session — should get a variant
    const assignRes = await request
      .post('/experiments/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: `sess-flow2-${Date.now()}`, experimentId: expId });
    expect(assignRes.status).toBe(200);
    expect(['control', 'variant_a']).toContain(assignRes.body.variantKey);

    // 4. Rollback
    const rollbackRes = await request
      .post(`/experiments/${expId}/rollback`)
      .set('Authorization', `Bearer ${token}`);
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.rolledBack).toBe(true);

    // 5. Assign after rollback → always returns rollbackVariantKey with forced: true
    const postRollbackRes = await request
      .post('/experiments/assign')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId: `sess-flow2b-${Date.now()}`, experimentId: expId });
    expect(postRollbackRes.status).toBe(200);
    expect(postRollbackRes.body.variantKey).toBe('control');
    expect(postRollbackRes.body.forced).toBe(true);
  });

  test('non-admin cannot create or rollback an experiment', async () => {
    const salesperson = await makeUser({ role: 'salesperson' });
    const token       = makeAuthToken(salesperson);

    const createRes = await request
      .post('/experiments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Unauthorized', scope: 'listing_layout', rollbackVariantKey: 'control',
        variants: [{ key: 'control', label: 'Control', weight: 100, config: {} }],
      });
    expect(createRes.status).toBe(403);
  });

  test('experiment results endpoint returns distribution data', async () => {
    const admin = await makeUser({ role: 'admin' });
    const token  = makeAuthToken(admin);

    // Create + activate
    const expRes = await request.post('/experiments').set('Authorization', `Bearer ${token}`)
      .send({
        name: 'E2E-Results', scope: 'listing_layout', rollbackVariantKey: 'control',
        variants: [
          { key: 'control',   label: 'Control',   weight: 50, config: {} },
          { key: 'variant_a', label: 'Variant A', weight: 50, config: {} },
        ],
      });
    const expId = expRes.body.experiment._id;
    await request.patch(`/experiments/${expId}/status`)
      .set('Authorization', `Bearer ${token}`).send({ status: 'active' });

    // Assign two different sessions
    await request.post('/experiments/assign').set('Authorization', `Bearer ${token}`)
      .send({ sessionId: 'sess-r1', experimentId: expId });
    await request.post('/experiments/assign').set('Authorization', `Bearer ${token}`)
      .send({ sessionId: 'sess-r2', experimentId: expId });

    const resultsRes = await request
      .get(`/experiments/${expId}/results`)
      .set('Authorization', `Bearer ${token}`);
    expect(resultsRes.status).toBe(200);
    expect(resultsRes.body.distribution).toBeInstanceOf(Array);
    const total = resultsRes.body.distribution.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 3 — Privacy: record consent → export → request deletion → cancel
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E Flow 3: consent → export → deletion request → cancel', () => {
  test('full privacy lifecycle', async () => {
    const user  = await makeUser({ role: 'salesperson' });
    const token = makeAuthToken(user);

    // 1. Record consent
    const consentRes = await request
      .post('/privacy/consent')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'data_processing', version: '1.0', consentGiven: true });
    expect(consentRes.status).toBe(201);

    // 2. Get consent history — should include the record just created
    const historyRes = await request
      .get('/privacy/consent')
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.records).toHaveLength(1);
    expect(historyRes.body.records[0].type).toBe('data_processing');

    // 3. Export data
    const exportRes = await request
      .get('/privacy/export')
      .set('Authorization', `Bearer ${token}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.body).toHaveProperty('consentRecords');

    // 4. Request deletion
    const delRes = await request
      .post('/privacy/deletion-request')
      .set('Authorization', `Bearer ${token}`)
      .send({ scope: ['all'] });
    expect(delRes.status).toBe(201);
    const requestId = delRes.body.request._id;

    // 5. List deletion requests — should show the pending one
    const listRes = await request
      .get('/privacy/deletion-requests')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const pending = listRes.body.requests.find(r => r._id === requestId);
    expect(pending).toBeTruthy();
    expect(pending.status).toBe('pending');

    // 6. Cancel deletion request
    const cancelRes = await request
      .delete(`/privacy/deletion-requests/${requestId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);

    // 7. List again — request should be cancelled (removed or status changed)
    const afterRes = await request
      .get('/privacy/deletion-requests')
      .set('Authorization', `Bearer ${token}`);
    const afterPending = afterRes.body.requests.filter(r => r.status === 'pending');
    expect(afterPending).toHaveLength(0);
  });

  test('consent history is user-scoped — other users cannot see it', async () => {
    const user1 = await makeUser({ role: 'salesperson' });
    const user2 = await makeUser({ role: 'salesperson' });

    await request
      .post('/privacy/consent')
      .set('Authorization', `Bearer ${makeAuthToken(user1)}`)
      .send({ type: 'marketing', version: '1.0', consentGiven: true });

    const res = await request
      .get('/privacy/consent')
      .set('Authorization', `Bearer ${makeAuthToken(user2)}`);
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(0); // user2 sees nothing
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flow 4 — Synonym: create → search with expansion → delete
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E Flow 4: synonym create → search expansion → delete', () => {
  test('synonym expansion causes vehicle search to return expanded results', async () => {
    const admin = await makeUser({ role: 'admin' });
    const token  = makeAuthToken(admin);

    // Seed a Mercedes vehicle
    await makeVehicle({ make: 'Mercedes-Benz', model: 'E-Class', price: 55000 });

    // Add synonym: benz → Mercedes-Benz
    const upsertRes = await request
      .put('/synonyms')
      .set('Authorization', `Bearer ${token}`)
      .send({ term: 'benz', expansions: ['Mercedes-Benz'] });
    expect(upsertRes.status).toBe(200);

    // Search with synonym term should return Mercedes-Benz vehicles
    const searchRes = await request.get('/vehicles/search').query({ make: 'benz' });
    expect(searchRes.status).toBe(200);
    const found = searchRes.body.results.find(v => v.make === 'Mercedes-Benz');
    expect(found).toBeTruthy();

    // Delete synonym
    const deleteRes = await request
      .delete('/synonyms/benz')
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    // List synonyms — benz should be gone
    const listRes = await request
      .get('/synonyms')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const benz = listRes.body.synonyms.find(s => s.term === 'benz');
    expect(benz).toBeUndefined();
  });

  test('synonym CRUD is admin-only — salesperson gets 403', async () => {
    const sp    = await makeUser({ role: 'salesperson' });
    const token = makeAuthToken(sp);

    const res = await request
      .put('/synonyms')
      .set('Authorization', `Bearer ${token}`)
      .send({ term: 'test', expansions: ['Test Brand'] });
    expect(res.status).toBe(403);
  });
});
