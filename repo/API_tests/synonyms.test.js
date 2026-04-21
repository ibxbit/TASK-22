const supertest = require('supertest');
const mongoose  = require('mongoose');
const app       = require('../backend/src/app');
const Synonym   = require('../backend/src/models/Synonym');
const Vehicle   = require('../backend/src/models/Vehicle');
const { clearCache } = require('../backend/src/services/synonymService');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeUser, authHeader } = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(async () => {
  await clearCollections();
  clearCache();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function adminHeader() {
  const admin = await makeUser({ role: 'admin' });
  return authHeader(admin);
}

async function managerHeader() {
  const mgr = await makeUser({ role: 'manager' });
  return authHeader(mgr);
}

function seedVehicle(make, model = 'Sedan') {
  return Vehicle.create({
    make, model,
    price: 25000, mileage: 15000, year: 2023,
    region: 'West', registrationDate: new Date('2023-01-01'),
    supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, status: 'available',
  });
}

// ── CRUD full lifecycle ───────────────────────────────────────────────────────

describe('synonym CRUD full lifecycle', () => {
  test('create → list → update → list → delete → list', async () => {
    const adminHdr = await adminHeader();

    // Create
    const createRes = await request
      .put('/synonyms')
      .set(adminHdr)
      .send({ term: 'vw', expansions: ['Volkswagen'] });
    expect(createRes.status).toBe(200);
    expect(createRes.body.synonym.term).toBe('vw');

    // List — should see it
    const listRes1 = await request.get('/synonyms').set(adminHdr);
    expect(listRes1.body.synonyms.some(s => s.term === 'vw')).toBe(true);

    // Update — add more expansions
    const updateRes = await request
      .put('/synonyms')
      .set(adminHdr)
      .send({ term: 'vw', expansions: ['Volkswagen', 'VW', 'Polo'] });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.synonym.expansions).toHaveLength(3);

    // List — should see updated expansions
    const listRes2 = await request.get('/synonyms').set(adminHdr);
    const vwEntry = listRes2.body.synonyms.find(s => s.term === 'vw');
    expect(vwEntry.expansions).toContain('Polo');

    // Delete
    const deleteRes = await request.delete('/synonyms/vw').set(adminHdr);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(true);

    // List — should no longer appear
    const listRes3 = await request.get('/synonyms').set(adminHdr);
    expect(listRes3.body.synonyms.some(s => s.term === 'vw')).toBe(false);
  });

  test('multiple synonyms are listed sorted alphabetically', async () => {
    const adminHdr = await adminHeader();

    await request.put('/synonyms').set(adminHdr).send({ term: 'toyota', expansions: ['Toyota'] });
    await request.put('/synonyms').set(adminHdr).send({ term: 'honda',  expansions: ['Honda'] });
    await request.put('/synonyms').set(adminHdr).send({ term: 'bmw',    expansions: ['BMW'] });

    const res = await request.get('/synonyms').set(adminHdr);
    expect(res.status).toBe(200);
    const terms = res.body.synonyms.map(s => s.term);
    expect(terms).toEqual([...terms].sort());
  });
});

// ── Synonym expansion in vehicle search ───────────────────────────────────────

describe('synonym expansion affects vehicle search results', () => {
  test('vehicles matching an expansion are returned when searching by synonym term', async () => {
    await seedVehicle('Mercedes-Benz', 'C-Class');
    await request
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'benz', expansions: ['Mercedes-Benz'] });
    clearCache();

    const res = await request.get('/vehicles/search?make=benz');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const makes = res.body.results.map(v => v.make);
    expect(makes.some(m => m.toLowerCase().includes('mercedes'))).toBe(true);
  });

  test('searching by exact make still works after adding synonym', async () => {
    await seedVehicle('Toyota', 'Camry');
    await request
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'toyota', expansions: ['Toyota', 'Lexus'] });
    clearCache();

    const res = await request.get('/vehicles/search?make=toyota');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  test('deleting a synonym removes it from future search expansion', async () => {
    await seedVehicle('Chevrolet', 'Malibu');
    const adminHdr = await adminHeader();

    await request.put('/synonyms').set(adminHdr).send({ term: 'chevy', expansions: ['Chevrolet'] });
    clearCache();

    // Confirm synonym works before delete
    const before = await request.get('/vehicles/search?make=chevy');
    expect(before.body.total).toBeGreaterThanOrEqual(1);

    // Delete synonym
    await request.delete('/synonyms/chevy').set(adminHdr);
    // Cache is cleared by controller

    // Confirm synonym no longer expands
    const after = await request.get('/vehicles/search?make=chevy');
    expect(after.body.total).toBe(0);
  });
});

