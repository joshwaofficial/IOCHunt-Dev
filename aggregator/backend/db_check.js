const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://iochunt:iochunt_password@localhost:5433/iochunt' });
async function check() {
  try {
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.log("Tables:", tables.rows.map(r => r.table_name).join(', '));
    const events = await pool.query(`SELECT * FROM events ORDER BY timestamp DESC LIMIT 5`);
    console.log("Recent Events:", JSON.stringify(events.rows, null, 2));
  } catch (e) { console.error(e); } finally { pool.end(); }
}
check();
