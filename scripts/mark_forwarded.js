const { getAggregatorPool } = require('../backend/src/config/aggregatorDbManager');

async function run() {
  try {
    const pool = getAggregatorPool('whitehouse_mumbai');
    await pool.query('UPDATE events SET is_forwarded = TRUE');
    console.log('Marked branch events as forwarded.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
