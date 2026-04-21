const express    = require('express');
const router     = express.Router();
const { login }  = require('../controllers/authController');

// POST /auth/token — exchange a userId for a signed JWT
router.post('/token', login);

module.exports = router;
