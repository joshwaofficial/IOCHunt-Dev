const db = require('../config/db');

const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function cleanOldEvents() {
  try {
    const settingsRes = await db.query('SELECT local_retention_days FROM settings LIMIT 1');
    if (settingsRes.rows.length === 0) return;
    
    const { local_retention_days } = settingsRes.rows[0];
    if (!local_retention_days || local_retention_days <= 0) {
      // If 0 or null, we might treat it as "forever"
      return;
    }

    console.log(`[RetentionService] Cleaning up local events older than ${local_retention_days} days...`);
    
    // Only delete events that have successfully been forwarded!
    const res = await db.query(`
      DELETE FROM events 
      WHERE ts::timestamp < (NOW() - INTERVAL '1 day' * $1)
      AND is_forwarded = TRUE
    `, [local_retention_days]);

    if (res.rowCount > 0) {
      console.log(`[RetentionService] Deleted ${res.rowCount} old events from local database.`);
    }
  } catch (error) {
    console.error('[RetentionService] Failed to clean up old events:', error.message);
  }
}

function startRetentionService() {
  console.log('[RetentionService] Starting daily log retention cleaner...');
  setInterval(cleanOldEvents, RETENTION_CHECK_INTERVAL_MS);
  
  // Do a first run a minute after boot
  setTimeout(cleanOldEvents, 60000);
}

module.exports = { startRetentionService };
