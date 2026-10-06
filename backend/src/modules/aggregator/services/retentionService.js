const db = require('../../../config/db');

const RETENTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function cleanOldEvents() {
  try {
    await db.query(`
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS retention_events_days INTEGER DEFAULT 30;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS retention_fw_days INTEGER DEFAULT 30;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_cleanup_at TIMESTAMP;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_cleanup_count INTEGER DEFAULT 0;
    `).catch(() => {});

    const settingsRes = await db.query(
      'SELECT local_retention_days, retention_events_days, retention_fw_days FROM settings LIMIT 1'
    );
    if (settingsRes.rows.length === 0) return;
    
    const row = settingsRes.rows[0];
    const defaultDays = row.local_retention_days || 30;
    const evDays = row.retention_events_days || defaultDays;
    const fwDays = row.retention_fw_days || defaultDays;

    if (evDays <= 0 && fwDays <= 0) return;

    console.log(`[RetentionService] Cleaning up local events (Events: ${evDays}d, Firewall: ${fwDays}d)...`);
    
    // Only delete events that have successfully been forwarded
    const res = await db.query(`
      DELETE FROM events 
      WHERE ts::timestamp < (NOW() - INTERVAL '1 day' * $1)
      AND (is_forwarded = TRUE OR is_forwarded IS NULL)
    `, [evDays]);

    const fwRes = await db.query(`
      DELETE FROM fw_events 
      WHERE ts::timestamp < (NOW() - INTERVAL '1 day' * $1)
      AND (is_forwarded = TRUE OR is_forwarded IS NULL)
    `, [fwDays]).catch(() => ({ rowCount: 0 }));

    const totalCleaned = (res.rowCount || 0) + (fwRes.rowCount || 0);
    if (totalCleaned > 0) {
      await db.query(
        'UPDATE settings SET last_cleanup_at = CURRENT_TIMESTAMP, last_cleanup_count = $1 WHERE id = 1',
        [totalCleaned]
      ).catch(() => {});
      console.log(`[RetentionService] Deleted ${totalCleaned} old forwarded records (${res.rowCount || 0} events, ${fwRes.rowCount || 0} firewall) from local database.`);
    }
  } catch (error) {
    console.error('[RetentionService] Failed to clean up old events:', error.message);
  }
}

function startRetentionService() {
  console.log('[RetentionService] Starting daily log retention cleaner...');
  setInterval(cleanOldEvents, RETENTION_CHECK_INTERVAL_MS);
  
  // First run 1 minute after boot
  setTimeout(cleanOldEvents, 60000);
}

module.exports = { startRetentionService };
