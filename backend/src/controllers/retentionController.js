// ════════════════════════════════════════════════════════════════
// IOC Hunt — Database Retention & Data Expiration Controller
// ════════════════════════════════════════════════════════════════
// Manages telemetry lifecycle, retention policies, and manual
// or scheduled expiration of historical data across all databases.
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const { getAggregatorPool } = require('../config/aggregatorDbManager');
const { parseSafeInt } = require('../utils/inputValidator');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');

/**
 * Returns current retention status, server date/time, cutoff calculation,
 * and count of expired records awaiting deletion.
 */
const getRetentionStatus = async (req, res) => {
  try {
    const settingsRes = await db.query(
      'SELECT local_retention_days, updated_at, last_cleanup_at, last_cleanup_count FROM settings LIMIT 1'
    );
    const configuredDays = settingsRes.rows[0]?.local_retention_days || 30;
    const lastCleanupAt = settingsRes.rows[0]?.last_cleanup_at || null;
    const lastCleanupCount = settingsRes.rows[0]?.last_cleanup_count || 0;

    const requestedDays = req.query.days ? parseSafeInt(req.query.days, configuredDays, 1, 3650) : configuredDays;
    const target = (req.query.target || 'all').toLowerCase();

    const now = new Date();
    const cutoff = new Date(now.getTime() - requestedDays * 86400000);
    const cutoffFormatted = cutoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const serverTimeFormatted = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    // Get list of branch aggregator databases
    let branchDbs = [];
    try {
      const aggRes = await db.query("SELECT id, name, display_name, database_name, status FROM aggregators WHERE status != 'deleted' ORDER BY name ASC");
      branchDbs = aggRes.rows.map(a => ({
        id: a.name,
        name: a.display_name || a.name,
        db_name: a.database_name || `iochunt_agg_${a.name}`,
        type: 'branch',
        status: a.status
      }));
    } catch (e) {
      // In case aggregators table is not available
    }

    const availableDatabases = [
      { id: 'all', name: 'Overall System (Central & All Branch Databases)', db_name: 'All Databases', type: 'system' },
      { id: 'central', name: 'Central Database (iochunt_db)', db_name: process.env.DB_NAME || 'iochunt_db', type: 'central' },
      ...branchDbs
    ];

    let expiredEvents = 0;
    let expiredFw = 0;
    let totalEvents = 0;
    let totalFw = 0;

    // 1. Query Central DB if target is 'all' or 'central'
    if (target === 'all' || target === 'central') {
      try {
        const [expEvRes, expFwRes, totEvRes, totFwRes] = await Promise.all([
          db.query("SELECT COUNT(*) FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedDays]),
          db.query("SELECT COUNT(*) FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedDays]),
          db.query("SELECT COUNT(*) FROM events"),
          db.query("SELECT COUNT(*) FROM fw_events")
        ]);
        expiredEvents += parseInt(expEvRes.rows[0]?.count || 0, 10);
        expiredFw += parseInt(expFwRes.rows[0]?.count || 0, 10);
        totalEvents += parseInt(totEvRes.rows[0]?.count || 0, 10);
        totalFw += parseInt(totFwRes.rows[0]?.count || 0, 10);
      } catch (err) {
        console.error('[RetentionStatus] Error querying Central DB:', err.message);
      }
    }

    // 2. Query Branch DBs if target is 'all' or matches specific branch
    if (target === 'all' || target !== 'central') {
      const targetsToQuery = target === 'all' ? branchDbs : branchDbs.filter(b => b.id === target);
      for (const b of targetsToQuery) {
        try {
          const pool = getAggregatorPool(b.id);
          const [bExpEv, bExpFw, bTotEv, bTotFw] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedDays]),
            pool.query("SELECT COUNT(*) FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedDays]),
            pool.query("SELECT COUNT(*) FROM events"),
            pool.query("SELECT COUNT(*) FROM fw_events")
          ]);
          expiredEvents += parseInt(bExpEv.rows[0]?.count || 0, 10);
          expiredFw += parseInt(bExpFw.rows[0]?.count || 0, 10);
          totalEvents += parseInt(bTotEv.rows[0]?.count || 0, 10);
          totalFw += parseInt(bTotFw.rows[0]?.count || 0, 10);
        } catch (err) {
          // Silently ignore branch databases that have not yet connected or been created
        }
      }
    }

    res.json({
      configured_days: configuredDays,
      active_days: requestedDays,
      target,
      server_time_utc: serverTimeFormatted,
      cutoff_time_utc: cutoffFormatted,
      expired_counts: {
        events: expiredEvents,
        fw_events: expiredFw,
        total: expiredEvents + expiredFw
      },
      total_records: {
        events: totalEvents,
        fw_events: totalFw,
        total: totalEvents + totalFw
      },
      last_cleanup: {
        timestamp: lastCleanupAt,
        deleted_count: lastCleanupCount
      },
      available_databases: availableDatabases
    });
  } catch (error) {
    console.error('[RetentionStatus Error]', error);
    res.status(500).json({ error: 'Failed to retrieve database retention status' });
  }
};

