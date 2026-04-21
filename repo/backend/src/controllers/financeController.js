const TaxRate = require('../models/TaxRate');
const Order   = require('../models/Order');
const { buildInvoicePreview } = require('../services/invoiceService');

async function invoicePreview(req, res) {
  try {
    const { orderId } = req.params;
    const { state, county } = req.query;

    if (!state)  return res.status(400).json({ error: 'state query parameter is required' });
    if (!county) return res.status(400).json({ error: 'county query parameter is required' });

    // Tenant isolation: verify user can access this order
    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role !== 'admin') {
      if (!order.dealershipId) return res.status(403).json({ error: 'Order has no dealership — access denied' });
      if (!req.user.dealershipId) return res.status(403).json({ error: 'User has no dealership — access denied' });
      if (order.dealershipId.toString() !== req.user.dealershipId.toString()) {
        return res.status(403).json({ error: 'Access denied: order belongs to a different dealership' });
      }
    }

    const preview = await buildInvoicePreview(orderId, state, county);
    return res.json({ preview });
  } catch (err) {
    const isClient = ['not found', 'No tax rate'].some(m => err.message.includes(m));
    return res.status(isClient ? 400 : 500).json({ error: err.message });
  }
}

async function listTaxRates(req, res) {
  try {
    const { state } = req.query;
    const filter = state ? { state: state.toUpperCase() } : {};
    const rates = await TaxRate.find(filter).sort({ state: 1, county: 1 }).lean();
    return res.json({ rates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function upsertTaxRate(req, res) {
  try {
    const { state, county = null, stateTax, countyTax } = req.body;

    if (!state || stateTax === undefined) {
      return res.status(400).json({ error: 'state and stateTax are required' });
    }

    const totalRate = parseFloat(((stateTax || 0) + (countyTax || 0)).toFixed(4));

    const rate = await TaxRate.findOneAndUpdate(
      { state: state.toUpperCase(), county: county || null },
      { $set: { stateTax, countyTax: countyTax || 0, totalRate } },
      { upsert: true, new: true }
    ).lean();

    return res.status(200).json({ rate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { invoicePreview, listTaxRates, upsertTaxRate };
