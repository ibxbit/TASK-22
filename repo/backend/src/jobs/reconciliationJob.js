const cron = require('node-cron');
const { runReconciliation } = require('../services/reconciliationService');

function startJob() {
  // Nightly at 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[reconciliation] Starting nightly run...');
    try {
      const log = await runReconciliation();
      console.log(`[reconciliation] Completed — ${log.discrepancyCount} ticket(s) created`);
    } catch (err) {
      console.error('[reconciliation] Run failed:', err.message);
    }
  });

  console.log('[reconciliation] Job scheduled (nightly 00:00)');
}

module.exports = { startJob };
