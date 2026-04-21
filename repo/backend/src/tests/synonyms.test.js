const request  = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../app');
const Synonym  = require('../../models/Synonym');
const Vehicle  = require('../../models/Vehicle');
const { expand, clearCache } = require('../../services/synonymService');
const { connect, clearCollections, disconnect } = require('./helpers/db');
const { makeUser, authHeader } = require('./helpers/fixtures');

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

function seedVehicle(make, model) {
  return Vehicle.create({
    make, model,
    price: 20000, mileage: 10000, year: 2022,
    region: 'West', registrationDate: new Date('2022-01-01'),
    supplier: 'SupA', warehouseLocation: 'WH1', turnaroundTime: 3, status: 'available',
  });
}

// ── GET /synonyms ─────────────────────────────────────────────────────────────

describe('GET /synonyms', () => {
  test('returns empty list when no synonyms exist', async () => {
    const res = await request(app)
      .get('/synonyms')
      .set(await managerHeader());

    expect(res.status).toBe(200);
    expect(res.body.synonyms).toEqual([]);
  });

  test('returns all synonyms sorted by term', async () => {
    await Synonym.create({ term: 'honda', expansions: ['Honda'] });
    await Synonym.create({ term: 'bmw',   expansions: ['BMW', 'Bayerische'] });

    const res = await request(app)
      .get('/synonyms')
      .set(await managerHeader());

    expect(res.status).toBe(200);
    expect(res.body.synonyms).toHaveLength(2);
    expect(res.body.synonyms[0].term).toBe('bmw');
    expect(res.body.synonyms[1].term).toBe('honda');
  });

  test('each synonym includes term and expansions array', async () => {
    await Synonym.create({ term: 'vw', expansions: ['Volkswagen', 'VW'] });

    const res = await request(app)
      .get('/synonyms')
      .set(await managerHeader());

    const syn = res.body.synonyms[0];
    expect(syn).toHaveProperty('term');
    expect(syn).toHaveProperty('expansions');
    expect(Array.isArray(syn.expansions)).toBe(true);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app).get('/synonyms');
    expect(res.status).toBe(401);
  });
});

// ── PUT /synonyms (upsert) ────────────────────────────────────────────────────

describe('PUT /synonyms', () => {
  test('admin creates a new synonym and receives 200', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'benz', expansions: ['Mercedes-Benz', 'Mercedes'] });

    expect(res.status).toBe(200);
    expect(res.body.synonym.term).toBe('benz');
    expect(res.body.synonym.expansions).toContain('Mercedes-Benz');
    expect(res.body.synonym.expansions).toContain('Mercedes');
  });

  test('term is stored lowercase regardless of input casing', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'BMW', expansions: ['Bayerische'] });

    expect(res.status).toBe(200);
    expect(res.body.synonym.term).toBe('bmw');
  });

  test('updating an existing synonym replaces its expansions', async () => {
    await Synonym.create({ term: 'vw', expansions: ['Volkswagen'] });

    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'vw', expansions: ['Volkswagen', 'VW', 'Polo'] });

    expect(res.status).toBe(200);
    expect(res.body.synonym.expansions).toHaveLength(3);
    expect(res.body.synonym.expansions).toContain('Polo');
  });

  test('duplicate expansions are deduplicated', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'chevy', expansions: ['Chevrolet', 'Chevrolet', 'chevy'] });

    expect(res.status).toBe(200);
    const exps = res.body.synonym.expansions;
    const unique = [...new Set(exps)];
    expect(exps).toHaveLength(unique.length);
  });

  test('empty expansions array is accepted', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'empty', expansions: [] });

    expect(res.status).toBe(200);
    expect(res.body.synonym.expansions).toEqual([]);
  });

  test('400 when term is missing', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ expansions: ['Honda'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/term/i);
  });

  test('400 when expansions is not an array', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'honda', expansions: 'Honda' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expansions/i);
  });

  test('403 when manager tries to upsert', async () => {
    const res = await request(app)
      .put('/synonyms')
      .set(await managerHeader())
      .send({ term: 'ford', expansions: ['Ford'] });

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/synonyms')
      .send({ term: 'ford', expansions: ['Ford'] });

    expect(res.status).toBe(401);
  });
});

// ── DELETE /synonyms/:term ────────────────────────────────────────────────────

describe('DELETE /synonyms/:term', () => {
  test('admin deletes a synonym by term', async () => {
    await Synonym.create({ term: 'honda', expansions: ['Honda'] });

    const res = await request(app)
      .delete('/synonyms/honda')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.term).toBe('honda');
  });

  test('term is case-insensitive on delete', async () => {
    await Synonym.create({ term: 'bmw', expansions: ['BMW'] });

    const res = await request(app)
      .delete('/synonyms/BMW')
      .set(await adminHeader());

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.term).toBe('bmw');
  });

  test('synonym is removed from DB after delete', async () => {
    await Synonym.create({ term: 'vw', expansions: ['Volkswagen'] });
    await request(app).delete('/synonyms/vw').set(await adminHeader());

    const found = await Synonym.findOne({ term: 'vw' });
    expect(found).toBeNull();
  });

  test('404 when synonym does not exist', async () => {
    const res = await request(app)
      .delete('/synonyms/nonexistent')
      .set(await adminHeader());

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('403 when manager tries to delete', async () => {
    await Synonym.create({ term: 'ford', expansions: ['Ford'] });

    const res = await request(app)
      .delete('/synonyms/ford')
      .set(await managerHeader());

    expect(res.status).toBe(403);
  });

  test('401 when unauthenticated', async () => {
    const res = await request(app).delete('/synonyms/honda');
    expect(res.status).toBe(401);
  });
});

