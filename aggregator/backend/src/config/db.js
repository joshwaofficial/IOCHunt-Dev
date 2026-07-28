// ════════════════════════════════════════════════════════════════
// IOC Hunt — Aggregator Database Connection (Docker-Ready)
// ════════════════════════════════════════════════════════════════
// Uses AGGREGATOR_DATABASE_URL or DATABASE_URL.
// Includes retry logic to handle Docker startup ordering.
// ════════════════════════════════════════════════════════════════

const { Pool } = require('pg');
require('dotenv').config();

const AGGREGATOR_NAME = process.env.AGGREGATOR_NAME;
if (!AGGREGATOR_NAME) {
  console.error('[FATAL] AGGREGATOR_NAME environment variable is required!');
  console.error('[FATAL] Set AGGREGATOR_NAME=branch-1 (or your branch name) in .env');
  process.exit(1);
}
console.log(`[DB] Aggregator "${AGGREGATOR_NAME}" connecting to database...`);

const connectionString = process.env.AGGREGATOR_DATABASE_URL
  || process.env.DATABASE_URL
  || `postgres://iochunt:iochunt_password@db:5432/iochunt_aggregator`;

const pool = new Pool({ connectionString });

pool.on('error', (err, client) => {
  console.error('[DB] Unexpected error on idle client', err.message);
});

// Wait for database to be ready (Docker startup ordering)
async function waitForDb(retries = 10, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(`[DB] Connected to PostgreSQL (attempt ${attempt})`);
      return;
    } catch (error) {
      console.error(`[DB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        console.log(`[DB] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// Initialize schema for Aggregator Server
const initDb = async () => {
  try {
    await waitForDb();

    const schema = `
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        central_server_url VARCHAR(255),
        central_api_key VARCHAR(255),
        local_retention_days INTEGER DEFAULT 30,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        machine VARCHAR(255) NOT NULL,
        ts TIMESTAMP NOT NULL,
        tag VARCHAR(255) NOT NULL,
        severity VARCHAR(50) DEFAULT 'info',
        category VARCHAR(255) DEFAULT '',
        message TEXT NOT NULL,
        received BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        is_noise INTEGER DEFAULT 0,
        is_forwarded BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS machines (
        id VARCHAR(255) PRIMARY KEY,
        label VARCHAR(255),
        last_seen BIGINT,
        event_count INTEGER DEFAULT 0,
        ip VARCHAR(50) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS fw_events (
        id SERIAL PRIMARY KEY,
        ts TIMESTAMP,
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

      CREATE TABLE IF NOT EXISTS pol_groups (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
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
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        linked_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        linked_by VARCHAR(255) DEFAULT 'system',
        UNIQUE (incident_id, event_id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'viewer',
        email VARCHAR(255) DEFAULT '',
        force_password_change INTEGER DEFAULT 0,
        mfa_secret TEXT,
        mfa_enabled INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS smtp_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        host VARCHAR(255) DEFAULT '',
        port INTEGER DEFAULT 587,
        secure INTEGER DEFAULT 0,
        username VARCHAR(255) DEFAULT '',
        password VARCHAR(255) DEFAULT '',
        from_addr VARCHAR(255) DEFAULT '',
        from_name VARCHAR(255) DEFAULT 'IOC Hunt',
        enabled INTEGER DEFAULT 0,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );

      CREATE TABLE IF NOT EXISTS email_schedules (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        recipients TEXT DEFAULT '',
        cron_expr VARCHAR(255) DEFAULT '0 8 * * 1',
        duration INTEGER DEFAULT 24,
        machine VARCHAR(255) DEFAULT '',
        severity VARCHAR(50) DEFAULT '',
        category VARCHAR(255) DEFAULT '',
        include_fw INTEGER DEFAULT 1,
        enabled INTEGER DEFAULT 1,
        last_run BIGINT,
        last_status TEXT DEFAULT '',
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      );
    `;

    await pool.query(schema);
    await pool.query('INSERT INTO smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING');

    // Inject default admin if not exists
    const adminCheck = await pool.query("SELECT id FROM users WHERE username='iochunt'");
    if (adminCheck.rows.length === 0) {
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync('iochunt', salt, 100000, 64, 'sha512').toString('hex');
      await pool.query(
        "INSERT INTO users (username, password_hash, salt, role, force_password_change) VALUES ('iochunt', $1, $2, 'admin', 1)",
        [hash, salt]
      );
      console.log('[AUTH] Default local aggregator admin created — username: iochunt password: iochunt');
    }


    console.log('[DB] Aggregator schema verified.');
  } catch (err) {
    console.error('[DB-ERR] Schema init failed:', err.message);
  }
};
initDb();

module.exports = pool;
