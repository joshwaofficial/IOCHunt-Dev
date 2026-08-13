const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgres://postgres:iochunt_password@localhost:5433/iochunt_tenant_josh_database'
});

async function run() {
  try {
    const res = await pool.query('SELECT username FROM users');
    console.log('Users in josh_database:', res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
