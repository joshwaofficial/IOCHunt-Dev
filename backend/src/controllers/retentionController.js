// ════════════════════════════════════════════════════════════════
// IOC Hunt — Database Retention & Data Expiration Controller
// ════════════════════════════════════════════════════════════════
// Manages telemetry lifecycle, retention policies, and manual
// or scheduled expiration of historical data across tenant databases.
// Supports both Central Server Tenant Database (direct/forwarded logs)
// and Branch Aggregator Dedicated Databases.
// Targets ONLY events and fw_events tables — preserving all other data.
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const { getAggregatorPool } = require('../config/aggregatorDbManager');
const { parseSafeInt } = require('../utils/inputValidator');
const { logSecurityEvent, EVENTS, SEVERITY } = require('../utils/securityLogger');

/**
 * Returns current retention status, server date/time, cutoff calculations,
 * and count of expired records awaiting deletion strictly for the tenant's databases.
 */
const getRetentionStatus = async (req, res) => {
  try {
    const tenantId = req.session?.tenant_id || req.tenantId || 'default';
    const isAggAdmin = req.session?.role === 'AGGREGATOR_ADMIN' || Boolean(req.session?.aggregator_name);

    let settingsRes;
    try {
      settingsRes = await db.query(
        'SELECT local_retention_days, retention_events_days, retention_fw_days, updated_at, last_cleanup_at, last_cleanup_count FROM settings LIMIT 1'
      );
    } catch (err) {
      settingsRes = await db.query(
        'SELECT local_retention_days, updated_at, last_cleanup_at, last_cleanup_count FROM settings LIMIT 1'
      );
    }

    const configuredGeneralDays = settingsRes.rows[0]?.local_retention_days || 30;
    const configuredEventsDays = settingsRes.rows[0]?.retention_events_days || configuredGeneralDays;
    const configuredFwDays = settingsRes.rows[0]?.retention_fw_days || configuredGeneralDays;
    const lastCleanupAt = settingsRes.rows[0]?.last_cleanup_at || null;
    const lastCleanupCount = settingsRes.rows[0]?.last_cleanup_count || 0;

    const requestedEventsDays = req.query.events_days
      ? parseSafeInt(req.query.events_days, configuredEventsDays, 1, 3650)
      : (req.query.days ? parseSafeInt(req.query.days, configuredEventsDays, 1, 3650) : configuredEventsDays);

    const requestedFwDays = req.query.fw_days
      ? parseSafeInt(req.query.fw_days, configuredFwDays, 1, 3650)
      : (req.query.days ? parseSafeInt(req.query.days, configuredFwDays, 1, 3650) : configuredFwDays);

    // 1. Central Server Tenant Database (where agents send logs directly or forwarded from aggregators)
    let tenantDbName = tenantId === 'default' ? (process.env.DB_NAME || 'iochunt_db') : `iochunt_tenant_${tenantId}`;
    let companyDisplay = req.session?.company_name || (tenantId !== 'default' ? tenantId.toUpperCase() : 'Central');
    try {
      const tRes = await db.query('SELECT company_name, db_name FROM tenants WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      if (tRes.rows.length > 0) {
        if (tRes.rows[0].db_name) tenantDbName = tRes.rows[0].db_name;
        if (tRes.rows[0].company_name) companyDisplay = tRes.rows[0].company_name;
      }
    } catch (e) {}

    const centralTenantDb = {
      id: 'central_tenant',
      name: `Central Server (${companyDisplay} Workspace)`,
      db_name: tenantDbName,
      type: 'central_tenant'
    };

    // 2. Branch Aggregator Databases belonging strictly to this tenant
    let branchDbs = [];
    try {
      let aggRes;
      if (isAggAdmin && req.session?.aggregator_name) {
        aggRes = await db.query(
          "SELECT id, name, display_name, database_name, status FROM aggregators WHERE name = $1 AND status != 'deleted'",
          [req.session.aggregator_name]
        );
      } else {
        aggRes = await db.query(
          "SELECT id, name, display_name, database_name, status FROM aggregators WHERE tenant_id = $1 AND status != 'deleted' ORDER BY name ASC",
          [tenantId]
        );
      }
      branchDbs = aggRes.rows.map(a => ({
        id: a.name,
        name: `Branch Aggregator: ${a.display_name || a.name}`,
        db_name: a.database_name || `iochunt_agg_${a.name}`,
        type: 'branch',
        status: a.status
      }));
    } catch (e) {
      console.error('[RetentionStatus] Error fetching tenant aggregators:', e.message);
    }

    // Available databases: Central Server Workspace database (default) + Own branch aggregator databases
    const availableDatabases = [
      centralTenantDb,
      ...branchDbs
    ];

    // Resolve target database scope (defaults to Central Server Tenant Database)
    let target = (req.query.target || '').toLowerCase().trim();
    if (!target || target === 'all' || !availableDatabases.some(d => d.id.toLowerCase() === target)) {
      target = 'central_tenant';
    }

    const now = new Date();
    const eventsCutoff = new Date(now.getTime() - requestedEventsDays * 86400000);
    const fwCutoff = new Date(now.getTime() - requestedFwDays * 86400000);
    const eventsCutoffFormatted = eventsCutoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const fwCutoffFormatted = fwCutoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    const serverTimeFormatted = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    let expiredEvents = 0;
    let expiredFw = 0;
    let totalEvents = 0;
    let totalFw = 0;

    if (target === 'central_tenant') {
      // Query Central Server Tenant Database (where agents send events directly or forwarded from aggregators)
      try {
        const [expEvRes, expFwRes, totEvRes, totFwRes] = await Promise.all([
          req.queryTenant("SELECT COUNT(*) FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedEventsDays]),
          req.queryTenant("SELECT COUNT(*) FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedFwDays]),
          req.queryTenant("SELECT COUNT(*) FROM events"),
          req.queryTenant("SELECT COUNT(*) FROM fw_events")
        ]);
        expiredEvents = parseInt(expEvRes.rows[0]?.count || 0, 10);
        expiredFw = parseInt(expFwRes.rows[0]?.count || 0, 10);
        totalEvents = parseInt(totEvRes.rows[0]?.count || 0, 10);
        totalFw = parseInt(totFwRes.rows[0]?.count || 0, 10);
      } catch (err) {
        console.error('[RetentionStatus] Error querying Central Tenant DB:', err.message);
      }
    } else {
      // Query specific branch aggregator database
      const targetAgg = branchDbs.find(b => b.id.toLowerCase() === target);
      if (targetAgg) {
        try {
          const pool = getAggregatorPool(targetAgg.id);
          const [bExpEv, bExpFw, bTotEv, bTotFw] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedEventsDays]),
            pool.query("SELECT COUNT(*) FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)", [requestedFwDays]),
            pool.query("SELECT COUNT(*) FROM events"),
            pool.query("SELECT COUNT(*) FROM fw_events")
          ]);
          expiredEvents = parseInt(bExpEv.rows[0]?.count || 0, 10);
          expiredFw = parseInt(bExpFw.rows[0]?.count || 0, 10);
          totalEvents = parseInt(bTotEv.rows[0]?.count || 0, 10);
          totalFw = parseInt(bTotFw.rows[0]?.count || 0, 10);
        } catch (err) {
          // Silently skip if branch database is offline
        }
      }
    }

    res.json({
      configured_days: configuredGeneralDays,
      configured_events_days: configuredEventsDays,
      configured_fw_days: configuredFwDays,
      active_events_days: requestedEventsDays,
      active_fw_days: requestedFwDays,
      target,
      server_time_utc: serverTimeFormatted,
      events_cutoff_utc: eventsCutoffFormatted,
      fw_cutoff_utc: fwCutoffFormatted,
      cutoff_time_utc: eventsCutoffFormatted,
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
 * Updates the retention policy days in settings table.
 * Supports updating events retention days, firewall retention days, or local_retention_days.
 */
const updateRetentionPolicy = async (req, res) => {
  try {
    const { local_retention_days, retention_events_days, retention_fw_days } = req.body || {};

    let days = local_retention_days ? parseSafeInt(local_retention_days, null, 1, 3650) : null;
    const evDays = retention_events_days ? parseSafeInt(retention_events_days, null, 1, 3650) : null;
    const fwDays = retention_fw_days ? parseSafeInt(retention_fw_days, null, 1, 3650) : null;

    if (days === null && evDays === null && fwDays === null) {
      return res.status(400).json({ error: 'Retention days must be an integer between 1 and 3650' });
    }

    if (days === null) {
      days = evDays || fwDays || 30;
    }

    const existing = await db.query('SELECT id, local_retention_days, retention_events_days, retention_fw_days FROM settings LIMIT 1').catch(() => ({ rows: [] }));
    const currentEv = existing.rows[0]?.retention_events_days || existing.rows[0]?.local_retention_days || 30;
    const currentFw = existing.rows[0]?.retention_fw_days || existing.rows[0]?.local_retention_days || 30;

    const finalEv = evDays !== null ? evDays : (days !== null ? days : currentEv);
    const finalFw = fwDays !== null ? fwDays : (days !== null ? days : currentFw);
    const finalGeneral = days !== null ? days : finalEv;

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE settings 
         SET local_retention_days = $1, 
             retention_events_days = $2, 
             retention_fw_days = $3, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4`,
        [finalGeneral, finalEv, finalFw, existing.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO settings (id, local_retention_days, retention_events_days, retention_fw_days, updated_at) 
         VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)`,
        [finalGeneral, finalEv, finalFw]
      );
    }

    if (typeof logSecurityEvent === 'function') {
      logSecurityEvent({
        event: 'RETENTION_POLICY_UPDATED',
        severity: SEVERITY.INFO,
        user: req.session?.username || 'system',
        detail: {
          retention_general_days: finalGeneral,
          retention_events_days: finalEv,
          retention_fw_days: finalFw
        }
      });
    }

    res.json({
      success: true,
      local_retention_days: finalGeneral,
      retention_events_days: finalEv,
      retention_fw_days: finalFw,
      message: `Database retention policy updated: Endpoint Events (${finalEv}d), Firewall Logs (${finalFw}d).`
    });
  } catch (error) {
    console.error('[UpdateRetention Error]', error);
    res.status(500).json({ error: 'Failed to update retention policy' });
  }
};

