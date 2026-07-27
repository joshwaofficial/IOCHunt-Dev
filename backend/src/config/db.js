// ════════════════════════════════════════════════════════════════
// IOC Hunt — Central Database Connection (Docker-Ready)
// ════════════════════════════════════════════════════════════════
// Uses DATABASE_URL or individual PG_ vars.
// Includes retry logic to handle Docker startup ordering.
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
require('dotenv').config();

// Support both DATABASE_URL and individual variables
const pool = process.env.CENTRAL_DATABASE_URL
  ? new Pool({ connectionString: process.env.CENTRAL_DATABASE_URL })
  : new Pool({
      user: process.env.DB_USER || 'iochunt',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'iochunt_central',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

// Initialize database schema
const initDB = async (retries = 10, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Test connection first
      const client = await pool.connect();
      client.release();
      console.log(`[DB] Connected to PostgreSQL (attempt ${attempt})`);

      const schema = `
    CREATE TABLE IF NOT EXISTS aggregators (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      api_key_hash VARCHAR(255),
      pairing_code_hash VARCHAR(255),
      pairing_expires TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending',
      last_sync TIMESTAMP,
      agent_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      aggregator_name VARCHAR(255) REFERENCES aggregators(name) ON DELETE CASCADE,
      machine VARCHAR(255),
      label VARCHAR(255),
      tag VARCHAR(255),
      severity VARCHAR(50),
      category VARCHAR(255),
      message TEXT,
      ts TIMESTAMP,
      is_noise BOOLEAN DEFAULT FALSE,
      is_alert BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS machines (
      id SERIAL PRIMARY KEY,
      aggregator_name VARCHAR(255) REFERENCES aggregators(name) ON DELETE CASCADE,
      name VARCHAR(255),
      label VARCHAR(255),
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      os VARCHAR(255),
      ip VARCHAR(50),
      "user" VARCHAR(255),
      UNIQUE(aggregator_name, name)
    );

    CREATE TABLE IF NOT EXISTS pol_groups (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      policy_json TEXT DEFAULT '{}',
      updated_at INTEGER DEFAULT 0
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
      updated_at INTEGER DEFAULT 0,
      applied_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token VARCHAR(128) PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR(255),
      role VARCHAR(50),
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT DEFAULT 'Global Admin',
      email TEXT DEFAULT '',
      force_password_change INTEGER DEFAULT 0,
      mfa_secret TEXT,
      mfa_enabled INTEGER DEFAULT 0,
      created_at BIGINT,
      last_login BIGINT
    );

    CREATE TABLE IF NOT EXISTS smtp_config (
      id INTEGER PRIMARY KEY,
      host TEXT DEFAULT '',
      port INTEGER DEFAULT 587,
      secure INTEGER DEFAULT 0,
      username TEXT DEFAULT '',
      password TEXT DEFAULT '',
      from_addr TEXT DEFAULT '',
      from_name TEXT DEFAULT 'IOC Hunt',
      enabled INTEGER DEFAULT 0,
      updated_at INTEGER
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
  `;

      await pool.query(schema);

      // Seed default SMTP config if empty
      await pool.query('INSERT INTO smtp_config(id) VALUES (1) ON CONFLICT (id) DO NOTHING');
      
      // Inject default admin user
      const userRes = await pool.query("SELECT * FROM users WHERE username='admin'");
      if (userRes.rows.length === 0) {
        const cryptoHelper = require('../utils/cryptoHelper');
        const { hash, salt } = cryptoHelper.hashPassword('admin');
        const created_at = Math.floor(Date.now() / 1000);
        await pool.query(
          "INSERT INTO users (username, password_hash, salt, role, created_at) VALUES ('admin', $1, $2, 'Global Admin', $3)", 
          [hash, salt, created_at]
        );
        console.log('[DB] Default admin/admin user created.');
      }
      
      console.log('[DB] PostgreSQL Central Schema Initialized');
      return; // Success — exit retry loop

    } catch (error) {
      console.error(`[DB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        console.log(`[DB] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[DB-FATAL] All connection attempts failed. Exiting.');
        throw error;
      }
    }
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  initDB
};
