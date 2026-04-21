const User            = require('../models/User');
const Document        = require('../models/Document');
const ConsentRecord   = require('../models/ConsentRecord');
const AnalyticsEvent  = require('../models/AnalyticsEvent');
const AuditLog        = require('../models/AuditLog');
const DeletionRequest = require('../models/DeletionRequest');

const RETENTION_DAYS = 30;

async function recordConsent(req, res) {
  try {
    const { type, version, consentGiven, consentText, orderId } = req.body;

    const record = await ConsentRecord.create({
      userId:       req.user._id,
      dealershipId: req.user.dealershipId,
      orderId:      orderId || null,
      type,
      version,
      consentGiven,
      consentText:  consentText || null,
      ipAddress:    req.ip || null,
      userAgent:    req.headers['user-agent'] || null,
    });

    return res.status(201).json({ record: record.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getConsentHistory(req, res) {
  try {
    const rawRecords = await ConsentRecord.find({ userId: req.user._id })
      .sort({ givenAt: -1 });
    const records = rawRecords.map(r => r.toObject());
    return res.json({ records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function exportData(req, res) {
  try {
    const userId = req.user._id;

    const [user, documents, consentRecords, analyticsEvents, auditLogs] = await Promise.all([
      User.findById(userId).select('-__v').lean(),
      Document.find({ uploadedBy: userId }).lean(),
      ConsentRecord.find({ userId }),
      AnalyticsEvent.find({ userId }).lean(),
      AuditLog.find({ userId }).lean(),
    ]);

    return res.json({
      exportedAt: new Date().toISOString(),
      user,
      documents,
      consentRecords,
      analyticsEvents,
      auditLogs,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function requestDeletion(req, res) {
  try {
    const { scope = ['all'], notes } = req.body;
    const userId = req.user._id;

    // Prevent duplicate pending requests
    const existing = await DeletionRequest.findOne({ userId, status: 'pending' });
    if (existing) {
      return res.status(409).json({ error: 'A pending deletion request already exists' });
    }

    const requestedAt = new Date();
    const scheduledAt = new Date(requestedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const request = await DeletionRequest.create({
      userId,
      requestedBy: userId,
      scope,
      requestedAt,
      scheduledAt,
      notes: notes || null,
    });

    return res.status(201).json({
      request: request.toObject(),
      message: `Data deletion scheduled for ${scheduledAt.toISOString()} (${RETENTION_DAYS}-day hold)`,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getDeletionRequests(req, res) {
  try {
    const requests = await DeletionRequest.find({ userId: req.user._id })
      .sort({ requestedAt: -1 })
      .lean();
    return res.json({ requests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function cancelDeletionRequest(req, res) {
  try {
    const request = await DeletionRequest.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!request) return res.status(404).json({ error: 'Deletion request not found' });
    if (request.status !== 'pending') {
      return res.status(409).json({ error: `Cannot cancel a request in '${request.status}' state` });
    }

    request.status = 'cancelled';
    await request.save();

    return res.json({ request: request.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  recordConsent,
  getConsentHistory,
  exportData,
  requestDeletion,
  getDeletionRequests,
  cancelDeletionRequest,
};
