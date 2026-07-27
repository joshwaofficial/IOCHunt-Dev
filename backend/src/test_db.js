const db = require('./config/db');

async function test() {
  const groupId = 'grp_1784743920400_nj1u7';
  const machines = ["MACHINE-DELHI-03"];
  
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const m of machines) {
      await client.query('INSERT INTO machine_groups (machine, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [m, groupId]);
    }
    await client.query('COMMIT');
    console.log("Success");
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("DB Error:", e);
  } finally {
    client.release();
    process.exit();
  }
}

test();
