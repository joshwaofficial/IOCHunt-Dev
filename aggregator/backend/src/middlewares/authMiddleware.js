const db = require('../config/db');

/**
 * Parses the session cookie from the request headers
 * @param {Object} req - Express request object
 * @returns {string|null} The session token or null
 */
function parseSessionCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === 'iochunt_session') return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * Retrieves a valid session from the database
 * @param {string} token - Session token
 * @returns {Object|null} Session data including user force_password_change flag
 */
async function getSession(token) {
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    const res = await db.query(`
      SELECT s.token, s.user_id, s.username, s.expires_at, u.role, u.force_password_change 
      FROM sessions s 
      JOIN users u ON u.id = s.user_id 
      WHERE s.token = $1 AND s.expires_at > $2
    `, [token, now]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('[AUTH DEBUG] getSession error:', err);
    return null;
  }
}

/**
 * Express middleware to ensure a valid session exists
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
  
  // Enforce password change strictly
  if (session.force_password_change && req.path !== '/change-password' && req.path !== '/logout') {
    return res.status(403).json({ 
      error: 'Forbidden: Password change required', 
      force_password_change: true 
    });
  }

  next();
}

/**
 * Express middleware to validate API key for agent ingestion
 */
function requireKey(req, res, next) {
  const API_KEY = process.env.API_KEY || process.env.AGGREGATOR_API_KEY || 'iochunt-agent-key-2024';
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key) return res.status(401).json({ error: 'Unauthorized' });
  const cleanKey = key.trim();
  if (cleanKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * Express middleware that allows either valid agent API key OR a valid dashboard session
 */
async function requireSessionOrKey(req, res, next) {
  const API_KEY = process.env.API_KEY || process.env.AGGREGATOR_API_KEY || 'iochunt-agent-key-2024';
  const key = req.headers['x-api-key'] || req.query.key;
  if (key) {
    const cleanKey = key.trim();
    if (cleanKey === API_KEY) {
      return next();
    }
  }
  return requireSession(req, res, next);
}

/**
 * Express middleware to ensure the user has admin privileges
 */
function requireAdmin(req, res, next) {
  const role = req.session?.role?.toLowerCase();
  if (!req.session || (role !== 'admin' && role !== 'aggregator')) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }
  next();
}

module.exports = {
  requireSession,
  requireAdmin,
  requireKey,
  requireSessionOrKey
};
