const express      = require('express');
const router       = express.Router();
const { listSynonyms, upsertSynonym, deleteSynonym } = require('../controllers/synonymController');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

router.use(auth);

router.get('/',           listSynonyms);
router.put('/',           requireRole(['admin']), upsertSynonym);
router.delete('/:term',   requireRole(['admin']), deleteSynonym);

module.exports = router;
