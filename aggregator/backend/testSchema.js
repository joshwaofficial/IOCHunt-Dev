require('dotenv').config();
const db = require('./src/config/db');

async function test() {
  try {
    const res1 = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'incident_events';");
    console.log("incident_events schema:", res1.rows);
    const res2 = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'events';");
    console.log("events schema:", res2.rows.filter(r => r.column_name === 'id'));
  } catch(e) {
    console.error("ERROR:", e);
  }
  process.exit(0);
}
test();
