const express      = require('express');
const router       = express.Router();
const validate     = require('../middleware/validate');
const schemas      = require('../validation/schemas');
const { trackEvent, getTrendingKeywords, getEvents } = require('../controllers/analyticsController');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

// Public: trending keywords used on the search page without requiring login
router.get('/trending', getTrendingKeywords);

// All other analytics routes require auth
router.use(auth);

router.post('/event',   validate(schemas.trackEvent), trackEvent);
router.get('/events',   requireRole(['admin', 'manager']), getEvents);

module.exports = router;
