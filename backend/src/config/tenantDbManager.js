// ════════════════════════════════════════════════════════════════
// IOC Hunt — Tenant Database Pool Manager (SaaS Architecture)
// ════════════════════════════════════════════════════════════════
// Manages dedicated PostgreSQL connection pools per tenant.
// Each tenant has its own logical database with unique credentials.
// Pools are cached with LRU eviction and idle timeout.
// The backend NEVER connects as the PostgreSQL superuser for data queries.
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
const crypto = require('crypto');

// ── Configuration ───────────────────────────────────────────────
const MAX_CACHED_POOLS = 50;
const POOL_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POOL_MAX_CONNECTIONS = 5;              // per tenant
const CONNECTION_TIMEOUT_MS = 5000;

// ── Pool Cache ──────────────────────────────────────────────────
// Map<tenantId, { pool: Pool, lastAccessed: number }>
const tenantPools = new Map();

// Reference to the control plane pool (set during init)
let controlPlanePool = null;

/**
 * Initialize the tenant DB manager with a reference to the control plane pool.
 * @param {Pool} cpPool - The control plane database connection pool
 */
function init(cpPool) {
  controlPlanePool = cpPool;

  // Start the idle pool reaper
  setInterval(() => {
    const now = Date.now();
    for (const [tenantId, entry] of tenantPools) {
      if (now - entry.lastAccessed > POOL_IDLE_TIMEOUT_MS) {
        console.log(`[TenantDB] Evicting idle pool for tenant: ${tenantId}`);
        entry.pool.end().catch(err => {
          console.error(`[TenantDB] Error closing pool for ${tenantId}:`, err.message);
        });
        tenantPools.delete(tenantId);
      }
    }
  }, 60000); // Check every minute
}

/**
 * Decrypt an AES-256-CBC encrypted password using the ENCRYPTION_KEY env var.
 */
function decryptPassword(encryptedText) {
  if (!encryptedText) return encryptedText;
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !encryptedText.includes(':')) {
    return encryptedText;
  }

  try {
    const key = Buffer.from(keyHex, 'hex');
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = parts.join(':');

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[TenantDB] Failed to decrypt tenant DB password:', e.message);
    return encryptedText;
  }
}

/**
 * Encrypt a plain text password using AES-256-CBC.
 */
function encryptPassword(plainText) {
  if (!plainText) return plainText;
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    console.warn('[TenantDB] No ENCRYPTION_KEY set! Storing password in plain text.');
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
 * Looks up tenant DB credentials from the control plane database
 * and returns or creates a cached connection pool for that tenant.
 * @param {string} tenantId
 * @returns {Promise<Pool>}
 */
async function getTenantPool(tenantId) {
  if (!controlPlanePool) {
    throw new Error('[TenantDB] Manager not initialized. Call init(controlPlanePool) first.');
  }

  // Return cached pool if available
  if (tenantPools.has(tenantId)) {
    const entry = tenantPools.get(tenantId);
    entry.lastAccessed = Date.now();
    return entry.pool;
  }

  // Look up credentials from control plane (check tenants first, then aggregators)
  let res = await controlPlanePool.query(
    'SELECT db_name, db_user, db_password_encrypted, db_host, db_port FROM tenants WHERE tenant_id = $1 AND status = $2',
    [tenantId, 'active']
  );

  if (res.rows.length === 0) {
    res = await controlPlanePool.query(
      'SELECT database_name as db_name, database_user as db_user, database_password_encrypted as db_password_encrypted, database_host as db_host, database_port as db_port FROM aggregators WHERE name = $1 AND status = $2',
      [tenantId, 'active']
    );
  }

  if (res.rows.length === 0) {
    throw new Error(`[TenantDB] Tenant not found or inactive: ${tenantId}`);
  }

  const tenant = res.rows[0];
  const dbPassword = decryptPassword(tenant.db_password_encrypted);

  // Evict oldest pool if we're at capacity
  if (tenantPools.size >= MAX_CACHED_POOLS) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of tenantPools) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      console.log(`[TenantDB] Evicting LRU pool for tenant: ${oldestKey}`);
      const oldEntry = tenantPools.get(oldestKey);
      await oldEntry.pool.end().catch(() => {});
      tenantPools.delete(oldestKey);
    }
  }

  // Build superuser connection string for self-healing operations
  const adminUrl = process.env.CONTROL_PLANE_DB_URL
    || process.env.DATABASE_URL
    || `postgres://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'iochunt_password'}@${tenant.db_host || 'iochunt-db-default'}:${tenant.db_port || 5432}/postgres`;
  const parsedUrl = new URL(adminUrl);

  // Self-healing: Ensure tenant role has full permissions on all existing tables/sequences
  try {
    const tenantAdminConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/${tenant.db_name}`;
    const fixPool = new Pool({ connectionString: tenantAdminConnStr, max: 1 });
    await fixPool.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${tenant.db_user}"`);
    await fixPool.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${tenant.db_user}"`);
    await fixPool.end().catch(() => {});
  } catch (healErr) {
    console.warn(`[TenantDB:${tenantId}] Self-healing permission check note:`, healErr.message);
  }

  // Create a new pool with tenant-specific credentials (NOT superuser)
  let pool = new Pool({
    host: tenant.db_host || 'iochunt-db-default',
    port: tenant.db_port || 5432,
    user: tenant.db_user,
    password: dbPassword,
    database: tenant.db_name,
    max: POOL_MAX_CONNECTIONS,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS
  });

  // Test the connection — if auth fails, self-heal by resetting the role password
  try {
    const testClient = await pool.connect();
    testClient.release();
  } catch (connErr) {
    if (connErr.code === '28P01') {
      // Password mismatch between stored password and PostgreSQL role
      console.warn(`[TenantDB:${tenantId}] Auth failed — resetting role password to match stored credentials...`);
      try {
        const resetConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/postgres`;
        const resetPool = new Pool({ connectionString: resetConnStr, max: 1 });
        // Reset the PostgreSQL role password to match what we have stored
        await resetPool.query(`ALTER ROLE "${tenant.db_user}" WITH PASSWORD '${dbPassword.replace(/'/g, "''")}'`);
        await resetPool.end().catch(() => {});
        console.log(`[TenantDB:${tenantId}] Role password reset successfully. Reconnecting...`);

        // Close the failed pool and create a fresh one
        await pool.end().catch(() => {});
        pool = new Pool({
          host: tenant.db_host || 'iochunt-db-default',
          port: tenant.db_port || 5432,
          user: tenant.db_user,
          password: dbPassword,
          database: tenant.db_name,
          max: POOL_MAX_CONNECTIONS,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: CONNECTION_TIMEOUT_MS
        });

        // Verify the fix worked
        const verifyClient = await pool.connect();
        verifyClient.release();
        console.log(`[TenantDB:${tenantId}] Reconnected successfully after password reset.`);
      } catch (resetErr) {
        console.error(`[TenantDB:${tenantId}] Failed to self-heal:`, resetErr.message);
        throw connErr; // Throw the original auth error
      }
    } else {
      throw connErr;
    }
  }

  pool.on('error', (err) => {
    console.error(`[TenantDB:${tenantId}] Pool error:`, err.message);
  });

  tenantPools.set(tenantId, {
    pool,
    lastAccessed: Date.now()
  });

  console.log(`[TenantDB] Created connection pool for tenant: ${tenantId} → ${tenant.db_name}`);
  return pool;
}

