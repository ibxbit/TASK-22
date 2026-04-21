const express  = require('express');
const router   = express.Router();
const { search } = require('../controllers/vehicleController');
const validate   = require('../middleware/validate');
const { vehicleSearch } = require('../validation/schemas');

router.get('/search', validate(vehicleSearch, 'query'), search);

module.exports = router;
