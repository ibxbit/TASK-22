const express      = require('express');
const router       = express.Router();
const {
  createExperiment,
  listExperiments,
  getExperiment,
  updateStatus,
  rollback,
  assign,
  getResults,
} = require('../controllers/experimentController');
const validate     = require('../middleware/validate');
const schemas      = require('../validation/schemas');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

router.use(auth);

router.post('/',             requireRole(['admin']), validate(schemas.createExperiment),        createExperiment);
router.get('/',              requireRole(['admin', 'manager']),                                 listExperiments);
router.get('/:id',           requireRole(['admin', 'manager']),                                 getExperiment);
router.patch('/:id/status',  requireRole(['admin']), validate(schemas.updateExperimentStatus),  updateStatus);
router.post('/:id/rollback', requireRole(['admin']),                                            rollback);
router.post('/assign',       validate(schemas.assignExperiment),                                assign);
router.get('/:id/results',   requireRole(['admin', 'manager']),                                 getResults);

module.exports = router;
