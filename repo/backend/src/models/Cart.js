const mongoose = require('mongoose');

const VALID_ADDONS = ['inspection_package', 'extended_warranty'];

const cartItemSchema = new mongoose.Schema({
  vehicleId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  addOns:            [{ type: String, enum: VALID_ADDONS }],
  supplier:          { type: String, required: true },
  warehouseLocation: { type: String, required: true },
  turnaroundTime:    { type: Number, required: true },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  sessionId:    { type: String, required: true, unique: true, index: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, default: null },
  dealershipId: { type: mongoose.Schema.Types.ObjectId, default: null },
  items:        [cartItemSchema],
  status:       { type: String, enum: ['active', 'checked_out'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
