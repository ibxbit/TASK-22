const Order        = require('../models/Order');
const Vehicle      = require('../models/Vehicle');
const LedgerEntry  = require('../models/LedgerEntry');
const OrderAuditLog = require('../models/OrderAuditLog');
const { transition, transitionWithRollback, getValidTransitions } = require('../services/orderStateMachine');

const SIDE_EFFECT_STATES = new Set(['reserved', 'settled']);

function assertTenantAccess(req, order) {
  if (req.user.role === 'admin') return null;
  if (!order.dealershipId) {
    return { status: 403, error: 'Order has no dealership — access denied' };
  }
  if (!req.user.dealershipId) {
    return { status: 403, error: 'User has no dealership — access denied' };
  }
  if (order.dealershipId.toString() !== req.user.dealershipId.toString()) {
    return { status: 403, error: 'Access denied: order belongs to a different dealership' };
  }
  return null;
}

async function reserveInventory(orderId) {
  const order = await Order.findById(orderId).lean();
  const vehicleIds = order.items.map(i => i.vehicleId);

  const vehicles = await Vehicle.find({ _id: { $in: vehicleIds } }).lean();
  const unavailable = vehicles.filter(v => v.status !== 'available');
  if (unavailable.length > 0) {
    const ids = unavailable.map(v => v._id).join(', ');
    throw new Error(`Vehicle(s) no longer available: ${ids}`);
  }

  await Vehicle.updateMany(
    { _id: { $in: vehicleIds }, status: 'available' },
    { $set: { status: 'reserved' } }
  );

  const reserved = await Vehicle.countDocuments({ _id: { $in: vehicleIds }, status: 'reserved' });
  if (reserved !== vehicleIds.length) {
    await Vehicle.updateMany(
      { _id: { $in: vehicleIds }, status: 'reserved' },
      { $set: { status: 'available' } }
    );
    throw new Error('Concurrent reservation conflict — one or more vehicles were taken');
  }
}

async function verifyPayment(orderId) {
  const entry = await LedgerEntry.findOne({
    orderId,
    direction: 'debit',
    status:    'completed',
  }).lean();

  if (!entry) {
    throw new Error(`No completed payment found for order ${orderId}`);
  }
}

async function getOrder(req, res) {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const deny = assertTenantAccess(req, order);
    if (deny) return res.status(deny.status).json({ error: deny.error });

    return res.json({ order, validTransitions: getValidTransitions(order.status) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function transitionOrder(req, res) {
  try {
    const { id } = req.params;
    const { toState, metadata = {} } = req.body;

    if (!toState) return res.status(400).json({ error: 'toState is required' });

    const existing = await Order.findById(id).lean();
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const deny = assertTenantAccess(req, existing);
    if (deny) return res.status(deny.status).json({ error: deny.error });

    let order;

    if (SIDE_EFFECT_STATES.has(toState)) {
      order = await transitionWithRollback(id, toState, async () => {
        if (toState === 'reserved') {
          await reserveInventory(id);
        } else if (toState === 'settled') {
          await verifyPayment(id);
        }
      }, metadata);
    } else {
      order = await transition(id, toState, metadata);
    }

    return res.json({ order });
  } catch (err) {
    const status = err.message.startsWith('Invalid transition') ||
                   err.message.startsWith('Unknown state') ? 422 : 500;
    return res.status(status).json({ error: err.message });
  }
}

async function getAuditLog(req, res) {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const deny = assertTenantAccess(req, order);
    if (deny) return res.status(deny.status).json({ error: deny.error });

    const logs = await OrderAuditLog.find({ orderId: req.params.id })
      .sort({ timestamp: 1 })
      .lean();
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getOrder, transitionOrder, getAuditLog };
