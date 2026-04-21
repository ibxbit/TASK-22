const mongoose = require('mongoose');

const SCOPES = ['listing_layout', 'checkout_steps'];

const variantSchema = new mongoose.Schema({
  key:    { type: String, required: true, trim: true },
  label:  { type: String, required: true, trim: true },
  weight: { type: Number, required: true, min: 0, max: 100 },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const experimentSchema = new mongoose.Schema({
  name:               { type: String, required: true, unique: true, trim: true },
  scope:              { type: String, enum: SCOPES, required: true },
  status:             { type: String, enum: ['draft', 'active', 'paused', 'rolled_back'], default: 'draft' },
  variants:           { type: [variantSchema], required: true },
  rollbackVariantKey: { type: String, required: true, default: 'control' },
}, { timestamps: true });

experimentSchema.index({ scope: 1, status: 1 });

module.exports = mongoose.model('Experiment', experimentSchema);
