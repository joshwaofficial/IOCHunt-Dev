// ════════════════════════════════════════════════════════════════
// IOC Hunt — Session Reaper & Inactivity Lifecycle Service
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const sseBroadcaster = require('./sseBroadcaster');
const tenantDbManager = require('../config/tenantDbManager');

/**
 * Sweeps the sessions table and terminates:
 * 1. Absolute lifetime expired sessions (expires_at < now)
 * 2. Inactive / idle timed-out sessions:
 *    idle_timeout_mins > 0 AND (now - last_activity_at) > (idle_timeout_mins * 60)
 *
 * For each terminated session:
 * - Deletes the session row from the sessions table
 * - Emits real-time SSE 'session_revoked' event to force-logout the user's browser immediately
 * - Writes an entry into audit_log
 * - Sets last_idle_signout timestamp on the user's account in the tenant DB
 */
async function purgeIdleSessions(queryControlPlane, queryTenant) {
  const now = Math.floor(Date.now() / 1000);
  const q = queryControlPlane || db.query.bind(db);

  try {
    const res = await q(`
      SELECT token, user_id, username, role, tenant_id, idle_timeout_mins, last_activity_at, expires_at, ip_address, user_agent
      FROM sessions
      WHERE expires_at < $1
         OR (idle_timeout_mins > 0 AND ($1 - last_activity_at) > (idle_timeout_mins * 60))
    `, [now]);

    if (!res.rows || res.rows.length === 0) return [];

    const purged = [];

    for (const s of res.rows) {
      const isIdle = s.idle_timeout_mins > 0 && (now - Number(s.last_activity_at || 0)) > (Number(s.idle_timeout_mins) * 60);
      const reason = isIdle ? 'idle_timeout' : 'session_expired';

      // 1. Delete session from control plane sessions table
      await q('DELETE FROM sessions WHERE token = $1', [s.token]);

      // 2. Broadcast SSE event to instantly kick user's browser to login screen
      try {
        sseBroadcaster.broadcast('session_revoked', {
          user_id: s.user_id,
          tenant_id: s.tenant_id,
          reason: reason
        });
      } catch (_) {}

      // 3. Write into audit_log
      try {
        const idleMins = Math.floor((now - Number(s.last_activity_at || 0)) / 60);
        await q(`
          INSERT INTO audit_log (tenant_id, user_id, username, action, resource, detail, ip_address, user_agent, result, created_at)
          VALUES ($1, $2, $3, $4, 'sessions', $5, $6, $7, 'SUCCESS', $8)
        `, [
          s.tenant_id || '',
          s.user_id,
          s.username,
          isIdle ? 'SESSION_IDLE_TIMEOUT' : 'SESSION_EXPIRED',
          isIdle 
            ? `Session automatically terminated due to inactivity (${idleMins}m idle, threshold: ${s.idle_timeout_mins}m)`
            : 'Session lifetime limit reached',
          s.ip_address || '',
          s.user_agent || '',
          now
        ]);
      } catch (_) {}

      // 4. Update last_idle_signout on user record in tenant DB
      if (isIdle) {
        try {
          if (s.tenant_id && s.tenant_id !== 'default' && s.tenant_id !== 'aggregator') {
            await tenantDbManager.queryTenant(s.tenant_id, 'UPDATE users SET last_idle_signout = $1 WHERE id = $2', [now, s.user_id]);
          } else {
            const tQ = queryTenant || q;
            await tQ('UPDATE users SET last_idle_signout = $1 WHERE id = $2', [now, s.user_id]);
          }
        } catch (_) {}
      }

      purged.push({
        token: s.token,
        username: s.username,
        user_id: s.user_id,
        reason: reason
      });
    }

    if (purged.length > 0) {
      console.log(`[SessionReaper] Purged ${purged.length} expired/idle sessions:`, purged.map(p => `${p.username} (${p.reason})`).join(', '));
    }

    return purged;
  } catch (err) {
    console.error('[SessionReaper Error]', err.message);
    return [];
  }
}

module.exports = {
  purgeIdleSessions
};
