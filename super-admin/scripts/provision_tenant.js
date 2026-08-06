const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

async function provisionTenant({ company_id, company_name, app_port, https_port, syslog_port }) {
  const rootDir = path.resolve(__dirname, '../../');
  const envFilePath = path.join(rootDir, `.env.${company_id}`);

  // Generate random credentials for this tenant
  const dbPassword = crypto.randomBytes(16).toString('hex');
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const apiKey = 'iochunt-' + crypto.randomBytes(16).toString('hex');
  
  const envContent = `
# ── Tenant Configuration for ${company_name} ─────────────────────
TENANT_ID=${company_id}
INSTANCE_MODE=central_server

# ── Ports ────────────────────────────────────────────────────────
APP_PORT=${app_port}
NGINX_HTTPS_PORT=${https_port}
SYSLOG_PORT=${syslog_port}

# ── Database ─────────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${dbPassword}
POSTGRES_DB=iochunt_db

# ── Security ─────────────────────────────────────────────────────
ENCRYPTION_KEY=${encryptionKey}
API_KEY=${apiKey}
FRONTEND_URL=*
`;

  console.log(`[Provision] Writing environment file for tenant ${company_id} at ${envFilePath}`);
  fs.writeFileSync(envFilePath, envContent.trim() + '\n');

  console.log(`[Provision] Spinning up docker stack for tenant ${company_id}...`);
  try {
    // Run docker compose up with the dynamically generated env file
    // We use -p <company_id> to completely isolate the container names
    execSync(`docker compose -p ${company_id} -f docker-compose.yml --env-file .env.${company_id} up -d`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log(`[Provision] Successfully spun up tenant ${company_id} on HTTPS port ${https_port}`);
    return true;
  } catch (error) {
    console.error(`[Provision] Failed to spin up docker stack for tenant ${company_id}:`, error.message);
    throw error;
  }
}

// If invoked directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.error('Usage: node provision_tenant.js <company_id> <company_name> <app_port> <https_port> <syslog_port>');
    process.exit(1);
  }
  
  provisionTenant({
    company_id: args[0],
    company_name: args[1],
    app_port: parseInt(args[2]),
    https_port: parseInt(args[3]),
    syslog_port: parseInt(args[4])
  }).catch(() => process.exit(1));
}

module.exports = provisionTenant;
