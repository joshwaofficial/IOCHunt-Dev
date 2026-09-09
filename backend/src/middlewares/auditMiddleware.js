// ════════════════════════════════════════════════════════════════
// IOC Hunt — Security Audit Middleware
// ════════════════════════════════════════════════════════════════
// Monitors API error responses (4xx/5xx) and tracks unusual traffic
// patterns targeting authentication endpoints (/api/auth/*).
// Explicitly bypasses agent ingestion pipelines (/api/logs, /api/policy)
// so legitimate agent telemetry is never impacted.
// ════════════════════════════════════════════════════════════════

const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');

// Sliding window store for auth endpoint frequency tracking
const authTracker = new Map(); // ip -> [timestamps]

// Clean up stale IP records every 5 minutes to prevent memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of authTracker.entries()) {
    const recent = timestamps.filter(t => now - t < 60000);
    if (recent.length === 0) {
      authTracker.delete(ip);
    } else {
      authTracker.set(ip, recent);
    }
  }
}, 300000);
if (cleanupTimer.unref) cleanupTimer.unref();

function auditMiddleware(req, res, next) {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const reqPath = req.originalUrl || req.url;
  const isAuthRoute = reqPath.startsWith('/api/auth') && req.method === 'POST';

  // 1. Monitor Authentication Burst Patterns (Login protection)
  if (isAuthRoute) {
    const now = Date.now();
    const timestamps = authTracker.get(clientIp) || [];
    timestamps.push(now);

    // Keep only last 60 seconds
    const lastMinute = timestamps.filter(t => now - t <= 60000);
    authTracker.set(clientIp, lastMinute);

    // Burst pattern: >5 attempts within 10 seconds
    const last10s = lastMinute.filter(t => now - t <= 10000);
    if (last10s.length === 6) {
      logSecurityEvent({
        event: EVENTS.TRAFFIC_SUSPICIOUS_PATTERN,
        severity: SEVERITY.WARN,
        ip: clientIp,
        tenant: req.tenantId || 'default',
        detail: {
          pattern: 'RAPID_AUTH_BURST',
          message: 'More than 5 auth requests received within 10 seconds',
          path: reqPath,
          count: last10s.length
        }
      });
    }

    // High frequency pattern: >20 attempts within 60 seconds
    if (lastMinute.length === 21) {
      logSecurityEvent({
        event: EVENTS.TRAFFIC_SUSPICIOUS_PATTERN,
        severity: SEVERITY.WARN,
        ip: clientIp,
        tenant: req.tenantId || 'default',
        detail: {
          pattern: 'HIGH_FREQUENCY_AUTH',
          message: 'More than 20 auth requests received within 60 seconds',
          path: reqPath,
          count: lastMinute.length
        }
      });
    }
  }

  // 2. Response Hook: Monitor 4xx and 5xx API Errors
  res.on('finish', () => {
    const statusCode = res.statusCode;

    // Server errors (5xx)
    if (statusCode >= 500) {
      logSecurityEvent({
        event: EVENTS.API_ERROR_5XX,
        severity: SEVERITY.ERROR,
        ip: clientIp,
        user: req.user?.username || null,
        tenant: req.tenantId || 'default',
        detail: {
          method: req.method,
          path: reqPath,
          statusCode,
          statusMessage: res.statusMessage
        }
      });
    }
    // Auth & Permission errors (401, 403, 429) or failures on auth routes
    else if (statusCode === 401 || statusCode === 403 || statusCode === 429 || (isAuthRoute && statusCode >= 400)) {
      logSecurityEvent({
        event: statusCode === 429 ? EVENTS.TRAFFIC_RATE_LIMITED : EVENTS.API_ERROR_4XX,
        severity: SEVERITY.WARN,
        ip: clientIp,
        user: req.user?.username || null,
        tenant: req.tenantId || 'default',
        detail: {
          method: req.method,
          path: reqPath,
          statusCode
        }
      });
    }
  });

  next();
}

module.exports = auditMiddleware;