/**
 * Execute a query against a specific tenant's database.
 * @param {string} tenantId
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<object>}
 */
async function queryTenant(tenantId, text, params = []) {
  const pool = await getTenantPool(tenantId);
  return pool.query(text, params);
}

/**
 * Provision a brand-new tenant database on the central PostgreSQL server.
 * Creates a new database, a dedicated role, initializes the schema,
 * and registers the tenant in the control plane.
 *
 * @param {object} opts
 * @param {string} opts.tenantId - Unique tenant identifier (e.g. 'acmecorp')
 * @param {string} opts.companyName - Human-readable company name
 * @param {string} opts.adminUsername - Initial admin username for the tenant
 * @param {string} opts.adminPassword - Initial admin password for the tenant
 * @param {number} opts.syslogPort - Assigned syslog UDP port
 * @param {string} [opts.tier='standard'] - Tenant tier
 * @param {number} [opts.maxEps=5000] - Rate limit (events per second)
 * @returns {Promise<object>} - { db_name, db_user, syslog_port }
 */
async function provisionTenantDb(opts) {
  const {
    tenantId, companyName,
    adminUsername, adminPassword,
    syslogPort, tier = 'standard', maxEps = 5000
  } = opts;

  const safeId = tenantId.replace(/[^a-z0-9_]/g, '_').toLowerCase();
  const dbName = `iochunt_tenant_${safeId}`;
  const dbUser = `tenant_${safeId}`;
  const dbPassword = crypto.randomBytes(24).toString('hex');
  const apiKey = 'iochunt-' + crypto.randomBytes(16).toString('hex');
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Use a provisioning connection (has CREATEDB / CREATEROLE but is NOT superuser)
  const provisioningUrl = process.env.PROVISIONING_DB_URL
    || `postgres://iochunt_provisioner:provision_change_me@${process.env.DB_HOST || 'db'}:5432/postgres`;

  const adminPool = new Pool({ connectionString: provisioningUrl, max: 2 });
  const adminClient = await adminPool.connect();

  try {
    // 1. Create the tenant database
    const dbCheck = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (dbCheck.rows.length === 0) {
      console.log(`[TenantDB] Creating database: ${dbName}`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
    } else {
      console.log(`[TenantDB] Database ${dbName} already exists.`);
    }

    // 2. Create a dedicated role for this tenant
    const roleCheck = await adminClient.query('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1', [dbUser]);
    if (roleCheck.rows.length === 0) {
      console.log(`[TenantDB] Creating role: ${dbUser}`);
      await adminClient.query(`CREATE ROLE "${dbUser}" WITH LOGIN PASSWORD '${dbPassword.replace(/'/g, "''")}'`);
    }

    // 3. Grant privileges (least privilege: only this tenant's database)
    await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    await adminClient.query(`REVOKE ALL ON DATABASE "${dbName}" FROM PUBLIC`);
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  // 4. Connect to the NEW database to initialize schema and seed admin
  const tenantPool = new Pool({
    connectionString: provisioningUrl.replace(/\/[^/]+$/, `/${dbName}`),
    max: 2
  });
  const tenantClient = await tenantPool.connect();

  try {
    // Grant schema-level privileges to the tenant user
    await tenantClient.query(`GRANT ALL ON SCHEMA public TO "${dbUser}"`);
    await tenantClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${dbUser}"`);
    await tenantClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "${dbUser}"`);

    // Initialize the full IOCHunt table schema
    const { getTableSchemaSQL } = require('./db');
    await tenantClient.query(getTableSchemaSQL());

    // Seed the initial admin user
    const { hashPassword } = require('../utils/cryptoHelper');
    const { hash, salt } = hashPassword(adminPassword);
    const createdAt = Math.floor(Date.now() / 1000);

    await tenantClient.query(
      `INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at)
       VALUES ($1, $2, $3, 'ADMIN', 1, $4)
       ON CONFLICT (username) DO NOTHING`,
      [adminUsername, hash, salt, createdAt]
    );

    // Set instance_config for this tenant database
    await tenantClient.query(`
      INSERT INTO instance_config (id, instance_mode, deployment_mode, company_id, company_name, instance_name, setup_complete)
      VALUES (1, 'central_server', 'cloud', $1, $2, $3, TRUE)
      ON CONFLICT (id) DO UPDATE SET
        instance_mode = EXCLUDED.instance_mode,
        company_id = EXCLUDED.company_id,
        company_name = EXCLUDED.company_name,
        setup_complete = TRUE
    `, [safeId, companyName, `${companyName} Central Server`]);

    console.log(`[TenantDB] Schema initialized and admin seeded for ${dbName}`);
  } finally {
    tenantClient.release();
    await tenantPool.end();
  }

  // 5. Register the tenant in the control plane
  const encryptedDbPassword = encryptPassword(dbPassword);

  await controlPlanePool.query(`
    INSERT INTO tenants (tenant_id, company_name, db_name, db_user, db_password_encrypted, syslog_port, api_key_hash, tier, max_eps)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tenant_id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      db_name = EXCLUDED.db_name,
      db_user = EXCLUDED.db_user,
      db_password_encrypted = EXCLUDED.db_password_encrypted,
      syslog_port = EXCLUDED.syslog_port,
      updated_at = EXTRACT(EPOCH FROM NOW())
  `, [safeId, companyName, dbName, dbUser, encryptedDbPassword, syslogPort, apiKeyHash, tier, maxEps]);

  // 6. Register syslog port mapping
  if (syslogPort) {
    await controlPlanePool.query(`
      INSERT INTO syslog_port_map (port, tenant_id, protocol, enabled)
      VALUES ($1, $2, 'udp', TRUE)
      ON CONFLICT (port) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, enabled = TRUE
    `, [syslogPort, safeId]);
  }

  console.log(`[TenantDB] Tenant ${safeId} fully provisioned → DB: ${dbName}, User: ${dbUser}, Syslog: ${syslogPort}`);

  return {
    db_name: dbName,
    db_user: dbUser,
    syslog_port: syslogPort,
    api_key: apiKey  // Return only during provisioning so admin can configure agents
  };
}

/**
 * Close and remove a tenant's cached connection pool.
 * @param {string} tenantId
 */
async function closeTenantPool(tenantId) {
  if (tenantPools.has(tenantId)) {
    const entry = tenantPools.get(tenantId);
    tenantPools.delete(tenantId);
    await entry.pool.end();
    console.log(`[TenantDB] Closed pool for tenant: ${tenantId}`);
  }
}

/**
 * Get diagnostic info about cached pools.
 * @returns {object}
 */
function getPoolStats() {
  const stats = {};
  for (const [tenantId, entry] of tenantPools) {
    stats[tenantId] = {
      totalCount: entry.pool.totalCount,
      idleCount: entry.pool.idleCount,
      waitingCount: entry.pool.waitingCount,
      lastAccessed: new Date(entry.lastAccessed).toISOString()
    };
  }
  return stats;
}

module.exports = {
  init,
  getTenantPool,
  queryTenant,
  provisionTenantDb,
  closeTenantPool,
  getPoolStats,
  encryptPassword,
  decryptPassword
};
