const express      = require('express');
const router       = express.Router();
const { invoicePreview, listTaxRates, upsertTaxRate } = require('../controllers/financeController');
const validate     = require('../middleware/validate');
const schemas      = require('../validation/schemas');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

router.use(auth);

router.get('/invoice-preview/:orderId', invoicePreview);
router.get('/tax-rates',               listTaxRates);
router.post('/tax-rates',              requireRole(['admin']), validate(schemas.upsertTaxRate), upsertTaxRate);

module.exports = router;
