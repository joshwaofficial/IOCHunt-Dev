// ════════════════════════════════════════════════════════════════
// IOC Hunt — Super Admin Standalone Control Plane Backend
// ════════════════════════════════════════════════════════════════
// SaaS Architecture: Manages tenant provisioning via dedicated
// logical databases. No Docker containers are spun up per tenant.
// All tenants share a fixed HTTPS port (8080) via NGINX load balancer.
// ════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  isString,
  isInteger,
  parseSafeInt,
  isDbIdentifier,
  validatePasswordComplexity,
  superSanitizationMiddleware
} = require('./inputValidator');

// ── Auto-Generate SSL Certificates Helper ──────────────────────
function generateFreshCerts(targetDir) {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const crtPath = path.join(targetDir, 'iochunt.crt');
    const keyPath = path.join(targetDir, 'iochunt.key');

    // Remove old/corrupt files if present
    try { if (fs.existsSync(crtPath)) fs.unlinkSync(crtPath); } catch (_) { }
    try { if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath); } catch (_) { }

    console.log('[SuperAdmin] Generating fresh self-signed TLS certificates in:', targetDir);
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', keyPath, '-out', crtPath,
      '-days', '3650', '-nodes',
      '-subj', '/CN=iochunt-superadmin/O=DefSecOne/C=IN'
    ], { stdio: 'ignore' });

    return { crtPath, keyPath };
  } catch (err) {
    console.error('[SuperAdmin] Failed to generate SSL certificates with openssl:', err.message);
    return null;
  }
}

function ensureSuperAdminSSL() {
  const possibleDirs = [
    path.resolve(__dirname, '../ssl'),
    path.resolve(__dirname, '../../nginx/ssl'),
    path.resolve(__dirname, '../../../nginx/ssl'),
    path.resolve('/app/nginx/ssl'),
    path.resolve(process.cwd(), 'nginx/ssl')
  ];

  for (const d of possibleDirs) {
    const crt = path.join(d, 'iochunt.crt');
    const key = path.join(d, 'iochunt.key');
    if (fs.existsSync(crt) && fs.existsSync(key)) {
      try {
        const keyContent = fs.readFileSync(key, 'utf8');
        const crtContent = fs.readFileSync(crt, 'utf8');
        if (keyContent.includes('PRIVATE KEY') && crtContent.includes('CERTIFICATE')) {
          return { crtPath: crt, keyPath: key };
        }
      } catch (_) { }
    }
  }

  // Generate fresh in ../ssl
  return generateFreshCerts(path.resolve(__dirname, '../ssl'));
}

const app = express();
app.disable('x-powered-by');

const PORT = process.env.SUPER_ADMIN_PORT || 4002;

// Database connection for Super Admin Control Plane
const pool = new Pool({
  connectionString: process.env.SUPER_ADMIN_DATABASE_URL || process.env.DATABASE_URL,
  max: 10
});

// Security & Header Sanitization Middleware
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(superSanitizationMiddleware);

