const mongoose = require('mongoose');
const { connect, clearCollections, disconnect } = require('../backend/src/tests/helpers/db');
const { makeUser, makeDocument, makeRolePolicy, makeDocumentPermission } = require('../backend/src/tests/helpers/fixtures');
const { check, checkType, getRoleChain } = require('../backend/src/services/permissionService');

beforeAll(() => connect());
afterAll(() => disconnect());
beforeEach(() => clearCollections());

// ── Pure getRoleChain ────────────────────────────────────────────────────────

describe('getRoleChain()', () => {
  test('admin chain contains only admin', () => {
    expect(getRoleChain('admin')).toEqual(['admin']);
  });

  test('manager chain inherits from admin', () => {
    expect(getRoleChain('manager')).toEqual(['manager', 'admin']);
  });

  test('salesperson chain inherits manager then admin', () => {
    expect(getRoleChain('salesperson')).toEqual(['salesperson', 'manager', 'admin']);
  });

  test('finance chain inherits manager then admin', () => {
    expect(getRoleChain('finance')).toEqual(['finance', 'manager', 'admin']);
  });

  test('inspector chain inherits manager then admin', () => {
    expect(getRoleChain('inspector')).toEqual(['inspector', 'manager', 'admin']);
  });

  test('unknown role returns singleton chain', () => {
    expect(getRoleChain('ghost')).toEqual(['ghost']);
  });
});

// ── DB-backed check() ────────────────────────────────────────────────────────

describe('check()', () => {
  test('cross-dealership access is always denied', async () => {
    const dealershipA = new mongoose.Types.ObjectId();
    const dealershipB = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'admin', dealershipId: dealershipA });
    const doc  = await makeDocument(user._id, dealershipB);
    expect(await check(user, doc, 'read')).toBe(false);
  });

  test('admin bypasses all permission checks', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'admin', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    // No policies, no overrides — admin still allowed
    expect(await check(user, doc, 'read')).toBe(true);
    expect(await check(user, doc, 'delete')).toBe(true);
  });

  test('user-level override grants listed action', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    await makeDocumentPermission(doc._id, { subjectType: 'user', userId: user._id, actions: ['read'] });
    expect(await check(user, doc, 'read')).toBe(true);
  });

  test('user-level override denies action not in list', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    await makeDocumentPermission(doc._id, { subjectType: 'user', userId: user._id, actions: ['read'] });
    expect(await check(user, doc, 'delete')).toBe(false);
  });

  test('user-level override takes precedence over role-level', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    // Role override grants delete, user override only grants read — user override wins
    await makeDocumentPermission(doc._id, { subjectType: 'role', role: 'salesperson', actions: ['read', 'delete'] });
    await makeDocumentPermission(doc._id, { subjectType: 'user', userId: user._id, actions: ['read'] });
    expect(await check(user, doc, 'delete')).toBe(false);
  });

  test('role-level override used when no user override exists', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    await makeDocumentPermission(doc._id, { subjectType: 'role', role: 'salesperson', actions: ['read', 'edit'] });
    expect(await check(user, doc, 'edit')).toBe(true);
  });

  test('role chain fallback: salesperson inherits manager policy', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    // No salesperson policy — manager policy exists
    await makeRolePolicy(dealershipId, 'manager', 'title', ['read', 'edit']);
    expect(await check(user, doc, 'read')).toBe(true);
    expect(await check(user, doc, 'edit')).toBe(true);
  });

  test('role chain fallback: own policy takes precedence over parent', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId, { type: 'title' });
    // Salesperson policy: read only. Manager policy: read + delete.
    await makeRolePolicy(dealershipId, 'salesperson', 'title', ['read']);
    await makeRolePolicy(dealershipId, 'manager', 'title', ['read', 'delete']);
    // Salesperson policy stops the chain walk — delete not inherited
    expect(await check(user, doc, 'read')).toBe(true);
    expect(await check(user, doc, 'delete')).toBe(false);
  });

  test('default deny when no policies or overrides match', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    const doc  = await makeDocument(user._id, dealershipId);
    expect(await check(user, doc, 'read')).toBe(false);
  });
});

// ── DB-backed checkType() ─────────────────────────────────────────────────────

describe('checkType()', () => {
  test('admin always allowed regardless of policies', async () => {
    const user = await makeUser({ role: 'admin', dealershipId: new mongoose.Types.ObjectId() });
    expect(await checkType(user, 'title', 'edit')).toBe(true);
  });

  test('role allowed when dealership policy grants action', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    await makeRolePolicy(dealershipId, 'salesperson', 'buyers_order', ['edit']);
    expect(await checkType(user, 'buyers_order', 'edit')).toBe(true);
  });

  test('role denied when policy does not grant action', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    await makeRolePolicy(dealershipId, 'salesperson', 'buyers_order', ['read']);
    expect(await checkType(user, 'buyers_order', 'edit')).toBe(false);
  });

  test('role chain fallback for checkType', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'salesperson', dealershipId });
    // No salesperson policy — manager policy exists
    await makeRolePolicy(dealershipId, 'manager', 'inspection_pdf', ['read']);
    expect(await checkType(user, 'inspection_pdf', 'read')).toBe(true);
  });

  test('denied when no policy chain match', async () => {
    const dealershipId = new mongoose.Types.ObjectId();
    const user = await makeUser({ role: 'finance', dealershipId });
    expect(await checkType(user, 'title', 'delete')).toBe(false);
  });
});