// ── synonymService.expand — explicit synonyms ─────────────────────────────────

describe('synonymService.expand — explicit synonym lookup', () => {
  test('returns [term] when no synonym exists', async () => {
    const result = await expand('honda');
    expect(result).toEqual(['honda']);
  });

  test('returns [term, ...expansions] when synonym exists', async () => {
    await Synonym.create({ term: 'benz', expansions: ['Mercedes-Benz', 'Mercedes'] });
    clearCache();

    const result = await expand('benz');
    expect(result).toContain('benz');
    expect(result).toContain('Mercedes-Benz');
    expect(result).toContain('Mercedes');
  });

  test('lookup is case-insensitive (input term is lowercased for lookup)', async () => {
    await Synonym.create({ term: 'vw', expansions: ['Volkswagen'] });
    clearCache();

    const result = await expand('VW');
    expect(result).toContain('Volkswagen');
  });

  test('de-duplicates user term that also appears in expansions', async () => {
    await Synonym.create({ term: 'bmw', expansions: ['BMW', 'bmw', 'Bayerische'] });
    clearCache();

    const result = await expand('bmw');
    const lower = result.map(t => t.toLowerCase());
    const uniqueLower = [...new Set(lower)];
    expect(lower).toHaveLength(uniqueLower.length);
  });

  test('returns empty array for empty/falsy input', async () => {
    expect(await expand('')).toEqual([]);
    expect(await expand(null)).toEqual([]);
    expect(await expand(undefined)).toEqual([]);
  });
});

// ── synonymService.expand — fuzzy matching ────────────────────────────────────

describe('synonymService.expand — fuzzy matching', () => {
  test('finds near-miss via fuzzy when no explicit synonym and field is provided', async () => {
    await seedVehicle('Toyota', 'Camry');
    clearCache();

    // "Toyotaa" is 1 edit away from "Toyota" (6 chars → maxDistance 2, matches)
    const result = await expand('Toyotaa', 'make');
    expect(result.map(t => t.toLowerCase())).toContain('toyota');
  });

  test('does NOT fuzzy-match when explicit synonym already covers the term', async () => {
    await Synonym.create({ term: 'chevy', expansions: ['Chevrolet'] });
    await seedVehicle('Chevy', 'Spark');
    clearCache();

    const result = await expand('chevy', 'make');
    expect(result).toContain('Chevrolet');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  test('returns only user term for 3-char input (maxDistance=0 disables fuzzy)', async () => {
    await seedVehicle('BMW', 'X5');
    clearCache();

    // "BMX" is 1 edit from "BMW" but 3-char terms have maxDistance=0
    const result = await expand('BMX', 'make');
    expect(result).toEqual(['BMX']);
  });

  test('returns only user term when no fuzzy match is close enough', async () => {
    await seedVehicle('Lamborghini', 'Urus');
    clearCache();

    // "Honda" has no vehicle makes within distance 2 of it in this seed
    const result = await expand('Honda', 'make');
    expect(result).toEqual(['Honda']);
  });

  test('fuzzy matching is skipped when field is not provided', async () => {
    await seedVehicle('Toyota', 'Camry');
    clearCache();

    const result = await expand('Toyotaa'); // no field arg
    expect(result).toEqual(['Toyotaa']);
  });
});

// ── synonymService.clearCache — cache invalidation ────────────────────────────

describe('synonymService.clearCache', () => {
  test('after clearCache, upserted synonym is visible in next expand call', async () => {
    // Prime the cache with no synonyms
    await expand('honda');

    // Add synonym while cache is stale
    await Synonym.create({ term: 'honda', expansions: ['Honda', 'Accord'] });

    // Before clear — should NOT see new synonym (stale cache)
    const stale = await expand('honda');
    expect(stale).not.toContain('Honda');

    // After clear — should see new synonym
    clearCache();
    const fresh = await expand('honda');
    expect(fresh).toContain('Honda');
  });

  test('upsert API endpoint clears the cache automatically', async () => {
    // Prime the cache
    await expand('ford');

    // Upsert via API (controller calls clearCache())
    await request(app)
      .put('/synonyms')
      .set(await adminHeader())
      .send({ term: 'ford', expansions: ['Ford', 'F-Series'] });

    // Cache was cleared by the API call — fresh expand should see the new synonym
    const result = await expand('ford');
    expect(result).toContain('Ford');
  });

  test('delete API endpoint clears the cache automatically', async () => {
    await Synonym.create({ term: 'gm', expansions: ['General Motors'] });
    clearCache();

    // Confirm synonym is visible
    const before = await expand('gm');
    expect(before).toContain('General Motors');

    // Delete via API
    await request(app)
      .delete('/synonyms/gm')
      .set(await adminHeader());

    // Cache cleared — expand should return only user term
    const after = await expand('gm');
    expect(after).toEqual(['gm']);
  });
});

// ── Synonym expansion affects vehicle search ──────────────────────────────────

describe('synonym expansion in vehicle search', () => {
  test('searching by synonym term returns vehicles matching the expansion', async () => {
    await seedVehicle('Toyota', 'Camry');
    await Synonym.create({ term: 'toy', expansions: ['Toyota'] });
    clearCache();

    const res = await request(app).get('/vehicles/search?make=toy');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.results.some(v => v.make === 'Toyota')).toBe(true);
  });

  test('searching without synonym only returns exact-ish match vehicles', async () => {
    await seedVehicle('Toyota', 'Camry');
    await seedVehicle('Honda', 'Civic');
    clearCache();

    const res = await request(app).get('/vehicles/search?make=Honda');
    expect(res.status).toBe(200);
    expect(res.body.results.every(v => v.make.toLowerCase().includes('honda'))).toBe(true);
  });
});
