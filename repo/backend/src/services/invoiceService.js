const Order   = require('../models/Order');
const Vehicle = require('../models/Vehicle');
const taxService = require('./taxService');

const ADDON_PRICES = {
  inspection_package: 299,
  extended_warranty:  1499,
};

async function buildInvoicePreview(orderId, state, county) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new Error('Order not found');

  // Batch-load all vehicles referenced by this order
  const vehicleIds = order.items.map(i => i.vehicleId);
  const vehicles   = await Vehicle.find({ _id: { $in: vehicleIds } }).lean();
  const vehicleMap = new Map(vehicles.map(v => [v._id.toString(), v]));

  const lineItems = order.items.map(item => {
    const vehicle      = vehicleMap.get(item.vehicleId.toString());
    const vehiclePrice = vehicle ? vehicle.price : 0;

    const addOnDetails = (item.addOns || []).map(name => ({
      name,
      price: ADDON_PRICES[name] ?? 0,
    }));
    const addOnsTotal = addOnDetails.reduce((sum, a) => sum + a.price, 0);

    return {
      vehicleId:    item.vehicleId,
      make:         vehicle ? vehicle.make  : null,
      model:        vehicle ? vehicle.model : null,
      vehiclePrice,
      addOns:       addOnDetails,
      itemTotal:    vehiclePrice + addOnsTotal,
    };
  });

  const subtotal = lineItems.reduce((sum, item) => sum + item.itemTotal, 0);

  const rates   = await taxService.getRates(state, county);
  const taxCalc = taxService.calculate(subtotal, rates);

  return {
    orderId,
    supplier:          order.supplier,
    warehouseLocation: order.warehouseLocation,
    lineItems,
    subtotal,
    tax: {
      state:          rates.state,
      county:         rates.county,
      stateRate:      rates.stateTax,
      countyRate:     rates.countyTax,
      totalRate:      rates.totalRate,
      stateAmount:    taxCalc.stateAmount,
      countyAmount:   taxCalc.countyAmount,
      totalTaxAmount: taxCalc.totalTax,
    },
    total:       parseFloat((subtotal + taxCalc.totalTax).toFixed(2)),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildInvoicePreview };
