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
const { execSync } = require('child_process');

// ── Auto-Generate SSL Certificates Helper ──────────────────────
function generateFreshCerts(targetDir) {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const crtPath = path.join(targetDir, 'iochunt.crt');
    const keyPath = path.join(targetDir, 'iochunt.key');
    
    // Remove old/corrupt files if present
    try { if (fs.existsSync(crtPath)) fs.unlinkSync(crtPath); } catch (_) {}
    try { if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath); } catch (_) {}

    console.log('[SuperAdmin] Generating fresh self-signed TLS certificates in:', targetDir);
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${crtPath}" -days 3650 -nodes -subj "/CN=iochunt-superadmin/O=DefSecOne/C=IN"`, { stdio: 'ignore' });
    
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
      } catch (_) {}
    }
  }

  // Generate fresh in ../ssl
  return generateFreshCerts(path.resolve(__dirname, '../ssl'));
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
    const { current_password, new_password, confirm_password } = req.body;
    const finalPassword = new_password || req.body.password;
    if (!finalPassword || finalPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
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
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    const newSalt = crypto.randomBytes(32).toString('hex');
    const newHash = crypto.pbkdf2Sync(finalPassword, newSalt, 100000, 64, 'sha512').toString('hex');

    await pool.query(
      'UPDATE super_admins SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3',
      [newHash, newSalt, admin.id]
    );

    await pool.query(
      `INSERT INTO audit_log (username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [admin.username, 'CHANGE_SUPERADMIN_PASSWORD', 'super_admins', 'Super Admin master password changed', req.ip, 'SUCCESS']
    );

    res.json({ success: true, message: 'Super Admin master password updated successfully.' });
  } catch (err) {
    console.error('[Change Password Error]', err);
    res.status(500).json({ error: `Password update failed: ${err.message}` });
  }
});

// ── List All Tenants ────────────────────────────────────────────
app.get('/api/super/companies', superAuthMiddleware, async (req, res) => {
  try {
    const companiesRes = await pool.query(
      'SELECT id, tenant_id AS company_id, company_name, status, central_url, syslog_port, db_name, tier, api_key_encrypted, created_at FROM tenants ORDER BY id DESC'
    );
    
    const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db');

    // Decrypt API key and query enrolled agent count per active tenant
    const mappedCompanies = await Promise.all(companiesRes.rows.map(async (company) => {
      const apiKey = decryptData(company.api_key_encrypted);
      delete company.api_key_encrypted;

      let agentCount = 0;
      if (company.status === 'active' && company.db_name) {
        try {
          const tConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${company.db_name}`;
          const tPool = new Pool({ connectionString: tConnStr, max: 1, connectionTimeoutMillis: 1000 });
          const mRes = await tPool.query('SELECT COUNT(*) AS count FROM machines');
          agentCount = parseInt(mRes.rows[0]?.count || 0, 10);
          await tPool.end();
        } catch (_) {
          // tenant DB timeout or unreachable, default to 0
        }
      }

      return {
        ...company,
        api_key: apiKey,
        agent_count: agentCount
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
    const { company_name, company_id, admin_username, admin_password } = req.body;
    if (!company_name || !company_id) return res.status(400).json({ error: 'Company Name and ID are required' });
    if (!admin_username || !admin_password) return res.status(400).json({ error: 'Admin Username and Password are required' });

    const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

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
          const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db');
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
    const { new_password, admin_username = 'admin' } = req.body;

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

    // Connect to tenant DB and update password
    const parsedUrl = new URL(process.env.SUPER_ADMIN_DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db');
    const tenantConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${dbName}`;
    const tenantPool = new Pool({ connectionString: tenantConnStr, max: 1 });

    try {
      await tenantPool.query(
        'UPDATE users SET password_hash = $1, salt = $2, force_password_change = 1 WHERE role = \'ADMIN\' OR username = $3',
        [hash, salt, admin_username]
      );
    } finally {
      await tenantPool.end();
    }

    // Log the password reset action
    await pool.query(
      `INSERT INTO audit_log (tenant_id, username, action, resource, detail, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [safeId, req.superAdmin.username, 'RESET_TENANT_PASSWORD', safeId, `Admin password reset for tenant ${safeId}`, req.ip, 'SUCCESS']
    );

    res.json({ success: true, message: 'Tenant admin password updated successfully. Password change required on next login.' });
  } catch (err) {
    console.error('[Reset Password Error]', err);
    res.status(500).json({ error: `Password reset failed: ${err.message}` });
  }
});

// ── Get Immutable Audit Logs ────────────────────────────────────
app.get('/api/super/audit-logs', superAuthMiddleware, async (req, res) => {
  try {
    const { limit = 50, offset = 0, search = '' } = req.query;
    let query = 'SELECT * FROM audit_log';
    const params = [];

    if (search) {
      query += ' WHERE action ILIKE $1 OR username ILIKE $1 OR tenant_id ILIKE $1 OR detail ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

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
