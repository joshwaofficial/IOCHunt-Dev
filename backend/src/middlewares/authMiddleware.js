// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication & Key Validation Middleware
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const db = require('../config/db');
const { normalizeRole, isRoleAboveOrEqual } = require('../config/roles');
const appMode = require('../config/appMode');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Parses the session cookie or authorization token from request headers
 */
function parseSessionCookie(req) {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. Check X-Session-Token custom header
  if (req.headers['x-session-token']) {
    return req.headers['x-session-token'].trim();
  }

  // 3. Check Cookie headers
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === 'iochunt_session') return decodeURIComponent(v.join('='));
  }

  // 4. Check parsed req.cookies if cookie-parser is active
  if (req.cookies?.iochunt_session) {
    return req.cookies.iochunt_session;
  }

  return null;
}

/**
 * Retrieves a valid session from the control plane database.
 * Sessions now include tenant_id for multi-tenant routing.
 */
async function getSession(token) {
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    const res = await db.query(`
      SELECT s.token, s.user_id, s.username, s.expires_at, s.role, s.tenant_id,
             s.force_password_change, s.aggregator_name, s.display_name,
             s.last_activity_at, s.idle_timeout_mins, s.user_agent, s.ip_address
      FROM sessions s
      WHERE s.token = $1 AND s.expires_at > $2
    `, [token, now]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('[AUTH] getSession error:', err.message);
    return null;
  }
}

/**
 * Express middleware to ensure a valid session exists and enforces mandatory password change.
 * Sets req.tenantId from the session's tenant_id — this is the SOLE source of truth
 * for which tenant database to route queries to.
 */
async function requireSession(req, res, next) {
  const token = parseSessionCookie(req) || req.cookies?.iochunt_session;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session token provided' });
  }

  const session = await getSession(token);
  if (!session) {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
    logSecurityEvent({
      event: EVENTS.API_ERROR_4XX,
      severity: SEVERITY.WARN,
      ip: clientIp,
      detail: {
        path: req.originalUrl || req.url,
        reason: 'Invalid or expired session token presented'
      }
    });
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Idle Inactivity Check (if configured > 0)
  const idleTimeoutMins = Number(session.idle_timeout_mins) || 0;
  if (idleTimeoutMins > 0) {
    const lastActivity = Number(session.last_activity_at) || 0;
    const idleSeconds = now - lastActivity;
    if (idleSeconds > idleTimeoutMins * 60) {
      await db.query('DELETE FROM sessions WHERE token = $1', [token]);
      const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
      logSecurityEvent({
        event: 'SESSION_IDLE_TIMEOUT',
        severity: SEVERITY.WARN,
        ip: clientIp,
        user: session.username,
        tenant: session.tenant_id || req.tenantId || 'default',
        detail: `Session automatically invalidated after ${Math.floor(idleSeconds / 60)}m inactivity (threshold: ${idleTimeoutMins}m)`
      });
      return res.status(401).json({ error: 'Session expired due to inactivity', reason: 'inactivity_timeout' });
    }
  }

  // 2. User-Agent Fingerprint Validation (prevents session hijacking)
  const clientUserAgent = req.headers['user-agent'] || 'unknown';
  if (session.user_agent && session.user_agent !== 'unknown' && session.user_agent !== clientUserAgent) {
    return res.status(401).json({ error: 'Session anomaly detected: User-Agent mismatch' });
  }

  // 3. Activity sliding: update last_activity_at once every 60s for non-passive endpoints
  const passivePaths = ['/api/stream', '/api/ping', '/api/auth/keep-alive'];
  if (!passivePaths.includes(req.path)) {
    const lastAct = Number(session.last_activity_at) || 0;
    if (now - lastAct > 60) {
      db.query('UPDATE sessions SET last_activity_at = $1 WHERE token = $2', [now, token]).catch(() => {});
    }
  }

  req.session = session;
  // Set tenant context from the authenticated session (NEVER from client input)
  req.tenantId = session.tenant_id || null;

  // Enforce password change strictly: only allow password change and logout endpoints
  const isAllowedPath = req.path === '/change-password' || req.path === '/logout' || req.path === '/me';
  if ((session.force_password_change === 1 || session.force_password_change === true) && !isAllowedPath) {
    return res.status(403).json({
      error: 'Forbidden: Mandatory password change required before accessing the system',
      force_password_change: true
    });
  }

  next();
}

/**
 * Express middleware to validate API key for agent log ingestion and aggregator syncing.
 * Queries the control plane `tenants` table to map the API key to a specific tenant database.
 */
