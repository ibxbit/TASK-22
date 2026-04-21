const mongoose = require('mongoose');

const ACTIONS   = ['read', 'download', 'edit', 'delete', 'share', 'submit', 'approve'];
const DOC_TYPES = ['title', 'buyers_order', 'inspection_pdf'];
const ROLES     = ['admin', 'manager', 'salesperson', 'finance', 'inspector'];

const rolePolicySchema = new mongoose.Schema({
  dealershipId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role:         { type: String, enum: ROLES, required: true },
  documentType: { type: String, enum: DOC_TYPES, required: true },
  actions:      [{ type: String, enum: ACTIONS }],
}, { timestamps: false });

// One policy per dealership + role + document type combination
rolePolicySchema.index({ dealershipId: 1, role: 1, documentType: 1 }, { unique: true });

module.exports = mongoose.model('RolePolicy', rolePolicySchema);
