const mongoose = require('mongoose');

const DOC_TYPES = ['title', 'buyers_order', 'inspection_pdf'];

const documentSchema = new mongoose.Schema({
  dealershipId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  type:         { type: String, enum: DOC_TYPES, required: true },
  name:         { type: String, required: true, trim: true },
  filePath:     { type: String, required: true },
  mimeType:     { type: String, default: null },
  uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:       { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft' },
  fileHash:     { type: String, default: null },
}, { timestamps: true });

// Document inbox: filter by dealership + type + status
documentSchema.index({ dealershipId: 1, type: 1, status: 1 });
// Order document bundle
documentSchema.index({ orderId: 1, type: 1 });
// Uploader history
documentSchema.index({ uploadedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Document', documentSchema);
