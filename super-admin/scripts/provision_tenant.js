const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const { Client } = require('pg');

// Helper to find an available port
function findAvailablePort(startingPort, type = 'tcp') {
  return new Promise((resolve) => {
    let port = startingPort;
    function check() {
      if (type === 'tcp') {
        const server = net.createServer();
        server.listen(port, () => {
          server.once('close', () => resolve(port));
          server.close();
        });
        server.on('error', () => {
          port++;
          check();
        });
      } else if (type === 'udp') {
        const dgram = require('dgram');
        const server = dgram.createSocket('udp4');
        server.bind(port, () => {
          server.close(() => resolve(port));
        });
        server.on('error', () => {
          port++;
          check();
        });
      }
    }
    check();
  });
}

// Generate salted password hash identical to what cryptoHelper does
function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

async function provisionTenant({ 
  company_id, company_name, 
  admin_username, admin_password,
  startingAppPort, startingHttpsPort, startingHttpPort, startingSyslogPort, startingDbPort
}) {
  const rootDir = path.resolve(__dirname, '../../');
  const envFilePath = path.join(rootDir, `.env.${company_id}`);

  // Find exact available ports dynamically
  const app_port = await findAvailablePort(startingAppPort, 'tcp');
  const https_port = await findAvailablePort(startingHttpsPort, 'tcp');
  const http_port = await findAvailablePort(startingHttpPort, 'tcp');
  const syslog_port = await findAvailablePort(startingSyslogPort, 'udp');
  const db_port = await findAvailablePort(startingDbPort, 'tcp');

  // Generate random credentials for this tenant's internal database
  const dbPassword = crypto.randomBytes(16).toString('hex');
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const apiKey = 'iochunt-' + crypto.randomBytes(16).toString('hex');
  
  const envContent = `
# ── Tenant Configuration for ${company_name} ─────────────────────
TENANT_ID=${company_id}
INSTANCE_MODE=central_server

# ── Ports ────────────────────────────────────────────────────────
APP_PORT=${app_port}
NGINX_HTTP_PORT=${http_port}
NGINX_HTTPS_PORT=${https_port}
SYSLOG_PORT=${syslog_port}
POSTGRES_PORT=${db_port}

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

  try {
    // ── STAGE 1: Spin up ONLY the database container ──
    console.log(`[Provision] Stage 1: Spinning up Postgres container for tenant ${company_id}...`);
    execSync(`docker compose -p ${company_id} -f docker-compose.yml --env-file .env.${company_id} up -d db`, {
      cwd: rootDir,
      stdio: 'inherit'
    });

    console.log(`[Provision] Waiting 10 seconds for PostgreSQL to initialize...`);
    await new Promise(resolve => setTimeout(resolve, 10000));

    // ── STAGE 2: Direct Database Injection ──
    console.log(`[Provision] Injecting Admin Credentials directly into isolated database on port ${db_port}...`);
    const pgClient = new Client({
      host: '127.0.0.1',
      port: db_port,
      user: 'postgres',
      password: dbPassword,
      database: 'iochunt_db'
    });

    await pgClient.connect();
    
    // Ensure the users table exists (it might not be fully initialized yet by the backend, so we create it if it doesn't exist)
    await pgClient.query(`
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
    `);

    const { hash, salt } = hashPassword(admin_password);
    const createdAt = Math.floor(Date.now() / 1000);

    // Insert the admin user with force_password_change = 1
    await pgClient.query(
      "INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at) VALUES ($1, $2, $3, 'ADMIN', 1, $4) ON CONFLICT DO NOTHING",
      [admin_username, hash, salt, createdAt]
    );

    await pgClient.end();
    console.log(`[Provision] Successfully injected admin credentials for ${admin_username}.`);

    // ── STAGE 3: Spin up the rest of the stack ──
    console.log(`[Provision] Stage 3: Spinning up the full stack for tenant ${company_id}...`);
    execSync(`docker compose -p ${company_id} -f docker-compose.yml --env-file .env.${company_id} up -d`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    
    console.log(`[Provision] Successfully provisioned tenant ${company_id} on HTTPS port ${https_port}`);
    
    return {
      app_port, https_port, syslog_port, db_port
    };
  } catch (error) {
    console.error(`[Provision] Failed to spin up docker stack for tenant ${company_id}:`, error.message);
    throw error;
  }
}

// If invoked directly from command line
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 9) {
    console.error('Usage: node provision_tenant.js <company_id> <company_name> <admin_username> <admin_password> <startingApp> <startingHttp> <startingHttps> <startingSyslog> <startingDb>');
    process.exit(1);
  }
  
  provisionTenant({
    company_id: args[0],
    company_name: args[1],
    admin_username: args[2],
    admin_password: args[3],
    startingAppPort: parseInt(args[4]),
    startingHttpPort: parseInt(args[5]),
    startingHttpsPort: parseInt(args[6]),
    startingSyslogPort: parseInt(args[7]),
    startingDbPort: parseInt(args[8])
  }).then(console.log).catch(() => process.exit(1));
}

module.exports = provisionTenant;
