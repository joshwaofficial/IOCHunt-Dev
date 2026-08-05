#!/usr/bin/env node

// ════════════════════════════════════════════════════════════════
// IOC Hunt — Database Clear & Reset Script
// ════════════════════════════════════════════════════════════════
// Usage: node scripts/clear_all_databases.js
// Or:    npm run db:reset (from backend directory)
// ════════════════════════════════════════════════════════════════

const path = require('path');
const dotenvPath = path.join(__dirname, '../backend/node_modules/dotenv');
const dotenv = require(dotenvPath);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = require(path.join(__dirname, '../backend/node_modules/pg'));
const cryptoHelper = require(path.join(__dirname, '../backend/src/utils/cryptoHelper'));

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5433', 10);
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'iochunt_password';
const DB_NAME = process.env.DB_NAME || 'iochunt_db';

async function clearAllDatabases() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  IOC Hunt — Wiping All Databases & Seeding Master Admin');
  console.log('══════════════════════════════════════════════════════\n');

  const adminPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres'
  });

  try {
    // 1. Drop all separate branch aggregator databases
    console.log('[1/4] Scanning for dynamic branch aggregator databases...');
    const dbsRes = await adminPool.query("SELECT datname FROM pg_database WHERE datname LIKE 'iochunt_agg_%'");
    
    if (dbsRes.rows.length === 0) {
      console.log('      No branch aggregator databases found.');
    } else {
      for (const row of dbsRes.rows) {
        const dbName = row.datname;
        console.log(`      Terminating connections and dropping: ${dbName}...`);
        await adminPool.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid();
        `, [dbName]);
        await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}";`);
        console.log(`      ✓ Dropped ${dbName}`);
      }
    }

    // 2. Connect to central iochunt_db and clean tables
    console.log('\n[2/4] Truncating all data in Central Database (' + DB_NAME + ')...');
    const centralPool = new Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME
    });

    // Ensure schema columns are present
    await centralPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 1;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT '';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_name VARCHAR(255) DEFAULT '';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_host VARCHAR(255) DEFAULT 'localhost';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_port INTEGER DEFAULT 5433;
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_user VARCHAR(255) DEFAULT 'postgres';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS database_password_encrypted TEXT DEFAULT '';
      ALTER TABLE aggregators ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP;

      TRUNCATE TABLE users, sessions, aggregators, events, machines, incidents, policies, machine_groups, settings CASCADE;
    `);
    console.log('      ✓ All central data tables truncated successfully.');

    // 3. Reset instance_config to Central Server
    console.log('\n[3/4] Initializing instance_config as Central Server...');
    await centralPool.query(`
      DELETE FROM instance_config;
      INSERT INTO instance_config (id, instance_mode, deployment_mode, instance_name, setup_complete)
      VALUES (1, 'central_server', 'onprem', 'IOC Hunt Central Command Hub', TRUE);
    `);
    console.log('      ✓ Mode set to: central_server (setup_complete = TRUE)');

    // 4. Seed ONLY Central Server Admin credentials: admin / admin (with force_password_change = 1)
    console.log('\n[4/4] Seeding default Central Admin account (admin / admin)...');
    const { hash, salt } = cryptoHelper.hashPassword('admin');
    const now = Math.floor(Date.now() / 1000);
    await centralPool.query(`
      INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at)
      VALUES ('admin', $1, $2, 'ADMIN', 1, $3);
    `, [hash, salt, now]);

    await centralPool.query(`
      INSERT INTO settings (id, local_retention_days, updated_at)
      VALUES (1, 30, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING;
    `);

    await centralPool.end();

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  ✅ DATABASE WIPE COMPLETE!');
    console.log('  ➜ Default Admin:     admin');
    console.log('  ➜ Default Password:  admin');
    console.log('  ➜ Mandatory Reset:   Enabled on first login');
    console.log('══════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n[ERROR] Database clear failed:', err);
    process.exit(1);
  } finally {
    await adminPool.end();
  }
}

clearAllDatabases();
