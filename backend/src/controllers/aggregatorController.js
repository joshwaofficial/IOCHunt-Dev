// ════════════════════════════════════════════════════════════════
// IOC Hunt — Aggregator Controller
// ════════════════════════════════════════════════════════════════
// Handles:
// 1. Aggregator separate database creation & provisioning
// 2. Secure pairing code exchange & API key generation
// 3. Querying specific aggregator branch databases and logs
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const db = require('../config/db');
const { createAggregatorDatabase, queryAggregator, closeAggregatorPool } = require('../config/aggregatorDbManager');
const { hashPassword } = require('../utils/cryptoHelper');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

/**
 * Admin registers an aggregator account in Central Server
 * (Does NOT create database on Central Server; database is created on the branch node upon remote login)
 */
const createAggregator = async (req, res) => {
  try {
    const { name, display_name } = req.body;
    if (!name) return res.status(400).json({ error: 'Aggregator name is required' });

    // Auto-assign tenant_id from the logged-in user's session
    const tenantId = req.session?.tenant_id || req.tenantId || 'default';

    const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const dbName = `iochunt_agg_${safeName}`;

    // Generate pairing code (valid for 48 hours)
    const pairingCode = 'PAIR-' + crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    const expires = new Date();
    expires.setHours(expires.getHours() + 48);

    await db.query(`
      INSERT INTO aggregators (name, display_name, tenant_id, pairing_code_hash, pairing_expires, status, database_name)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      ON CONFLICT (name) DO UPDATE SET 
        display_name = COALESCE(EXCLUDED.display_name, aggregators.display_name),
        tenant_id = EXCLUDED.tenant_id,
        pairing_code_hash = EXCLUDED.pairing_code_hash,
        pairing_expires = EXCLUDED.pairing_expires,
        database_name = EXCLUDED.database_name,
        status = 'pending'
    `, [
      safeName,
      display_name || safeName,
      tenantId,
      hash(pairingCode),
      expires,
      dbName
    ]);

    const { getNetworkUrl } = require('../utils/networkHelper');
    const port = process.env.PORT || 4001;
    const isHttps = req.protocol === 'https' || req.secure || Boolean(process.env.SSL_KEY_PATH);
    const centralServerUrl = getNetworkUrl(port, isHttps);

    res.status(201).json({
      success: true,
      message: `Aggregator '${safeName}' registered for tenant '${tenantId}'. Ready to be provisioned on remote Branch server.`,
      name: safeName,
      display_name: display_name || name,
      tenant_id: tenantId,
      database_name: dbName,
      status: 'pending',
      pairing_code: pairingCode,
      central_server_url: centralServerUrl,
      expires_at: expires
    });
  } catch (error) {
    console.error('[Create Aggregator Error]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

/**
 * Remote Aggregator Node connects for first-time provisioning & authentication
 * Central Server verifies branch credentials and returns authorization bundle
 */

/**
 * Generate/Regenerate a pairing code for an existing aggregator
 */
const generateCode = async (req, res) => {
  try {
    const { aggregator_name, display_name } = req.body;
    if (!aggregator_name) return res.status(400).json({ error: 'aggregator_name required' });

    const safeName = aggregator_name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Ensure database exists
    const dbInfo = await createAggregatorDatabase(safeName);

    const pairingCode = 'PAIR-' + crypto.randomBytes(6).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    const expires = new Date();
    expires.setHours(expires.getHours() + 24);

    const tenantId = req.session?.tenant_id || req.tenantId || 'default';
    const defaultDbHost = process.env.DB_HOST || 'db';
    await db.query(`
      INSERT INTO aggregators (name, display_name, tenant_id, pairing_code_hash, pairing_expires, status, database_name, database_host, database_port)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
      ON CONFLICT (name) DO UPDATE SET 
        display_name = COALESCE(EXCLUDED.display_name, aggregators.display_name),
        tenant_id = COALESCE(aggregators.tenant_id, EXCLUDED.tenant_id),
        pairing_code_hash = EXCLUDED.pairing_code_hash,
        pairing_expires = EXCLUDED.pairing_expires,
        database_name = EXCLUDED.database_name,
        database_host = EXCLUDED.database_host,
        database_port = EXCLUDED.database_port,
        status = 'pending'
    `, [
      safeName,
      display_name || safeName,
      tenantId,
      hash(pairingCode),
      expires,
      dbInfo.databaseName,
      defaultDbHost,
      5432
    ]);

    const { getNetworkUrl } = require('../utils/networkHelper');
    const port = process.env.PORT || 4001;
    const isHttps = req.protocol === 'https' || req.secure || Boolean(process.env.SSL_KEY_PATH);
    const centralServerUrl = getNetworkUrl(port, isHttps);

    res.json({
      success: true,
      aggregator_name: safeName,
      database_name: dbInfo.databaseName,
      pairing_code: pairingCode,
      central_server_url: centralServerUrl,
      expires_at: expires
    });
  } catch (error) {
    console.error('[Generate Code Error]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

/**
 * Branch Aggregator exchanges its pairing code for an active API key
 */
const pair = async (req, res) => {
  try {
    const { pairing_code } = req.body;
    if (!pairing_code) return res.status(400).json({ error: 'pairing_code required' });

    const codeHash = hash(pairing_code.trim());

    const result = await db.query(
      'SELECT * FROM aggregators WHERE pairing_code_hash = $1 AND status != $2',
      [codeHash, 'revoked']
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired pairing code' });
    }

    const aggregator = result.rows[0];

    // Check expiration
    if (aggregator.pairing_expires && new Date() > new Date(aggregator.pairing_expires)) {
      return res.status(400).json({ error: 'Pairing code has expired. Request a new one from Central Server.' });
    }

    // Generate unique API key for this aggregator
    const apiKey = 'agg_' + crypto.randomBytes(32).toString('hex');

    await db.query(`
      UPDATE aggregators 
      SET status = 'active', 
          api_key_hash = $1, 
          pairing_code_hash = NULL,
          last_sync = NOW()
      WHERE id = $2
    `, [hash(apiKey), aggregator.id]);

    res.json({
      status: 'paired',
      api_key: apiKey,
      aggregator_name: aggregator.name,
      database_name: aggregator.database_name
    });
  } catch (error) {
    console.error('[Pairing Error]', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

/**
 * List all registered aggregators with sync health & stats
 * Filtered by the logged-in user's tenant — each tenant sees only their own aggregators.
 */
const getAggregators = async (req, res) => {
  try {
    const isAggAdmin = req.session?.role === 'AGGREGATOR_ADMIN' || Boolean(req.session?.aggregator_name);
    
    let result;
    if (isAggAdmin && req.session?.aggregator_name) {
      // Aggregator admin can only see their own aggregator
      result = await db.query(`
        SELECT id, name, display_name, tenant_id, status, database_name, last_sync, agent_count, created_at 
        FROM aggregators 
        WHERE name = $1
        ORDER BY created_at DESC
      `, [req.session.aggregator_name]);
    } else {
      // Filter by tenant — each company only sees their own aggregators
      const tenantId = req.session?.tenant_id || req.tenantId || 'default';
      result = await db.query(`
        SELECT id, name, display_name, tenant_id, status, database_name, last_sync, agent_count, created_at 
        FROM aggregators 
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `, [tenantId]);
    }
    res.json(result.rows);
  } catch (error) {
    console.error('[Get Aggregators Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * View logs from a specific aggregator.
 * Queries the owning tenant's isolated database (NOT the control plane).
 */
const getAggregatorLogs = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, severity, machine } = req.query;

    // Verify the aggregator exists AND belongs to this user's tenant
    const tenantId = req.session?.tenant_id || req.tenantId || 'default';
    const aggRes = await db.query(
      'SELECT name, database_name, tenant_id FROM aggregators WHERE id = $1',
      [id]
    );
    if (aggRes.rows.length === 0) {
      return res.status(404).json({ error: 'Aggregator not found' });
    }

    const agg = aggRes.rows[0];
    
    // Security check: only allow viewing logs for aggregators belonging to this tenant
    if (agg.tenant_id && agg.tenant_id !== tenantId && tenantId !== 'default') {
      return res.status(403).json({ error: 'Access denied: aggregator belongs to another tenant' });
    }

    const aggName = agg.name;

    // Query events from the owning tenant's isolated database
    let queryText = 'SELECT * FROM events WHERE aggregator_name = $1';
    const params = [aggName];
    let pIdx = 2;

    if (severity) {
      queryText += ` AND severity = $${pIdx++}`;
      params.push(severity);
    }
    if (machine) {
      queryText += ` AND machine = $${pIdx++}`;
      params.push(machine);
    }

    queryText += ` ORDER BY ts DESC LIMIT $${pIdx}`;
    params.push(parseInt(limit, 10));

    // Use req.queryTenant to route to the correct tenant's isolated DB
    const eventsRes = await req.queryTenant(queryText, params);
    res.json({
      aggregator: aggName,
      total: eventsRes.rows.length,
      events: eventsRes.rows
    });
  } catch (error) {
    console.error('[Get Aggregator Logs Error]', error);
    res.status(500).json({ error: 'Failed to retrieve aggregator logs' });
  }
};

/**
 * Delete aggregator and close its connection pool
 */
const deleteAggregator = async (req, res) => {
  try {
    const { id } = req.params;
    const aggRes = await db.query('SELECT name FROM aggregators WHERE id = $1', [id]);
    if (aggRes.rows.length > 0) {
      await closeAggregatorPool(aggRes.rows[0].name);
    }
    await db.query('DELETE FROM aggregators WHERE id = $1', [id]);
    res.json({ success: true, message: 'Aggregator removed' });
  } catch (error) {
    console.error('[Delete Aggregator Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  createAggregator,

  generateCode,
  pair,
  getAggregators,
  getAggregatorLogs,
  deleteAggregator
};
