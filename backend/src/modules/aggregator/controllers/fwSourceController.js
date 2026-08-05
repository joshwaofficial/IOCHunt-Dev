const { getDbForRequest } = require('../../../config/aggregatorDbManager');
const { startWatchingSource, stopWatchingSource } = require('../../../utils/fwWatcher');

exports.getSources = async (req, res) => {
  try {
    const pool = getDbForRequest(req);
    const sourcesRes = await pool.query('SELECT * FROM fw_sources ORDER BY created DESC');
    res.json(sourcesRes.rows);
  } catch (error) {
    console.error('[FW_SOURCES] Get Sources Error:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
};

exports.addSource = async (req, res) => {
  try {
    const { name, log_path, source_timezone = 'UTC' } = req.body;
    
    if (!name || !log_path) {
      return res.status(400).json({ error: 'Name and log_path are required.' });
    }

    const pool = getDbForRequest(req);

    // Check if path already exists
    const existingRes = await pool.query('SELECT id FROM fw_sources WHERE log_path = $1', [log_path]);
    if (existingRes.rows.length > 0) {
      return res.status(400).json({ error: 'A source with this log path already exists.' });
    }

    const infoRes = await pool.query(
      'INSERT INTO fw_sources (name, log_path, source_timezone) VALUES ($1, $2, $3) RETURNING id',
      [name, log_path, source_timezone]
    );

    const newSource = {
      id: infoRes.rows[0].id, 
      name, 
      log_path, 
      source_timezone, 
      enabled: 1 
    };

    startWatchingSource(newSource);

    res.status(201).json(newSource);
  } catch (error) {
    console.error('[FW_SOURCES] Add Source Error:', error);
    res.status(500).json({ error: 'Failed to add source' });
  }
};

exports.toggleSource = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDbForRequest(req);
    
    const currentRes = await pool.query('SELECT * FROM fw_sources WHERE id = $1', [id]);
    const current = currentRes.rows[0];
    if (!current) {
      return res.status(404).json({ error: 'Source not found' });
    }

    const newVal = current.enabled ? 0 : 1;
    await pool.query('UPDATE fw_sources SET enabled = $1 WHERE id = $2', [newVal, id]);

    current.enabled = newVal;
    if (newVal === 1) {
      startWatchingSource(current);
    } else {
      stopWatchingSource(current.id);
    }

    res.json({ success: true, enabled: newVal });
  } catch (error) {
    console.error('[FW_SOURCES] Toggle Source Error:', error);
    res.status(500).json({ error: 'Failed to toggle source' });
  }
};

exports.deleteSource = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getDbForRequest(req);
    
    stopWatchingSource(id);

    const infoRes = await pool.query('DELETE FROM fw_sources WHERE id = $1', [id]);
    
    if (infoRes.rowCount === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[FW_SOURCES] Delete Source Error:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
};

