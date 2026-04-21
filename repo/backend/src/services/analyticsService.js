const AnalyticsEvent = require('../models/AnalyticsEvent');

const EVENT_CATEGORIES = new Set(['listing', 'search', 'cart', 'checkout', 'document', 'payment', 'system']);

/**
 * Fire-and-forget — analytics recording must never block the main flow.
 * Errors are logged and swallowed.
 */
function track(data) {
  if (!data.sessionId || !data.eventType || !EVENT_CATEGORIES.has(data.category)) {
    return; // silently skip malformed events rather than throwing
  }

  AnalyticsEvent.create({
    sessionId:    data.sessionId,
    userId:       data.userId       || null,
    dealershipId: data.dealershipId || null,
    eventType:    data.eventType,
    category:     data.category,
    entityType:   data.entityType  || null,
    entityId:     data.entityId    || null,
    properties:   data.properties  || {},
  }).catch(err => console.error('[analytics] track failed:', err.message));
}

async function queryEvents({ category, eventType, dealershipId, from, to, limit = 100 } = {}) {
  const filter = {};
  if (category)     filter.category     = category;
  if (eventType)    filter.eventType    = eventType;
  if (dealershipId) filter.dealershipId = dealershipId;
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to)   filter.timestamp.$lte = new Date(to);
  }
  return AnalyticsEvent.find(filter)
    .sort({ timestamp: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();
}

module.exports = { track, queryEvents };