/**
 * Updates the global/local retention policy days in settings table.
 */
const updateRetentionPolicy = async (req, res) => {
  try {
    const { local_retention_days } = req.body;
    const days = parseSafeInt(local_retention_days, null, 1, 3650);
    if (days === null) {
      return res.status(400).json({ error: 'Retention days must be an integer between 1 and 3650' });
    }

    const existing = await db.query('SELECT id FROM settings LIMIT 1');
    if (existing.rows.length > 0) {
      await db.query(
        'UPDATE settings SET local_retention_days = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [days, existing.rows[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO settings (id, local_retention_days, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)',
        [days]
      );
    }

    if (typeof logSecurityEvent === 'function') {
      logSecurityEvent({
        event: 'RETENTION_POLICY_UPDATED',
        severity: SEVERITY.INFO,
        user: req.session?.username || 'system',
        detail: { retention_days: days }
      });
    }

    res.json({
      success: true,
      local_retention_days: days,
      message: `Database retention policy successfully set to ${days} days.`
    });
  } catch (error) {
    console.error('[UpdateRetention Error]', error);
    res.status(500).json({ error: 'Failed to update retention policy' });
  }
};

/**
 * Executes an immediate manual purge of records older than X days for the selected database(s).
 */
const purgeExpiredData = async (req, res) => {
  try {
    const { days: rawDays, target: rawTarget } = req.body;
    const days = parseSafeInt(rawDays, 30, 1, 3650);
    const target = (rawTarget || 'all').toLowerCase();

    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 86400000);
    const cutoffFormatted = cutoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    let deletedEvents = 0;
    let deletedFw = 0;

    // 1. Purge Central DB
    if (target === 'all' || target === 'central') {
      try {
        const evRes = await db.query(
          "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
          [days]
        );
        const fwRes = await db.query(
          "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
          [days]
        );
        deletedEvents += evRes.rowCount || 0;
        deletedFw += fwRes.rowCount || 0;
      } catch (err) {
        console.error('[Purge Central DB Error]', err.message);
      }
    }

    // 2. Purge Branch Databases
    if (target === 'all' || target !== 'central') {
      try {
        const aggRes = await db.query("SELECT name FROM aggregators WHERE status != 'deleted'");
        const targets = target === 'all' ? aggRes.rows : aggRes.rows.filter(r => r.name.toLowerCase() === target);

        for (const agg of targets) {
          try {
            const pool = getAggregatorPool(agg.name);
            const bEvRes = await pool.query(
              "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
              [days]
            );
            const bFwRes = await pool.query(
              "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
              [days]
            );
            deletedEvents += bEvRes.rowCount || 0;
            deletedFw += bFwRes.rowCount || 0;
          } catch (err) {
            console.warn(`[Purge Branch DB Warning] Skipping branch '${agg.name}':`, err.message);
          }
        }
      } catch (e) {
        // Aggregators table may not be present in standalone mode
      }
    }

    const totalDeleted = deletedEvents + deletedFw;

    // Record last cleanup statistics in settings table
    await db.query(
      'UPDATE settings SET last_cleanup_at = CURRENT_TIMESTAMP, last_cleanup_count = $1 WHERE id = 1',
      [totalDeleted]
    ).catch(() => {});

    if (typeof logSecurityEvent === 'function') {
      logSecurityEvent({
        event: 'DATABASE_DATA_PURGED',
        severity: SEVERITY.WARN,
        user: req.session?.username || 'system',
        detail: {
          days,
          target,
          cutoff: cutoffFormatted,
          deleted_events: deletedEvents,
          deleted_fw: deletedFw,
          total_deleted: totalDeleted
        }
      });
    }

    res.json({
      success: true,
      target,
      days,
      cutoff_time_utc: cutoffFormatted,
      deleted_events: deletedEvents,
      deleted_fw_events: deletedFw,
      total_deleted: totalDeleted,
      message: `Successfully purged ${totalDeleted.toLocaleString()} expired records older than ${days} days (recorded before ${cutoffFormatted}).`
    });
  } catch (error) {
    console.error('[PurgeExpiredData Error]', error);
    res.status(500).json({ error: 'Failed to purge expired database data' });
  }
};

module.exports = {
  getRetentionStatus,
  updateRetentionPolicy,
  purgeExpiredData
};
