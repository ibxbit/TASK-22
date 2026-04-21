const { track, queryEvents } = require('../services/analyticsService');
const { getTrending }         = require('../services/trendingService');

async function trackEvent(req, res) {
  try {
    const { sessionId, dealershipId, eventType, category, entityType, entityId, properties } = req.body;

    track({
      sessionId,
      userId:       req.user?._id || null,
      dealershipId: dealershipId  || req.user?.dealershipId || null,
      eventType,
      category,
      entityType:   entityType || null,
      entityId:     entityId   || null,
      properties:   properties || {},
    });

    return res.status(202).json({ tracked: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getTrendingKeywords(req, res) {
  try {
    const keywords = await getTrending();
    return res.json({ keywords });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getEvents(req, res) {
  try {
    const { category, eventType, from, to, limit } = req.query;
    // Non-admin users can only see events for their own dealership
    const dealershipId = req.user.role === 'admin'
      ? req.query.dealershipId
      : req.user.dealershipId?.toString();
    const events = await queryEvents({ category, eventType, dealershipId, from, to, limit });
    return res.json({ events });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { trackEvent, getTrendingKeywords, getEvents };
