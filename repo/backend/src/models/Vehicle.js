const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  make:             { type: String, required: true },
  model:            { type: String, required: true },
  price:            { type: Number, required: true },
  mileage:          { type: Number, required: true },
  region:           { type: String },
  registrationDate: { type: Date },
  year:             { type: Number },
  status:           { type: String, default: 'available' },
  supplier:         { type: String, required: true },
  warehouseLocation:{ type: String, required: true },
  turnaroundTime:   { type: Number, required: true },
}, { timestamps: true });

vehicleSchema.index({ make: 1, model: 1, price: 1, _id: 1 });
vehicleSchema.index({ price: 1, _id: 1 });
vehicleSchema.index({ mileage: 1, _id: 1 });
vehicleSchema.index({ registrationDate: 1, _id: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
