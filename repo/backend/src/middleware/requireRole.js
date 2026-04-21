// Factory — returns middleware that allows only the specified roles.
// Must run after auth so req.user is populated.
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${req.user.role}' cannot perform this action`,
      });
    }
    next();
  };
}

module.exports = requireRole;
