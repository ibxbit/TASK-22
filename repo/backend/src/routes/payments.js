const express      = require('express');
const router       = express.Router();
const { pay, getLedgerEntries, refund, walletSummary } = require('../controllers/paymentController');
const validate     = require('../middleware/validate');
const schemas      = require('../validation/schemas');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

router.use(auth);

router.post('/',                requireRole(['admin', 'manager', 'finance']), validate(schemas.processPayment), pay);
router.get('/wallet',           requireRole(['admin', 'manager', 'finance']), walletSummary);
router.get('/ledger/:orderId',  requireRole(['admin', 'manager', 'finance', 'salesperson']), getLedgerEntries);
router.post('/:id/refund',      requireRole(['admin', 'finance']), validate(schemas.refundPayment), refund);

module.exports = router;
