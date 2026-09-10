// ════════════════════════════════════════════════════════════════
// IOC Hunt — Structured Security Event Logger
// ════════════════════════════════════════════════════════════════
// Emits SIEM-compliant JSON audit records for authentication,
// API anomalies, and suspicious traffic patterns.
// ════════════════════════════════════════════════════════════════

const SEVERITY = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

const EVENTS = {
  // Auth Events
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_MFA_SUCCESS: 'AUTH_MFA_SUCCESS',
  AUTH_MFA_FAILED: 'AUTH_MFA_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_SESSION_TAKEOVER: 'AUTH_SESSION_TAKEOVER',
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',

  // API Errors
  API_ERROR_4XX: 'API_ERROR_4XX',
  API_ERROR_5XX: 'API_ERROR_5XX',

  // Traffic / Access
  TRAFFIC_INVALID_KEY: 'TRAFFIC_INVALID_KEY',
  TRAFFIC_RATE_LIMITED: 'TRAFFIC_RATE_LIMITED',
  TRAFFIC_SUSPICIOUS_PATTERN: 'TRAFFIC_SUSPICIOUS_PATTERN'
};

/**
 * Emits a structured security event in JSON format
 * @param {Object} params
 * @param {string} params.event - Event type from EVENTS
 * @param {string} [params.severity] - INFO, WARN, ERROR, CRITICAL
 * @param {string} [params.ip] - Client IP address
 * @param {string} [params.user] - Username or User ID
 * @param {string} [params.tenant] - Tenant ID
 * @param {Object} [params.detail] - Arbitrary additional context
 */
function logSecurityEvent({ event, severity = SEVERITY.INFO, ip = 'unknown', user = null, tenant = 'default', detail = {} }) {
  const entry = {
    timestamp: new Date().toISOString(),
    logger: 'IOCHunt-Security',
    event,
    severity,
    ip,
    user: user || undefined,
    tenant: tenant || 'default',
    detail
  };

  const output = JSON.stringify(entry);

  if (severity === SEVERITY.ERROR || severity === SEVERITY.CRITICAL) {
    console.error(output);
  } else if (severity === SEVERITY.WARN) {
    console.warn(output);
  } else {
    console.log(output);
  }

  // Asynchronously persist AUTH events to control plane audit_log table
  try {
    const db = require('../config/db');
    if (db && db.query && typeof event === 'string' && (event.startsWith('AUTH_') || event.startsWith('SESSION_'))) {
      db.query(
        'INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          tenant || 'default',
          user || 'unknown',
          event,
          'sessions',
          typeof detail === 'object' ? JSON.stringify(detail) : String(detail || ''),
          ip || 'unknown',
          severity === SEVERITY.ERROR || severity === SEVERITY.CRITICAL ? 'FAILURE' : 'SUCCESS'
        ]
      ).catch(() => {});
    }
  } catch (_) {}

  return entry;
}

module.exports = {
  EVENTS,
  SEVERITY,
  logSecurityEvent
};
