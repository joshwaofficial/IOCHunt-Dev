// ════════════════════════════════════════════════════════════════
// IOC Hunt — Tenant Provisioning Script (SaaS Architecture)
// ════════════════════════════════════════════════════════════════
// Replaces the old Docker-based provisioning with database-only provisioning.
//
// OLD: Spin up Docker containers (db, app, nginx) on random ports per tenant.
// NEW: Create a dedicated logical PostgreSQL database + role on the central server.
//
// No new Docker containers are created. The shared backend cluster handles
// all tenants via dynamic database connection pooling.
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Load environment variables
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env')
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

// ── Helper: Find an available UDP port for syslog ───────────────
function findAvailablePort(startingPort) {
  return new Promise((resolve) => {
    let port = startingPort;
    function check() {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(port));
        server.close();
      });
      server.on('error', () => {
        port++;
        check();
      });
    }
    check();
  });
}

// ── Helper: Hash password (same as cryptoHelper) ────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

// ── Helper: Encrypt a password with AES-256-CBC ─────────────────
function encryptPassword(plainText) {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn('[Provision] WARNING: No ENCRYPTION_KEY set. Storing DB password as plain text.');
    return plainText;
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Provision a new tenant by creating a dedicated logical database.
 * 
 * @param {object} opts
 * @param {string} opts.company_id - Unique tenant identifier
 * @param {string} opts.company_name - Human-readable name
 * @param {string} opts.admin_username - Initial admin username
 * @param {string} opts.admin_password - Initial admin password
 * @param {number} opts.startingSyslogPort - Starting port to scan for syslog
 * @returns {Promise<object>} - { db_name, db_user, syslog_port }
 */
async function provisionTenant({
  company_id, company_name,
  admin_username, admin_password,
  startingSyslogPort
}) {
  const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbName = `iochunt_tenant_${safeId}`;
  const dbUser = `tenant_${safeId}`;
  const dbPassword = crypto.randomBytes(24).toString('hex');
  const apiKey = 'iochunt-' + crypto.randomBytes(4).toString('hex').slice(0, 7);
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Find an available syslog port
  const syslog_port = await findAvailablePort(startingSyslogPort || 9500);

  // ── STAGE 1: Connect to central PostgreSQL as provisioning admin ──
  const provisioningUrl = process.env.PROVISIONING_DB_URL
    || process.env.SUPER_ADMIN_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgres://postgres:iochunt_password@localhost:5433/postgres';

  // Parse the provisioning URL to get host/port for connecting to the maintenance DB
  const parsedUrl = new URL(provisioningUrl);
  const adminConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/postgres`;

  console.log(`[Provision] Stage 1: Creating dedicated database for tenant ${safeId}...`);

  const adminPool = new Pool({ connectionString: adminConnStr, max: 2 });
  const adminClient = await adminPool.connect();

  try {
    // Create the tenant database
    const dbCheck = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (dbCheck.rows.length === 0) {
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Provision] Database ${dbName} created.`);
    } else {
      console.log(`[Provision] Database ${dbName} already exists.`);
    }

    // Create a dedicated PostgreSQL role
    const roleCheck = await adminClient.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [dbUser]);
    if (roleCheck.rows.length === 0) {
      await adminClient.query(`CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}'`);
      console.log(`[Provision] Role ${dbUser} created.`);
    }

    // Grant least-privilege access
    await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    await adminClient.query(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`);
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  // ── STAGE 2: Initialize schema in the new tenant database ──
  console.log(`[Provision] Stage 2: Initializing schema in ${dbName}...`);

  const tenantConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${dbName}`;
  const tenantPool = new Pool({ connectionString: tenantConnStr, max: 2 });
  const tenantClient = await tenantPool.connect();

  try {
    // Grant schema-level privileges to tenant role
    await tenantClient.query(`GRANT ALL ON SCHEMA public TO "${dbUser}"`);
    await tenantClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`);
    await tenantClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`);

    // Load and execute the IOCHunt table schema
    const schemaPath = path.resolve(__dirname, '../../backend/src/config/db.js');
    let getTableSchemaSQL;
    try {
      getTableSchemaSQL = require(schemaPath).getTableSchemaSQL;
    } catch {
      // Fallback: try relative path for when running inside the super-admin context
      getTableSchemaSQL = require('../../backend/src/config/db').getTableSchemaSQL;
    }

    await tenantClient.query(getTableSchemaSQL());

    // Grant full permissions on all created tables and sequences to the tenant DB role
    await tenantClient.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${dbUser}"`);
    await tenantClient.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${dbUser}"`);

    // Seed the initial admin user
    const { hash, salt } = hashPassword(admin_password);
    const createdAt = Math.floor(Date.now() / 1000);

    await tenantClient.query(
      `INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at)
       VALUES ($1, $2, $3, 'ADMIN', 1, $4)
       ON CONFLICT (username) DO NOTHING`,
      [admin_username, hash, salt, createdAt]
    );

    // Set instance_config
    await tenantClient.query(`
      INSERT INTO instance_config (id, instance_mode, deployment_mode, company_id, company_name, instance_name, setup_complete)
      VALUES (1, 'central_server', 'cloud', $1, $2, $3, TRUE)
      ON CONFLICT (id) DO UPDATE SET
        instance_mode = EXCLUDED.instance_mode,
        company_id = EXCLUDED.company_id,
        company_name = EXCLUDED.company_name,
        setup_complete = TRUE
    `, [safeId, company_name, `${company_name} Central Server`]);

    console.log(`[Provision] Admin user '${admin_username}' seeded in ${dbName}.`);
  } finally {
    tenantClient.release();
    await tenantPool.end();
  }

  // ── STAGE 3: Register tenant in the control plane database ──
  console.log(`[Provision] Stage 3: Registering tenant in control plane...`);

  // Connect to the control plane database (where tenants table lives)
  const controlPlaneDb = process.env.SUPER_ADMIN_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db';

  const cpPool = new Pool({ connectionString: controlPlaneDb, max: 2 });

  try {
    const encryptedPassword = encryptPassword(dbPassword);

    // Ensure tenants table exists (in case control plane hasn't run init yet)
    await cpPool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(64) UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        db_name VARCHAR(255) NOT NULL,
        db_user VARCHAR(255) NOT NULL,
        db_password_encrypted TEXT NOT NULL,
        db_host VARCHAR(255) DEFAULT 'iochunt-db-default',
        db_port INTEGER DEFAULT 5432,
        syslog_port INTEGER,
        api_key_hash VARCHAR(255),
        status VARCHAR(50) DEFAULT 'active',
        tier VARCHAR(50) DEFAULT 'standard',
        max_eps INTEGER DEFAULT 5000,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await cpPool.query(`
      CREATE TABLE IF NOT EXISTS syslog_port_map (
        port INTEGER PRIMARY KEY,
        tenant_id VARCHAR(64),
        protocol VARCHAR(10) DEFAULT 'udp',
        enabled BOOLEAN DEFAULT TRUE,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `);

    await cpPool.query(`
      INSERT INTO tenants (tenant_id, company_name, db_name, db_user, db_password_encrypted, syslog_port, api_key_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        db_name = EXCLUDED.db_name,
        updated_at = EXTRACT(EPOCH FROM NOW())
    `, [safeId, company_name, dbName, dbUser, encryptedPassword, syslog_port, apiKeyHash]);

    // Register syslog port mapping
    await cpPool.query(`
      INSERT INTO syslog_port_map (port, tenant_id) VALUES ($1, $2)
      ON CONFLICT (port) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, enabled = TRUE
    `, [syslog_port, safeId]);

  } finally {
    await cpPool.end();
  }

  console.log(`[Provision] ✅ Tenant ${safeId} fully provisioned:`);
  console.log(`  Database:   ${dbName}`);
  console.log(`  DB User:    ${dbUser}`);
  console.log(`  Syslog:     UDP :${syslog_port}`);
  console.log(`  API Key:    ${apiKey}`);

  return {
    db_name: dbName,
    db_user: dbUser,
    syslog_port,
    api_key: apiKey
  };
}

// If invoked directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.error('Usage: node provision_tenant.js <company_id> <company_name> <admin_username> <admin_password> [starting_syslog_port]');
    process.exit(1);
  }

  provisionTenant({
    company_id: args[0],
    company_name: args[1],
    admin_username: args[2],
    admin_password: args[3],
    startingSyslogPort: parseInt(args[4]) || 9500
  }).then(result => {
    console.log('\nProvisioning result:', JSON.stringify(result, null, 2));
  }).catch(err => {
    console.error('Provisioning failed:', err.message);
    process.exit(1);
  });
}

module.exports = provisionTenant;
