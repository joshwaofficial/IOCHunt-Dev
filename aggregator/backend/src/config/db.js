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

// Initialize settings table for Phase 3 (Central Server Pairing)
const initDb = async () => {
  try {
    await waitForDb();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        central_server_url VARCHAR(255),
        central_api_key VARCHAR(255),
        local_retention_days INTEGER DEFAULT 30,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add local_retention_days if it's missing (for existing databases)
    await pool.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS local_retention_days INTEGER DEFAULT 30;
    `);
    
    // Add is_forwarded to events and fw_events for sync service
    await pool.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE fw_events ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT FALSE;
    `);

    console.log('[DB] Aggregator schema verified.');
  } catch (err) {
    console.error('[DB-ERR] Schema init failed:', err.message);
  }
};
initDb();

module.exports = pool;
