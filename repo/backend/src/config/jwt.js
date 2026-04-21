const crypto = require('crypto');

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  .toString('base64url');

function sign(payload, expiresInSeconds = 3600) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }))
    .toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${HEADER_B64}.${body}`)
    .digest('base64url');
  return `${HEADER_B64}.${body}.${sig}`;
}

function verify(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  if (!token || typeof token !== 'string') throw new Error('Invalid token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [h, body, sig] = parts;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${h}.${body}`)
    .digest('base64url');

  // Constant-time compare — both strings are base64url so same charset/length means equal bytes
  const sBuf = Buffer.from(sig,      'base64url');
  const eBuf = Buffer.from(expected, 'base64url');
  if (sBuf.length !== eBuf.length || !crypto.timingSafeEqual(sBuf, eBuf)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

module.exports = { sign, verify };
