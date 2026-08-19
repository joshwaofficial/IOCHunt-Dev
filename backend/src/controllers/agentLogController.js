// ════════════════════════════════════════════════════════════════
// IOC Hunt — Direct Agent Log Ingestion Controller
// ════════════════════════════════════════════════════════════════
// Accepts logs directly from endpoint agents (Scenario 2 or local branch)
// ════════════════════════════════════════════════════════════════


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

    const tenantPool = await req.getTenantPool();
    const client = await tenantPool.connect();
    
    let uniqueRows = [];
    try {
      // 1. Perform duplicate checking using a single connection to avoid pool exhaustion
      for (const r of rows) {
        const dupRes = await client.query(
          'SELECT 1 FROM events WHERE machine=$1 AND ts=$2 AND tag=$3 AND message=$4 LIMIT 1',
          [r.machine, r.ts, r.tag, r.message]
        );
        if (dupRes.rowCount === 0) {
          uniqueRows.push(r);
        }
      }

      if (uniqueRows.length > 0) {
        await client.query('BEGIN');
        
        // 2. Bulk insert events
        const insertValues = [];
        const insertParams = [];
        let pIdx = 1;
        
        for (const e of uniqueRows) {
          insertValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, (EXTRACT(EPOCH FROM NOW())::INTEGER), $${pIdx++})`);
          insertParams.push(
            aggregatorName,
            e.machine,
            label || e.machine,
            e.ts,
            e.tag,
            e.severity,
            e.category,
            e.message,
            e.is_noise,
            !isAggNode
          );
        }

        // Postgres parameter limit is 65535, so chunk if necessary (unlikely to hit 65535 with 800 events * 10 params = 8000)
        await client.query(`
          INSERT INTO events (aggregator_name, machine, label, ts, tag, severity, category, message, is_noise, received, is_forwarded)
          VALUES ${insertValues.join(', ')}
        `, insertParams);

        await client.query(`
          INSERT INTO machines (id, aggregator_name, name, label, last_seen, event_count, ip)
          VALUES ($1, $2, $3, $4, NOW(), $5, $6)
          ON CONFLICT(id) DO UPDATE SET
            label       = EXCLUDED.label,
            last_seen   = NOW(),
            event_count = machines.event_count + EXCLUDED.event_count,
            ip          = EXCLUDED.ip
        `, [machine, aggregatorName, machine, label || machine, uniqueRows.length, clientIp]);

        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (uniqueRows.length > 0) {
      // Realtime SSE broadcast for analysts
      for (const e of uniqueRows) {
        if (!e.is_noise) {
          sseBroadcaster.broadcast('new_event', { ...e, label: label || machine, aggregator_name: aggregatorName });
        }
      }

      // TRIGGER EVENT-DRIVEN SYNC (After successful DB commit)
      syncService.triggerSync();
    }

    return res.json({ success: true, processed: uniqueRows.length });
  } catch (error) {
    console.error('[Agent Ingest Error]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  ingestAgentLogs
};
