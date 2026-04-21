const mongoose = require('mongoose');

// Key vehicle fields are denormalized here for query performance.
// Avoids joins on every search; Vehicle remains the authoritative record.
const priceHistorySchema = new mongoose.Schema({
  price:     { type: Number, required: true },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const listingSchema = new mongoose.Schema({
  vehicleId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
  dealershipId: { type: mongoose.Schema.Types.ObjectId, required: true },

  // Denormalized vehicle fields — mirrors vehicleController search params
  make:              { type: String, required: true },
  model:             { type: String, required: true },
  year:              { type: Number },
  price:             { type: Number, required: true },
  mileage:           { type: Number },
  region:            { type: String },
  registrationDate:  { type: Date },
  supplier:          { type: String },
  warehouseLocation: { type: String },
  turnaroundTime:    { type: Number },

  // Listing state
  status:      { type: String, enum: ['active', 'pending', 'sold', 'inactive'], default: 'active' },
  featured:    { type: Boolean, default: false },
  views:       { type: Number, default: 0 },
  listingDate: { type: Date, default: Date.now },
  soldAt:      { type: Date, default: null },
  orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  // Immutable price trail for auditability
  priceHistory: [priceHistorySchema],
}, { timestamps: true });

// Search queries: stable sort with _id tiebreaker
listingSchema.index({ make: 1, model: 1, price: 1, _id: 1 });
listingSchema.index({ price: 1, _id: 1 });
listingSchema.index({ mileage: 1, _id: 1 });
listingSchema.index({ registrationDate: 1, _id: 1 });
listingSchema.index({ status: 1, price: 1, _id: 1 });
listingSchema.index({ dealershipId: 1, status: 1, listingDate: -1 });
listingSchema.index({ featured: 1, listingDate: -1 });

module.exports = mongoose.model('Listing', listingSchema);
