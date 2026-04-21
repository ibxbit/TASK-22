const express = require('express');
const multer  = require('multer');
const path    = require('path');
const router  = express.Router();

const auth              = require('../middleware/auth');
const requirePermission = require('../middleware/requirePermission');
const requireRole       = require('../middleware/requireRole');
const { validateUpload } = require('../middleware/fileValidator');
const ctrl              = require('../controllers/documentController');


const UPLOAD_DIR = path.join(__dirname, '../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard limit
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Unsupported file type'), allowed.includes(file.mimetype));
  },
});

// All document routes require authentication
router.use(auth);

// Read-only routes: auth only
router.get('/', ctrl.listDocuments);
router.get('/:id',          requirePermission('read'),     ctrl.getDocument);
router.get('/:id/download', requirePermission('download'), ctrl.downloadDocument);

// Mutation routes: auth required
router.post('/upload',          upload.single('file'), validateUpload, ctrl.upload);
router.put('/:id',              requirePermission('edit'),     ctrl.editDocument);
router.delete('/:id',           requirePermission('delete'),   ctrl.deleteDocument);
router.post('/:id/share',       requirePermission('share'),    ctrl.shareDocument);
router.post('/:id/submit',      requirePermission('submit'),   ctrl.submitDocument);
router.post('/:id/approve',     requirePermission('approve'),  ctrl.approveDocument);
router.post('/:id/permissions', requireRole(['admin', 'manager']), requirePermission('edit'), ctrl.setPermission);

module.exports = router;
