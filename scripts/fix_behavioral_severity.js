#!/usr/bin/env node

// ════════════════════════════════════════════════════════════════
// IOC Hunt — Normalize [BEHAVIORAL-IOC] Events to Medium Severity
// ════════════════════════════════════════════════════════════════
// Updates existing historical events in all active databases
// ════════════════════════════════════════════════════════════════

const path = require('path');
const dotenvPath = path.join(__dirname, '../backend/node_modules/dotenv');
const dotenv = require(dotenvPath);

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const { Pool } = require(path.join(__dirname, '../backend/node_modules/pg'));

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db';

async function fixSeverity() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  IOC Hunt — Normalizing [BEHAVIORAL-IOC] Severity');
  console.log('══════════════════════════════════════════════════════\n');

  const pool = new Pool({ connectionString });

  try {
    const client = await pool.connect();
    try {
      console.log('[1/2] Updating default database events...');
      const updateRes = await client.query(`
        UPDATE events 
        SET severity = 'medium' 
        WHERE (tag ILIKE '%BEHAVIORAL-IOC%' OR tag ILIKE '%BEHAVIORAL%' OR message ILIKE '%BEHAVIORAL-IOC%')
          AND LOWER(severity) != 'medium'
      `);
      console.log(`      ✅ Updated ${updateRes.rowCount} event(s) to 'medium'.`);

      // Check tenant databases if any
      console.log('[2/2] Checking tenant databases...');
      try {
        const tenantsRes = await client.query("SELECT db_name, db_user, db_host, db_port FROM tenants WHERE status = 'active'");
        for (const t of tenantsRes.rows) {
          const tPool = new Pool({
            host: t.db_host || 'localhost',
            port: t.db_port || 5432,
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: t.db_name
          });
          try {
            const tRes = await tPool.query(`
              UPDATE events 
              SET severity = 'medium' 
              WHERE (tag ILIKE '%BEHAVIORAL-IOC%' OR tag ILIKE '%BEHAVIORAL%' OR message ILIKE '%BEHAVIORAL-IOC%')
                AND LOWER(severity) != 'medium'
            `);
            console.log(`      ✅ Tenant '${t.db_name}': updated ${tRes.rowCount} event(s) to 'medium'.`);
          } catch (te) {
            console.warn(`      ⚠️ Could not update tenant ${t.db_name}:`, te.message);
          } finally {
            await tPool.end().catch(() => {});
          }
        }
      } catch (_) {
        console.log('      (No tenants table in this deployment mode).');
      }

      console.log('\n🎉 Finished! All [BEHAVIORAL-IOC] events normalized to medium.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Database connection error:', err.message);
  } finally {
    await pool.end().catch(() => {});
  }
}

fixSeverity();
