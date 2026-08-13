const { Pool } = require('pg');
const crypto = require('crypto');

async function run() {
  const tenantId = 'sam123';
  const targetUser = 'SamAdmin';
  const targetPass = '%yYx#brJdTNn';
  
  const pool = new Pool({ connectionString: `postgres://postgres:iochunt_password@db:5432/iochunt_tenant_${tenantId}` });

  try {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [targetUser]);
    console.log(`[DEBUG] Found users for ${targetUser}:`, res.rows.length);

    if (res.rows.length > 0) {
      const user = res.rows[0];
      console.log(`[DEBUG] Stored Hash:`, user.password_hash);
      console.log(`[DEBUG] Stored Salt:`, user.salt);

      const iterations = 100000;
      const keylen = 64;
      const digest = 'sha512';
      const expectedHash = crypto.pbkdf2Sync(targetPass, user.salt, iterations, keylen, digest).toString('hex');
      
      console.log(`[DEBUG] Recomputed Hash:`, expectedHash);
      console.log(`[DEBUG] Match?`, expectedHash === user.password_hash);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