// ── Fuzzy matching integration ────────────────────────────────────────────────

describe('fuzzy matching in search', () => {
  test('single-character typo in make still finds vehicle via fuzzy expansion', async () => {
    await seedVehicle('Toyota', 'Corolla');
    clearCache();

    // "Toyotaa" — 1 char extra, 7-char term → maxDistance 2 → should match
    const res = await request.get('/vehicles/search?make=Toyotaa');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  test('completely unrelated term returns 0 results (no false fuzzy match)', async () => {
    await seedVehicle('Honda', 'Civic');
    clearCache();

    const res = await request.get('/vehicles/search?make=Porsche');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('3-char term with 1 typo returns 0 results (maxDistance=0 for short terms)', async () => {
    await seedVehicle('BMW', 'M3');
    clearCache();

    // "BMX" — 1 edit from "BMW" but 3 chars → maxDistance=0 → no fuzzy
    const res = await request.get('/vehicles/search?make=BMX');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

// ── RBAC enforcement ──────────────────────────────────────────────────────────

describe('synonym RBAC', () => {
  test('salesperson cannot create/update synonyms (403)', async () => {
    const sp = await makeUser({ role: 'salesperson' });
    const res = await request
      .put('/synonyms')
      .set(authHeader(sp))
      .send({ term: 'ford', expansions: ['Ford'] });

    expect(res.status).toBe(403);
  });

  test('salesperson cannot delete synonyms (403)', async () => {
    await Synonym.create({ term: 'ford', expansions: ['Ford'] });
    const sp = await makeUser({ role: 'salesperson' });

    const res = await request.delete('/synonyms/ford').set(authHeader(sp));
    expect(res.status).toBe(403);
  });

  test('manager can list synonyms but cannot mutate', async () => {
    const mgrHdr = await managerHeader();

    const listRes = await request.get('/synonyms').set(mgrHdr);
    expect(listRes.status).toBe(200);

    const putRes = await request.put('/synonyms').set(mgrHdr)
      .send({ term: 'kia', expansions: ['Kia'] });
    expect(putRes.status).toBe(403);
  });

  test('unauthenticated cannot list synonyms (401)', async () => {
    const res = await request.get('/synonyms');
    expect(res.status).toBe(401);
  });

  test('unauthenticated cannot upsert synonyms (401)', async () => {
    const res = await request.put('/synonyms').send({ term: 'ford', expansions: ['Ford'] });
    expect(res.status).toBe(401);
  });

  test('unauthenticated cannot delete synonyms (401)', async () => {
    const res = await request.delete('/synonyms/ford');
    expect(res.status).toBe(401);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('synonym validation', () => {
  test('400 when term is missing', async () => {
    const res = await request
      .put('/synonyms')
      .set(await adminHeader())
      .send({ expansions: ['Honda'] });
    expect(res.status).toBe(400);
  });

  test('400 when expansions is not an array', async () => {
    const res = await request
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'honda', expansions: 'Honda' });
    expect(res.status).toBe(400);
  });

  test('404 when deleting non-existent synonym', async () => {
    const res = await request
      .delete('/synonyms/doesnotexist')
      .set(await adminHeader());
    expect(res.status).toBe(404);
  });
});
