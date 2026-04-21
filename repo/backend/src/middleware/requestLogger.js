const RequestLog = require('../models/RequestLog');

const REDACTED = '[REDACTED]';
const SENSITIVE = new Set(['password', 'token', 'secret', 'authorization', 'apikey', 'api_key']);

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, SENSITIVE.has(k.toLowerCase()) ? REDACTED : v])
  );
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    const duration = Date.now() - start;
    const errMsg = res.statusCode >= 400
      ? (body?.error?.message || body?.error || null)
      : null;

    // Fire-and-forget — never blocks response delivery
    RequestLog.create({
      method:     req.method,
      path:       req.path,
      query:      sanitize(req.query),
      userId:     req.user?._id || null,
      statusCode: res.statusCode,
      duration,
      error:      typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg),
      ip:         req.ip || null,
    }).catch(err => console.error('[requestlog] persist failed:', err.message));

    return originalJson(body);
  };

  next();
}

module.exports = requestLogger;
