const express      = require('express');
const router       = express.Router();
const {
  triggerRun,
  getLogs,
  getRunLedger,
  getTickets,
  resolveTicket,
} = require('../controllers/reconciliationController');
const auth         = require('../middleware/auth');
const requireRole  = require('../middleware/requireRole');

// Reconciliation operates on cross-dealership financial data — admin only.
router.use(auth, requireRole(['admin']));

router.post('/run',                      triggerRun);
router.get('/logs',                      getLogs);
router.get('/logs/:runId/ledger',        getRunLedger);
router.get('/tickets',                   getTickets);
router.patch('/tickets/:id/resolve',     resolveTicket);

module.exports = router;
