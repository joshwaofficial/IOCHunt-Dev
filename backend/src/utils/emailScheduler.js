const cron = require('node-cron');
const db = require('../config/db');
const { generateAndSendReport } = require('./reportBuilder');

const activeCrons = {};

function getQueryFn(tenantId) {
  const { isAggregator, isOnPrem } = require('../config/appMode');
  const tenantDbManager = require('../config/tenantDbManager');
  if (isAggregator() || isOnPrem() || !tenantId || tenantId === 'default' || tenantId === 'iochunt-default') {
    return db.query.bind(db);
  }
  return (text, params) => tenantDbManager.queryTenant(tenantId, text, params);
}

function getCronKey(scheduleId, tenantId) {
  return tenantId ? `${tenantId}:${scheduleId}` : `${scheduleId}`;
}

function startSchedule(s, tenantId = null) {
  const tId = tenantId || s.tenant_id || null;
  const cronKey = getCronKey(s.id, tId);

  if (activeCrons[cronKey]) {
    activeCrons[cronKey].stop();
    delete activeCrons[cronKey];
  }
  if (!s.enabled) return;

  const q = getQueryFn(tId);

  try {
    activeCrons[cronKey] = cron.schedule(s.cron_expr, async () => {
      try {
        const freshRes = await q('SELECT * FROM email_schedules WHERE id=$1', [s.id]);
        const currentSched = freshRes.rows[0] || s;

        await generateAndSendReport(currentSched, q, false);

        const nowUnix = Math.floor(Date.now() / 1000);
        await q('UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
          [nowUnix, 'OK', s.id]);
        s.last_run = nowUnix;
      } catch (e) {
        console.error(`[EMAIL] Schedule "${s.name}" (Tenant: ${tId || 'default'}) failed:`, e.message);
        await q('UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
          [Math.floor(Date.now() / 1000), 'ERROR: ' + e.message.slice(0, 120), s.id]);
      }
    });
    console.log(`[EMAIL] Scheduled "${s.name}" (Tenant: ${tId || 'default'}) → ${s.cron_expr}`);
  } catch (e) {
    console.error(`[EMAIL] Invalid cron "${s.cron_expr}" for schedule ${s.id}:`, e.message);
  }
}

function stopSchedule(id, tenantId = null) {
  if (tenantId) {
    const cronKey = getCronKey(id, tenantId);
    if (activeCrons[cronKey]) {
      activeCrons[cronKey].stop();
      delete activeCrons[cronKey];
    }
  } else {
    if (activeCrons[id]) {
      activeCrons[id].stop();
      delete activeCrons[id];
    }
    for (const key of Object.keys(activeCrons)) {
      if (key === `${id}` || key.endsWith(`:${id}`)) {
        activeCrons[key].stop();
        delete activeCrons[key];
      }
    }
  }
}

async function initSchedules() {
  const { isAggregator, isOnPrem } = require('../config/appMode');
  const tenantDbManager = require('../config/tenantDbManager');

  if (isAggregator()) return;

  // On-prem / single-tenant load
  if (isOnPrem()) {
    try {
      const schedulesRes = await db.query('SELECT * FROM email_schedules WHERE enabled=1');
      schedulesRes.rows.forEach(s => startSchedule(s, null));
      console.log(`[EMAIL] Loaded ${schedulesRes.rowCount} on-prem schedule(s)`);
    } catch (err) {
      console.error('[EMAIL] Failed to init on-prem schedules:', err.message);
    }
    return;
  }

  // Multi-tenant (cloud / SaaS) mode:
  // 1. Control-plane / default DB
  try {
    const defaultSchedules = await db.query('SELECT * FROM email_schedules WHERE enabled=1');
    defaultSchedules.rows.forEach(s => startSchedule(s, 'default'));
  } catch (_) {}

  // 2. All active tenant databases
  try {
    const tenantsRes = await db.query("SELECT tenant_id FROM tenants WHERE status = 'active'");
    for (const t of tenantsRes.rows) {
      try {
        const tQ = (text, params) => tenantDbManager.queryTenant(t.tenant_id, text, params);
        const tSchedules = await tQ('SELECT * FROM email_schedules WHERE enabled=1');
        tSchedules.rows.forEach(s => startSchedule(s, t.tenant_id));
        if (tSchedules.rowCount > 0) {
          console.log(`[EMAIL] Loaded ${tSchedules.rowCount} schedule(s) for tenant "${t.tenant_id}"`);
        }
      } catch (tErr) {
        console.warn(`[EMAIL] Failed to load schedules for tenant "${t.tenant_id}":`, tErr.message);
      }
    }
  } catch (err) {
    console.error('[EMAIL] Failed to iterate tenants for email schedules:', err.message);
  }
}

module.exports = {
  startSchedule,
  stopSchedule,
  initSchedules
};