// Initialize Super Admin Schema & Default Credentials
async function initSuperAdminDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        force_password_change INTEGER DEFAULT 1,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS super_sessions (
        token VARCHAR(128) PRIMARY KEY,
        admin_id INTEGER REFERENCES super_admins(id) ON DELETE CASCADE,
        ip_address VARCHAR(45) DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(64) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        db_name VARCHAR(255) NOT NULL,
        db_user VARCHAR(255) NOT NULL,
        db_password_encrypted TEXT NOT NULL DEFAULT '',
        db_host VARCHAR(255) DEFAULT 'db',
        db_port INTEGER DEFAULT 5432,
        syslog_port INTEGER,
        api_key_hash VARCHAR(255),
        api_key_encrypted TEXT,
        status VARCHAR(50) DEFAULT 'active',
        tier VARCHAR(50) DEFAULT 'standard',
        max_eps INTEGER DEFAULT 5000,
        central_url VARCHAR(255) DEFAULT '',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS syslog_port_map (
        port INTEGER PRIMARY KEY,
        tenant_id VARCHAR(64),
        protocol VARCHAR(10) DEFAULT 'udp',
        enabled BOOLEAN DEFAULT TRUE,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        tenant_id VARCHAR(64),
        user_id INTEGER,
        username VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(255),
        detail TEXT,
        ip_address VARCHAR(50),
        user_agent TEXT,
        result VARCHAR(20) DEFAULT 'SUCCESS',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS super_settings (
        category VARCHAR(50) PRIMARY KEY,
        settings JSONB NOT NULL,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );
    `);

    // Seed default settings if not exists
    const defaultSettings = [
      {
        category: 'security',
        settings: {
          session_timeout_mins: 120
        }
      }
    ];

    for (const item of defaultSettings) {
      await client.query(
        `INSERT INTO super_settings (category, settings)
         VALUES ($1, $2)
         ON CONFLICT (category) DO NOTHING`,
        [item.category, JSON.stringify(item.settings)]
      );
    }

    // Auto-migrate schema for missing columns in existing deployments
    try {
      await client.query('ALTER TABLE tenants ADD COLUMN central_url VARCHAR(255) DEFAULT \'\'');
      console.log('[SuperAdmin] Auto-migrated: Added central_url to tenants table');
    } catch (e) {
      // Column already exists, ignore
    }

    try {
      await client.query('ALTER TABLE tenants ADD COLUMN api_key_encrypted TEXT');
      console.log('[SuperAdmin] Auto-migrated: Added api_key_encrypted to tenants table');
    } catch (e) {
      // Column already exists, ignore
    }

    try {
      await client.query('ALTER TABLE super_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) DEFAULT \'\'');
      await client.query('ALTER TABLE super_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT \'\'');
      await client.query('ALTER TABLE super_sessions ADD COLUMN IF NOT EXISTS last_activity_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())');
      console.log('[SuperAdmin] Auto-migrated: Added ip_address, user_agent, and last_activity_at to super_sessions table');
    } catch (e) {
      // Columns already exist or error, ignore
    }

    // Seed default superadmin / superadmin with mandatory password change
    const checkRes = await client.query('SELECT * FROM super_admins WHERE username = $1', ['superadmin']);
    if (checkRes.rows.length === 0) {
      const salt = crypto.randomBytes(32).toString('hex');
      const hash = crypto.pbkdf2Sync('superadmin', salt, 100000, 64, 'sha512').toString('hex');
      await client.query(
        'INSERT INTO super_admins (username, password_hash, salt, force_password_change) VALUES ($1, $2, $3, 1)',
        ['superadmin', hash, salt]
      );
      console.log('[SuperAdmin] Seeded default superadmin / superadmin (Password change required on first login).');
    }
  } finally {
    client.release();
  }
}

// Authentication Middleware
async function superAuthMiddleware(req, res, next) {
  const token = req.cookies?.super_session || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Super Admin authentication required' });

  const now = Math.floor(Date.now() / 1000);
  const sessionRes = await pool.query(
    'SELECT s.*, a.username, a.force_password_change FROM super_sessions s JOIN super_admins a ON s.admin_id = a.id WHERE s.token = $1 AND s.expires_at > $2',
    [token, now]
  );

  if (sessionRes.rows.length === 0) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  req.superAdmin = sessionRes.rows[0];

  // User-Agent fingerprint sanity check
  const clientUserAgent = req.headers['user-agent'] || 'unknown';
  if (req.superAdmin.user_agent && req.superAdmin.user_agent !== 'unknown' && req.superAdmin.user_agent !== clientUserAgent) {
    return res.status(401).json({ error: 'Session anomaly detected: User-Agent mismatch' });
  }

  // Idle inactivity check based on super_settings.session_timeout_mins
  let idleTimeoutMins = 120;
  try {
    const settingsRes = await pool.query("SELECT settings FROM super_settings WHERE category = 'security'");
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].settings?.session_timeout_mins) {
      const parsed = parseInt(settingsRes.rows[0].settings.session_timeout_mins, 10);
      if (!isNaN(parsed) && parsed > 0) idleTimeoutMins = parsed;
    }
  } catch (_) {}

  const lastAct = Number(req.superAdmin.last_activity_at) || 0;
  if (lastAct > 0 && (now - lastAct) > (idleTimeoutMins * 60)) {
    await pool.query('DELETE FROM super_sessions WHERE token = $1', [token]).catch(() => {});
    res.clearCookie('super_session');
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }

  // Throttle activity sliding: update last_activity_at once every 60s for non-passive endpoints
  const passivePaths = ['/api/super/stream', '/api/super/session-check'];
  if (!passivePaths.includes(req.path)) {
    if (now - lastAct > 60) {
      const newExpiry = now + (idleTimeoutMins * 60);
      pool.query('UPDATE super_sessions SET last_activity_at = $1, expires_at = GREATEST(expires_at, $2) WHERE token = $3', [now, newExpiry, token]).catch(() => {});
    }
  }

  // Enforce mandatory password change if required
  const allowedPaths = ['/api/super/change-password', '/api/super/logout', '/api/super/session-check', '/api/super/stream'];
  if (req.superAdmin.force_password_change === 1 && !allowedPaths.includes(req.path)) {
    return res.status(403).json({
      error: 'Forbidden: Mandatory password change required before accessing the system',
      force_password_change: true
    });
  }

  next();
}

// Helper: Decrypt data using AES-256-CBC
function decryptData(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') return null;
  const parts = encryptedString.split(':');
  if (parts.length !== 2) return encryptedString;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) return encryptedString;

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Decrypt] Error decrypting API key:', err.message);
    return null;
  }
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
}

// Rate limiter for super-admin login (7 attempts per 15 minutes per IP)
const superLoginAttempts = new Map();
function superLoginLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 7;

  const record = superLoginAttempts.get(ip);
  if (!record || now - record.startTime > windowMs) {
    superLoginAttempts.set(ip, { count: 1, startTime: now });
    return next();
  }

  record.count++;
  if (record.count > maxAttempts) {
    const msRemaining = Math.max(1000, (record.startTime + windowMs) - now);
    const formatted = formatRemainingTime(msRemaining);
    const retrySec = Math.ceil(msRemaining / 1000);
    res.setHeader('Retry-After', retrySec);
    const errorMsg = `Too many login attempts. Please try again in ${formatted}.`;
    return res.status(429).json({
      error: errorMsg,
      message: errorMsg,
      retryAfter: retrySec
    });
  }

  return next();
}

// Rate limiter for super-admin password changes (7 attempts per 15 minutes per IP/Admin)
const superPasswordAttempts = new Map();
function superPasswordLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const adminId = req.superAdmin?.admin_id || req.superAdmin?.id || 'anon';
  const key = `${ip}_admin_${adminId}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 7;

  const record = superPasswordAttempts.get(key);
  if (!record || now - record.startTime > windowMs) {
    superPasswordAttempts.set(key, { count: 1, startTime: now });
    return next();
  }

  record.count++;
  if (record.count > maxAttempts) {
    const msRemaining = Math.max(1000, (record.startTime + windowMs) - now);
    const formatted = formatRemainingTime(msRemaining);
    const retrySec = Math.ceil(msRemaining / 1000);
    res.setHeader('Retry-After', retrySec);
    const errorMsg = `Too many password change attempts. Account protection engaged. Please try again in ${formatted}.`;
    return res.status(429).json({
      error: errorMsg,
      message: errorMsg,
      retryAfter: retrySec
    });
  }

  return next();
}

// Background session cleaner for super-admin control plane (every 15 minutes)
setInterval(async () => {
  try {
    const now = Math.floor(Date.now() / 1000);
    await pool.query('DELETE FROM super_sessions WHERE expires_at < $1', [now]);

    // Clean up expired rate limiter memory maps
    const nowMs = Date.now();
    const windowMs = 15 * 60 * 1000;
    for (const [key, val] of superLoginAttempts.entries()) {
      if (nowMs - val.startTime > windowMs) superLoginAttempts.delete(key);
    }
    for (const [key, val] of superPasswordAttempts.entries()) {
      if (nowMs - val.startTime > windowMs) superPasswordAttempts.delete(key);
    }
  } catch (err) {
    console.error('[Session Cleanup] Error deleting expired super_sessions:', err.message);
  }
}, 15 * 60 * 1000).unref();

// ════════════════════════════════════════════════════════════════
// Real-Time SSE Broadcaster for Super-Admin Control Plane
// ════════════════════════════════════════════════════════════════
class SuperSSEBroadcaster {
  constructor() {
    this.clients = new Map(); // adminId -> Set of res
  }

  subscribe(adminId, res) {
    if (!this.clients.has(adminId)) {
      this.clients.set(adminId, new Set());
    }
    this.clients.get(adminId).add(res);
  }

  unsubscribe(adminId, res) {
    const adminSet = this.clients.get(adminId);
    if (adminSet) {
      adminSet.delete(res);
      if (adminSet.size === 0) {
        this.clients.delete(adminId);
      }
    }
  }

  broadcastToAdmin(adminId, eventType, data = {}) {
    const adminSet = this.clients.get(adminId);
    if (adminSet && adminSet.size > 0) {
      const payload = JSON.stringify(data);
      for (const client of adminSet) {
        try {
          client.write(`event: ${eventType}\ndata: ${payload}\n\n`);
        } catch (_) { }
      }
    }
  }
}

const superSSE = new SuperSSEBroadcaster();

// Routes
app.get('/api/super/stream', superAuthMiddleware, (req, res) => {
  const adminId = req.superAdmin.admin_id || req.superAdmin.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  superSSE.subscribe(adminId, res);

  res.write(`event: connected\ndata: {"status":"connected"}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    superSSE.unsubscribe(adminId, res);
  });
});

app.post('/api/super/login', superLoginLimiter, async (req, res) => {
  try {
    const { username, password, confirm_takeover } = req.body || {};
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const adminRes = await pool.query('SELECT * FROM super_admins WHERE username = $1', [username.trim().toLowerCase()]);
    if (adminRes.rows.length === 0) {
      await pool.query(
        'INSERT INTO audit_log (username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [username || 'unknown', 'SUPERADMIN_LOGIN_FAILED', 'super_admins', 'Invalid username attempt', clientIp, userAgent, 'FAILURE']
      ).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = adminRes.rows[0];
    const computedHash = crypto.pbkdf2Sync(password, admin.salt, 100000, 64, 'sha512').toString('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(admin.password_hash, 'hex');
    if (computedBuf.length !== storedBuf.length || !crypto.timingSafeEqual(computedBuf, storedBuf)) {
      await pool.query(
        'INSERT INTO audit_log (user_id, username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [admin.id, admin.username, 'SUPERADMIN_LOGIN_FAILED', 'super_admins', 'Invalid password attempt', clientIp, userAgent, 'FAILURE']
      ).catch(() => {});
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Clear failed rate limit attempts on successful authentication
    superLoginAttempts.delete(clientIp);
    if (req.ip) superLoginAttempts.delete(req.ip);

    const now = Math.floor(Date.now() / 1000);

    // Check for active unexpired session for this admin account
    const activeSessionRes = await pool.query(
      'SELECT token, ip_address, user_agent, created_at, expires_at FROM super_sessions WHERE admin_id = $1 AND expires_at > $2 ORDER BY created_at DESC LIMIT 1',
      [admin.id, now]
    );

    if (activeSessionRes.rows.length > 0 && confirm_takeover !== true) {
      const activeSession = activeSessionRes.rows[0];
      return res.status(409).json({
        session_already_active: true,
        active_session: {
          ip_address: activeSession.ip_address || 'unknown',
          user_agent: activeSession.user_agent || 'unknown',
          created_at: activeSession.created_at
        },
        message: 'This account is currently active on another device. Do you want to log out that device and continue?'
      });
    }

    // Single active session enforcement: delete prior active sessions for this admin
    if (activeSessionRes.rows.length > 0) {
      await pool.query('DELETE FROM super_sessions WHERE admin_id = $1', [admin.id]);

      // REAL-TIME INSTANT PUSH: kick out the old device immediately with ZERO clicks
      superSSE.broadcastToAdmin(admin.id, 'session_revoked', {
        reason: 'concurrent_takeover',
        message: 'You were logged out because this account was accessed from another device.'
      });

      try {
        await pool.query(
          'INSERT INTO audit_log (user_id, username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [admin.id, admin.username, 'SESSION_TAKEOVER', 'super_sessions', 'Terminated previous session due to new login takeover', clientIp, userAgent, 'SUCCESS']
        );
      } catch (_) { }
    }

    let sessionTimeoutMins = 120; // Default: 2 hours
    try {
      const settingsRes = await pool.query("SELECT settings FROM super_settings WHERE category = 'security'");
      if (settingsRes.rows.length > 0 && settingsRes.rows[0].settings?.session_timeout_mins) {
        const parsed = parseInt(settingsRes.rows[0].settings.session_timeout_mins, 10);
        if (!isNaN(parsed) && parsed > 0) sessionTimeoutMins = parsed;
      }
    } catch (_) {}

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = now + (sessionTimeoutMins * 60);

    await pool.query(
      'INSERT INTO super_sessions (token, admin_id, ip_address, user_agent, expires_at, last_activity_at) VALUES ($1, $2, $3, $4, $5, $6)',
      [token, admin.id, clientIp, userAgent, expiresAt, now]
    );

    await pool.query(
      'INSERT INTO audit_log (user_id, username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [admin.id, admin.username, 'SUPERADMIN_LOGIN_SUCCESS', 'super_sessions', 'Super Admin authenticated successfully', clientIp, userAgent, 'SUCCESS']
    ).catch(() => {});

    res.cookie('super_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: sessionTimeoutMins * 60 * 1000
    });
    return res.json({
      force_password_change: admin.force_password_change === 1,
      username: admin.username,
      session_timeout_mins: sessionTimeoutMins
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/super/session-check', superAuthMiddleware, (req, res) => {
  res.json({
    valid: true,
    username: req.superAdmin.username,
    force_password_change: req.superAdmin.force_password_change === 1
  });
});

app.post('/api/super/logout', superAuthMiddleware, async (req, res) => {
  try {
    const token = req.cookies?.super_session || req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
      await pool.query('DELETE FROM super_sessions WHERE token = $1', [token]);
    }
    res.clearCookie('super_session');
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/super/change-password', superAuthMiddleware, superPasswordLimiter, async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body || {};
    const finalPassword = new_password || req.body?.password;
    if (!finalPassword || typeof finalPassword !== 'string') {
      return res.status(400).json({ error: 'New password must be provided as a string' });
    }
    const pwdErr = validatePasswordComplexity(finalPassword);
    if (pwdErr) {
      return res.status(400).json({ error: pwdErr });
    }
    if (confirm_password && finalPassword !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const adminId = req.superAdmin.admin_id || req.superAdmin.id;
    const adminRes = await pool.query('SELECT * FROM super_admins WHERE id = $1', [adminId]);
    if (adminRes.rows.length === 0) {
      return res.status(404).json({ error: 'Super Admin account not found' });
    }

    const admin = adminRes.rows[0];

    // If not in forced initial change mode, verify current password
    if (admin.force_password_change !== 1 || current_password) {
      if (!current_password) {
        return res.status(400).json({ error: 'Current password is required' });
      }
      const computedHash = crypto.pbkdf2Sync(current_password, admin.salt, 100000, 64, 'sha512').toString('hex');
      if (computedHash !== admin.password_hash) {
        await pool.query(
          `INSERT INTO audit_log (username, action, resource, detail, ip_address, result)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [admin.username, 'CHANGE_SUPERADMIN_PASSWORD_FAILED', 'super_admins', 'Failed password change: incorrect current password', req.ip, 'FAILURE']
        ).catch(() => { });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const newSalt = crypto.randomBytes(32).toString('hex');
    const newHash = crypto.pbkdf2Sync(finalPassword, newSalt, 100000, 64, 'sha512').toString('hex');

    await pool.query(
      'UPDATE super_admins SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3',
      [newHash, newSalt, admin.id]
    );

    // Invalidate all active sessions for this super admin
    await pool.query('DELETE FROM super_sessions WHERE admin_id = $1', [admin.id]);
    res.clearCookie('super_session', { httpOnly: true, secure: true, sameSite: 'strict' });

    await pool.query(
      `INSERT INTO audit_log (username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin.username, 'CHANGE_SUPERADMIN_PASSWORD', 'super_admins', 'Super Admin master password changed', req.ip, 'SUCCESS']
    );

    res.json({ success: true, reauth_required: true, message: 'Super Admin master password updated successfully. Please log in again with your new password.' });
  } catch (err) {
    console.error('[Change Password Error]', err);
    res.status(500).json({ error: 'Password update failed' });
  }
});

// ── List All Tenants ────────────────────────────────────────────
app.get('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const companiesRes = await pool.query(
      'SELECT id, tenant_id AS company_id, company_name, status, central_url, syslog_port, db_name, tier, api_key_encrypted, created_at FROM tenants ORDER BY id DESC'
    );

    const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || process.env.DATABASE_URL);

    // Decrypt API key and query enrolled agent count per active tenant
    const mappedCompanies = await Promise.all(companiesRes.rows.map(async (company) => {
      const apiKey = decryptData(company.api_key_encrypted);
      delete company.api_key_encrypted;

      let agentCount = 0;
      let adminUsername = 'admin';
      if (company.status === 'active' && company.db_name) {
        try {
          const tConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${company.db_name}`;
          const tPool = new Pool({ connectionString: tConnStr, max: 1, connectionTimeoutMillis: 1000 });
          const [mRes, uRes] = await Promise.all([
            tPool.query('SELECT COUNT(*) AS count FROM machines'),
            tPool.query("SELECT username FROM users WHERE role = 'ADMIN' ORDER BY id ASC LIMIT 1")
          ]);
          agentCount = parseInt(mRes.rows[0]?.count || 0, 10);
          if (uRes.rows.length > 0 && uRes.rows[0].username) {
            adminUsername = uRes.rows[0].username;
          }
          await tPool.end();
        } catch (_) {
          // tenant DB timeout or unreachable, default to 0
        }
      }

      return {
        ...company,
        api_key: apiKey,
        agent_count: agentCount,
        admin_username: adminUsername
      };
    }));

    res.json(mappedCompanies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Provision New Tenant ────────────────────────────────────────
app.post('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const { company_name, company_id, admin_username, admin_password } = req.body || {};
    if (!company_name || !company_id || typeof company_name !== 'string' || typeof company_id !== 'string') {
      return res.status(400).json({ error: 'Company Name and ID are required' });
    }
    if (!admin_username || !admin_password || typeof admin_username !== 'string' || typeof admin_password !== 'string') {
      return res.status(400).json({ error: 'Admin Username and Password are required' });
    }

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!isDbIdentifier(safeId)) {
      return res.status(400).json({ error: 'Company ID must be 3-63 characters containing only lowercase letters, numbers, and underscores.' });
    }

    const pwdError = validatePasswordComplexity(admin_password);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }

    // Check if tenant ID already exists
    const checkIdRes = await pool.query('SELECT id FROM tenants WHERE tenant_id = $1', [safeId]);
    if (checkIdRes.rows.length > 0) return res.status(400).json({ error: 'Tenant ID already exists. Please choose a different subdomain.' });

    // Check if company name already exists
    const checkNameRes = await pool.query('SELECT id FROM tenants WHERE company_name ILIKE $1', [company_name.trim()]);
    if (checkNameRes.rows.length > 0) return res.status(400).json({ error: 'Company Name already exists. Please choose a different name.' });

    // Find the next available syslog port
    const portRes = await pool.query('SELECT MAX(syslog_port) as max_syslog FROM tenants');
    const startingSyslogPort = portRes.rows[0].max_syslog ? portRes.rows[0].max_syslog + 1 : 9500;

    // Provision the tenant database (no Docker containers!)
    const provisionTenant = require('../scripts/provision_tenant');
    const result = await provisionTenant({
      company_id: safeId,
      company_name: company_name.trim(),
      admin_username: admin_username.trim(),
      admin_password: admin_password.trim(),
      startingSyslogPort
    });

    // All tenants share the same fixed URL on port 8082
    const central_url = `https://${req.hostname}:8082`;

    // Update the central_url in the tenants table
    await pool.query(
      'UPDATE tenants SET central_url = $1 WHERE tenant_id = $2',
      [central_url, safeId]
    );

    // Log the provisioning action
    await pool.query(
      `INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [safeId, req.superAdmin.username, 'PROVISION_TENANT', safeId, `Provisioned tenant ${safeId} with DB ${result.db_name}`, req.ip, 'SUCCESS']
    );

    // Return the tenant info along with the raw API key
    const tenantRes = await pool.query(
      'SELECT id, tenant_id AS company_id, company_name, status, central_url, syslog_port, db_name, tier, created_at FROM tenants WHERE tenant_id = $1',
      [safeId]
    );

    const tenantData = tenantRes.rows[0];
    tenantData.api_key = result.api_key;

    res.json(tenantData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Provisioning failed' });
  }
});

// ── Delete Tenant ───────────────────────────────────────────────
app.delete('/api/super/companies/:company_id', superAuthMiddleware, async (req, res) => {
  try {
    const { company_id } = req.params;
    if (!company_id) return res.status(400).json({ error: 'Company ID is required' });

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Check if tenant exists
    const checkRes = await pool.query('SELECT id FROM tenants WHERE tenant_id = $1', [safeId]);
    if (checkRes.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    // Execute teardown
    const deleteTenant = require('../scripts/delete_tenant');
    await deleteTenant(safeId);

    // Log the deletion action
    await pool.query(
      `INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [safeId, req.superAdmin.username, 'DELETE_TENANT', safeId, `Deleted tenant ${safeId}`, req.ip, 'SUCCESS']
    );

    res.json({ success: true, message: `Tenant ${safeId} has been successfully deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Deletion failed' });
  }
});

// ── Global SaaS Statistics ──────────────────────────────────────
app.get('/api/super/stats', superAuthMiddleware, async (req, res) => {
  try {
    const tenantsRes = await pool.query('SELECT status, COUNT(*) AS count FROM tenants GROUP BY status');
    let totalTenants = 0;
    let activeTenants = 0;
    let suspendedTenants = 0;

    tenantsRes.rows.forEach(r => {
      const c = parseInt(r.count, 10);
      totalTenants += c;
      if (r.status === 'active') activeTenants = c;
      if (r.status === 'suspended') suspendedTenants = c;
    });

    // Estimate storage usage across iochunt databases
    let totalStorageBytes = 0;
    let totalStoragePretty = '0 MB';
    try {
      const sizeRes = await pool.query(
        "SELECT SUM(pg_database_size(datname)) AS total_bytes, pg_size_pretty(SUM(pg_database_size(datname))) AS pretty_size FROM pg_database WHERE datname LIKE 'iochunt%'"
      );
      if (sizeRes.rows[0]?.total_bytes) {
        totalStorageBytes = parseInt(sizeRes.rows[0].total_bytes, 10);
        totalStoragePretty = sizeRes.rows[0].pretty_size || '0 MB';
      }
    } catch (e) {
      console.warn('[Stats] Could not get database size:', e.message);
    }

    // Get assigned syslog ports
    const portRes = await pool.query('SELECT COUNT(*) AS count FROM syslog_port_map WHERE enabled = TRUE');
    const activeSyslogPorts = parseInt(portRes.rows[0]?.count || 0, 10);

    // Get audit logs count
    const auditRes = await pool.query('SELECT COUNT(*) AS count FROM audit_log');
    const totalAuditEvents = parseInt(auditRes.rows[0]?.count || 0, 10);

    // Count enrolled agents across all active tenant DBs
    let totalEnrolledAgents = 0;
    try {
      const activeTenantList = await pool.query("SELECT db_name, db_user, db_password_encrypted FROM tenants WHERE status = 'active'");
      for (const t of activeTenantList.rows) {
        try {
          const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || process.env.DATABASE_URL);
          const tConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${t.db_name}`;
          const tPool = new Pool({ connectionString: tConnStr, max: 1, connectionTimeoutMillis: 1500 });
          const mRes = await tPool.query('SELECT COUNT(*) AS count FROM machines');
          totalEnrolledAgents += parseInt(mRes.rows[0]?.count || 0, 10);
          await tPool.end();
        } catch (tErr) {
          // ignore individual tenant DB connection timeout
        }
      }
    } catch (err) {
      console.warn('[Stats] Could not scan tenant machines:', err.message);
    }

    res.json({
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalEnrolledAgents,
      totalStorageBytes,
      totalStoragePretty,
      activeSyslogPorts,
      totalAuditEvents
    });
  } catch (err) {
    console.error('[Stats Error]', err);
    res.status(500).json({ error: 'Failed to retrieve SaaS statistics' });
  }
});

