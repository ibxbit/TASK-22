const Order       = require('../models/Order');
const LedgerEntry = require('../models/LedgerEntry');
const { processPayment, getLedger, refundPayment, getWalletSummary } = require('../services/paymentService');

async function assertOrderTenant(req, orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order) return { code: 404, error: 'Order not found' };
  if (req.user.role !== 'admin') {
    if (!order.dealershipId) return { code: 403, error: 'Order has no dealership — access denied' };
    if (!req.user.dealershipId) return { code: 403, error: 'User has no dealership — access denied' };
    if (order.dealershipId.toString() !== req.user.dealershipId.toString()) {
      return { code: 403, error: 'Access denied: order belongs to a different dealership' };
    }
  }
  return null;
}

async function pay(req, res) {
  try {
    const { orderId, method, amount, details = {} } = req.body;

    if (!orderId || !method || amount === undefined) {
      return res.status(400).json({ error: 'orderId, method, and amount are required' });
    }

    const deny = await assertOrderTenant(req, orderId);
    if (deny) return res.status(deny.code).json({ error: deny.error });

    const result = await processPayment({ orderId, method, amount, details });
    return res.status(201).json(result);
  } catch (err) {
    const clientErrors = ['disabled', 'Unknown payment', 'Order not found', 'must be', 'required', 'cannot exceed', 'Cannot process payment'];
    const isClient = clientErrors.some(msg => err.message.includes(msg));
    return res.status(isClient ? 400 : 500).json({ error: err.message });
  }
}

async function getLedgerEntries(req, res) {
  try {
    const deny = await assertOrderTenant(req, req.params.orderId);
    if (deny) return res.status(deny.code).json({ error: deny.error });

    const entries = await getLedger(req.params.orderId);
    return res.json({ entries });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function refund(req, res) {
  try {
    const entry = await LedgerEntry.findById(req.params.id).lean();
    if (!entry) return res.status(400).json({ error: 'Ledger entry not found' });

    const deny = await assertOrderTenant(req, entry.orderId);
    if (deny) return res.status(deny.code).json({ error: deny.error });

    const { reason = '' } = req.body;
    const result = await refundPayment(req.params.id, reason);
    return res.json(result);
  } catch (err) {
    const clientErrors = ['not found', 'Only debit', 'already been refunded', 'Cannot refund'];
    const isClient = clientErrors.some(msg => err.message.includes(msg));
    return res.status(isClient ? 400 : 500).json({ error: err.message });
  }
}

async function walletSummary(req, res) {
  try {
    if (req.user.role !== 'admin' && !req.user.dealershipId) {
      return res.status(403).json({ error: 'User has no dealership — access denied' });
    }
    const dealershipId = req.user.role === 'admin' ? null : req.user.dealershipId;
    const summary = await getWalletSummary(dealershipId);
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { pay, getLedgerEntries, refund, walletSummary };
