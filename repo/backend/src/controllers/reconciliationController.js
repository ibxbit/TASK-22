const ReconciliationLog    = require('../models/ReconciliationLog');
const ReconciliationLedger = require('../models/ReconciliationLedger');
const DiscrepancyTicket    = require('../models/DiscrepancyTicket');
const { runReconciliation } = require('../services/reconciliationService');

const VALID_TICKET_STATUSES = new Set(['open', 'resolved']);
const VALID_TICKET_TYPES    = new Set([
  'missing_invoice', 'missing_settlement', 'amount_mismatch',
  'orphaned_invoice', 'orphaned_settlement',
]);

async function triggerRun(req, res) {
  try {
    const log = await runReconciliation();
    return res.status(201).json({ log });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getLogs(req, res) {
  try {
    const logs = await ReconciliationLog.find({})
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getRunLedger(req, res) {
  try {
    const { runId } = req.params;
    const { status } = req.query;

    const filter = { runId };
    if (status) {
      if (!VALID_TICKET_STATUSES.has(status) && status !== 'matched' &&
          !['missing_invoice', 'missing_settlement', 'amount_mismatch',
            'orphaned_invoice', 'orphaned_settlement'].includes(status)) {
        return res.status(400).json({ error: `Invalid status filter: ${status}` });
      }
      filter.status = status;
    }

    const records = await ReconciliationLedger.find(filter)
      .sort({ createdAt: 1 })
      .lean();
    return res.json({ records });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getTickets(req, res) {
  try {
    const { status, logId, type } = req.query;

    const filter = {};

    if (status && status !== 'all') {
      if (!VALID_TICKET_STATUSES.has(status)) {
        return res.status(400).json({ error: `Invalid status: ${status}. Use 'open', 'resolved', or 'all'` });
      }
      filter.status = status;
    } else if (!status) {
      filter.status = 'open';
    }

    if (logId) filter.reconciliationLogId = logId;

    if (type) {
      if (!VALID_TICKET_TYPES.has(type)) {
        return res.status(400).json({ error: `Invalid type: ${type}` });
      }
      filter.type = type;
    }

    const tickets = await DiscrepancyTicket.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ tickets });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function resolveTicket(req, res) {
  try {
    const { resolution = '' } = req.body || {};

    const ticket = await DiscrepancyTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.status === 'resolved') return res.json({ ticket: ticket.toObject() });

    ticket.status     = 'resolved';
    ticket.resolvedAt = new Date();
    if (resolution) ticket.resolution = resolution.trim();
    await ticket.save();

    console.log(`[reconciliation] Ticket ${ticket._id} resolved (type: ${ticket.type}): ${resolution || '(no note)'}`);

    return res.json({ ticket: ticket.toObject() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { triggerRun, getLogs, getRunLedger, getTickets, resolveTicket };
