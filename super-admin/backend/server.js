// ════════════════════════════════════════════════════════════════
// IOC Hunt — Super Admin Standalone Control Plane Backend
// ════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.SUPER_ADMIN_PORT || 4002;

// Database connection for Super Admin Control Plane
const pool = new Pool({
  connectionString: process.env.SUPER_ADMIN_DATABASE_URL || process.env.DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db',
  max: 10
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS managed_companies (
        id SERIAL PRIMARY KEY,
        company_id VARCHAR(64) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        central_url VARCHAR(255) DEFAULT '',
        app_port INTEGER,
        http_port INTEGER,
        https_port INTEGER,
        syslog_port INTEGER,
        db_port INTEGER,
        status VARCHAR(50) DEFAULT 'active',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );
      
      ALTER TABLE managed_companies ADD COLUMN IF NOT EXISTS app_port INTEGER;
      ALTER TABLE managed_companies ADD COLUMN IF NOT EXISTS http_port INTEGER;
      ALTER TABLE managed_companies ADD COLUMN IF NOT EXISTS https_port INTEGER;
      ALTER TABLE managed_companies ADD COLUMN IF NOT EXISTS syslog_port INTEGER;
      ALTER TABLE managed_companies ADD COLUMN IF NOT EXISTS db_port INTEGER;
    `);

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
  next();
}

// Routes
app.post('/api/super/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const adminRes = await pool.query('SELECT * FROM super_admins WHERE username = $1', [username.trim().toLowerCase()]);
    if (adminRes.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const admin = adminRes.rows[0];
    const computedHash = crypto.pbkdf2Sync(password, admin.salt, 100000, 64, 'sha512').toString('hex');
    if (computedHash !== admin.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 8 * 3600;

    await pool.query(
      'INSERT INTO super_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)',
      [token, admin.id, expiresAt]
    );

    res.cookie('super_session', token, { httpOnly: true, secure: true, sameSite: 'strict' });
    return res.json({
      token,
      force_password_change: admin.force_password_change === 1,
      username: admin.username
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/super/change-password', superAuthMiddleware, async (req, res) => {
  try {
    const { new_password, confirm_password } = req.body;
    if (new_password !== confirm_password) return res.status(400).json({ error: 'Passwords do not match' });
    if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const newSalt = crypto.randomBytes(32).toString('hex');
    const newHash = crypto.pbkdf2Sync(new_password, newSalt, 100000, 64, 'sha512').toString('hex');

    await pool.query(
      'UPDATE super_admins SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3',
      [newHash, newSalt, req.superAdmin.admin_id]
    );

    res.json({ success: true, message: 'Super admin password updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const companiesRes = await pool.query('SELECT * FROM managed_companies ORDER BY id DESC');
    res.json(companiesRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const { company_name, company_id, admin_username, admin_password } = req.body;
    if (!company_name || !company_id) return res.status(400).json({ error: 'Company Name and ID are required' });
    if (!admin_username || !admin_password) return res.status(400).json({ error: 'Admin Username and Password are required' });

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    // Check if company already exists
    const checkRes = await pool.query('SELECT id FROM managed_companies WHERE company_id = $1', [safeId]);
    if (checkRes.rows.length > 0) return res.status(400).json({ error: 'Company ID already exists' });

    // Find highest ports currently used to pass as a starting hint
    const portRes = await pool.query('SELECT MAX(app_port) as max_app, MAX(http_port) as max_http, MAX(https_port) as max_https, MAX(syslog_port) as max_syslog, MAX(db_port) as max_db FROM managed_companies');
    
    const startingAppPort = portRes.rows[0].max_app ? portRes.rows[0].max_app + 1 : 6000;
    const startingHttpPort = portRes.rows[0].max_http ? portRes.rows[0].max_http + 1 : 8080;
    const startingHttpsPort = portRes.rows[0].max_https ? portRes.rows[0].max_https + 1 : 8000;
    const startingSyslogPort = portRes.rows[0].max_syslog ? portRes.rows[0].max_syslog + 1 : 9000;
    const startingDbPort = portRes.rows[0].max_db ? portRes.rows[0].max_db + 1 : 5500;

    // Provision the tenant (it will return the actual allocated ports)
    const provisionTenant = require('../scripts/provision_tenant');
    const allocated = await provisionTenant({
      company_id: safeId,
      company_name: company_name.trim(),
      admin_username: admin_username.trim(),
      admin_password: admin_password.trim(),
      startingAppPort,
      startingHttpPort,
      startingHttpsPort,
      startingSyslogPort,
      startingDbPort
    });

    const central_url = `https://10.90.120.177:${allocated.https_port}`;

    const insertRes = await pool.query(
      'INSERT INTO managed_companies (company_id, company_name, central_url, app_port, http_port, https_port, syslog_port, db_port) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [safeId, company_name.trim(), central_url, allocated.app_port, allocated.http_port, allocated.https_port, allocated.syslog_port, allocated.db_port]
    );

    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create company (may already exist or provisioning failed)' });
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

// Start Server
initSuperAdminDB().then(() => {
  const sslDir = path.resolve(__dirname, '../../nginx/ssl');
  let server;
  if (fs.existsSync(path.join(sslDir, 'iochunt.key')) && fs.existsSync(path.join(sslDir, 'iochunt.crt'))) {
    const sslOptions = {
      key: fs.readFileSync(path.join(sslDir, 'iochunt.key')),
      cert: fs.readFileSync(path.join(sslDir, 'iochunt.crt'))
    };
    server = https.createServer(sslOptions, app);
  } else {
    server = app;
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SuperAdmin] Isolated Super Admin Control Plane running on port ${PORT}`);
  });
}).catch(err => {
  console.error('[SuperAdmin] Failed to initialize database:', err);
});
