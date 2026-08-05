// ════════════════════════════════════════════════════════════════
// IOC Hunt — Role-Based Access Control (RBAC) Middleware
// ════════════════════════════════════════════════════════════════
// Enforces hierarchical role checks and granular permissions
// ════════════════════════════════════════════════════════════════

const { normalizeRole, isRoleAboveOrEqual, hasPermission } = require('../config/roles');

/**
 * Middleware generator that ensures the session role meets or exceeds the required role.
 * Accepts an array of roles or a single role string.
 */
function requireRole(allowedRoles) {
  const rolesList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function (req, res, next) {
    const userRole = req.session && req.session.role ? req.session.role : null;
    if (!userRole) {
      return res.status(401).json({ error: 'Unauthenticated: valid session required' });
    }

    const normUserRole = normalizeRole(userRole);

    // Check if the user role matches or is above any of the allowed roles
    const isPermitted = rolesList.some(r => isRoleAboveOrEqual(normUserRole, r));

    if (isPermitted) {
      return next();
    }

    return res.status(403).json({
      error: 'Forbidden: Insufficient privileges for this resource',
      requiredRoles: rolesList,
      currentRole: normUserRole
    });
  };
}

/**
 * Middleware generator that ensures user has a specific granular permission
 */
function requirePermission(permission) {
  return function (req, res, next) {
    const userRole = req.session && req.session.role ? req.session.role : null;
    if (!userRole) {
      return res.status(401).json({ error: 'Unauthenticated: valid session required' });
    }

    if (hasPermission(userRole, permission)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Missing required permission '${permission}'`,
      currentRole: normalizeRole(userRole)
    });
  };
}

module.exports = {
  requireRole,
  requirePermission
};
