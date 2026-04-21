const mongoose  = require('mongoose');
const { verify } = require('../config/jwt');

// Verifies the signed JWT from the Authorization: Bearer header.
// Populates req.user with { _id, role, dealershipId } — same shape as before.
// The token is issued by POST /auth/token and cannot be forged without JWT_SECRET.
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }
  try {
    const payload = verify(header.slice(7));
    req.user = {
      _id:          new mongoose.Types.ObjectId(payload.userId),
      role:         payload.role,
      dealershipId: payload.dealershipId
        ? new mongoose.Types.ObjectId(payload.dealershipId)
        : null,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = auth;
