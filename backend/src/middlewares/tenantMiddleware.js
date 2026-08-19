// ════════════════════════════════════════════════════════════════
// IOC Hunt — Database Context & Query Router Middleware (SaaS)
// ════════════════════════════════════════════════════════════════
// Attaches two query helpers to every request:
//   req.queryControlPlane(sql, params) → Control plane DB (sessions, tenants, config)
//   req.queryTenant(sql, params)       → Tenant-specific DB (events, machines, incidents)
//
// The tenant is resolved from req.tenantId which is set by authMiddleware
// from the authenticated session. NEVER from a client-supplied header.
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const tenantDbManager = require('../config/tenantDbManager');

/**
 * Attaches convenient query execution helpers to the express request object.
 * 
 * Usage in controllers:
 *   await req.queryControlPlane('SELECT * FROM tenants WHERE ...', [params])
 *   await req.queryTenant('SELECT * FROM events WHERE ...', [params])
 */
function databaseContext(req, res, next) {
  // ── Control Plane Queries ───────────────────────────────────
  // For: sessions, tenants, super_admins, audit_log, syslog_port_map
  req.queryControlPlane = (text, params = []) => {
    return db.query(text, params);
  };

  // Legacy alias: req.queryDb still works for control plane queries
  req.queryDb = req.queryControlPlane;

  const { isAggregator, isOnPrem } = require('../config/appMode');

  // ── Tenant-Specific Queries ─────────────────────────────────
  // For: events, fw_events, machines, incidents, policies, groups, etc.
  // Uses the tenant_id from the authenticated session to route to the correct DB.
  req.queryTenant = async (text, params = []) => {
    if (isAggregator() || isOnPrem()) {
      return db.query(text, params);
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new Error('No tenant context available. User must be authenticated with a workspace.');
    }
    return tenantDbManager.queryTenant(tenantId, text, params);
  };

  // ── Get Tenant Pool (for advanced use cases) ────────────────
  // For: transactions, COPY, streaming queries
  req.getTenantPool = async () => {
    if (isAggregator() || isOnPrem()) {
      return db;
    }
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new Error('No tenant context available.');
    }
    return tenantDbManager.getTenantPool(tenantId);
  };

  next();
}

module.exports = {
  databaseContext,
  tenantContext: databaseContext // Alias for backwards compatibility
};
