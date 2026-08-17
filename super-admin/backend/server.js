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
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Auto-Generate SSL Certificates ─────────────────────────────
try {
  const sslDir = path.join(__dirname, '../../../nginx/ssl');
  if (fs.existsSync(sslDir)) {
    const crtPath = path.join(sslDir, 'iochunt.crt');
    const keyPath = path.join(sslDir, 'iochunt.key');
    if (!fs.existsSync(crtPath) || !fs.existsSync(keyPath)) {
      console.log('[SuperAdmin] SSL certificates missing. Generating self-signed certificates...');
      execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${crtPath}" -days 3650 -nodes -subj "/CN=iochunt-platform/O=DefSecOne/C=IN"`, { stdio: 'ignore' });
      console.log('[SuperAdmin] SSL certificates generated successfully.');
    }
  }
} catch (err) {
  console.error('[SuperAdmin] Failed to auto-generate SSL certificates:', err.message);
}

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
    `);

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

// ── List All Tenants ────────────────────────────────────────────
app.get('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const companiesRes = await pool.query(
      'SELECT id, tenant_id AS company_id, company_name, status, central_url, syslog_port, db_name, tier, max_eps, api_key_encrypted, created_at FROM tenants ORDER BY id DESC'
    );
    
    // Decrypt API key for display
    const mappedCompanies = companiesRes.rows.map(company => {
      const apiKey = decryptData(company.api_key_encrypted);
      delete company.api_key_encrypted; // don't send raw encrypted string to frontend
      return {
        ...company,
        api_key: apiKey
      };
    });
    
    res.json(mappedCompanies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Provision New Tenant ────────────────────────────────────────
app.post('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const { company_name, company_id, admin_username, admin_password } = req.body;
    if (!company_name || !company_id) return res.status(400).json({ error: 'Company Name and ID are required' });
    if (!admin_username || !admin_password) return res.status(400).json({ error: 'Admin Username and Password are required' });

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Check if tenant already exists
    const checkRes = await pool.query('SELECT id FROM tenants WHERE tenant_id = $1', [safeId]);
    if (checkRes.rows.length > 0) return res.status(400).json({ error: 'Tenant ID already exists' });

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
    res.status(500).json({ error: `Provisioning failed: ${err.message}` });
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
    res.status(500).json({ error: `Deletion failed: ${err.message}` });
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
    console.log(`[SuperAdmin] SaaS Mode: All tenants share port 8080 via NGINX`);
  });
}).catch(err => {
  console.error('[SuperAdmin] Failed to initialize database:', err);
});