/**
 * Executes an immediate manual purge of records older than X days.
 * Strictly scopes to the current tenant's database(s).
 * Strictly deletes ONLY events and/or fw_events based on log_type ('events' | 'firewall' | 'all').
 * NEVER deletes policies, configurations, users, machines, or incidents.
 */
const purgeExpiredData = async (req, res) => {
  try {
    const tenantId = req.session?.tenant_id || req.tenantId || 'default';
    const isAggAdmin = req.session?.role === 'AGGREGATOR_ADMIN' || Boolean(req.session?.aggregator_name);

    const {
      days: rawDays,
      events_days: rawEventsDays,
      fw_days: rawFwDays,
      target: rawTarget,
      log_type: rawLogType
    } = req.body || {};

    const logType = (rawLogType || 'all').toLowerCase();
    if (!['events', 'firewall', 'all'].includes(logType)) {
      return res.status(400).json({ error: 'Invalid log_type. Must be "events", "firewall", or "all".' });
    }

    const days = parseSafeInt(
      logType === 'events' ? (rawEventsDays || rawDays) : (logType === 'firewall' ? (rawFwDays || rawDays) : rawDays),
      30,
      1,
      3650
    );

    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 86400000);
    const cutoffFormatted = cutoff.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    const target = (rawTarget || 'central_tenant').toLowerCase().trim();

    let deletedEvents = 0;
    let deletedFw = 0;

    if (target === 'central_tenant') {
      // Purge Central Server Tenant Database (direct/forwarded logs)
      try {
        if (logType === 'events' || logType === 'all') {
          const evRes = await req.queryTenant(
            "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          deletedEvents += evRes.rowCount || 0;
        }

        if (logType === 'firewall' || logType === 'all') {
          const fwRes = await req.queryTenant(
            "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          deletedFw += fwRes.rowCount || 0;
        }
      } catch (err) {
        console.error('[Purge Central Tenant DB Error]', err.message);
        return res.status(500).json({ error: 'Failed to purge central tenant data: ' + err.message });
      }
    } else {
      // Purge Branch Aggregator Database
      let branchDbs = [];
      if (isAggAdmin && req.session?.aggregator_name) {
        const aggRes = await db.query(
          "SELECT id, name, display_name, database_name FROM aggregators WHERE name = $1 AND status != 'deleted'",
          [req.session.aggregator_name]
        );
        branchDbs = aggRes.rows;
      } else {
        const aggRes = await db.query(
          "SELECT id, name, display_name, database_name FROM aggregators WHERE tenant_id = $1 AND status != 'deleted'",
          [tenantId]
        );
        branchDbs = aggRes.rows;
      }

      const targetAgg = branchDbs.find(b => b.name.toLowerCase() === target || b.id.toString() === target);
      if (!targetAgg) {
        return res.status(400).json({ error: 'Target database not found or access denied for this tenant.' });
      }

      try {
        const pool = getAggregatorPool(targetAgg.name);

        if (logType === 'events' || logType === 'all') {
          const evRes = await pool.query(
            "DELETE FROM events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          deletedEvents += evRes.rowCount || 0;
        }

        if (logType === 'firewall' || logType === 'all') {
          const fwRes = await pool.query(
            "DELETE FROM fw_events WHERE ts < (NOW() - INTERVAL '1 day' * $1)",
            [days]
          );
          deletedFw += fwRes.rowCount || 0;
        }
      } catch (err) {
        console.warn(`[Purge Branch DB Warning] Skipping branch '${targetAgg.name}':`, err.message);
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
        tenant: tenantId,
        detail: {
          days,
          target,
          log_type: logType,
          cutoff: cutoffFormatted,
          deleted_events: deletedEvents,
          deleted_fw: deletedFw,
          total_deleted: totalDeleted
        }
      });
    }

    const logTypeLabel = logType === 'events'
      ? 'Endpoint Security Events'
      : (logType === 'firewall' ? 'Firewall Connection Logs' : 'Security Telemetry (Events & Firewall)');

    res.json({
      success: true,
      target,
      log_type: logType,
      days,
      cutoff_time_utc: cutoffFormatted,
      deleted_events: deletedEvents,
      deleted_fw_events: deletedFw,
      total_deleted: totalDeleted,
      message: `Successfully purged ${totalDeleted.toLocaleString()} expired ${logTypeLabel} older than ${days} days (recorded before ${cutoffFormatted}).`
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
