const User    = require('../models/User');
const { sign } = require('../config/jwt');

const TOKEN_TTL = 3600; // 1 hour

async function login(req, res) {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ error: 'User not found' });

    const token = sign({
      userId:      user._id.toString(),
      role:        user.role,
      dealershipId: user.dealershipId ? user.dealershipId.toString() : null,
    }, TOKEN_TTL);

    return res.json({
      token,
      expiresIn: TOKEN_TTL,
      user: {
        id:          user._id,
        name:        user.name,
        role:        user.role,
        dealershipId: user.dealershipId ?? null,
      },
    });
  } catch {
    return res.status(400).json({ error: 'Invalid userId' });
  }
}

module.exports = { login };
