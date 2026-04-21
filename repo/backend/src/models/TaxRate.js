const mongoose = require('mongoose');

const taxRateSchema = new mongoose.Schema({
  state:      { type: String, required: true, uppercase: true, trim: true },
  county:     { type: String, default: null, trim: true },
  stateTax:   { type: Number, required: true, min: 0 },
  countyTax:  { type: Number, required: true, min: 0, default: 0 },
  totalRate:  { type: Number, required: true, min: 0 },
}, { timestamps: false });

// One record per state + county combination (county null = state-wide fallback)
taxRateSchema.index({ state: 1, county: 1 }, { unique: true });

module.exports = mongoose.model('TaxRate', taxRateSchema);
