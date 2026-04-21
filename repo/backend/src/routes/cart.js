const express  = require('express');
const router   = express.Router();
const { addToCart, checkout } = require('../controllers/cartController');
const validate = require('../middleware/validate');
const schemas  = require('../validation/schemas');
const auth     = require('../middleware/auth');

router.use(auth);

router.post('/add',      validate(schemas.addToCart), addToCart);
router.post('/checkout', validate(schemas.checkout),  checkout);

module.exports = router;
