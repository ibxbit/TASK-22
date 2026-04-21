const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Vehicle = require('../models/Vehicle');
const { splitItems }   = require('../services/checkoutService');
const analyticsService = require('../services/analyticsService');

const VALID_ADDONS = new Set(['inspection_package', 'extended_warranty']);

async function addToCart(req, res) {
  try {
    const { sessionId, vehicleId, addOns = [] } = req.body;

    if (!sessionId || !vehicleId) {
      return res.status(400).json({ error: 'sessionId and vehicleId are required' });
    }

    const invalidAddOns = addOns.filter(a => !VALID_ADDONS.has(a));
    if (invalidAddOns.length > 0) {
      return res.status(400).json({ error: `Invalid add-ons: ${invalidAddOns.join(', ')}` });
    }

    const vehicle = await Vehicle.findById(vehicleId).lean();
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    if (vehicle.status !== 'available') {
      return res.status(409).json({ error: 'Vehicle is not available' });
    }

    const cart = await Cart.findOneAndUpdate(
      { sessionId, status: 'active' },
      {
        $set: {
          userId:       req.user._id,
          dealershipId: req.user.dealershipId,
        },
        $push: {
          items: {
            vehicleId:         vehicle._id,
            addOns:            [...new Set(addOns)],
            supplier:          vehicle.supplier,
            warehouseLocation: vehicle.warehouseLocation,
            turnaroundTime:    vehicle.turnaroundTime,
          },
        },
      },
      { upsert: true, new: true }
    );

    analyticsService.track({
      sessionId,
      userId:       req.user._id,
      dealershipId: req.user.dealershipId,
      eventType:    'cart.add',
      category:     'cart',
      entityType:   'Vehicle',
      entityId:     vehicle._id,
      properties:   { addOns },
    });

    return res.status(200).json({ cart });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function checkout(req, res) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const cart = await Cart.findOne({ sessionId, status: 'active' });
    if (!cart) return res.status(404).json({ error: 'Active cart not found' });
    if (cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const groups = splitItems(cart.items);

    let orders;
    try {
      orders = await Order.insertMany(
        groups.map(group => ({
          cartId:            cart._id,
          userId:            req.user._id,
          dealershipId:      req.user.dealershipId,
          supplier:          group.supplier,
          warehouseLocation: group.warehouseLocation,
          turnaroundTime:    group.turnaroundTime,
          groupKey:          group.groupKey,
          items:             group.items,
          status:            'created',
        }))
      );
    } catch (insertErr) {
      await Order.deleteMany({ cartId: cart._id, status: 'created' })
        .catch(delErr => console.error('[checkout] compensation delete failed:', delErr.message));
      throw insertErr;
    }

    cart.status = 'checked_out';
    await cart.save();

    analyticsService.track({
      sessionId,
      userId:       req.user._id,
      dealershipId: req.user.dealershipId,
      eventType:    'checkout.complete',
      category:     'checkout',
      properties:   { orderCount: orders.length },
    });

    return res.status(201).json({ orders });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { addToCart, checkout };
