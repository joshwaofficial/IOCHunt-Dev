// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication Controller
// ════════════════════════════════════════════════════════════════

const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../utils/cryptoHelper');
const crypto = require('crypto');
const db = require('../config/db');
const tenantDbManager = require('../config/tenantDbManager');
const { verifyTOTP } = require('../utils/totpHelper');
const appMode = require('../config/appMode');
const sseBroadcaster = require('../services/sseBroadcaster');
const { sendSecurityAlertEmail } = require('../utils/emailHelper');

/**
 * Validates password complexity
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&* etc.)';
  }
  return null;
}

// Helper to decrypt AES-256-CBC
function decryptData(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') return null;
  const parts = encryptedString.split(':');
  if (parts.length !== 2) return encryptedString;
  
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) return encryptedString;
  
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const key = Buffer.from(keyHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Decrypt] Error decrypting API key:', err.message);
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// Account Lockout Configuration & Storage
// Policy: 5 failed attempts within 15 minutes -> 15 minute lock
// ════════════════════════════════════════════════════════════════
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 15 * 60;   // 15 minutes window
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes lockout duration

// In-memory fallback store if Redis is unavailable
const memoryLockoutStore = new Map();

// Periodic cleanup of expired in-memory lockout records (every 15 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of memoryLockoutStore.entries()) {
    if (val.lockedUntil && now > val.lockedUntil) {
      memoryLockoutStore.delete(key);
    } else if (val.firstAttempt && now - val.firstAttempt > LOCKOUT_WINDOW_SECONDS * 1000) {
      memoryLockoutStore.delete(key);
    }
  }
}, LOCKOUT_WINDOW_SECONDS * 1000).unref();

/**
 * Check if account is locked and return remaining seconds, or 0 if not locked.
 */
async function getAccountLockoutRemaining(lockoutKey) {
  // 1. Try Redis if available
  try {
    const { getRedisClient, isRedisConnected } = require('../config/redisClient');
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const ttl = await redis.ttl(`lockout:active:${lockoutKey}`);
      if (ttl > 0) return ttl;
    }
  } catch (_) {
    // Redis error, fall back to in-memory store
  }

  // 2. In-memory check
  const mem = memoryLockoutStore.get(lockoutKey);
  if (mem && mem.lockedUntil) {
    const now = Date.now();
    if (now < mem.lockedUntil) {
      return Math.ceil((mem.lockedUntil - now) / 1000);
    } else {
      memoryLockoutStore.delete(lockoutKey);
    }
  }
  return 0;
}

/**
 * Record a failed login attempt. Locks account if threshold is reached.
 */
async function recordFailedAttempt(lockoutKey) {
  // 1. Try Redis
  try {
    const { getRedisClient, isRedisConnected } = require('../config/redisClient');
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const failKey = `lockout:failed:${lockoutKey}`;
      const activeLockKey = `lockout:active:${lockoutKey}`;

      const attempts = await redis.incr(failKey);
      if (attempts === 1) {
        await redis.expire(failKey, LOCKOUT_WINDOW_SECONDS);
      }

      if (attempts >= MAX_FAILED_ATTEMPTS) {
        await redis.set(activeLockKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
        await redis.del(failKey);
        return { locked: true, remainingSeconds: LOCKOUT_DURATION_SECONDS };
      }
      return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - attempts };
    }
  } catch (_) {
    // Redis error, fall back to in-memory
  }

  // 2. In-memory fallback
  const now = Date.now();
  let entry = memoryLockoutStore.get(lockoutKey);
  if (!entry || (entry.firstAttempt && now - entry.firstAttempt > LOCKOUT_WINDOW_SECONDS * 1000)) {
    entry = { count: 1, firstAttempt: now, lockedUntil: null };
  } else {
    entry.count += 1;
  }

  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_SECONDS * 1000;
    memoryLockoutStore.set(lockoutKey, entry);
    return { locked: true, remainingSeconds: LOCKOUT_DURATION_SECONDS };
  }

  memoryLockoutStore.set(lockoutKey, entry);
  return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - entry.count };
}

/**
 * Clear failed attempts and active lockout upon successful authentication.
 */
async function clearLockout(lockoutKey) {
  try {
    const { getRedisClient, isRedisConnected } = require('../config/redisClient');
    if (isRedisConnected()) {
      const redis = getRedisClient();
      await redis.del(`lockout:failed:${lockoutKey}`, `lockout:active:${lockoutKey}`);
    }
  } catch (_) {
    // Ignore Redis errors
  }
  memoryLockoutStore.delete(lockoutKey);
}

