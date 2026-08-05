// ════════════════════════════════════════════════════════════════
// IOC Hunt — Instance Configuration & Setup Controller
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const { initDB } = require('../config/db');
const { getConfig, setConfig, MODES, normalizeMode } = require('../config/appMode');
const cryptoHelper = require('../utils/cryptoHelper');
const User = require('../models/User');
const axios = require('axios');
const https = require('https');

/**
 * Returns current instance setup status and metadata dynamically from DB
 */
async function getInstanceInfo(req, res) {
  try {
    let setupComplete = false;
    let mode = MODES.UNCONFIGURED;
    let instanceName = 'IOC Hunt Platform';
    let deploymentMode = 'onprem';

    try {
      const configRes = await db.query('SELECT * FROM instance_config WHERE id = 1');
      const userRes = await db.query('SELECT COUNT(*) as count FROM users');
      const userCount = parseInt(userRes.rows[0]?.count || '0', 10);

      if (configRes.rows.length > 0) {
        const row = configRes.rows[0];
        instanceName = row.instance_name || instanceName;
        deploymentMode = row.deployment_mode || deploymentMode;
        
        // Setup is only complete if marked in DB AND there is at least one active user
        if ((row.setup_complete === true || row.setup_complete === 1) && userCount > 0) {
          setupComplete = true;
          mode = row.instance_mode || MODES.CENTRAL;
        }
      }
    } catch (dbErr) {
      console.warn('[Instance] DB query for setup status notice:', dbErr.message);
    }

    const { getHostIp, getNetworkUrl } = require('../utils/networkHelper');
    const port = process.env.PORT || 4001;
    const isHttps = req.protocol === 'https' || req.secure || Boolean(process.env.SSL_KEY_PATH);

    return res.json({
      mode: mode,
      deployment_mode: deploymentMode,
      instance_name: instanceName,
      setup_complete: setupComplete,
      host_ip: getHostIp(),
      network_url: getNetworkUrl(port, isHttps),
      port: port,
      available_modes: [
        {
          id: MODES.CENTRAL,
          name: 'Central Management Server',
          description: 'Unified command center to monitor all branch aggregators, direct agents, and system policies.'
        },
        {
          id: MODES.AGGREGATOR,
          name: 'Branch Aggregator',
          description: 'Branch edge aggregator collecting local agent events and syncing with Central Server.'
        }
      ]
    });
  } catch (error) {
    console.error('[Instance] Info error:', error);
    return res.status(500).json({ error: 'Failed to retrieve instance info' });
  }
}

/**
 * First-time setup wizard completion endpoint
 */
