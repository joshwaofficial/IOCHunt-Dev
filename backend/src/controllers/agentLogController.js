// ════════════════════════════════════════════════════════════════
// IOC Hunt — Direct Agent Log Ingestion Controller
// ════════════════════════════════════════════════════════════════
// Accepts logs directly from endpoint agents (Scenario 2 or local branch)
// ════════════════════════════════════════════════════════════════

const db = require('../config/db');
const sseBroadcaster = require('../services/sseBroadcaster');
const { detectNoise, classifySeverity, parseCategory, normalizeToUTC } = require('../utils/ingestHelpers');
const { isAggregator } = require('../config/appMode');
const syncService = require('../modules/aggregator/services/syncService');

async function ingestAgentLogs(req, res) {
  try {
    const { machine, label, events } = req.body;
    if (!machine || !Array.isArray(events)) {
      return res.status(400).json({ error: 'machine+events[] required' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim().replace(/^::ffff:/, '');

    const displayTimezone = 'UTC';
    const isAggNode = isAggregator();
    const aggregatorName = isAggNode ? (process.env.INSTANCE_NAME || 'aggregator') : 'direct';

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
      const dupRes = await db.query(
        'SELECT 1 FROM events WHERE machine=$1 AND ts=$2 AND tag=$3 AND message=$4 LIMIT 1',
        [r.machine, r.ts, r.tag, r.message]
      );
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
            INSERT INTO events (aggregator_name, machine, label, ts, tag, severity, category, message, is_noise, received, is_forwarded)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (EXTRACT(EPOCH FROM NOW())::INTEGER), $10)
          `, [
            aggregatorName,
            e.machine,
            label || e.machine,
            e.ts,
            e.tag,
            e.severity,
            e.category,
            e.message,
            e.is_noise,
            !isAggNode // If on Central Server, it's already at central (is_forwarded=true); if on Aggregator, needs sync (is_forwarded=false)
          ]);
        }

        await client.query(`
          INSERT INTO machines (id, aggregator_name, name, label, last_seen, event_count, ip)
          VALUES ($1, $2, $3, $4, NOW(), $5, $6)
          ON CONFLICT(id) DO UPDATE SET
            label       = EXCLUDED.label,
            last_seen   = NOW(),
            event_count = machines.event_count + EXCLUDED.event_count,
            ip          = CASE WHEN EXCLUDED.ip != '' THEN EXCLUDED.ip ELSE machines.ip END
        `, [machine, aggregatorName, machine, label || machine, uniqueRows.length, clientIp]);

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      // Realtime SSE broadcast for analysts
      for (const e of uniqueRows) {
        if (!e.is_noise) {
          sseBroadcaster.broadcast('new_event', { ...e, label: label || machine, aggregator_name: aggregatorName });
        }
      }

      // TRIGGER EVENT-DRIVEN SYNC (After successful DB commit)
      syncService.triggerSync();
    }

    res.status(200).json({ success: true, ingested: uniqueRows.length });
  } catch (error) {
    console.error('[Agent Ingest Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  ingestAgentLogs
};
