const { Client } = require('../backend/node_modules/pg');

async function run() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    port: 5433,
    database: 'iochunt_agg_whitehouse_mumbai',
    password: process.env.AGG_DB_PASSWORD || 'iochunt_password'
  });
  
  try {
    await client.connect();
    const res = await client.query("SELECT count(*) FROM events");
    console.log("Branch events count:", res.rows[0]);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
    process.exit(0);
  }
}

run();
