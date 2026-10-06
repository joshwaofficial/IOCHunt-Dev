// ════════════════════════════════════════════════════════════════
// IOC Hunt — Central Server Automated Retention Service
// ════════════════════════════════════════════════════════════════
// Performs daily background cleanup of expired telemetry events
// and firewall connection logs older than their configured periods.
// Cleans both Central Server Tenant Databases and Branch Databases.
// Strictly targets ONLY events and fw_events tables.
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const { getAggregatorPool } = require('../config/aggregatorDbManager');

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runCentralRetentionPurge() {
  try {
    const settingsRes = await db.query(
      'SELECT local_retention_days, retention_events_days, retention_fw_days FROM settings LIMIT 1'
    ).catch(() => ({ rows: [] }));

    if (settingsRes.rows.length === 0) return;

    const baseDays = parseInt(settingsRes.rows[0].local_retention_days || 30, 10);
    const evDays = parseInt(settingsRes.rows[0].retention_events_days || baseDays, 10);
    const fwDays = parseInt(settingsRes.rows[0].retention_fw_days || baseDays, 10);

    if (evDays <= 0 && fwDays <= 0) return;

    console.log(`[CentralRetention] Running scheduled daily purge (Events: ${evDays}d, Firewall: ${fwDays}d)...`);

    let totalDeletedEvents = 0;
    let totalDeletedFw = 0;

    // 1. Purge all Central Tenant Databases
    try {
      const tenantDbManager = require('../config/tenantDbManager');
      const tenantsRes = await db.query("SELECT tenant_id FROM tenants WHERE status = 'active'");
      for (const t of tenantsRes.rows) {
        try {
          const tPool = await tenantDbManager.getTenantPool(t.tenant_id);
          const tEv = await tPool.query(
            "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [evDays]
          );
          const tFw = await tPool.query(
            "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [fwDays]
          );
          totalDeletedEvents += tEv.rowCount || 0;
          totalDeletedFw += tFw.rowCount || 0;
        } catch (tErr) {
          // Skip if tenant DB offline
        }
      }
    } catch (e) {
      // In standalone or onprem mode without tenant manager
    }

    // Also purge central DB if standalone/on-prem
    try {
      const defEv = await db.query(
        "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
        [evDays]
      );
      const defFw = await db.query(
        "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
        [fwDays]
      );
      totalDeletedEvents += defEv.rowCount || 0;
      totalDeletedFw += defFw.rowCount || 0;
    } catch (e) {
      // Ignore if table not present in control plane
    }

    // 2. Purge Branch Databases for registered aggregators
    try {
      const aggRes = await db.query("SELECT name FROM aggregators WHERE status != 'deleted'");
      for (const agg of aggRes.rows) {
        try {
          const pool = getAggregatorPool(agg.name);
          const aEv = await pool.query(
            "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [evDays]
          );
          const aFw = await pool.query(
            "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [fwDays]
          );
          totalDeletedEvents += aEv.rowCount || 0;
          totalDeletedFw += aFw.rowCount || 0;
        } catch (err) {
          // Skip if branch database is offline
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

    console.log(`[CentralRetention] Daily purge completed: ${total} expired records deleted (Events: ${totalDeletedEvents}, Firewall: ${totalDeletedFw}).`);
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
