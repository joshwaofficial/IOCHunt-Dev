// ════════════════════════════════════════════════════════════════
// IOC Hunt — Authentication Controller
// ════════════════════════════════════════════════════════════════

const User = require('../models/User');
const { hashPassword, verifyPassword } = require('../utils/cryptoHelper');
const crypto = require('crypto');
const db = require('../config/db');
const { verifyTOTP } = require('../utils/totpHelper');
const { getConfig } = require('../config/appMode');

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
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // MFA check
    if (user.mfa_enabled) {
      const tempToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 mins
      
      await db.query(
        'INSERT INTO mfa_pending (token, user_id, username, role, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [tempToken, user.id, user.username, user.role, expiresAt]
      );
      
      return res.status(200).json({ 
        message: 'MFA required', 
        mfa_required: true,
        tempToken: tempToken 
      });
    }

    // Generate authenticated session
    const token = await User.createSession(user.id, user.username, user.role);
    await User.updateLastLogin(user.id);

    // Set secure session cookie (7 days)
    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    const isForcedChange = user.force_password_change === 1 || user.force_password_change === true;

    // If logging in as Central Super Admin, ensure instance_mode is central_server
    if (user.role === 'ADMIN' && !user.aggregator_name) {
      await db.query(`
        UPDATE instance_config 
        SET instance_mode = 'central_server', setup_complete = TRUE 
        WHERE id = 1
      `);
      const { setConfig, MODES } = require('../config/appMode');
      setConfig({
        mode: MODES.CENTRAL_SERVER,
        setupComplete: true,
        source: 'database'
      });
    }

    return res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        aggregator_name: user.aggregator_name || null,
        display_name: user.display_name || null,
        is_aggregator_admin: Boolean(user.aggregator_name || user.role === 'AGGREGATOR_ADMIN'),
        force_password_change: isForcedChange,
        instance_mode: user.aggregator_name ? 'aggregator' : 'central_server',
        deployment_mode: getConfig().deploymentMode
      }
    });
  } catch (error) {
    console.error('[Auth Error] Login failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function changePassword(req, res) {
  try {
    const { current_password, new_password, confirm_password, new_username } = req.body;

    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ error: 'All password fields are required' });
    }

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

    const user = await User.findById(req.session.user_id);
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
      const existingUser = await User.findByUsername(new_username);
      if (existingUser) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      await User.updateCredentials(user.id, new_username, hash, salt);
    } else {
      await User.updatePassword(user.id, hash, salt);
    }

    // Update the session in memory if needed
    if (req.session) {
      req.session.force_password_change = 0;
    }

    return res.status(200).json({
      success: true,
      force_password_change: false,
      message: 'Password successfully changed. You now have full access to the system.'
    });
  } catch (error) {
    console.error('[Auth Error] Change password failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function mfaVerify(req, res) {
  try {
    const { tempToken, totpToken } = req.body;
    if (!tempToken || !totpToken) {
      return res.status(400).json({ message: 'Token and code required' });
    }

    const pendingRes = await db.query(
      'SELECT * FROM mfa_pending WHERE token=$1 AND expires_at > $2',
      [tempToken, Math.floor(Date.now() / 1000)]
    );
    const pending = pendingRes.rows[0];
    if (!pending) return res.status(401).json({ message: 'Session expired or invalid' });

    const user = await User.findById(pending.user_id);
    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      await db.query('DELETE FROM mfa_pending WHERE token=$1', [tempToken]);
      return res.status(401).json({ message: 'Invalid user state' });
    }

    if (!verifyTOTP(user.mfa_secret, totpToken)) {
      return res.status(401).json({ message: 'Invalid MFA code. Please try again.' });
    }

    await db.query('DELETE FROM mfa_pending WHERE token=$1', [tempToken]);
    
    const token = await User.createSession(user.id, user.username, user.role);
    await User.updateLastLogin(user.id);

    res.cookie('iochunt_session', token, {
      httpOnly: true,
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000
    });

    const isForcedChange = user.force_password_change === 1 || user.force_password_change === true;

    return res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        force_password_change: isForcedChange,
        instance_mode: getConfig().mode,
        deployment_mode: getConfig().deploymentMode
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
        instance_mode: getConfig().mode,
        deployment_mode: getConfig().deploymentMode,
        company_name: getConfig().companyName
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
      token: token,
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
    return res.status(500).json({ error: 'Failed to initialize branch node: ' + error.message });
  }
}

module.exports = {
  login,
  setupBranchNode,
  changePassword,
  mfaVerify,
  logout,
  me
};
