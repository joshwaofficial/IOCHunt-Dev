const cron = require('node-cron');
const db = require('../config/db');
const { generateAndSendReport } = require('./reportBuilder');

const activeCrons = {};

function startSchedule(s) {
  if (activeCrons[s.id]) { activeCrons[s.id].stop(); delete activeCrons[s.id]; }
  if (!s.enabled) return;
  try {
    activeCrons[s.id] = cron.schedule(s.cron_expr, async () => {
      try {
        await generateAndSendReport(s);
        await db.query('UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
          [Math.floor(Date.now() / 1000), 'OK', s.id]);
      } catch (e) {
        console.error(`[EMAIL] Schedule "${s.name}" failed:`, e.message);
        await db.query('UPDATE email_schedules SET last_run=$1,last_status=$2 WHERE id=$3',
          [Math.floor(Date.now() / 1000), 'ERROR: ' + e.message.slice(0, 120), s.id]);
      }
    });
    console.log(`[EMAIL] Scheduled "${s.name}" → ${s.cron_expr}`);
  } catch (e) {
    console.error(`[EMAIL] Invalid cron "${s.cron_expr}":`, e.message);
  }
}

function stopSchedule(id) {
  if (activeCrons[id]) { activeCrons[id].stop(); delete activeCrons[id]; }
}

async function initSchedules() {
  try {
    const schedulesRes = await db.query('SELECT * FROM email_schedules WHERE enabled=1');
    schedulesRes.rows.forEach(startSchedule);
    console.log(`[EMAIL] Loaded ${schedulesRes.rowCount} schedule(s)`);
  } catch (err) {
    console.error('[EMAIL] Failed to init schedules:', err);
  }
}

module.exports = {
  startSchedule,
  stopSchedule,
  initSchedules
};
