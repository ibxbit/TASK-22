const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');
const schemas  = require('../validation/schemas');
const {
  getConsentHistory,
  recordConsent,
  exportData,
  requestDeletion,
  getDeletionRequests,
  cancelDeletionRequest,
} = require('../controllers/privacyController');

router.use(auth);

router.get('/consent',            getConsentHistory);
router.post('/consent',           validate(schemas.recordConsent), recordConsent);
router.get('/export',             exportData);
router.get('/deletion-requests',  getDeletionRequests);
router.post('/deletion-request',  requestDeletion);
router.delete('/deletion-requests/:id', cancelDeletionRequest);

module.exports = router;
