const crypto            = require('crypto');
const mongoose          = require('mongoose');
const Vehicle           = require('../../models/Vehicle');
const Cart              = require('../../models/Cart');
const Order             = require('../../models/Order');
const LedgerEntry       = require('../../models/LedgerEntry');
const User              = require('../../models/User');
const Document          = require('../../models/Document');
const RolePolicy        = require('../../models/RolePolicy');
const DocumentPermission = require('../../models/DocumentPermission');
const { sign }          = require('../../config/jwt');

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Returns a signed JWT for the given user object (for test requests).
function makeAuthToken(user) {
  return sign({
    userId:      user._id.toString(),
    role:        user.role,
    dealershipId: user.dealershipId ? user.dealershipId.toString() : null,
  }, 3600);
}

// Returns the Authorization header object for a given user.
function authHeader(user) {
  return { 'Authorization': `Bearer ${makeAuthToken(user)}` };
}

// Kept for any server-to-server or legacy test scenarios.
function makeHmacHeaders(method, path, body = null) {
  const secret    = process.env.HMAC_SECRET || 'test-hmac-secret-string-for-integration-tests';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce     = crypto.randomBytes(16).toString('hex');
  const bodyStr   = body ? JSON.stringify(body) : '';
  const bodyHash  = crypto.createHash('sha256').update(Buffer.from(bodyStr)).digest('hex');
  const payload   = `${method.toUpperCase()}:${path}:${timestamp}:${nonce}:${bodyHash}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return {
    'x-timestamp': timestamp,
    'x-nonce':     nonce,
    'x-signature': signature,
  };
}

async function makeVehicle(overrides = {}) {
  return Vehicle.create({
    make:              'TestMake',
    model:             `Model-${uid()}`,
    price:             20000,
    mileage:           10000,
    year:              2022,
    region:            'West',
    registrationDate:  new Date('2022-01-01'),
    supplier:          'SupA',
    warehouseLocation: 'WH1',
    turnaroundTime:    3,
    status:            'available',
    ...overrides,
  });
}

async function makeCart(vehicleId, dealershipId = null) {
  return Cart.create({
    sessionId:    `sess-${uid()}`,
    dealershipId: dealershipId,
    items: [{
      vehicleId,
      addOns:            [],
      supplier:          'SupA',
      warehouseLocation: 'WH1',
      turnaroundTime:    3,
    }],
    status: 'active',
  });
}

async function makeOrder(status = 'created', { vehicleOverrides = {}, orderOverrides = {}, userId = null, dealershipId = null } = {}) {
  const vehicle = await makeVehicle(vehicleOverrides);
  const cart    = await makeCart(vehicle._id, dealershipId);
  const order   = await Order.create({
    cartId:            cart._id,
    userId,
    dealershipId,
    supplier:          'SupA',
    warehouseLocation: 'WH1',
    turnaroundTime:    3,
    groupKey:          `GK-${uid()}`,
    items:             [{ vehicleId: vehicle._id, addOns: [] }],
    status,
    ...orderOverrides,
  });
  return { order, vehicle, cart };
}

async function makeUser(overrides = {}) {
  return User.create({
    name:         `User-${uid()}`,
    email:        `user-${uid()}@test.com`,
    role:         'salesperson',
    dealershipId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

async function makeDocument(uploadedBy, dealershipId, overrides = {}) {
  return Document.create({
    dealershipId,
    orderId:   null,
    type:      'title',
    name:      `Doc-${uid()}`,
    filePath:  `/tmp/test-${uid()}.pdf`,
    mimeType:  'application/pdf',
    uploadedBy,
    status:    'draft',
    ...overrides,
  });
}

async function makeRolePolicy(dealershipId, role, documentType, actions) {
  return RolePolicy.create({ dealershipId, role, documentType, actions });
}

async function makeDocumentPermission(documentId, { subjectType, userId, role, actions }) {
  return DocumentPermission.create({
    documentId,
    subjectType,
    userId:  userId  ?? null,
    role:    role    ?? null,
    actions,
  });
}

async function makeCompletedPayment(orderId, amount = 10000) {
  return LedgerEntry.create({
    orderId,
    method:    'cash',
    amount,
    direction: 'debit',
    reference: `REF-${uid()}`,
    status:    'completed',
    metadata:  { source: 'test' },
  });
}

module.exports = {
  makeVehicle,
  makeCart,
  makeOrder,
  makeUser,
  makeDocument,
  makeRolePolicy,
  makeDocumentPermission,
  makeCompletedPayment,
  makeHmacHeaders,
  makeAuthToken,
  authHeader,
};
