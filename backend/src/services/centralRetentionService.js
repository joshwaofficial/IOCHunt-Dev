// ════════════════════════════════════════════════════════════════
// IOC Hunt — Central Server Automated Retention Service
// ════════════════════════════════════════════════════════════════
// Performs daily background cleanup of expired telemetry events
// and firewall connection logs older than the configured days.
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const { getAggregatorPool } = require('../config/aggregatorDbManager');

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runCentralRetentionPurge() {
  try {
    const settingsRes = await db.query('SELECT local_retention_days FROM settings LIMIT 1');
    if (settingsRes.rows.length === 0) return;

    const days = parseInt(settingsRes.rows[0].local_retention_days || 30, 10);
    if (!days || days <= 0) return;

    console.log(`[CentralRetention] Running scheduled daily purge for records older than ${days} days...`);

    let totalDeletedEvents = 0;
    let totalDeletedFw = 0;

    // 1. Purge Central DB
    try {
      const evDel = await db.query(
        "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
        [days]
      );
      const fwDel = await db.query(
        "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
        [days]
      );
      totalDeletedEvents += evDel.rowCount || 0;
      totalDeletedFw += fwDel.rowCount || 0;
    } catch (err) {
      console.error('[CentralRetention] Error cleaning central tables:', err.message);
    }

    // 2. Purge Branch Databases
    try {
      const aggRes = await db.query("SELECT name FROM aggregators WHERE status != 'deleted'");
      for (const agg of aggRes.rows) {
        try {
          const pool = getAggregatorPool(agg.name);
          const aEv = await pool.query(
            "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          const aFw = await pool.query(
            "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          totalDeletedEvents += aEv.rowCount || 0;
          totalDeletedFw += aFw.rowCount || 0;
        } catch (err) {
          // Skip if branch database is offline or not yet initialized
        }
      }
    } catch (e) {
      // Aggregators table may not be present
    }

    const total = totalDeletedEvents + totalDeletedFw;

    // Update settings table with cleanup stats
    await db.query(
      'UPDATE settings SET last_cleanup_at = CURRENT_TIMESTAMP, last_cleanup_count = $1 WHERE id = 1',
      [total]
    ).catch(() => {});

    console.log(`[CentralRetention] Daily purge completed: ${total} expired records deleted (Events: ${totalDeletedEvents}, Firewall: ${totalDeletedFw}) older than ${days} days.`);
  } catch (error) {
    console.error('[CentralRetention] Daily cleanup failed:', error.message);
  }
}

function startCentralRetentionService() {
  console.log('[CentralRetention] Initializing central automated database retention service (24h schedule)...');
  setInterval(runCentralRetentionPurge, RETENTION_INTERVAL_MS);
  // Initial run 1 minute after boot
  setTimeout(runCentralRetentionPurge, 60000);
}

module.exports = { startCentralRetentionService, runCentralRetentionPurge };
