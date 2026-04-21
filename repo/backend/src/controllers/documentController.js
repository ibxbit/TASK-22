const path = require('path');
const Document           = require('../models/Document');
const DocumentPermission = require('../models/DocumentPermission');
const RolePolicy         = require('../models/RolePolicy');
const { checkType, getRoleChain } = require('../services/permissionService');

const DOC_TYPES = new Set(['title', 'buyers_order', 'inspection_pdf']);

async function upload(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const { type, name, orderId } = req.body;
    if (!DOC_TYPES.has(type)) {
      return res.status(400).json({ error: `Invalid document type: '${type}'` });
    }

    const allowed = await checkType(req.user, type, 'edit');
    if (!allowed) {
      return res.status(403).json({ error: `Forbidden: 'edit' not permitted for type '${type}'` });
    }

    const doc = await Document.create({
      dealershipId: req.user.dealershipId,
      orderId:      orderId || null,
      type,
      name:         name || req.file.originalname,
      filePath:     req.file.path,
      mimeType:     req.file.mimetype,
      uploadedBy:   req.user._id,
      fileHash:     req.fileHash || null,
    });

    return res.status(201).json({ document: doc.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listDocuments(req, res) {
  try {
    const user   = req.user;
    const filter = { dealershipId: user.dealershipId };

    if (user.role !== 'admin') {
      // Document types this role (or ancestors) can read via dealership policy
      const chain    = getRoleChain(user.role);
      const policies = await RolePolicy.find({
        dealershipId: user.dealershipId,
        role:         { $in: chain },
        actions:      'read',
      }).lean();
      const allowedTypes = [...new Set(policies.map(p => p.documentType))];

      // Document-level overrides granting read directly to this user or role
      const [userOverrides, roleOverrides] = await Promise.all([
        DocumentPermission.find({ subjectType: 'user', userId: user._id, actions: 'read' }).lean(),
        DocumentPermission.find({ subjectType: 'role', role: user.role,  actions: 'read' }).lean(),
      ]);
      const overrideIds = [
        ...userOverrides.map(o => o.documentId),
        ...roleOverrides.map(o => o.documentId),
      ];

      if (allowedTypes.length === 0 && overrideIds.length === 0) {
        return res.json({ documents: [] });
      }

      const conditions = [];
      if (allowedTypes.length > 0) conditions.push({ type: { $in: allowedTypes } });
      if (overrideIds.length  > 0) conditions.push({ _id: { $in: overrideIds  } });
      filter.$or = conditions;
    }

    const docs = await Document.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ documents: docs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getDocument(req, res) {
  return res.json({ document: req.document });
}

async function downloadDocument(req, res) {
  const doc = req.document;
  return res.download(path.resolve(doc.filePath), doc.name);
}

async function editDocument(req, res) {
  try {
    const { name } = req.body;
    const updated = await Document.findByIdAndUpdate(
      req.document._id,
      { $set: { name: name || req.document.name } },
      { new: true }
    ).lean();
    return res.json({ document: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function deleteDocument(req, res) {
  try {
    await Document.findByIdAndDelete(req.document._id);
    return res.json({ deleted: true, id: req.document._id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function shareDocument(req, res) {
  return res.json({
    document:  req.document,
    shareLink: `/documents/${req.document._id}`,
  });
}

async function submitDocument(req, res) {
  try {
    const updated = await Document.findByIdAndUpdate(
      req.document._id,
      { $set: { status: 'submitted' } },
      { new: true }
    ).lean();
    return res.json({ document: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function approveDocument(req, res) {
  try {
    const updated = await Document.findByIdAndUpdate(
      req.document._id,
      { $set: { status: 'approved' } },
      { new: true }
    ).lean();
    return res.json({ document: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Upsert an explicit permission override on a document (admin / manager only)
async function setPermission(req, res) {
  try {
    const { subjectType, userId, role, actions } = req.body;

    if (!subjectType || !actions) {
      return res.status(400).json({ error: 'subjectType and actions are required' });
    }
    if (subjectType === 'user' && !userId) {
      return res.status(400).json({ error: 'userId is required for user-level override' });
    }
    if (subjectType === 'role' && !role) {
      return res.status(400).json({ error: 'role is required for role-level override' });
    }

    const filter  = { documentId: req.document._id, subjectType,
                      ...(subjectType === 'user' ? { userId } : { role }) };
    const updated = await DocumentPermission.findOneAndUpdate(
      filter,
      { $set: { actions } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ permission: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listDocuments, upload, getDocument, downloadDocument, editDocument,
  deleteDocument, shareDocument, submitDocument, approveDocument, setPermission,
};
