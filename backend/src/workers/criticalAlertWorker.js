// ════════════════════════════════════════════════════════════════
// IOC Hunt — Critical Log Alert Background Worker
// ════════════════════════════════════════════════════════════════
// Flushes critical log buffers from Redis every 30 seconds and sends
// consolidated alert emails to SOC team users (Admin, L1, L2, L3).
// ════════════════════════════════════════════════════════════════

const { getRedisClient } = require('../config/redisClient');
const db = require('../config/db');
const { sendCriticalAlertEmail } = require('../utils/criticalAlertEmail');
const { isAggregator, isOnPrem } = require('../config/appMode');
const tenantDbManager = require('../config/tenantDbManager');

const FLUSH_INTERVAL_MS = 30000; // 30 seconds buffer flush window

function getQueryFn(tenantId) {
  if (isAggregator() || isOnPrem() || !tenantId || tenantId === 'default' || tenantId === 'iochunt-default') {
    return db.query.bind(db);
  }
  return (text, params) => tenantDbManager.queryTenant(tenantId, text, params);
}

async function processTenantBuffer(redis, tenantId) {
  const bufferKey = `critical_alert_buffer:${tenantId}`;
  
  try {
    // Atomically read and delete buffered items using a pipeline
    const pipeline = redis.pipeline();
    pipeline.lrange(bufferKey, 0, -1);
    pipeline.del(bufferKey);
    const results = await pipeline.exec();

    const rawLogs = results[0]?.[1] || [];
    if (!rawLogs || rawLogs.length === 0) return;

    const events = [];
    for (const raw of rawLogs) {
      try {
        const parsed = JSON.parse(raw);
        events.push(parsed);
      } catch (_) {}
    }

    if (events.length === 0) return;

    console.log(`[CriticalAlertWorker] Processing ${events.length} critical event(s) for tenant "${tenantId}"`);

    // Fetch SOC team recipients (Admin, L1, L2, L3 analysts)
    const queryFn = getQueryFn(tenantId);
    let usersRes = await queryFn(`
      SELECT username, email, role FROM users 
      WHERE UPPER(role) LIKE '%ADMIN%' 
         OR UPPER(role) LIKE '%L1%' 
         OR UPPER(role) LIKE '%L2%' 
         OR UPPER(role) LIKE '%L3%'
         OR UPPER(role) LIKE '%SOC%'
         OR UPPER(role) LIKE '%ANALYST%'
    `);

    const recipientEmails = new Set();
    for (const u of usersRes.rows || []) {
      const email = (u.email && u.email.trim()) || (u.username && u.username.includes('@') ? u.username.trim() : null);
      if (email) recipientEmails.add(email);
    }

    // Fallback: If tenant DB users table has no email configured, query control plane DB
    if (recipientEmails.size === 0 && tenantId !== 'default' && tenantId !== 'iochunt-default') {
      try {
        const cpUsersRes = await db.query(`
          SELECT username, email, role FROM users 
          WHERE UPPER(role) LIKE '%ADMIN%' 
             OR UPPER(role) LIKE '%L1%' 
             OR UPPER(role) LIKE '%L2%' 
             OR UPPER(role) LIKE '%L3%'
             OR UPPER(role) LIKE '%SOC%'
             OR UPPER(role) LIKE '%ANALYST%'
        `);
        for (const u of cpUsersRes.rows || []) {
          const email = (u.email && u.email.trim()) || (u.username && u.username.includes('@') ? u.username.trim() : null);
          if (email) recipientEmails.add(email);
        }
      } catch (cpErr) {
        console.warn(`[CriticalAlertWorker] Control plane fallback user query error:`, cpErr.message);
      }
    }

    const recipients = Array.from(recipientEmails);
    if (recipients.length === 0) {
      console.warn(`[CriticalAlertWorker] Tenant "${tenantId}" has no valid email addresses configured for Admin/L1/L2/L3 users.`);
      return;
    }

    // Send consolidated critical log email alert
    await sendCriticalAlertEmail({
      events,
      recipients,
      queryFn,
      tenantId
    });

  } catch (err) {
    console.error(`[CriticalAlertWorker] Error processing buffer for tenant "${tenantId}":`, err.message);
  }
}

async function flushAllBuffers() {
  if (isAggregator()) return; // Central Server feature only

  try {
    const redis = getRedisClient();
    const keys = await redis.keys('critical_alert_buffer:*');
    
    for (const key of keys) {
      const tenantId = key.replace('critical_alert_buffer:', '');
      if (tenantId) {
        await processTenantBuffer(redis, tenantId);
      }
    }
  } catch (err) {
    console.error('[CriticalAlertWorker] Error scanning Redis alert buffers:', err.message);
  }
}

function startCriticalAlertWorker() {
  if (isAggregator()) {
    console.log('[CriticalAlertWorker] Skipped (Running in Aggregator mode)');
    return;
  }

  console.log(`[CriticalAlertWorker] Initializing worker (Buffer flush every ${FLUSH_INTERVAL_MS / 1000}s)`);
  
  // Initial flush on startup
  flushAllBuffers().catch(err => console.error('[CriticalAlertWorker] Startup error:', err.message));

  // Schedule recurring 30s flush
  setInterval(() => {
    flushAllBuffers().catch(err => console.error('[CriticalAlertWorker] Recurring flush error:', err.message));
  }, FLUSH_INTERVAL_MS);
}

module.exports = {
  startCriticalAlertWorker,
  flushAllBuffers
};
