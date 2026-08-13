const { Pool } = require('pg');
const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

async function run() {
  const adminUrl = process.env.CONTROL_PLANE_DB_URL || 'postgres://postgres:iochunt_password@db:5432/iochunt_tenant_josh_database';
  const pool = new Pool({ connectionString: adminUrl });

  try {
    const res = await pool.query('SELECT username FROM users');
    console.log('Current users in josh_database workspace:', res.rows.map(r => r.username));

    const targetUser = 'JoshwaAdmin';
    const targetPass = '%zlaRmj1bNJI';
    const { hash, salt } = hashPassword(targetPass);
    const createdAt = Math.floor(Date.now() / 1000);

    console.log(`\nEnsuring user ${targetUser} exists with the correct password...`);
    
    const userRes = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [targetUser]);
    
    if (userRes.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (username, password_hash, salt, role, force_password_change, created_at)
         VALUES ($1, $2, $3, 'ADMIN', 0, $4)`,
        [targetUser, hash, salt, createdAt]
      );
      console.log(`Created new admin user: ${targetUser}`);
    } else {
      await pool.query(
        `UPDATE users SET password_hash = $1, salt = $2, force_password_change = 0 WHERE id = $3`,
        [hash, salt, userRes.rows[0].id]
      );
      console.log(`Reset password for existing user: ${targetUser}`);
    }
    
    console.log('\n✅ Success! You can now log in.');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

run();
