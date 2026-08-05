// ════════════════════════════════════════════════════════════════
// IOC Hunt — Role-Based Access Control Definitions
// ════════════════════════════════════════════════════════════════

const ROLES = {
  ADMIN: 'ADMIN',
  L3_ANALYST: 'L3_ANALYST',
  L2_ANALYST: 'L2_ANALYST',
  L1_ANALYST: 'L1_ANALYST',
  VIEWER: 'VIEWER'
};

const ROLE_HIERARCHY = [
  ROLES.VIEWER,
  ROLES.L1_ANALYST,
  ROLES.L2_ANALYST,
  ROLES.L3_ANALYST,
  ROLES.ADMIN
];

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    'view_dashboard',
    'view_logs',
    'manage_incidents',
    'manage_policies',
    'manage_aggregators',
    'manage_users',
    'manage_smtp',
    'manage_reports'
  ],
  [ROLES.L3_ANALYST]: [
    'view_dashboard',
    'view_logs',
    'manage_incidents',
    'manage_policies',
    'manage_reports'
  ],
  [ROLES.L2_ANALYST]: [
    'view_dashboard',
    'view_logs',
    'manage_incidents',
    'view_reports'
  ],
  [ROLES.L1_ANALYST]: [
    'view_dashboard',
    'view_logs',
    'view_incidents',
    'view_reports'
  ],
  [ROLES.VIEWER]: [
    'view_dashboard',
    'view_logs'
  ]
};

function normalizeRole(roleStr) {
  if (!roleStr) return ROLES.VIEWER;
  const upper = roleStr.toString().trim().toUpperCase();
  if (upper === 'ADMIN' || upper === 'SUPERADMIN' || upper === 'AGGREGATOR_ADMIN' || upper === 'BRANCH_ADMIN') return ROLES.ADMIN;
  if (upper === 'L3_ANALYST' || upper === 'L3') return ROLES.L3_ANALYST;
  if (upper === 'L2_ANALYST' || upper === 'L2') return ROLES.L2_ANALYST;
  if (upper === 'L1_ANALYST' || upper === 'L1') return ROLES.L1_ANALYST;
  if (upper === 'VIEWER') return ROLES.VIEWER;
  return ROLES.VIEWER;
}

function isRoleAboveOrEqual(userRole, requiredRole) {
  const normUser = normalizeRole(userRole);
  const normReq = normalizeRole(requiredRole);
  const userIdx = ROLE_HIERARCHY.indexOf(normUser);
  const reqIdx = ROLE_HIERARCHY.indexOf(normReq);
  return userIdx >= reqIdx;
}

function hasPermission(userRole, permission) {
  const normRole = normalizeRole(userRole);
  const perms = ROLE_PERMISSIONS[normRole] || [];
  return perms.includes(permission);
}

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  normalizeRole,
  isRoleAboveOrEqual,
  hasPermission,
  getValidRoles: () => Object.values(ROLES)
};