async function requireKey(req, res, next) {
  let key = req.headers['x-api-key'] || req.headers['x-aggregator-key'] || req.query.key;
  
  if (!key && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    key = req.headers.authorization.split(' ')[1];
  }

  if (!key) {
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
    logSecurityEvent({
      event: EVENTS.TRAFFIC_INVALID_KEY,
      severity: SEVERITY.WARN,
      ip: clientIp,
      detail: {
        path: req.originalUrl || req.url,
        reason: 'Missing API key'
      }
    });
    return res.status(401).json({ error: 'Unauthorized: Missing API key' });
  }

  const cleanKey = key.trim();

  try {
    if (appMode.isAggregator()) {
      // Aggregator local validation: strictly allow only verified local key hash or central key
      const settingsRes = await db.query('SELECT agent_api_key_hash, central_api_key FROM settings WHERE id = 1');
      const localHash = settingsRes.rows[0]?.agent_api_key_hash;
      const centralKey = settingsRes.rows[0]?.central_api_key;
      
      if (
        (localHash && safeCompare(localHash, hash(cleanKey))) || 
        (centralKey && safeCompare(cleanKey, centralKey))
      ) {
        req.authType = 'aggregator_agent';
        // Aggregators only manage a single database
        req.tenantId = 'aggregator'; 
        return next();
      }
    } else {
      // Central Server multi-tenant validation
      const tenantRes = await db.query(
        'SELECT id, tenant_id, company_name, status FROM tenants WHERE api_key_hash = $1 AND status = $2',
        [hash(cleanKey), 'active']
      );
      if (tenantRes.rows.length > 0) {
        const tenant = tenantRes.rows[0];
        req.tenantId = tenant.tenant_id;
        req.authType = 'tenant_agent';
        return next();
      }
    }
  } catch (e) {
    console.error('[AUTH] Error checking API key in requireKey:', e.message);
  }

  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
  logSecurityEvent({
    event: EVENTS.TRAFFIC_INVALID_KEY,
    severity: SEVERITY.WARN,
    ip: clientIp,
    detail: {
      path: req.originalUrl || req.url,
      reason: 'Invalid API key provided'
    }
  });
  return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
}

/**
 * Express middleware that allows either valid agent/aggregator API key OR a valid dashboard session
 */
async function requireSessionOrKey(req, res, next) {
  let key = req.headers['x-api-key'] || req.headers['x-aggregator-key'] || req.query.key;
  
  if (!key && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    key = req.headers.authorization.split(' ')[1];
  }

  if (key) {
    const cleanKey = key.trim();
    try {
      if (appMode.isAggregator()) {
        const settingsRes = await db.query('SELECT agent_api_key_hash, central_api_key FROM settings WHERE id = 1');
        const localHash = settingsRes.rows[0]?.agent_api_key_hash;
        const centralKey = settingsRes.rows[0]?.central_api_key;
        if (
          (localHash && safeCompare(localHash, hash(cleanKey))) || 
          (centralKey && safeCompare(cleanKey, centralKey))
        ) {
          req.authType = 'aggregator_agent';
          req.tenantId = 'aggregator';
          return next();
        }
      } else {
        const tenantRes = await db.query(
          'SELECT id, tenant_id, company_name, status FROM tenants WHERE api_key_hash = $1 AND status = $2',
          [hash(cleanKey), 'active']
        );
        if (tenantRes.rows.length > 0) {
          const tenant = tenantRes.rows[0];
          req.tenantId = tenant.tenant_id;
          req.authType = 'tenant_agent';
          return next();
        }
      }
    } catch (e) {
      console.error('[AUTH] Error checking API key in requireSessionOrKey:', e.message);
    }
    // If a key was provided but we didn't return next(), it means the key is invalid as an API key.
    // However, it might be a valid session token (e.g., from the browser frontend sending a Bearer token).
    // We fall back to requireSession instead of immediately failing.
  }
  return requireSession(req, res, next);
}

/**
 * Express middleware to ensure the user has admin privileges
 */
function requireAdmin(req, res, next) {
  const role = req.session?.role;
  if (!req.session || !isRoleAboveOrEqual(role, 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Admin privileges required' });
  }
  next();
}

/**
 * Express middleware to ensure the user has analyst privileges
 */
function requireAnalyst(req, res, next) {
  const role = req.session?.role;
  if (!req.session || !isRoleAboveOrEqual(role, 'L1_ANALYST')) {
    return res.status(403).json({ error: 'Forbidden: Analyst privileges required' });
  }
  next();
}

module.exports = {
  parseSessionCookie,
  getSession,
  requireSession,
  requireAdmin,
  requireAnalyst,
  requireKey,
  requireSessionOrKey
};
