const crypto = require('crypto');

const WINDOW_MS = 5 * 60 * 1000; // 5-minute anti-replay window

// In-memory nonce store; entries older than WINDOW_MS are purged on each request
const usedNonces = new Map();

function purgeExpiredNonces() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [nonce, ts] of usedNonces.entries()) {
    if (ts < cutoff) usedNonces.delete(nonce);
  }
}

/**
 * Signature payload: `${METHOD}:${path}:${timestamp}:${nonce}:${sha256(body)}`
 *
 * Client must send:
 *   X-Timestamp  — Unix epoch seconds (integer)
 *   X-Nonce      — unique string per request
 *   X-Signature  — hex HMAC-SHA256 of the payload using HMAC_SECRET
 */
function hmacAuth(req, res, next) {
  const timestamp = req.headers['x-timestamp'];
  const nonce     = req.headers['x-nonce'];
  const signature = req.headers['x-signature'];

  if (!timestamp || !nonce || !signature) {
    return res.status(401).json({
      success: false,
      error: { code: 'MISSING_SIGNATURE', message: 'x-timestamp, x-nonce, x-signature headers are required' },
    });
  }

  // Timestamp within window
  const tsMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(tsMs) || Math.abs(Date.now() - tsMs) > WINDOW_MS) {
    return res.status(401).json({
      success: false,
      error: { code: 'REPLAY_EXPIRED', message: 'Request outside the 5-minute anti-replay window' },
    });
  }

  // Nonce uniqueness
  purgeExpiredNonces();
  if (usedNonces.has(nonce)) {
    return res.status(401).json({
      success: false,
      error: { code: 'REPLAY_DETECTED', message: 'Nonce already used — replay attack blocked' },
    });
  }

  // HMAC verification
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    console.error('[hmac] HMAC_SECRET not configured');
    return res.status(500).json({ success: false, error: { code: 'CONFIG_ERROR', message: 'Server authentication misconfigured' } });
  }

  const bodyHash = crypto
    .createHash('sha256')
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex');

  const urlPath   = req.originalUrl.split('?')[0];
  const payload  = `${req.method}:${urlPath}:${timestamp}:${nonce}:${bodyHash}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const a = Buffer.from(signature, 'hex');
    const b = Buffer.from(expected,  'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' },
    });
  }

  usedNonces.set(nonce, Date.now());
  next();
}

module.exports = hmacAuth;
