const db = require('../config/db');
const sseBroadcaster = require('../sse/sseBroadcaster');
const { detectNoise, classifySeverity, parseCategory, normalizeToUTC } = require('../utils/ingestHelpers');

async function ingestLogs(req, res) {
  try {
    const { machine, label, events } = req.body;
    if (!machine || !Array.isArray(events)) {
      return res.status(400).json({ error: 'machine+events[] required' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim().replace(/^::ffff:/, '');

    const displayTimezone = 'UTC';

    const rows = events.filter(e => e.ts && e.message).map(e => {
      const sev = classifySeverity(e.tag, e.message);
      return {
        machine,
        ts: normalizeToUTC(e.ts, displayTimezone),
        tag: e.tag || '',
        severity: sev,
        category: e.category || parseCategory(e.tag, e.message),
        message: e.message.slice(0, 2000),
        is_noise: detectNoise(e.tag, e.message, sev),
      };
    });

    const uniqueRows = [];
    for (const r of rows) {
      const dupRes = await db.query('SELECT 1 FROM events WHERE machine=$1 AND ts=$2 AND tag=$3 AND message=$4 LIMIT 1', [r.machine, r.ts, r.tag, r.message]);
      if (dupRes.rowCount === 0) {
        uniqueRows.push(r);
      }
    }

    if (uniqueRows.length) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const e of uniqueRows) {
          await client.query(`
            INSERT INTO events (machine, ts, tag, severity, category, message, is_noise, received)
            VALUES ($1, $2, $3, $4, $5, $6, $7, (EXTRACT(EPOCH FROM NOW())::INTEGER))
          `, [e.machine, e.ts, e.tag, e.severity, e.category, e.message, e.is_noise]);
        }
        await client.query(`
          INSERT INTO machines (id, label, last_seen, event_count, ip)
          VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW())::INTEGER), $3, $4)
          ON CONFLICT(id) DO UPDATE SET
            label       = excluded.label,
            last_seen   = excluded.last_seen,
            event_count = machines.event_count + excluded.event_count,
            ip          = CASE WHEN excluded.ip != '' THEN excluded.ip ELSE machines.ip END
        `, [machine, label || machine, uniqueRows.length, clientIp]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Broadcast new events
      for (const e of uniqueRows) {
        if (!e.is_noise) {
          sseBroadcaster.broadcast('new_event', e);
        }
      }
    }

    res.status(200).json({ success: true, ingested: uniqueRows.length });

    // --- Phase 3: Central Server Event Forwarding ---
    if (uniqueRows.length > 0) {
      forwardToCentral(machine, label, uniqueRows).catch(err => {
        console.error('[Sync Error] Failed to forward to central server:', err.message);
      });
    }
  } catch (error) {
    console.error('[Ingest Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function forwardToCentral(machine, label, events) {
  const axios = require('axios');
  const https = require('https');

  // Fetch central server settings
  const res = await db.query('SELECT central_server_url, central_api_key FROM settings LIMIT 1');
  if (res.rows.length === 0) return;

  const { central_server_url, central_api_key } = res.rows[0];
  if (!central_server_url || !central_api_key) return;

  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  await axios.post(`${central_server_url}/api/ingest/events`, {
    machine,
    label,
    events
  }, {
    headers: {
      'Authorization': `Bearer ${central_api_key}`
    },
    httpsAgent
  });
}

module.exports = {
  ingestLogs
};
