const User            = require('../models/User');
const Document        = require('../models/Document');
const ConsentRecord   = require('../models/ConsentRecord');
const AnalyticsEvent  = require('../models/AnalyticsEvent');
const DeletionRequest = require('../models/DeletionRequest');

const SCOPE_HANDLERS = {
  profile:   userId => User.findByIdAndDelete(userId),
  documents: userId => Document.deleteMany({ uploadedBy: userId }),
  consent:   userId => ConsentRecord.deleteMany({ userId }),
  analytics: userId => AnalyticsEvent.deleteMany({ userId }),
  // Orders reference sessions, not userId directly — financial retention applies
  orders:    () => Promise.resolve(),
};

async function executeRequest(request) {
  const scopes = request.scope.includes('all')
    ? Object.keys(SCOPE_HANDLERS)
    : request.scope;

  const errors = [];
  for (const scope of scopes) {
    const handler = SCOPE_HANDLERS[scope];
    if (!handler) continue;
    try {
      await handler(request.userId);
    } catch (err) {
      errors.push(`${scope}: ${err.message}`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('; '));
}

async function processDueDeletions() {
  const now = new Date();
  const due = await DeletionRequest.find({
    status:      'pending',
    scheduledAt: { $lte: now },
  }).lean();

  let processed = 0;
  let failed    = 0;

  for (const req of due) {
    // Mark processing before executing — prevents duplicate runs on retry
    await DeletionRequest.findByIdAndUpdate(req._id, { $set: { status: 'processing' } });

    try {
      await executeRequest(req);
      await DeletionRequest.findByIdAndUpdate(req._id, {
        $set: { status: 'completed', executedAt: new Date() },
      });
      processed++;
    } catch (err) {
      await DeletionRequest.findByIdAndUpdate(req._id, {
        $set: { status: 'pending', notes: `Execution failed: ${err.message}` },
      });
      console.error(`[deletion] Request ${req._id} failed:`, err.message);
      failed++;
    }
  }

  return { processed, failed, total: due.length };
}

module.exports = { processDueDeletions };