/**
 * Helper to record failure and return locked or invalid credentials response.
 */
async function handleFailedLogin(lockoutKey, res) {
  const result = await recordFailedAttempt(lockoutKey);
  if (result.locked) {
    return res.status(423).json({
      error: 'Account is temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.'
    });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
}

async function login(req, res) {
  try {
    let { username, password, workspace_id, confirm_takeover } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    password = password.trim();

    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const normalizedUser = String(username).trim().toLowerCase();
    const normalizedWorkspace = (workspace_id && typeof workspace_id === 'string')
      ? workspace_id.trim().toLowerCase()
      : 'default';
    const lockoutKey = `${normalizedWorkspace}:${normalizedUser}`;

    // Check account lockout status before performing expensive operations
    const remainingLockout = await getAccountLockoutRemaining(lockoutKey);
    if (remainingLockout > 0) {
      const mins = Math.ceil(remainingLockout / 60);
      return res.status(423).json({
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`
      });
    }

    if (appMode.isCentralServer()) {
      if (!workspace_id) {
        return res.status(400).json({ error: 'Workspace ID is required for SaaS login' });
      }

      let tenantId = null;
      let tenantPool = null;
      let companyName = '';

      // Look up the tenant in the control plane
      const tenantRes = await db.query(
        'SELECT tenant_id, company_name, status FROM tenants WHERE tenant_id = $1',
        [workspace_id.trim().toLowerCase()]
      );

      if (tenantRes.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid workspace ID' });
      }

      const tenant = tenantRes.rows[0];
      if (tenant.status !== 'active') {
        return res.status(403).json({ error: 'This workspace has been deactivated' });
      }

      tenantId = tenant.tenant_id;
      companyName = tenant.company_name;

      // Get a connection to the tenant's database
      try {
        tenantPool = await tenantDbManager.getTenantPool(tenantId);
      } catch (err) {
        console.error(`[Auth] Failed to connect to tenant DB for ${tenantId}:`, err.message);
        return res.status(500).json({ error: 'Unable to connect to workspace database' });
      }

      // Look up the user in the TENANT's database
      const userRes = await tenantPool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username.trim()]
      );

      if (userRes.rows.length === 0) {
        return await handleFailedLogin(lockoutKey, res);
      }

      const user = userRes.rows[0];
      const isValid = verifyPassword(password, user.password_hash, user.salt);
      
      if (!isValid) {
        return await handleFailedLogin(lockoutKey, res);
      }

      // Successful credentials verification: clear failed login attempts
      await clearLockout(lockoutKey);

      // Check for active unexpired session for this tenant user
      const now = Math.floor(Date.now() / 1000);
      const activeSessionRes = await db.query(
        'SELECT token, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = $1 AND tenant_id = $2 AND expires_at > $3 ORDER BY created_at DESC LIMIT 1',
        [user.id, tenantId, now]
      );

      if (activeSessionRes.rows.length > 0 && confirm_takeover !== true) {
        const activeSession = activeSessionRes.rows[0];
        return res.status(409).json({
          session_already_active: true,
          active_session: {
            ip_address: activeSession.ip_address || 'unknown',
            user_agent: activeSession.user_agent || 'unknown',
            created_at: activeSession.created_at
          },
          message: 'This account is currently active on another device. Do you want to log out that device and continue?'
        });
      }

      // MFA check
      if (user.mfa_enabled) {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = Math.floor(Date.now() / 1000) + 300;

        // Store mfa_pending strictly in the isolated tenant database
        await tenantPool.query(
          'INSERT INTO mfa_pending (token, user_id, username, role, tenant_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [rawToken, user.id, user.username, user.role, tenantId, expiresAt]
        );

        // Prefix tempToken with tenantId so verification requests route directly to tenant DB
        const tempToken = `${tenantId}:${rawToken}`;

        return res.status(200).json({
          message: 'MFA required',
          mfa_required: true,
          tempToken: tempToken
        });
      }

      // Single active session enforcement: terminate old sessions
      if (activeSessionRes.rows.length > 0) {
        await db.query('DELETE FROM sessions WHERE user_id = $1 AND tenant_id = $2', [user.id, tenantId]);
        
        // Push real-time event to terminate the old session immediately
        sseBroadcaster.broadcast('session_revoked', {
          user_id: user.id,
          tenant_id: tenantId,
          reason: 'concurrent_takeover'
        });

        // Email notification
        if (user.email) {
          sendSecurityAlertEmail({
            to: user.email,
            username: user.username,
            ip: clientIp,
            userAgent: userAgent,
            time: now
          }).catch(() => {});
        }
      }

      // Create session in control plane with tenant_id, ip_address, and user_agent
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 86400;
      const isForcedChange = user.force_password_change === 1 || user.force_password_change === true;

      await db.query(
        `INSERT INTO sessions (token, user_id, username, role, tenant_id, force_password_change, aggregator_name, display_name, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [token, user.id, user.username, user.role, tenantId, isForcedChange ? 1 : 0, user.aggregator_name || null, user.display_name || null, clientIp, userAgent, expiresAt]
      );

      // Update last login in tenant DB
      await tenantPool.query('UPDATE users SET last_login = $1 WHERE id = $2', [now, user.id]);

      // Set secure session cookie
      res.cookie('iochunt_session', token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600 * 1000
      });

      return res.status(200).json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          aggregator_name: user.aggregator_name || null,
          display_name: user.display_name || null,
          force_password_change: isForcedChange,
          tenant_id: tenantId,
          company_name: companyName,
          instance_mode: 'central_server',
          deployment_mode: 'cloud'
        }
      });
    }

    // ── Legacy Single-Tenant / Aggregator Login (no workspace_id) ────────
    // Falls back to the original login flow for backwards compatibility
    const user = await User.findByUsername(username);
    if (!user) {
      return await handleFailedLogin(lockoutKey, res);
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return await handleFailedLogin(lockoutKey, res);
    }

    // Successful credentials verification: clear failed login attempts
    await clearLockout(lockoutKey);

    const targetTenant = user.aggregator_name ? 'aggregator' : 'default';
    const now = Math.floor(Date.now() / 1000);

    // Check for active unexpired session
    const activeSessionRes = await db.query(
      'SELECT token, ip_address, user_agent, created_at, expires_at FROM sessions WHERE user_id = $1 AND (tenant_id = $2 OR tenant_id = \'\' OR tenant_id IS NULL) AND expires_at > $3 ORDER BY created_at DESC LIMIT 1',
      [user.id, targetTenant, now]
    );

    if (activeSessionRes.rows.length > 0 && confirm_takeover !== true) {
      const activeSession = activeSessionRes.rows[0];
      return res.status(409).json({
        session_already_active: true,
        active_session: {
          ip_address: activeSession.ip_address || 'unknown',
          user_agent: activeSession.user_agent || 'unknown',
          created_at: activeSession.created_at
        },
        message: 'This account is currently active on another device. Do you want to log out that device and continue?'
      });
    }

    // MFA check
    if (user.mfa_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 mins
      
      await db.query(
        'INSERT INTO mfa_pending (token, user_id, username, role, tenant_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [tempToken, user.id, user.username, user.role, '', expiresAt]
      );
      
      return res.status(200).json({ 
        message: 'MFA required', 
        mfa_required: true, 
        tempToken: tempToken 
      });
    }

    // Invalidate previous sessions
    if (activeSessionRes.rows.length > 0) {
      await db.query(
        'DELETE FROM sessions WHERE user_id = $1 AND (tenant_id = $2 OR tenant_id = \'\' OR tenant_id IS NULL)',
        [user.id, targetTenant]
      );

      sseBroadcaster.broadcast('session_revoked', {
        user_id: user.id,
        tenant_id: targetTenant,
        reason: 'concurrent_takeover'
      });

      if (user.email) {
        sendSecurityAlertEmail({
          to: user.email,
          username: user.username,
          ip: clientIp,
          userAgent: userAgent,
          time: now
        }).catch(() => {});
      }
    }

    // Generate authenticated single session
    const isForcedChange = user.force_password_change === 1 || user.force_password_change === true;
    const token = await User.createSession(user.id, user.username, user.role, targetTenant, clientIp, userAgent, isForcedChange ? 1 : 0);
    await User.updateLastLogin(user.id);

    // Set secure session cookie (7 days)
    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    // If logging in as Central Super Admin, ensure instance_mode is central_server
    if (user.role === 'ADMIN' && !user.aggregator_name) {
      await db.query(`
        UPDATE instance_config 
        SET instance_mode = 'central_server', setup_complete = TRUE 
        WHERE id = 1
      `);
      const { setConfig, MODES } = require('../config/appMode');
      setConfig({
        mode: MODES.CENTRAL,
        setupComplete: true,
        source: 'database'
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        aggregator_name: user.aggregator_name || null,
        display_name: user.display_name || null,
        is_aggregator_admin: Boolean(user.aggregator_name || user.role === 'AGGREGATOR_ADMIN'),
        force_password_change: isForcedChange,
        instance_mode: user.aggregator_name ? 'aggregator' : 'central_server',
        deployment_mode: appMode.getConfig().deploymentMode
      }
    });
  } catch (error) {
    console.error('[Auth Error] Login failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function changePassword(req, res) {
  try {
    let { current_password, new_password, confirm_password, new_username } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

    current_password = current_password.trim();
    new_password = new_password.trim();
    confirm_password = confirm_password.trim();

    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New password and confirm password do not match' });
    }

    if (current_password === new_password) {
      return res.status(400).json({ error: 'New password cannot be identical to the current password' });
    }

    const validationError = validatePasswordStrength(new_password);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Support multi-tenancy by selecting the appropriate query function
    let queryFn;
    const { isAggregator } = require('../config/appMode');
    if (req.tenantId && req.tenantId !== 'default' && !isAggregator()) {
      const tenantDbManager = require('../config/tenantDbManager');
      const tenantPool = await tenantDbManager.getTenantPool(req.tenantId);
      queryFn = tenantPool.query.bind(tenantPool);
    } else {
      const db = require('../config/db');
      queryFn = db.query.bind(db);
    }

    const user = await User.findById(req.session.user_id, queryFn);
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const isCurrentValid = verifyPassword(current_password, user.password_hash, user.salt);
    if (!isCurrentValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and reset force_password_change flag
    const { hash, salt } = hashPassword(new_password);
    
    if (new_username && new_username.trim().toLowerCase() !== user.username) {
      const existingUser = await User.findByUsername(new_username, queryFn);
      if (existingUser) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      await User.updateCredentials(user.id, new_username, hash, salt, queryFn);
    } else {
      await User.updatePassword(user.id, hash, salt, queryFn);
    }

    // Invalidate all active sessions for this user across all devices/browsers (INT-WAPT-M-002 remediation)
    await User.deleteSessionsByUserId(user.id, req.tenantId);

    // Clear session cookie so existing token cannot be reused
    res.clearCookie('iochunt_session', { path: '/' });

    return res.status(200).json({
      success: true,
      reauth_required: true,
      message: 'Password successfully changed and all active sessions have been terminated. Please log in again with your new password.'
    });
  } catch (error) {
    console.error('[Auth Error] Change password failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function mfaVerify(req, res) {
  try {
    const { tempToken, totpToken, workspace_id } = req.body;
    if (!tempToken || !totpToken) {
      return res.status(400).json({ message: 'Token and code required' });
    }

    let tenantId = (workspace_id && typeof workspace_id === 'string') ? workspace_id.trim().toLowerCase() : null;
    let rawToken = tempToken;

    // Parse tenantId from tempToken prefix (format: "tenantId:rawToken") if present
    if (tempToken.includes(':')) {
      const parts = tempToken.split(':');
      tenantId = parts[0].trim().toLowerCase();
      rawToken = parts.slice(1).join(':');
    }

    let targetPool = db;
    let queryFn = db.query.bind(db);
    let pending = null;

    if (tenantId && tenantId !== 'default' && appMode.isCentralServer()) {
      try {
        targetPool = await tenantDbManager.getTenantPool(tenantId);
        queryFn = targetPool.query.bind(targetPool);
      } catch (err) {
        console.error(`[Auth] Failed to connect to tenant DB for ${tenantId}:`, err.message);
        return res.status(500).json({ message: 'Unable to connect to workspace database' });
      }

      // Check isolated tenant database for mfa_pending
      const pendingRes = await targetPool.query(
        'SELECT * FROM mfa_pending WHERE token=$1 AND expires_at > $2',
        [rawToken, Math.floor(Date.now() / 1000)]
      );
      pending = pendingRes.rows[0];
    } else {
      // Standalone / legacy fallback to central db
      const pendingRes = await db.query(
        'SELECT * FROM mfa_pending WHERE token=$1 AND expires_at > $2',
        [rawToken, Math.floor(Date.now() / 1000)]
      );
      pending = pendingRes.rows[0];

      // If token was found in central DB but belongs to a tenant, route queryFn to tenant
      if (pending && pending.tenant_id && pending.tenant_id !== 'default' && appMode.isCentralServer()) {
        tenantId = pending.tenant_id;
        targetPool = await tenantDbManager.getTenantPool(tenantId);
        queryFn = targetPool.query.bind(targetPool);
      }
    }

    if (!pending) return res.status(401).json({ message: 'Session expired or invalid' });

    const user = await User.findById(pending.user_id, queryFn);
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      await targetPool.query('DELETE FROM mfa_pending WHERE token=$1', [rawToken]);
      return res.status(401).json({ message: 'Invalid user state' });
    }

    if (!verifyTOTP(user.mfa_secret, totpToken)) {
      return res.status(401).json({ message: 'Invalid MFA code. Please try again.' });
    }

    // Cleanup pending challenge token
    await targetPool.query('DELETE FROM mfa_pending WHERE token=$1', [rawToken]);
    
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').split(',')[0].trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const targetTenant = pending.tenant_id || tenantId || 'default';

    // Terminate existing sessions upon successful MFA verification
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND (tenant_id = $2 OR tenant_id = \'\' OR tenant_id IS NULL)', [user.id, targetTenant]);
    sseBroadcaster.broadcast('session_revoked', {
      user_id: user.id,
      tenant_id: targetTenant,
      reason: 'concurrent_takeover'
    });

    // Session is created ONLY AFTER MFA verification succeeds
    const isForcedChange = user.force_password_change === 1 || user.force_password_change === true;
    const token = await User.createSession(user.id, user.username, user.role, targetTenant, clientIp, userAgent, isForcedChange ? 1 : 0);
    await User.updateLastLogin(user.id, queryFn);

    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: isForcedChange,
        instance_mode: appMode.getConfig().mode,
        deployment_mode: appMode.getConfig().deploymentMode
      }
    });
  } catch (error) {
    console.error('[Auth Error] MFA verify failed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function logout(req, res) {
  try {
    const token = req.cookies?.iochunt_session || req.headers['x-session-token'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null) || req.session?.token;
    if (token) {
      await User.deleteSession(token);
    }
    
    res.clearCookie('iochunt_session', { path: '/' });
    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('[Auth Error] Logout failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function me(req, res) {
  try {
    const isForcedChange = req.session.force_password_change === 1 || req.session.force_password_change === true;

    return res.status(200).json({
      user: {
        id: req.session.user_id,
        username: req.session.username,
        role: req.session.role,
        aggregator_name: req.session.aggregator_name || null,
        display_name: req.session.display_name || null,
        is_aggregator_admin: Boolean(req.session.aggregator_name || req.session.role === 'AGGREGATOR_ADMIN'),
        force_password_change: isForcedChange,
        instance_mode: appMode.getConfig().mode,
        deployment_mode: appMode.getConfig().deploymentMode,
        company_name: appMode.getConfig().companyName
      }
    });
  } catch (error) {
    console.error('[Auth Error] Me query failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function setupBranchNode(req, res) {
  try {
    const { central_url, username, password } = req.body;
    if (!central_url || !username || !password) {
      return res.status(400).json({ error: 'Central Server URL, username, and password are required' });
    }

    const https = require('https');
    const axios = require('axios');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const normalizedCentralUrl = central_url.replace(/\/+$/, '');
    const provisionEndpoint = `${normalizedCentralUrl}/api/aggregators/provision-remote`;

    // 1. Verify with Central Server
    let centralRes;
    try {
      centralRes = await axios.post(provisionEndpoint, {
        username,
        password
      }, {
        httpsAgent: agent,
        timeout: 10000
      });
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message;
      return res.status(400).json({ error: `Central Server verification failed: ${errMsg}` });
    }

    const { aggregator_name, display_name, user: remoteUser } = centralRes.data;

    // 2. Initialize local database schema for this branch
    const { initDB } = require('../config/db');
    await initDB();

    const { createAggregatorDatabase } = require('../config/aggregatorDbManager');
    try {
      await createAggregatorDatabase(aggregator_name);
    } catch (e) {
      console.warn('[Branch Setup] Aggregator DB provisioning note:', e.message);
    }

    // 3. Ensure remote admin user exists in local database
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 1;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT '';
    `);

    await db.query(`
      INSERT INTO users (username, password_hash, salt, role, aggregator_name, display_name, force_password_change, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        salt = EXCLUDED.salt,
        role = EXCLUDED.role,
        aggregator_name = EXCLUDED.aggregator_name,
        display_name = EXCLUDED.display_name,
        force_password_change = EXCLUDED.force_password_change
    `, [
      remoteUser.username,
      remoteUser.password_hash,
      remoteUser.salt,
      remoteUser.role || 'AGGREGATOR_ADMIN',
      aggregator_name,
      display_name || aggregator_name,
      remoteUser.force_password_change !== undefined ? remoteUser.force_password_change : 1,
      Math.floor(Date.now() / 1000)
    ]);

    const localUserRes = await db.query('SELECT * FROM users WHERE username = $1', [remoteUser.username]);
    const localUser = localUserRes.rows[0];

    // 4. Update local instance_config and settings
    await db.query(`
      INSERT INTO instance_config (id, instance_mode, deployment_mode, instance_name, setup_complete)
      VALUES (1, 'aggregator', 'onprem', $1, TRUE)
      ON CONFLICT (id) DO UPDATE SET
        instance_mode = 'aggregator',
        instance_name = EXCLUDED.instance_name,
        setup_complete = TRUE
    `, [display_name || `${aggregator_name} Branch Aggregator`]);

    await db.query(`
      INSERT INTO settings (id, central_server_url, central_api_key, aggregator_name, updated_at)
      VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        central_server_url = EXCLUDED.central_server_url,
        central_api_key = EXCLUDED.central_api_key,
        aggregator_name = EXCLUDED.aggregator_name,
        updated_at = CURRENT_TIMESTAMP
    `, [normalizedCentralUrl, centralRes.data.api_key || '', aggregator_name]);

    const { setConfig, MODES } = require('../config/appMode');
    setConfig({
      mode: MODES.AGGREGATOR,
      instanceName: display_name || `${aggregator_name} Branch Aggregator`,
      setupComplete: true,
      source: 'database'
    });

    // 5. Create local session
    const token = await User.createSession(localUser.id, localUser.username, localUser.role);
    await User.updateLastLogin(localUser.id);

    // Set secure session cookie (7 days)
    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.status(200).json({
      message: `Branch Node successfully connected to Central Server as '${aggregator_name}'`,
      aggregator_name: aggregator_name,
      user: {
        id: localUser.id,
        username: localUser.username,
        role: localUser.role,
        aggregator_name: aggregator_name,
        display_name: display_name,
        is_aggregator_admin: true,
        force_password_change: localUser.force_password_change === 1 || localUser.force_password_change === true,
        instance_mode: 'aggregator'
      }
    });
  } catch (error) {
    console.error('[Branch Setup Error]', error);
    return res.status(500).json({ error: 'Failed to initialize branch node' });
  }
}

/**
 * Get tenant's raw API key
 */
async function getApiKey(req, res) {
  try {
    const { isAggregator, isOnPrem } = require('../config/appMode');
    
    // For Aggregators or On-Premise deployments, the API key is stored locally in the settings table
    if (isAggregator() || isOnPrem()) {
      const settingsRes = await db.query('SELECT agent_api_key_plain FROM settings WHERE id = 1');
      if (settingsRes.rows.length === 0 || !settingsRes.rows[0].agent_api_key_plain) {
        return res.status(404).json({ error: 'API key not configured.' });
      }
      return res.json({ api_key: settingsRes.rows[0].agent_api_key_plain });
    }

    // For multi-tenant Cloud deployments, fetch from the tenants table
    if (!req.tenantId) {
      return res.status(400).json({ error: 'Tenant context missing' });
    }
    const tenantRes = await db.query(
      'SELECT api_key_encrypted FROM tenants WHERE tenant_id = $1',
      [req.tenantId]
    );
    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const encryptedKey = tenantRes.rows[0].api_key_encrypted;
    if (!encryptedKey) {
      return res.status(404).json({ error: 'API key not available for viewing (legacy tenant).' });
    }
    const plainKey = decryptData(encryptedKey);
    if (!plainKey) {
      return res.status(500).json({ error: 'Failed to decrypt API key.' });
    }
    res.json({ api_key: plainKey });
  } catch (err) {
    console.error('[AUTH] getApiKey error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  login,
  setupBranchNode,
  changePassword,
  mfaVerify,
  logout,
  me,
  getApiKey,
  validatePasswordStrength
};
