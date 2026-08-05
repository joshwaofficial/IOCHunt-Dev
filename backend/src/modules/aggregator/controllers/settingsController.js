const { getDbForRequest, getAggregatorPool } = require('../../../config/aggregatorDbManager');
const db = require('../../../config/db');
const axios = require('axios');
const https = require('https');

// For development/internal networks, we accept self-signed certs when communicating with Central Server
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const getSettings = async (req, res) => {
  try {
    const pool = getDbForRequest(req);
    const result = await pool.query('SELECT central_server_url, updated_at, local_retention_days FROM settings LIMIT 1');
    const settings = result.rows.length > 0 ? result.rows[0] : null;
    
    let stats = {
      events_forwarded: 0,
      last_sync: null,
      status: 'Offline'
    };

    if (settings && settings.central_server_url) {
      // Get total events as a proxy for events forwarded
      const eventCount = await pool.query('SELECT COUNT(*) FROM events WHERE is_forwarded = TRUE');
      stats.events_forwarded = parseInt(eventCount.rows[0]?.count || 0, 10);
      stats.last_sync = settings.updated_at;
      stats.status = 'Active';
    }

    res.json({ 
      central_server_url: settings?.central_server_url || '',
      local_retention_days: settings?.local_retention_days || 30,
      stats
    });
  } catch (error) {
    console.error('[Settings] Get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const pairCentral = async (req, res) => {
  try {
    const { url, pairing_code } = req.body;
    if (!url || !pairing_code) return res.status(400).json({ error: 'URL and pairing code required' });

    // Ensure URL is clean
    const cleanUrl = url.replace(/\/$/, '');
    const aggregatorName = req.session?.aggregator_name || req.user?.aggregator_name || process.env.AGGREGATOR_NAME || process.env.TENANT_ID || 'branch-1';
    const pool = getDbForRequest(req);

    // Call Central Server to exchange code for API Key
    const response = await axios.post(`${cleanUrl}/api/aggregators/pair`, {
      pairing_code: pairing_code.trim(),
      aggregator_name: aggregatorName
    }, { httpsAgent });

    if (response.data && response.data.api_key) {
      const apiKey = response.data.api_key;
      
      // Upsert into dedicated aggregator database settings table
      const existing = await pool.query('SELECT id FROM settings LIMIT 1');
      if (existing.rows.length > 0) {
        await pool.query(
          'UPDATE settings SET central_server_url = $1, central_api_key = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [cleanUrl, apiKey, existing.rows[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO settings (central_server_url, central_api_key) VALUES ($1, $2)',
          [cleanUrl, apiKey]
        );
      }

      res.json({ success: true, message: 'Successfully paired to Central Server!' });
    } else {
      res.status(400).json({ error: 'Invalid response from Central Server' });
    }
  } catch (error) {
    console.error('[Settings] Pairing error:', error.response?.data || error.message);
    res.status(400).json({ error: error.response?.data?.error || 'Failed to connect to Central Server' });
  }
};

const disconnectCentral = async (req, res) => {
  try {
    const pool = getDbForRequest(req);
    await pool.query('UPDATE settings SET central_server_url = NULL, central_api_key = NULL');
    
    // Also update Central Server status if aggregator name known
    const aggName = req.session?.aggregator_name || req.user?.aggregator_name;
    if (aggName) {
      try {
        await db.query('UPDATE aggregators SET status = $1 WHERE name = $2', ['pending', aggName]);
      } catch (e) {
        console.warn('[Settings] Failed to update central status on disconnect:', e.message);
      }
    }

    res.json({ success: true, message: 'Disconnected from Central Server' });
  } catch (error) {
    console.error('[Settings] Disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateRetention = async (req, res) => {
  try {
    const { local_retention_days } = req.body;
    const days = parseInt(local_retention_days, 10);
    if (isNaN(days)) return res.status(400).json({ error: 'Invalid days value' });

    const pool = getDbForRequest(req);
    const existing = await pool.query('SELECT id FROM settings LIMIT 1');
    if (existing.rows.length > 0) {
      await pool.query('UPDATE settings SET local_retention_days = $1 WHERE id = $2', [days, existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO settings (local_retention_days) VALUES ($1)', [days]);
    }
    res.json({ success: true, message: 'Retention policy updated successfully' });
  } catch (error) {
    console.error('[Settings] Update retention error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getSettings,
  pairCentral,
  disconnectCentral,
  updateRetention
};
