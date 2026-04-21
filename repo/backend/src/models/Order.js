const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  addOns:    [{ type: String }],
}, { _id: false });

const orderSchema = new mongoose.Schema({
  cartId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Cart', required: true },
  userId:            { type: mongoose.Schema.Types.ObjectId, default: null },
  dealershipId:      { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  supplier:          { type: String, required: true },
  warehouseLocation: { type: String, required: true },
  turnaroundTime:    { type: Number, required: true },
  groupKey:          { type: String, required: true },
  items:             [orderItemSchema],
  status: {
    type: String,
    enum: ['created', 'reserved', 'invoiced', 'settled', 'fulfilled', 'cancelled'],
    default: 'created',
  },
  failureReason: { type: String, default: null },
}, { timestamps: true });

// Operational: list orders by status + date
orderSchema.index({ status: 1, createdAt: -1 });
// Cart lookup
orderSchema.index({ cartId: 1 });
// Logistics grouping
orderSchema.index({ supplier: 1, warehouseLocation: 1, status: 1 });
// State machine history
orderSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
