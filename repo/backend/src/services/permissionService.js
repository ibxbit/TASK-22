const DocumentPermission = require('../models/DocumentPermission');
const RolePolicy         = require('../models/RolePolicy');

// Roles in ascending authority order.
// Each entry lists the roles whose policies apply when resolving access for
// that role — own policy first, then parent roles as fallback.
// This means: if a manager policy exists and no salesperson policy does,
// salesperson inherits the manager's actions for that document type.
const ROLE_CHAIN = {
  admin:       ['admin'],
  manager:     ['manager',     'admin'],
  salesperson: ['salesperson', 'manager', 'admin'],
  finance:     ['finance',     'manager', 'admin'],
  inspector:   ['inspector',   'manager', 'admin'],
};

function getRoleChain(role) {
  return ROLE_CHAIN[role] || [role];
}

/**
 * Resolves whether `user` may perform `action` on `document`.
 *
 * Resolution order (first match wins):
 *   0. Cross-dealership → always deny
 *   1. admin role       → always allow
 *   2. User-level document override
 *   3. Role-level document override
 *   4. Dealership role policy — walks up ROLE_CHAIN until a policy is found
 *   5. Default deny
 */
async function check(user, document, action) {
  // 0. Cross-dealership isolation
  if (document.dealershipId.toString() !== user.dealershipId.toString()) return false;

  // 1. admin bypasses all per-document and per-policy checks
  if (user.role === 'admin') return true;

  // 2. Explicit user-level override on this specific document
  const userOverride = await DocumentPermission.findOne({
    documentId:  document._id,
    subjectType: 'user',
    userId:      user._id,
  }).lean();
  if (userOverride) return userOverride.actions.includes(action);

  // 3. Explicit role-level override on this specific document
  const roleOverride = await DocumentPermission.findOne({
    documentId:  document._id,
    subjectType: 'role',
    role:        user.role,
  }).lean();
  if (roleOverride) return roleOverride.actions.includes(action);

  // 4. Dealership role policy — walk up hierarchy until a policy is found
  const chain = getRoleChain(user.role);
  for (const candidateRole of chain) {
    const policy = await RolePolicy.findOne({
      dealershipId: user.dealershipId,
      role:         candidateRole,
      documentType: document.type,
    }).lean();
    if (policy) return policy.actions.includes(action);
  }

  // 5. Default deny
  return false;
}

/**
 * Pre-document check (e.g., before upload). Walks the same role hierarchy.
 * admin always allowed; others follow ROLE_CHAIN fallback.
 */
async function checkType(user, documentType, action) {
  if (user.role === 'admin') return true;

  const chain = getRoleChain(user.role);
  for (const candidateRole of chain) {
    const policy = await RolePolicy.findOne({
      dealershipId: user.dealershipId,
      role:         candidateRole,
      documentType,
    }).lean();
    if (policy) return policy.actions.includes(action);
  }
  return false;
}

module.exports = { check, checkType, getRoleChain };
