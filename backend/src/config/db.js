// ════════════════════════════════════════════════════════════════
// IOC Hunt — PostgreSQL Connection & Database Initializer
// ════════════════════════════════════════════════════════════════
// Clean relational architecture:
// 1. Central Server DB stores global configuration, users, aggregators, & security data
// 2. Aggregators each maintain their own independent, separate PostgreSQL database
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Load environment variables
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env')
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

const connectionString = process.env.DATABASE_URL
  || process.env.CENTRAL_DATABASE_URL
  || process.env.AGGREGATOR_DATABASE_URL
  || `postgres://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'iochunt_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5433}/${process.env.POSTGRES_DB || 'iochunt_db'}`;

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Returns raw SQL string to initialize all security tables in any target PostgreSQL database
 */
function getTableSchemaSQL() {
  return `
    CREATE TABLE IF NOT EXISTS instance_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      instance_mode VARCHAR(50) NOT NULL DEFAULT 'unconfigured',
      deployment_mode VARCHAR(50) DEFAULT 'onprem',
      company_id VARCHAR(64) DEFAULT '',
      company_name VARCHAR(255) DEFAULT '',
      instance_name VARCHAR(255) DEFAULT 'IOC Hunt',
      setup_complete BOOLEAN DEFAULT FALSE,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT DEFAULT 'ADMIN',
      email TEXT DEFAULT '',
      force_password_change INTEGER DEFAULT 1,
      mfa_secret TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      aggregator_name TEXT DEFAULT NULL,
      display_name TEXT DEFAULT NULL,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      last_login BIGINT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      expires_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mfa_pending (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      expires_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aggregators (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255) DEFAULT '',
      api_key_hash VARCHAR(255),
      pairing_code_hash VARCHAR(255),
      pairing_expires TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending',
      database_name VARCHAR(255) DEFAULT '',
      database_host VARCHAR(255) DEFAULT 'localhost',
      database_port INTEGER DEFAULT 5433,
      database_user VARCHAR(255) DEFAULT 'postgres',
      database_password_encrypted TEXT DEFAULT '',
      last_sync TIMESTAMP,
      agent_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      aggregator_name VARCHAR(255) DEFAULT 'direct',
      machine VARCHAR(255) NOT NULL,
      label VARCHAR(255) DEFAULT '',
      tag VARCHAR(255) NOT NULL DEFAULT '',
      severity VARCHAR(50) DEFAULT 'info',
      category VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      received BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      is_noise BOOLEAN DEFAULT FALSE,
      is_alert BOOLEAN DEFAULT FALSE,
      is_forwarded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_events_unforwarded ON events (id) WHERE is_forwarded = FALSE;

    CREATE TABLE IF NOT EXISTS fw_events (
      id BIGSERIAL PRIMARY KEY,
      aggregator_name VARCHAR(255) DEFAULT 'direct',
      ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      received BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      devname VARCHAR(255) DEFAULT '',
      src_ip VARCHAR(50) DEFAULT '',
      src_port INTEGER DEFAULT 0,
      dst_ip VARCHAR(50) DEFAULT '',
      dst_port INTEGER DEFAULT 0,
      action VARCHAR(50) DEFAULT '',
      service VARCHAR(255) DEFAULT '',
      policy VARCHAR(255) DEFAULT '',
      proto VARCHAR(50) DEFAULT '',
      src_country VARCHAR(10) DEFAULT '',
      dst_country VARCHAR(10) DEFAULT '',
      sent_bytes BIGINT DEFAULT 0,
      rcv_bytes BIGINT DEFAULT 0,
      duration INTEGER DEFAULT 0,
      session_id VARCHAR(255) DEFAULT '',
      severity VARCHAR(50) DEFAULT 'info',
      raw TEXT DEFAULT '',
      is_forwarded BOOLEAN DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_fw_events_unforwarded ON fw_events (id) WHERE is_forwarded = FALSE;

    CREATE TABLE IF NOT EXISTS fw_sources (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      log_path TEXT UNIQUE NOT NULL,
      enabled INTEGER DEFAULT 1,
      created BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      last_read BIGINT DEFAULT 0,
      last_size BIGINT DEFAULT 0,
      lines_ingested BIGINT DEFAULT 0,
      source_timezone VARCHAR(50) DEFAULT 'UTC'
    );

    CREATE TABLE IF NOT EXISTS machines (
      id VARCHAR(255) PRIMARY KEY,
      aggregator_name VARCHAR(255) DEFAULT 'direct',
      name VARCHAR(255) DEFAULT '',
      label VARCHAR(255) DEFAULT '',
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      os VARCHAR(255) DEFAULT 'unknown',
      ip VARCHAR(50) DEFAULT '',
      "user" VARCHAR(255) DEFAULT 'system',
      event_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pol_groups (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      policy_json TEXT DEFAULT '{}',
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS machine_groups (
      machine VARCHAR(255) NOT NULL,
      group_id VARCHAR(64) REFERENCES pol_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (machine, group_id)
    );

    CREATE TABLE IF NOT EXISTS policies (
      machine VARCHAR(255) PRIMARY KEY,
      policy_json TEXT DEFAULT '{}',
      current_json TEXT DEFAULT '{}',
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      applied_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT DEFAULT '',
      status VARCHAR(50) DEFAULT 'new',
      priority VARCHAR(50) DEFAULT 'P2',
      assigned_to VARCHAR(255),
      machine VARCHAR(255) DEFAULT '',
      created_by VARCHAR(255) DEFAULT 'system',
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      resolved_at BIGINT,
      closed_at BIGINT,
      source_chain_id VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS incident_notes (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
      author VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      note_type VARCHAR(50) DEFAULT 'comment'
    );

    CREATE TABLE IF NOT EXISTS incident_events (
      id SERIAL PRIMARY KEY,
      incident_id INTEGER REFERENCES incidents(id) ON DELETE CASCADE,
      event_id INTEGER,
      linked_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
      linked_by VARCHAR(255) DEFAULT 'system',
      UNIQUE (incident_id, event_id)
    );

    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      host TEXT DEFAULT '',
      port INTEGER DEFAULT 587,
      secure INTEGER DEFAULT 0,
      username TEXT DEFAULT '',
      password TEXT DEFAULT '',
      from_addr TEXT DEFAULT '',
      from_name TEXT DEFAULT 'IOC Hunt',
      enabled INTEGER DEFAULT 0,
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS email_schedules (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      recipients TEXT NOT NULL DEFAULT '',
      cron_expr TEXT NOT NULL DEFAULT '0 8 * * 1',
      duration INTEGER DEFAULT 24,
      aggregator TEXT DEFAULT '',
      machine TEXT DEFAULT '',
      severity TEXT DEFAULT '',
      category TEXT DEFAULT '',
      include_fw INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      last_run BIGINT,
      last_status TEXT DEFAULT '',
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      central_server_url VARCHAR(255),
      central_api_key VARCHAR(255),
      aggregator_name VARCHAR(255) DEFAULT '',
      local_retention_days INTEGER DEFAULT 30,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `;
}

