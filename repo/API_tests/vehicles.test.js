const supertest  = require('supertest');
const app        = require('../backend/src/app');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeVehicle } = require('../backend/src/tests/helpers/fixtures');

const request = supertest(app);

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

function tag() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Vehicle search is a public route — no auth required

describe('GET /vehicles/search', () => {
  test('returns 200 with empty results when no vehicles exist', async () => {
    const res = await request.get('/vehicles/search');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  test('returns matching vehicles by make', async () => {
    const make = `BrandX-${tag()}`;
    await makeVehicle({ make, model: 'Coupe' });
    await makeVehicle({ make: `Other-${tag()}`, model: 'SUV' });
    const res = await request.get(`/vehicles/search?make=${make}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].make).toBe(make);
  });

  test('pagination: page and limit are respected', async () => {
    const make = `Page-${tag()}`;
    for (let i = 0; i < 5; i++) await makeVehicle({ make, model: `M${i}` });
    const res = await request.get(`/vehicles/search?make=${make}&page=1&limit=2`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBeGreaterThanOrEqual(3);
  });

  test('pagination: page 2 returns different vehicles than page 1', async () => {
    const make = `Paged-${tag()}`;
    for (let i = 0; i < 6; i++) await makeVehicle({ make, model: `Car${i}`, price: i * 1000 + 1000 });
    const p1 = await request.get(`/vehicles/search?make=${make}&page=1&limit=3&sort=price&order=asc`);
    const p2 = await request.get(`/vehicles/search?make=${make}&page=2&limit=3&sort=price&order=asc`);
    const ids1 = p1.body.results.map(v => v._id);
    const ids2 = p2.body.results.map(v => v._id);
    const overlap = ids1.filter(id => ids2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test('pagination: no vehicle appears on more than one page', async () => {
    const make = `NoDup-${tag()}`;
    for (let i = 0; i < 9; i++) await makeVehicle({ make, model: `V${i}` });
    const all = [];
    for (let page = 1; page <= 3; page++) {
      const res = await request.get(`/vehicles/search?make=${make}&page=${page}&limit=3`);
      all.push(...res.body.results.map(v => v._id));
    }
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });

  test('sort=price order=asc: ascending order returned', async () => {
    const make = `Sort-${tag()}`;
    await makeVehicle({ make, model: 'High', price: 50000 });
    await makeVehicle({ make, model: 'Low',  price: 10000 });
    await makeVehicle({ make, model: 'Mid',  price: 30000 });
    const res = await request.get(`/vehicles/search?make=${make}&sort=price&order=asc`);
    expect(res.status).toBe(200);
    const prices = res.body.results.map(v => v.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  test('sort=price order=desc: descending order returned', async () => {
    const make = `SortD-${tag()}`;
    await makeVehicle({ make, model: 'A', price: 20000 });
    await makeVehicle({ make, model: 'B', price: 40000 });
    const res = await request.get(`/vehicles/search?make=${make}&sort=price&order=desc`);
    const prices = res.body.results.map(v => v.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
  });

  test('response shape includes total, totalPages, limit, page', async () => {
    const res = await request.get('/vehicles/search?limit=5');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('page');
  });

  test('invalid limit returns 422', async () => {
    const res = await request.get('/vehicles/search?limit=-1');
    expect(res.status).toBe(422);
  });

  test('invalid page returns 422', async () => {
    const res = await request.get('/vehicles/search?page=0');
    expect(res.status).toBe(422);
  });
});