// ── Toggle Tenant Status (Active / Suspended) ───────────────────
app.patch('/api/super/companies/:company_id/status', superAuthMiddleware, async (req, res) => {
  try {
    const { company_id } = req.params;
    const { status } = req.body;
    if (!company_id || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Valid company_id and status (active/suspended) required' });
    }

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const updateRes = await pool.query(
      'UPDATE tenants SET status = $1, updated_at = EXTRACT(EPOCH FROM NOW()) WHERE tenant_id = $2 RETURNING id, tenant_id, company_name, status',
      [status, safeId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Log the status change
    await pool.query(
      `INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [safeId, req.superAdmin.username, status === 'suspended' ? 'SUSPEND_TENANT' : 'ACTIVATE_TENANT', safeId, `Tenant status changed to ${status}`, req.ip, 'SUCCESS']
    );

    res.json({ success: true, tenant: updateRes.rows[0] });
  } catch (err) {
    console.error('[Status Error]', err);
    res.status(500).json({ error: 'Failed to update tenant status' });
  }
});

// ── Reset Tenant Admin Password ─────────────────────────────────
app.post('/api/super/companies/:company_id/reset-password', superAuthMiddleware, async (req, res) => {
  try {
    const { company_id } = req.params;
    const { new_password, admin_username } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const tenantRes = await pool.query('SELECT db_name FROM tenants WHERE tenant_id = $1', [safeId]);
    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const dbName = tenantRes.rows[0].db_name;
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(new_password, salt, 100000, 64, 'sha512').toString('hex');

    // Connect to tenant DB and update credentials
    const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || process.env.DATABASE_URL);
    const tenantConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${dbName}`;
    const tenantPool = new Pool({ connectionString: tenantConnStr, max: 1 });

    const targetUsername = (admin_username && admin_username.trim()) ? admin_username.trim().toLowerCase() : null;

    try {
      if (targetUsername) {
        await tenantPool.query(
          'UPDATE users SET username = $1, password_hash = $2, salt = $3, force_password_change = 1 WHERE role = \'ADMIN\'',
          [targetUsername, hash, salt]
        );
      } else {
        await tenantPool.query(
          'UPDATE users SET password_hash = $1, salt = $2, force_password_change = 1 WHERE role = \'ADMIN\'',
          [hash, salt]
        );
      }
    } finally {
      await tenantPool.end();
    }

    // Invalidate all active sessions for this tenant and targeted admin in the central sessions table
    await pool.query(
      'DELETE FROM sessions WHERE tenant_id = $1 AND role = \'ADMIN\'',
      [safeId]
    );

    // Log the password reset action
    await pool.query(
      `INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [safeId, req.superAdmin.username, 'RESET_TENANT_PASSWORD', safeId, `Admin credentials reset for tenant ${safeId}${targetUsername ? ` (username: ${targetUsername})` : ''}`, req.ip, 'SUCCESS']
    );

    res.json({ success: true, message: `Tenant admin credentials updated successfully${targetUsername ? ` (Username: ${targetUsername})` : ''} and all active sessions have been terminated. Password change required on next login.` });
  } catch (err) {
    console.error('[Reset Password Error]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// ── Get Immutable Audit Logs ────────────────────────────────────
app.get('/api/super/audit-logs', superAuthMiddleware, async (req, res) => {
  try {
    const limit = parseSafeInt(req.query.limit, 50, 1, 500);
    const offset = parseSafeInt(req.query.offset, 0, 0);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    let query = 'SELECT * FROM audit_log';
    const params = [];

    if (search) {
      query += ' WHERE action ILIKE $1 OR username ILIKE $1 OR tenant_id ILIKE $1 OR detail ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const logsRes = await pool.query(query, params);
    const totalRes = await pool.query('SELECT COUNT(*) AS total FROM audit_log' + (search ? ' WHERE action ILIKE $1 OR username ILIKE $1 OR tenant_id ILIKE $1 OR detail ILIKE $1' : ''), search ? [`%${search}%`] : []);

    res.json({
      logs: logsRes.rows,
      total: parseInt(totalRes.rows[0]?.total || 0, 10)
    });
  } catch (err) {
    console.error('[Audit Logs Error]', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// ── Get System Health & Infrastructure Telemetry ─────────────────
app.get('/api/super/system-health', superAuthMiddleware, async (req, res) => {
  try {
    const uptimeSec = Math.floor(process.uptime());
    const memUsage = process.memoryUsage();

    // Check Postgres Control Plane connections
    const dbStatRes = await pool.query(
      'SELECT count(*) AS active_connections, (SELECT count(*) FROM pg_stat_activity WHERE state = \'active\') AS active_queries FROM pg_stat_activity'
    );

    // Get Syslog Port Mappings
    const portMapRes = await pool.query(
      'SELECT spm.port, spm.tenant_id, spm.protocol, spm.enabled, t.company_name FROM syslog_port_map spm LEFT JOIN tenants t ON spm.tenant_id = t.tenant_id ORDER BY spm.port ASC'
    );

    // Database size info
    const dbSizesRes = await pool.query(
      "SELECT datname AS db_name, pg_size_pretty(pg_database_size(datname)) AS pretty_size, pg_database_size(datname) AS bytes FROM pg_database WHERE datname LIKE 'iochunt%' ORDER BY pg_database_size(datname) DESC"
    );

    res.json({
      status: 'healthy',
      uptimeSeconds: uptimeSec,
      memory: {
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      postgres: {
        totalConnections: parseInt(dbStatRes.rows[0]?.active_connections || 0, 10),
        activeQueries: parseInt(dbStatRes.rows[0]?.active_queries || 0, 10),
        databases: dbSizesRes.rows
      },
      syslogPorts: portMapRes.rows
    });
  } catch (err) {
    console.error('[System Health Error]', err);
    res.status(500).json({ error: 'Failed to retrieve system health metrics' });
  }
});

// ── Control Plane Settings ───────────────────────────────────────
app.get('/api/super/settings', superAuthMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT category, settings FROM super_settings');
    const settingsMap = {};
    result.rows.forEach(r => {
      settingsMap[r.category] = r.settings;
    });
    res.json({ success: true, settings: settingsMap });
  } catch (err) {
    console.error('[Settings GET Error]', err);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

app.put('/api/super/settings', superAuthMiddleware, async (req, res) => {
  try {
    const { category, settings } = req.body;
    if (!category || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Valid category and settings object required' });
    }

    if (category === 'security' && settings.session_timeout_mins !== undefined) {
      const parsed = parseInt(settings.session_timeout_mins, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 10080) {
        return res.status(400).json({ error: 'Session timeout must be between 1 and 10080 minutes' });
      }
      settings.session_timeout_mins = parsed;
    }

    await pool.query(
      `INSERT INTO super_settings (category, settings, updated_at)
       VALUES ($1, $2, EXTRACT(EPOCH FROM NOW()))
       ON CONFLICT (category) DO UPDATE
       SET settings = EXCLUDED.settings, updated_at = EXTRACT(EPOCH FROM NOW())`,
      [category, JSON.stringify(settings)]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.superAdmin.username, 'UPDATE_SETTINGS', category, `Updated settings for category: ${category}`, req.ip, 'SUCCESS']
    );

    res.json({ success: true, message: `Settings for ${category} updated successfully` });
  } catch (err) {
    console.error('[Settings PUT Error]', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});


// Static Frontend Serving
const staticPath = path.join(__dirname, '../frontend/dist');
if (process.env.SERVE_STATIC === 'true' || fs.existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      const indexPath = path.join(staticPath, 'index.html');
      return res.sendFile(indexPath, err => {
        if (err) next();
      });
    }
    next();
  });
}

// 404 Handler for unmatched API and static requests
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Safe Global Error Handler (never leak stack traces or internal server details)
app.use((err, req, res, next) => {
  console.error('[SuperAdmin Error]', err);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

// Start Server
initSuperAdminDB().then(() => {
  let server;
  const useHttps = process.env.USE_HTTPS !== 'false';

  if (useHttps) {
    try {
      const ssl = ensureSuperAdminSSL();
      if (ssl && fs.existsSync(ssl.keyPath) && fs.existsSync(ssl.crtPath)) {
        const key = fs.readFileSync(ssl.keyPath, 'utf8');
        const cert = fs.readFileSync(ssl.crtPath, 'utf8');
        server = https.createServer({ key, cert }, app);
        console.log('[SuperAdmin] HTTPS TLS server enabled with certificate:', ssl.crtPath);
      }
    } catch (tlsErr) {
      console.warn('[SuperAdmin] Primary TLS initialization failed (' + tlsErr.message + '), generating fresh certs...');
      try {
        const fresh = generateFreshCerts(path.resolve(__dirname, '../ssl'));
        if (fresh) {
          const key = fs.readFileSync(fresh.keyPath, 'utf8');
          const cert = fs.readFileSync(fresh.crtPath, 'utf8');
          server = https.createServer({ key, cert }, app);
          console.log('[SuperAdmin] HTTPS TLS server recovered with newly generated certificate');
        }
      } catch (freshErr) {
        console.error('[SuperAdmin] Fresh certificate generation failed:', freshErr.message);
      }
    }
  }

  if (!server) {
    server = http.createServer(app);
    console.log('[SuperAdmin] HTTP server fallback active on port ' + PORT);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SuperAdmin] Super Admin Control Plane running on port ${PORT}`);
    console.log(`[SuperAdmin] SaaS Mode: All tenants share port 8080 via NGINX`);
  });
}).catch(err => {
  console.error('[SuperAdmin] Failed to initialize database:', err);
});
