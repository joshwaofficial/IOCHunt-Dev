const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

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

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

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
    return encryptedText;
  }
}

async function run() {
  const tenantId = process.argv[2];
  const username = process.argv[3];
  const newPassword = process.argv[4];

  if (!tenantId || !username || !newPassword) {
    console.error("Usage: node reset_tenant_password.js <tenant_id> <username> <new_password>");
    process.exit(1);
  }

  const cpPool = new Pool({
    connectionString: process.env.SUPER_ADMIN_DATABASE_URL || 'postgres://postgres:iochunt_password@localhost:5433/iochunt_db'
  });

  const tenantRes = await cpPool.query("SELECT * FROM tenants WHERE tenant_id = \$1", [tenantId]);
  if (tenantRes.rows.length === 0) {
    console.error("Tenant not found.");
    process.exit(1);
  }
  const tenant = tenantRes.rows[0];
  const dbPassword = decryptPassword(tenant.db_password_encrypted);

  const tenantPool = new Pool({
    host: tenant.db_host || 'iochunt-db-default',
    port: tenant.db_port || 5432,
    user: tenant.db_user,
    password: dbPassword,
    database: tenant.db_name
  });

  const { hash, salt } = hashPassword(newPassword);
  const updateRes = await tenantPool.query(
    "UPDATE users SET password_hash = \$1, salt = \$2 WHERE LOWER(username) = LOWER(\$3) RETURNING *",
    [hash, salt, username]
  );

  if (updateRes.rows.length === 0) {
    console.error("User not found in tenant database.");
  } else {
    console.log(`Password reset successfully for ${username} in tenant ${tenantId}.`);
  }
  
  await tenantPool.end();
  await cpPool.end();
}
run().catch(console.error);