async function completeSetup(req, res) {
  try {
    const {
      mode,
      instance_name,
      admin_username,
      admin_password,
      admin_email,
      central_server_url
    } = req.body;

    const normalized = normalizeMode(mode);
    if (!normalized) {
      return res.status(400).json({ error: 'Valid mode (central_server or aggregator) is required.' });
    }

    // ── 1. SETUP CENTRAL SERVER ─────────────────────────────────
    if (normalized === MODES.CENTRAL) {
      if (!admin_username || !admin_password) {
        return res.status(400).json({ error: 'Admin username and password are required for Central Server setup' });
      }
      if (admin_password.length < 6) {
        return res.status(400).json({ error: 'Admin password must be at least 6 characters long' });
      }

      const safeInstanceName = (instance_name || '').trim() || 'IOC Hunt Central Command Hub';
      const { hash, salt } = cryptoHelper.hashPassword(admin_password);
      const createdAt = Math.floor(Date.now() / 1000);
      const username = admin_username.trim().toLowerCase();

      // Ensure tables exist
      await initDB();

      // Ensure user columns exist
      await db.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 0;
      `);

      // Insert/Update Primary Administrator
      const userInsertRes = await db.query(`
        INSERT INTO users (username, password_hash, salt, role, email, force_password_change, created_at)
        VALUES ($1, $2, $3, 'ADMIN', $4, 0, $5)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          salt = EXCLUDED.salt,
          role = 'ADMIN',
          email = EXCLUDED.email,
          force_password_change = 0
        RETURNING id, username, role
      `, [username, hash, salt, admin_email || '', createdAt]);

      const adminUser = userInsertRes.rows[0];

      // Update instance_config
      await db.query(`
        INSERT INTO instance_config (id, instance_mode, deployment_mode, instance_name, setup_complete)
        VALUES (1, 'central_server', 'onprem', $1, TRUE)
        ON CONFLICT (id) DO UPDATE SET
          instance_mode = 'central_server',
          instance_name = EXCLUDED.instance_name,
          setup_complete = TRUE
      `, [safeInstanceName]);

      // Create session
      const token = await User.createSession(adminUser.id, adminUser.username, adminUser.role);
      await User.updateLastLogin(adminUser.id);

      // Set cookie
      res.cookie('iochunt_session', token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600 * 1000
      });

      setConfig({
        mode: MODES.CENTRAL,
        instanceName: safeInstanceName,
        setupComplete: true,
        source: 'database'
      });

      return res.status(200).json({
        success: true,
        message: 'Central Server initialized successfully!',
        token: token,
        mode: MODES.CENTRAL,
        instance_name: safeInstanceName,
        user: {
          id: adminUser.id,
          username: adminUser.username,
          role: adminUser.role,
          instance_mode: 'central_server',
          force_password_change: false
        }
      });
    }

    // ── 2. SETUP BRANCH AGGREGATOR ──────────────────────────────
    if (normalized === MODES.AGGREGATOR) {
      if (!central_server_url || !admin_username || !admin_password) {
        return res.status(400).json({ error: 'Central Server URL, username, and password are required' });
      }

      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const normalizedCentralUrl = central_server_url.replace(/\/+$/, '');
      const provisionEndpoint = `${normalizedCentralUrl}/api/aggregators/provision-remote`;

      // 1. Verify with Central Server
      let centralRes;
      try {
        centralRes = await axios.post(provisionEndpoint, {
          username: admin_username.trim(),
          password: admin_password
        }, {
          httpsAgent,
          timeout: 10000
        });
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return res.status(400).json({ error: `Central Server verification failed: ${errMsg}` });
      }

      const { aggregator_name, display_name, user: remoteUser, api_key } = centralRes.data;
      const safeInstanceName = display_name || instance_name || `${aggregator_name} Branch Aggregator`;

      // 2. Initialize local database schema for this branch
      await initDB();

      // 3. Ensure remote admin user exists in local database
      await db.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS aggregator_name VARCHAR(255) DEFAULT NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT '';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change INTEGER DEFAULT 0;
      `);

      const createdAt = Math.floor(Date.now() / 1000);
      const userRes = await db.query(`
        INSERT INTO users (username, password_hash, salt, role, aggregator_name, display_name, force_password_change, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          salt = EXCLUDED.salt,
          role = EXCLUDED.role,
          aggregator_name = EXCLUDED.aggregator_name,
          display_name = EXCLUDED.display_name,
          force_password_change = 0
        RETURNING id, username, role
      `, [
        remoteUser.username,
        remoteUser.password_hash,
        remoteUser.salt,
        remoteUser.role || 'AGGREGATOR_ADMIN',
        aggregator_name,
        display_name || aggregator_name,
        createdAt
      ]);

      const localUser = userRes.rows[0];

      // 4. Update instance_config & settings
      await db.query(`
        INSERT INTO instance_config (id, instance_mode, deployment_mode, instance_name, setup_complete)
        VALUES (1, 'aggregator', 'onprem', $1, TRUE)
        ON CONFLICT (id) DO UPDATE SET
          instance_mode = 'aggregator',
          instance_name = EXCLUDED.instance_name,
          setup_complete = TRUE
      `, [safeInstanceName]);

      await db.query(`
        INSERT INTO settings (id, central_server_url, central_api_key, aggregator_name, updated_at)
        VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          central_server_url = EXCLUDED.central_server_url,
          central_api_key = EXCLUDED.central_api_key,
          aggregator_name = EXCLUDED.aggregator_name,
          updated_at = CURRENT_TIMESTAMP
      `, [normalizedCentralUrl, api_key || '', aggregator_name]);

      // 5. Create local session
      const token = await User.createSession(localUser.id, localUser.username, localUser.role);
      await User.updateLastLogin(localUser.id);

      // Set session cookie
      res.cookie('iochunt_session', token, {
        httpOnly: true,
        secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 3600 * 1000
      });

      setConfig({
        mode: MODES.AGGREGATOR,
        instanceName: safeInstanceName,
        setupComplete: true,
        source: 'database'
      });

      return res.status(200).json({
        success: true,
        message: `Branch Aggregator initialized and linked to Central Server as '${aggregator_name}'`,
        token: token,
        mode: MODES.AGGREGATOR,
        instance_name: safeInstanceName,
        user: {
          id: localUser.id,
          username: localUser.username,
          role: localUser.role,
          aggregator_name: aggregator_name,
          display_name: display_name,
          is_aggregator_admin: true,
          force_password_change: false,
          instance_mode: 'aggregator'
        }
      });
    }

  } catch (error) {
    console.error('[Instance] Setup error:', error);
    return res.status(500).json({ error: 'Failed to complete setup: ' + error.message });
  }
}

module.exports = {
  getInstanceInfo,
  completeSetup
};
