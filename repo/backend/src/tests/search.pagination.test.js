const request  = require('supertest');
const app      = require('../../app');
const Vehicle  = require('../../models/Vehicle');
const { connect, clearCollections, disconnect } = require('./helpers/db');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// Unique make prefix per test prevents cache key collisions between tests.
// The search cache has a 10-min TTL and keyed on all query params; using a
// per-test timestamp+random prefix makes collision practically impossible.
let make;
beforeEach(() => {
  make = `TestMake${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
});

async function seedVehicles(count, overrides = {}) {
  return Vehicle.insertMany(
    Array.from({ length: count }, (_, i) => ({
      make,
      model:             `Model${String(i).padStart(3, '0')}`,
      price:             (i + 1) * 1000,
      mileage:           i * 500,
      year:              2018 + (i % 6),
      region:            'West',
      registrationDate:  new Date(`202${(i % 4) + 0}-0${(i % 9) + 1}-01`),
      supplier:          'SupA',
      warehouseLocation: 'WH1',
      turnaroundTime:    3,
      status:            'available',
      ...overrides,
    }))
  );
}

function searchQuery(extra = {}) {
  return request(app)
    .get('/vehicles/search')
    .query({ make, sort: 'price', order: 'asc', ...extra });
}

// ─── Page disjointness ────────────────────────────────────────────────────────

describe('page disjointness', () => {
  it('no vehicle appears on more than one page across a full traversal', async () => {
    await seedVehicles(25);

    const [p1, p2, p3] = await Promise.all([
      searchQuery({ page: 1, limit: 10 }),
      searchQuery({ page: 2, limit: 10 }),
      searchQuery({ page: 3, limit: 10 }),
    ]);

    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);
    expect(p3.status).toBe(200);

    const allIds = [
      ...p1.body.results.map(v => v._id),
      ...p2.body.results.map(v => v._id),
      ...p3.body.results.map(v => v._id),
    ];

    expect(allIds).toHaveLength(25);
    expect(new Set(allIds).size).toBe(25);
  });

  it('page sizes are correct for the final partial page', async () => {
    await seedVehicles(25);

    const p1 = await searchQuery({ page: 1, limit: 10 });
    const p2 = await searchQuery({ page: 2, limit: 10 });
    const p3 = await searchQuery({ page: 3, limit: 10 });

    expect(p1.body.results).toHaveLength(10);
    expect(p2.body.results).toHaveLength(10);
    expect(p3.body.results).toHaveLength(5);
  });

  it('page beyond last returns empty results with correct total', async () => {
    await seedVehicles(5);

    const res = await searchQuery({ page: 99, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.total).toBe(5);
  });

  it('single-page result when limit exceeds total', async () => {
    await seedVehicles(7);

    const res = await searchQuery({ page: 1, limit: 100 });

    expect(res.body.results).toHaveLength(7);
    expect(res.body.total).toBe(7);
    expect(res.body.totalPages).toBe(1);
  });
});

// ─── Response shape consistency ───────────────────────────────────────────────

describe('response shape consistency', () => {
  it('total, totalPages, page, limit are self-consistent', async () => {
    await seedVehicles(23);

    const res = await searchQuery({ page: 2, limit: 8 });

    expect(res.body.total).toBe(23);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(8);
    expect(res.body.totalPages).toBe(Math.ceil(23 / 8));
  });

  it('totalPages * limit is always >= total', async () => {
    await seedVehicles(17);

    const res = await searchQuery({ page: 1, limit: 5 });
    const { total, totalPages, limit } = res.body;

    expect(totalPages * limit).toBeGreaterThanOrEqual(total);
    expect((totalPages - 1) * limit).toBeLessThan(total);
  });

  it('results array length matches page / limit arithmetic', async () => {
    await seedVehicles(13);

    const res = await searchQuery({ page: 2, limit: 5 });

    // page 2 of 13 with limit 5 = items 6-10 → 5 results
    expect(res.body.results).toHaveLength(5);
  });
});

// ─── Sort ordering ────────────────────────────────────────────────────────────

describe('sort ordering', () => {
  it('price ascending: each result price ≥ previous', async () => {
    await seedVehicles(10);

    const res = await searchQuery({ order: 'asc', limit: 10 });
    const prices = res.body.results.map(v => v.price);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  it('price descending: each result price ≤ previous', async () => {
    await seedVehicles(10);

    const res = await searchQuery({ order: 'desc', limit: 10 });
    const prices = res.body.results.map(v => v.price);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it('asc and desc page-1 results are exact reverses of each other', async () => {
    await seedVehicles(10);

    const asc  = await searchQuery({ order: 'asc',  limit: 10 });
    const desc = await searchQuery({ order: 'desc', limit: 10 });

    const ascIds  = asc.body.results.map(v => v._id);
    const descIds = desc.body.results.map(v => v._id);

    expect(ascIds).toEqual([...descIds].reverse());
  });
});

// ─── _id tiebreaker for identical sort keys ───────────────────────────────────

describe('_id tiebreaker for identical sort-key values', () => {
  it('no vehicle appears on two pages when all prices are equal', async () => {
    await Vehicle.insertMany(
      Array.from({ length: 9 }, (_, i) => ({
        make,
        model:             `TieModel${i}`,
        price:             50000,
        mileage:           1000,
        supplier:          'SupA',
        warehouseLocation: 'WH1',
        turnaroundTime:    3,
        status:            'available',
      }))
    );

    const p1 = await searchQuery({ page: 1, limit: 5 });
    const p2 = await searchQuery({ page: 2, limit: 5 });

    const ids1 = p1.body.results.map(v => v._id);
    const ids2 = p2.body.results.map(v => v._id);

    expect(ids1).toHaveLength(5);
    expect(ids2).toHaveLength(4);
    expect(new Set([...ids1, ...ids2]).size).toBe(9);
  });

  it('repeated identical request returns results in the same order', async () => {
    await Vehicle.insertMany(
      Array.from({ length: 6 }, (_, i) => ({
        make,
        model:             `StableModel${i}`,
        price:             77777,
        mileage:           1000,
        supplier:          'SupA',
        warehouseLocation: 'WH1',
        turnaroundTime:    3,
        status:            'available',
      }))
    );

    // Two separate requests with identical params — DB order must be deterministic
    const r1 = await searchQuery({ page: 1, limit: 6 });
    const r2 = await searchQuery({ page: 2, limit: 6 }); // page 2 = empty, forces a fresh cache key
    const r3 = await request(app)
      .get('/vehicles/search')
      .query({ make, sort: 'price', order: 'asc', page: 1, limit: 6 });

    expect(r1.body.results.map(v => v._id))
      .toEqual(r3.body.results.map(v => v._id));
  });

  it('pages built with same-price tiebreaker cover every vehicle exactly once', async () => {
    await Vehicle.insertMany(
      Array.from({ length: 11 }, (_, i) => ({
        make,
        model:             `TPModel${i}`,
        price:             30000,
        mileage:           2000,
        supplier:          'SupA',
        warehouseLocation: 'WH1',
        turnaroundTime:    3,
        status:            'available',
      }))
    );

    const [p1, p2, p3] = await Promise.all([
      searchQuery({ page: 1, limit: 4 }),
      searchQuery({ page: 2, limit: 4 }),
      searchQuery({ page: 3, limit: 4 }),
    ]);

    const allIds = [
      ...p1.body.results.map(v => v._id),
      ...p2.body.results.map(v => v._id),
      ...p3.body.results.map(v => v._id),
    ];
    expect(allIds).toHaveLength(11);
    expect(new Set(allIds).size).toBe(11);
  });
});

// ─── Filter + pagination interaction ─────────────────────────────────────────

describe('filter with pagination', () => {
  it('price range reduces total and pages remain disjoint', async () => {
    await seedVehicles(20); // prices: 1000 .. 20000

    const params = { priceMin: 5000, priceMax: 10000, sort: 'price', order: 'asc', limit: 3 };
    const p1 = await request(app).get('/vehicles/search').query({ make, ...params, page: 1 });
    const p2 = await request(app).get('/vehicles/search').query({ make, ...params, page: 2 });

    // 5000, 6000, 7000, 8000, 9000, 10000 → 6 results
    expect(p1.body.total).toBe(6);
    expect(p1.body.results).toHaveLength(3);
    expect(p2.body.results).toHaveLength(3);

    const allIds = [
      ...p1.body.results.map(v => v._id),
      ...p2.body.results.map(v => v._id),
    ];
    expect(new Set(allIds).size).toBe(6);

    p1.body.results.forEach(v => {
      expect(v.price).toBeGreaterThanOrEqual(5000);
      expect(v.price).toBeLessThanOrEqual(10000);
    });
  });

  it('filter that matches nothing returns total=0 and empty results', async () => {
    await seedVehicles(10); // prices up to 10000

    const res = await searchQuery({ priceMin: 999999, limit: 10 });

    expect(res.body.total).toBe(0);
    expect(res.body.results).toHaveLength(0);
    expect(res.body.totalPages).toBe(0);
  });

  it('mileage filter reduces results correctly', async () => {
    await seedVehicles(10); // mileage: 0, 500, 1000, ..., 4500

    const res = await searchQuery({ mileageMax: 2000, limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5); // 0, 500, 1000, 1500, 2000
    res.body.results.forEach(v => {
      expect(v.mileage).toBeLessThanOrEqual(2000);
    });
  });
});
