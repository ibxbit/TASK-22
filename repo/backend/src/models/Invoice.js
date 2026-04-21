const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  amount:  { type: Number, required: true },
  status:  { type: String, enum: ['pending', 'paid', 'void'], default: 'pending' },
  paidAt:  { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
