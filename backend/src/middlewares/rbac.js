// backend/src/middlewares/rbac.js
// Role-Based Access Control middleware
// Supports roles: admin, L3, L2, L1, viewer
// Usage: router.get('/protected', requireRole(['admin', 'L3']), handler);

module.exports = {
  /**
   * Middleware generator that ensures the current session role is one of the allowedRoles.
   * @param {Array<string>} allowedRoles - List of role strings permitted to access the route.
   * @returns {function(req, res, next)} Express middleware.
   */
  requireRole: function (allowedRoles) {
    const rolesSet = new Set(allowedRoles.map(r => r.toLowerCase()));
    return function (req, res, next) {
      const userRole = (req.session && req.session.role) ? req.session.role.toLowerCase() : null;
      if (!userRole) {
        return res.status(401).json({ error: 'Unauthenticated: session missing' });
      }
      if (rolesSet.has(userRole)) {
        return next();
      }
      // For hierarchical roles, allow higher privilege to access lower privilege routes
      const hierarchy = ['viewer', 'l1_analyst', 'l2_analyst', 'l3_analyst', 'admin'];
      const userIdx = hierarchy.indexOf(userRole);
      const minIdx = Math.min(...Array.from(rolesSet).map(r => hierarchy.indexOf(r)));
      if (userIdx >= minIdx && userIdx !== -1) {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    };
  }
};