/**
 * Initialize database schema and default initial administrative state
 */
const initDB = async (retries = 10, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      try {
        console.log(`[DB] Connected to PostgreSQL (${connectionString.replace(/:[^:@]+@/, ':****@')}) (attempt ${attempt})`);

        // Create all tables
        await client.query(getTableSchemaSQL());

        // Dynamic table migrations for existing databases
        await client.query(`
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_name VARCHAR(255) DEFAULT '';
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_host VARCHAR(255) DEFAULT 'localhost';
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_port INTEGER DEFAULT 5433;
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_user VARCHAR(255) DEFAULT 'postgres';
          ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_password_encrypted TEXT DEFAULT '';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 1;
          ALTER TABLE settings ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT '';
        `);

        // Instance Configuration Initialization
        const envDeployment = process.env.DEPLOYMENT_MODE || 'onprem';
        const isCentral = process.env.IS_CENTRAL_SERVER !== 'false';
        const instanceMode = isCentral ? 'central_server' : 'aggregator';
        const instanceName = isCentral ? 'IOC Hunt Central Command Hub' : (process.env.INSTANCE_NAME || 'Branch Aggregator');

        await client.query(`
          INSERT INTO instance_config (id, instance_mode, deployment_mode, instance_name, setup_complete)
          VALUES (1, $1, $2, $3, TRUE)
          ON CONFLICT (id) DO UPDATE SET
            instance_mode = EXCLUDED.instance_mode,
            instance_name = EXCLUDED.instance_name,
            setup_complete = TRUE
        `, [instanceMode, envDeployment, instanceName]);

        const cryptoHelper = require('../utils/cryptoHelper');

        if (isCentral) {
          // Default Central Super Administrator Seeding (admin / admin with mandatory password change)
          const userRes = await client.query("SELECT * FROM users WHERE username='admin'");
          if (userRes.rows.length === 0) {
            const { hash, salt } = cryptoHelper.hashPassword('admin');
            const createdAt = Math.floor(Date.now() / 1000);
            await client.query(
              "INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at) VALUES ('admin', $1, $2, 'ADMIN', 1, $3)",
              [hash, salt, createdAt]
            );
            console.log('[DB] Default Central Admin initialized (admin / admin).');
          }
        } else {
          // Branch Aggregator Administrator Seeding
          const branchName = process.env.INSTANCE_NAME || 'branch';
          const defaultUsername = `admin_${branchName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
          const userRes = await client.query("SELECT * FROM users WHERE role='AGGREGATOR_ADMIN'");
          if (userRes.rows.length === 0) {
            const { hash, salt } = cryptoHelper.hashPassword('admin');
            const createdAt = Math.floor(Date.now() / 1000);
            await client.query(
              "INSERT INTO users (username, password_hash, salt, role, aggregator_name, force_password_change, created_at) VALUES ($1, $2, $3, 'AGGREGATOR_ADMIN', $4, 1, $5)",
              [defaultUsername, hash, salt, branchName, createdAt]
            );
            console.log(`[DB] Default Branch Admin initialized (${defaultUsername} / admin).`);
          }
        }

        console.log('[DB] Core PostgreSQL Database Tables Initialized Successfully.');
      } finally {
        client.release();
      }
      return;
    } catch (error) {
      console.error(`[DB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        console.log(`[DB] Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error('[DB-FATAL] All PostgreSQL connection attempts failed. Exiting.');
        throw error;
      }
    }
  }
};

/**
 * Standard query execution helper
 */
const query = async (text, params = []) => {
  return pool.query(text, params);
};

module.exports = {
  pool,
  query,
  connect: () => pool.connect(),
  initDB,
  getTableSchemaSQL
};
