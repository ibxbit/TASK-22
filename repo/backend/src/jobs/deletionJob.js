const cron = require('node-cron');
const { processDueDeletions } = require('../services/deletionService');

function startJob() {
  // Nightly at 01:00 — after reconciliation (00:00)
  cron.schedule('0 1 * * *', async () => {
    console.log('[deletion] Starting nightly deletion run...');
    try {
      const result = await processDueDeletions();
      console.log(`[deletion] Completed — ${result.processed} processed, ${result.failed} failed of ${result.total} due`);
    } catch (err) {
      console.error('[deletion] Run failed:', err.message);
    }
  });

  console.log('[deletion] Job scheduled (nightly 01:00)');
}

module.exports = { startJob };
