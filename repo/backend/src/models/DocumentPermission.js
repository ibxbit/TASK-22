const mongoose = require('mongoose');

const ACTIONS = ['read', 'download', 'edit', 'delete', 'share', 'submit', 'approve'];
const ROLES   = ['admin', 'manager', 'salesperson', 'finance', 'inspector'];

const documentPermissionSchema = new mongoose.Schema({
  documentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  subjectType: { type: String, enum: ['user', 'role'], required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  role:        { type: String, enum: ROLES, default: null },
  actions:     [{ type: String, enum: ACTIONS }],
}, { timestamps: { createdAt: true, updatedAt: false } });

documentPermissionSchema.index({ documentId: 1, subjectType: 1, userId: 1 });
documentPermissionSchema.index({ documentId: 1, subjectType: 1, role:   1 });

module.exports = mongoose.model('DocumentPermission', documentPermissionSchema);
