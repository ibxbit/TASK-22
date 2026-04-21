const Document = require('../models/Document');
const { check } = require('../services/permissionService');

// Factory — returns middleware that enforces a specific action on :id document.
// Sets req.document so subsequent handlers don't re-fetch.
function requirePermission(action) {
  return async (req, res, next) => {
    try {
      const document = req.document || await Document.findById(req.params.id).lean();
      if (!document) return res.status(404).json({ error: 'Document not found' });

      const allowed = await check(req.user, document, action);
      if (!allowed) {
        return res.status(403).json({ error: `Forbidden: '${action}' not permitted on this document` });
      }

      req.document = document;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requirePermission;
