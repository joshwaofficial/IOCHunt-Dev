// ════════════════════════════════════════════════════════════════
// IOC Hunt — User Management Controller
// ════════════════════════════════════════════════════════════════

const User = require('../models/User');
const { hashPassword } = require('../utils/cryptoHelper');
const totpHelper = require('../utils/totpHelper');
const QRCodeLib = require('qrcode');
const db = require('../config/db');
const { getValidRoles } = require('../config/roles');
const {
  isString,
  isPositiveInteger,
  isEmail,
  isIdentifier,
  validatePasswordComplexity,
  TOTP_REGEX
} = require('../utils/inputValidator');
const { purgeIdleSessions } = require('../services/sessionReaper');

async function getUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });

    // Clean up any idle or expired sessions first
    await purgeIdleSessions(req.queryControlPlane, req.queryTenant);

    let users;
    if (req.session.role === 'ADMIN' || req.session.role === 'AGGREGATOR_ADMIN') {
      users = await User.getAllUsers(req.queryTenant);
    } else {
      const u = await User.findById(req.session.user_id, req.queryTenant);
      users = u ? [u] : [];
    }
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      force_password_change: u.force_password_change === 1 || u.force_password_change === true,
      created_at: u.created_at,
      last_login: u.last_login,
      last_idle_signout: u.last_idle_signout ? Number(u.last_idle_signout) : null,
      mfa_enabled: u.mfa_enabled,
      session_policy: u.session_policy || 'inherit',
      custom_session_hours: u.custom_session_hours !== null && u.custom_session_hours !== undefined ? Number(u.custom_session_hours) : null,
      custom_idle_mins: u.custom_idle_mins !== null && u.custom_idle_mins !== undefined ? Number(u.custom_idle_mins) : null
    }));
    return res.status(200).json({ users: safeUsers });
  } catch (error) {
    console.error('[Users] Failed to get users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getAssignableUsers(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });
    const users = await User.getAllUsers(req.queryTenant);
    
    const role = req.session.role;
    const allowedAssignees = users.filter(u => {
      if (role === 'ADMIN' || role === 'AGGREGATOR_ADMIN') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L3_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L2_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
      if (role === 'L1_ANALYST') return u.role === 'L2_ANALYST';
      return false;
    });

    const safeUsers = allowedAssignees.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role
    }));
    return res.status(200).json({ users: safeUsers });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function createUser(req, res) {
  try {
    const { username, email, password, role, force_password_change = true, session_policy = 'inherit', custom_session_hours, custom_idle_mins } = req.body || {};
    if (!username || !password || !role || typeof username !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
      return res.status(400).json({ error: 'Username, password, and role are required and must be strings' });
    }

    const trimmedUser = username.trim().toLowerCase();
    if (!isIdentifier(trimmedUser, 3, 32)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters long and contain only letters, numbers, hyphens, and underscores' });
    }

    if (email && (typeof email !== 'string' || !isEmail(email))) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const pwdError = validatePasswordComplexity(password);
    if (pwdError) {
      return res.status(400).json({ error: pwdError });
    }
    
    const validRoles = getValidRoles();
    const upperRole = role.toUpperCase();
    if (!validRoles.includes(upperRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${validRoles.join(', ')}` });
    }

    const existing = await User.findByUsername(username, req.queryTenant);
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const { hash: passwordHash, salt } = hashPassword(password);
    await User.createUser({
      username,
      email: email || '',
      passwordHash,
      salt,
      role: upperRole,
      forcePasswordChange: force_password_change !== false,
      sessionPolicy: session_policy || 'inherit',
      customSessionHours: custom_session_hours ? Math.min(168, Math.max(1, Number(custom_session_hours))) : null,
      customIdleMins: custom_idle_mins !== undefined && custom_idle_mins !== null && custom_idle_mins !== '' ? Math.max(0, Number(custom_idle_mins)) : null
    }, req.queryTenant);
    
    return res.status(201).json({ success: true, message: 'User created successfully' });
  } catch (error) {
    console.error('[Users] Failed to create user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const id = req.params.id;
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }

    const { username, email, role, password, force_password_change, session_policy, custom_session_hours, custom_idle_mins } = req.body || {};
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    
    const isAdmin = req.session.role === 'ADMIN';
    const isOwnAccount = parseInt(id, 10) === req.session.user_id;

    if (!isAdmin && !isOwnAccount) return res.status(403).json({ error: 'Forbidden' });
    if (role && role !== existing.role && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    if ((session_policy !== undefined || custom_session_hours !== undefined || custom_idle_mins !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can modify session policies.' });
    }

    if (email && (typeof email !== 'string' || !isEmail(email))) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Restrict username modification
    if (username && username.trim().toLowerCase() !== existing.username.toLowerCase()) {
      if (existing.role === 'ADMIN') {
        return res.status(403).json({
          error: 'Central server administrator username cannot be changed. The admin username can only be set by the Super Admin.'
        });
      }
      const existingUser = await User.findByUsername(username.trim().toLowerCase(), req.queryTenant);
      if (existingUser && parseInt(existingUser.id) !== parseInt(id)) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }

    let passwordHash = undefined, salt = undefined;
    let enforcedForcePasswordChange = force_password_change;

    if (password) {
      if (typeof password !== 'string') {
        return res.status(400).json({ error: 'Password must be a string' });
      }
      if (isOwnAccount) {
        return res.status(400).json({
          error: 'To change your own password, please use the Change Password setting with your current password verification.'
        });
      }
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Only administrators can reset user passwords.' });
      }
      const pwdError = validatePasswordComplexity(password);
      if (pwdError) {
        return res.status(400).json({ error: pwdError });
      }
      const hashed = hashPassword(password);
      passwordHash = hashed.hash;
      salt = hashed.salt;
      // Admin reset always forces the employee to set their own password on next login
      enforcedForcePasswordChange = 1;
    }

    const upperRole = role ? role.toUpperCase() : existing.role;
    const targetUsername = existing.role === 'ADMIN' ? existing.username : (username ? username.trim().toLowerCase() : existing.username);

    await User.updateUser(id, {
      username: targetUsername,
      email: email !== undefined ? email : existing.email,
      role: upperRole,
      passwordHash,
      salt,
      forcePasswordChange: enforcedForcePasswordChange,
      sessionPolicy: session_policy !== undefined ? session_policy : existing.session_policy,
      customSessionHours: custom_session_hours !== undefined ? (custom_session_hours ? Math.min(168, Math.max(1, Number(custom_session_hours))) : null) : existing.custom_session_hours,
      customIdleMins: custom_idle_mins !== undefined ? (custom_idle_mins !== null && custom_idle_mins !== '' ? Math.max(0, Number(custom_idle_mins)) : null) : existing.custom_idle_mins
    }, req.queryTenant);

    if (targetUsername !== existing.username) {
      await req.queryControlPlane('UPDATE sessions SET username = $1 WHERE user_id = $2 AND tenant_id = $3', [targetUsername, id, req.tenantId]);
    }

    if (password) {
      await req.queryControlPlane('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [id, req.tenantId]);
    } else if (custom_idle_mins !== undefined || session_policy !== undefined) {
      let effectiveIdle = 0;
      if (session_policy === 'custom' || (!session_policy && existing.session_policy === 'custom')) {
        effectiveIdle = custom_idle_mins !== undefined && custom_idle_mins !== null && custom_idle_mins !== '' ? Math.max(0, Number(custom_idle_mins)) : (Number(existing.custom_idle_mins) || 0);
      } else if (session_policy === 'strict_30m') {
        effectiveIdle = 30;
      } else if (session_policy === 'soc_shift_8h' || session_policy === 'wallboard_24h') {
        effectiveIdle = 0;
      }
      await req.queryControlPlane('UPDATE sessions SET idle_timeout_mins = $1 WHERE user_id = $2 AND tenant_id = $3', [effectiveIdle, id, req.tenantId]);
    }

    return res.status(200).json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function deleteUser(req, res) {
  try {
    const id = req.params.id;
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }
    const existing = await User.findById(id, req.queryTenant);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (existing.role === 'ADMIN') {
      const allUsers = await User.getAllUsers(req.queryTenant);
      if (allUsers.filter(u => u.role === 'ADMIN').length <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only remaining admin account' });
      }
    }
    await User.deleteUser(id, req.queryTenant);
    await req.queryControlPlane('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [id, req.tenantId]);
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function disableMfa(req, res) {
  try {
    const id = req.params.id;
    if (!isPositiveInteger(id)) {
      return res.status(400).json({ error: 'Invalid user ID parameter' });
    }
    const isAdmin = req.session.role === 'ADMIN';
    if (!isAdmin && parseInt(id, 10) !== req.session.user_id) return res.status(403).json({ error: 'Forbidden' });
    await User.disableMfa(id, req.queryTenant);
    return res.status(200).json({ success: true, message: 'MFA disabled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function generateMfa(req, res) {
  try {
    const user = await User.findById(req.session.user_id, req.queryTenant);
    const newSecret = totpHelper.generateMFASecret();
    const otpAuth = totpHelper.otpauthURL(user.username, newSecret);
    const qrDataUrl = await QRCodeLib.toDataURL(otpAuth);
    return res.status(200).json({ secret: newSecret, qrDataUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function verifyMfa(req, res) {
  try {
    const { secret, totp } = req.body || {};
    if (!secret || !totp || typeof secret !== 'string' || typeof totp !== 'string') {
      return res.status(400).json({ error: 'Secret and TOTP code are required and must be strings' });
    }
    if (!TOTP_REGEX.test(totp.trim())) {
      return res.status(400).json({ error: 'TOTP code must be a 6-digit number' });
    }
    if (!totpHelper.verifyTOTP(secret, totp.trim())) return res.status(400).json({ error: 'Invalid verification code' });
    await req.queryTenant('UPDATE users SET mfa_enabled=1, mfa_secret=$1 WHERE id=$2', [secret, req.session.user_id]);
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSessionSettings(req, res) {
  try {
    let settings = {
      session_policy: 'soc_shift_8h',
      session_lifetime_hours: 8,
      idle_timeout_mins: 0
    };

    if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
      try {
        const tRes = await req.queryControlPlane(
          'SELECT session_policy, session_lifetime_hours, idle_timeout_mins FROM tenants WHERE tenant_id = $1',
          [req.tenantId]
        );
        if (tRes && tRes.rows.length > 0 && tRes.rows[0].session_policy) {
          settings = tRes.rows[0];
        }
      } catch (_) {}
    } else {
      try {
        const q = req.queryTenant || req.queryControlPlane;
        const sRes = await q('SELECT session_policy, session_lifetime_hours, idle_timeout_mins FROM settings LIMIT 1');
        if (sRes && sRes.rows.length > 0 && sRes.rows[0].session_policy) {
          settings = sRes.rows[0];
        }
      } catch (_) {}
    }

    return res.status(200).json({ success: true, settings });
  } catch (error) {
    console.error('[Users] Failed to get session settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function updateSessionSettings(req, res) {
  try {
    const { session_policy = 'soc_shift_8h', session_lifetime_hours = 8, idle_timeout_mins = 0 } = req.body || {};

    const validPolicies = ['soc_shift_8h', 'wallboard_24h', 'strict_30m', 'custom'];
    if (!validPolicies.includes(session_policy)) {
      return res.status(400).json({ error: 'Invalid session policy' });
    }

    const hours = Math.min(168, Math.max(1, Number(session_lifetime_hours) || 8));
    const idle = Math.max(0, Number(idle_timeout_mins) || 0);

    if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
      await req.queryControlPlane(
        'UPDATE tenants SET session_policy = $1, session_lifetime_hours = $2, idle_timeout_mins = $3 WHERE tenant_id = $4',
        [session_policy, hours, idle, req.tenantId]
      );
    }

    try {
      const q = req.queryTenant || req.queryControlPlane;
      await q(
        'UPDATE settings SET session_policy = $1, session_lifetime_hours = $2, idle_timeout_mins = $3',
        [session_policy, hours, idle]
      );
    } catch (_) {}

    try {
      await req.queryControlPlane(
        'UPDATE sessions SET idle_timeout_mins = $1 WHERE (tenant_id = $2 OR tenant_id IS NULL OR tenant_id = \'\')',
        [idle, req.tenantId || 'default']
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Session policy updated successfully',
      settings: {
        session_policy,
        session_lifetime_hours: hours,
        idle_timeout_mins: idle
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getActiveSessions(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });
    
    // Only Admin or Aggregator Admin can monitor sessions
    const allowedRoles = ['ADMIN', 'AGGREGATOR_ADMIN'];
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to view active sessions' });
    }

    // Purge any idle or expired sessions so live monitoring is 100% accurate
    await purgeIdleSessions(req.queryControlPlane, req.queryTenant);

    const now = Math.floor(Date.now() / 1000);
    const q = req.queryControlPlane || db.query.bind(db);

    let sql = 'SELECT * FROM sessions WHERE expires_at > $1';
    let params = [now];

    if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
      sql += ' AND (tenant_id = $2 OR tenant_id = \'\' OR tenant_id IS NULL)';
      params.push(req.tenantId);
    }

    sql += ' ORDER BY last_activity_at DESC';

    const sessionRes = await q(sql, params);
    const rawSessions = sessionRes.rows || [];

    // Retrieve user details from tenant db to enrich email and policy
    let userMap = {};
    try {
      const uRes = await (req.queryTenant || q)('SELECT id, username, email, role, session_policy FROM users');
      if (uRes && uRes.rows) {
        for (const u of uRes.rows) {
          userMap[u.username] = u;
        }
      }
    } catch (_) {}

    let onlineCount = 0;
    let idleCount = 0;

    const formattedSessions = rawSessions.map(s => {
      const lastAct = Number(s.last_activity_at || s.created_at || now);
      const idleSec = Math.max(0, now - lastAct);
      const isOnline = idleSec < 120; // Active within last 2 minutes
      const isIdle = !isOnline;
      if (isOnline) onlineCount++;
      else idleCount++;

      const expiresInSec = Math.max(0, Number(s.expires_at) - now);
      const uInfo = userMap[s.username] || {};

      return {
        token: s.token,
        token_preview: s.token.substring(0, 10) + '...',
        user_id: s.user_id,
        username: s.username,
        email: uInfo.email || '',
        role: s.role || uInfo.role || 'USER',
        display_name: s.display_name || s.username,
        tenant_id: s.tenant_id || 'default',
        ip_address: s.ip_address || '127.0.0.1',
        is_online: isOnline,
        is_idle: isIdle,
        idle_seconds: idleSec,
        idle_timeout_mins: Number(s.idle_timeout_mins || 0),
        created_at: Number(s.created_at || now),
        last_activity_at: lastAct,
        expires_at: Number(s.expires_at),
        expires_in_seconds: expiresInSec,
        session_policy: uInfo.session_policy || 'inherit',
        is_current: (req.session && req.session.token === s.token)
      };
    });

    return res.status(200).json({
      success: true,
      total_sessions: formattedSessions.length,
      online_count: onlineCount,
      idle_count: idleCount,
      sessions: formattedSessions
    });
  } catch (error) {
    console.error('[Users] Failed to get active sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function terminateSession(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });

    const allowedRoles = ['ADMIN', 'AGGREGATOR_ADMIN'];
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can revoke sessions' });
    }

    const targetToken = req.params.token || req.body.token;
    if (!targetToken || typeof targetToken !== 'string') {
      return res.status(400).json({ error: 'Valid session token required' });
    }

    const q = req.queryControlPlane || db.query.bind(db);

    const sRes = await q('SELECT * FROM sessions WHERE token = $1', [targetToken]);
    if (sRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or already terminated' });
    }

    const targetSession = sRes.rows[0];

    // Delete session immediately
    await q('DELETE FROM sessions WHERE token = $1', [targetToken]);

    // Record in audit log
    try {
      await q(
        'INSERT INTO audit_log (tenant_id, user_id, username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          targetSession.tenant_id || req.tenantId || '',
          targetSession.user_id,
          targetSession.username,
          'AUTH_SESSION_TERMINATED',
          'sessions',
          `Session revoked by administrator ${req.session.username}`,
          req.ip || '127.0.0.1',
          req.headers['user-agent'] || '',
          'SUCCESS'
        ]
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Session for "${targetSession.username}" was terminated successfully.`
    });
  } catch (error) {
    console.error('[Users] Failed to terminate session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function terminateAllOtherSessions(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });

    const allowedRoles = ['ADMIN', 'AGGREGATOR_ADMIN'];
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can revoke sessions' });
    }

    const q = req.queryControlPlane || db.query.bind(db);
    const currentToken = req.session.token;

    let sql = 'DELETE FROM sessions WHERE token != $1';
    let params = [currentToken];

    if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
      sql += ' AND (tenant_id = $2 OR tenant_id = \'\' OR tenant_id IS NULL)';
      params.push(req.tenantId);
    }

    const delRes = await q(sql, params);
    const deletedCount = delRes.rowCount || 0;

    // Record in audit log
    try {
      await q(
        'INSERT INTO audit_log (tenant_id, user_id, username, action, resource, detail, ip_address, user_agent, result) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [
          req.tenantId || '',
          req.session.user_id,
          req.session.username,
          'AUTH_MASS_SESSION_TERMINATED',
          'sessions',
          `Administrator ${req.session.username} terminated ${deletedCount} other active session(s)`,
          req.ip || '127.0.0.1',
          req.headers['user-agent'] || '',
          'SUCCESS'
        ]
      );
    } catch (_) {}

    return res.status(200).json({
      success: true,
      count: deletedCount,
      message: `Successfully terminated ${deletedCount} active session(s). Your current session remains active.`
    });
  } catch (error) {
    console.error('[Users] Failed to terminate other sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getSessionAuditLogs(req, res) {
  try {
    if (!req.session || !req.session.user_id) return res.status(401).json({ error: 'Unauthenticated' });

    const allowedRoles = ['ADMIN', 'AGGREGATOR_ADMIN'];
    if (!allowedRoles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const q = req.queryControlPlane || db.query.bind(db);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';

    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    let params = [];

    if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
      params.push(req.tenantId);
      sql += ` AND (tenant_id = $${params.length} OR tenant_id = '' OR tenant_id IS NULL)`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (LOWER(username) LIKE $${params.length} OR LOWER(action) LIKE $${params.length} OR LOWER(detail) LIKE $${params.length} OR ip_address LIKE $${params.length})`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    let logs = [];
    try {
      const r = await q(sql, params);
      logs = r.rows || [];
    } catch (_) {
      logs = [];
    }

    // Also include real-time Idle events for active sessions that are currently away from keyboard
    const now = Math.floor(Date.now() / 1000);
    try {
      let sessionSql = 'SELECT * FROM sessions WHERE expires_at > $1';
      let sessionParams = [now];
      if (req.tenantId && req.tenantId !== 'default' && req.tenantId !== 'aggregator') {
        sessionParams.push(req.tenantId);
        sessionSql += ` AND (tenant_id = $2 OR tenant_id = '' OR tenant_id IS NULL)`;
      }
      const activeRes = await q(sessionSql, sessionParams);
      const activeSessions = activeRes.rows || [];

      activeSessions.forEach(s => {
        const lastAct = Number(s.last_activity_at || s.created_at || now);
        const idleSec = now - lastAct;
        if (idleSec >= 120) {
          const hrs = Math.floor(idleSec / 3600);
          const mins = Math.floor((idleSec % 3600) / 60);
          const dur = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          const idleRecord = {
            id: `idle-${s.token.substring(0, 8)}`,
            tenant_id: s.tenant_id,
            username: s.username,
            action: 'SESSION_IDLE_DETECTED',
            resource: 'sessions',
            detail: `User away from keyboard: idle for ${dur} (last active: ${new Date(lastAct * 1000).toISOString().replace('T', ' ').substring(0, 16)})`,
            ip_address: s.ip_address || '—',
            result: 'IDLE',
            created_at: lastAct
          };

          if (!search ||
              idleRecord.username.toLowerCase().includes(search) ||
              idleRecord.action.toLowerCase().includes(search) ||
              idleRecord.detail.toLowerCase().includes(search) ||
              idleRecord.ip_address.toLowerCase().includes(search)) {
            logs.push(idleRecord);
          }
        }
      });
    } catch (_) {}

    // Sort combined logs by timestamp descending
    logs.sort((a, b) => {
      const timeA = typeof a.created_at === 'number' ? a.created_at : Math.floor(new Date(a.created_at).getTime() / 1000);
      const timeB = typeof b.created_at === 'number' ? b.created_at : Math.floor(new Date(b.created_at).getTime() / 1000);
      return timeB - timeA;
    });

    if (logs.length > limit) {
      logs = logs.slice(0, limit);
    }

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('[Users] Failed to get session audit logs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getUsers,
  getAssignableUsers,
  createUser,
  updateUser,
  deleteUser,
  disableMfa,
  generateMfa,
  verifyMfa,
  getSessionSettings,
  updateSessionSettings,
  getActiveSessions,
  terminateSession,
  terminateAllOtherSessions,
  getSessionAuditLogs
};


