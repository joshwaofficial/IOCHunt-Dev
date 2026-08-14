const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

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

/**
 * Permanently delete a tenant database, role, and control plane records.
 * 
 * @param {string} company_id - Unique tenant identifier
 * @returns {Promise<void>}
 */
async function deleteTenant(company_id) {
  const safeId = company_id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const dbName = `iochunt_tenant_${safeId}`;
  const dbUser = `tenant_${safeId}`;

  console.log(`[Delete] Initiating complete teardown for tenant: ${safeId}`);

  // 1. Connect to Control Plane to retrieve tenant info and delete it
  const controlPlaneDb = process.env.SUPER_ADMIN_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db';

  const cpPool = new Pool({ connectionString: controlPlaneDb, max: 2 });
  
  try {
    // Look up the tenant
    const res = await cpPool.query('SELECT * FROM tenants WHERE tenant_id = $1', [safeId]);
    if (res.rows.length === 0) {
      console.warn(`[Delete] Tenant ${safeId} not found in control plane. Proceeding to drop DB anyway just in case.`);
    } else {
      // Remove port mapping
      await cpPool.query('DELETE FROM syslog_port_map WHERE tenant_id = $1', [safeId]);
      // Remove tenant record
      await cpPool.query('DELETE FROM tenants WHERE tenant_id = $1', [safeId]);
      console.log(`[Delete] Removed tenant ${safeId} from control plane tables.`);
    }
  } catch (e) {
    console.error(`[Delete] Error manipulating control plane: ${e.message}`);
    throw e;
  } finally {
    await cpPool.end();
  }

  // 2. Connect to postgres (maintenance DB) to drop the database and role
  const provisioningUrl = process.env.PROVISIONING_DB_URL
    || process.env.SUPER_ADMIN_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgres://postgres:iochunt_password@localhost:5433/postgres';

  const parsedUrl = new URL(provisioningUrl);
  // Force connect to the 'postgres' default database
  const adminConnStr = `postgres://${parsedUrl.username}:${parsedUrl.password}@${parsedUrl.hostname}:${parsedUrl.port || 5432}/postgres`;

  const adminPool = new Pool({ connectionString: adminConnStr, max: 2 });
  const adminClient = await adminPool.connect();

  try {
    // Terminate all active connections to the target database so it can be dropped
    console.log(`[Delete] Terminating active connections to ${dbName}...`);
    await adminClient.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop the database
    console.log(`[Delete] Dropping database ${dbName}...`);
    await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`[Delete] Database ${dbName} dropped successfully.`);

    // Drop the role
    console.log(`[Delete] Dropping role ${dbUser}...`);
    await adminClient.query(`DROP ROLE IF EXISTS "${dbUser}"`);
    console.log(`[Delete] Role ${dbUser} dropped successfully.`);

  } catch (e) {
    console.error(`[Delete] Error dropping database/role: ${e.message}`);
    throw e;
  } finally {
    adminClient.release();
    await adminPool.end();
  }

  console.log(`[Delete] ✅ Tenant ${safeId} has been fully erased.`);
}

// If invoked directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node delete_tenant.js <company_id>');
    process.exit(1);
  }

  deleteTenant(args[0]).then(() => {
    console.log('\nDeletion complete.');
  }).catch(err => {
    console.error('Deletion failed:', err.message);
    process.exit(1);
  });
}

module.exports = deleteTenant;
