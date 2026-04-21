const express      = require('express');
const router       = express.Router();
const { getOrder, transitionOrder, getAuditLog } = require('../controllers/orderController');
const validate     = require('../middleware/validate');
const schemas      = require('../validation/schemas');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

router.use(auth);

router.get('/:id',                getOrder);
router.patch('/:id/transition',   requireRole(['admin', 'manager', 'finance']), validate(schemas.transitionOrder), transitionOrder);
router.get('/:id/audit',          getAuditLog);

module.exports = router;
