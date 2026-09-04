// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication & Key Validation Middleware
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const db = require('../config/db');
const { normalizeRole, isRoleAboveOrEqual } = require('../config/roles');
const appMode = require('../config/appMode');

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
             s.force_password_change, s.aggregator_name, s.display_name
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
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
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
    return res.status(401).json({ error: 'Unauthorized: Missing API key' });
  }

  const cleanKey = key.trim();

  try {
    if (appMode.isAggregator()) {
      // Aggregator local validation: allow local hash, test key, central key, or any valid agent key
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
