// ════════════════════════════════════════════════════════════════
// IOC Hunt — Direct Agent Log Ingestion Controller
// ════════════════════════════════════════════════════════════════
// Accepts logs directly from endpoint agents (Scenario 2 or local branch)
// ════════════════════════════════════════════════════════════════


const sseBroadcaster = require('../services/sseBroadcaster');
const { detectNoise, classifySeverity, parseCategory, normalizeToUTC } = require('../utils/ingestHelpers');
const { isAggregator } = require('../config/appMode');
const syncService = require('../modules/aggregator/services/syncService');
const { isIdentifier, isString, sanitizeText } = require('../utils/inputValidator');

async function ingestAgentLogs(req, res) {
  try {
    const { machine, label, events } = req.body;
    if (!isIdentifier(machine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }

    // Zero-Trust Machine Identity Enforcement (INT-PT-H-003 & INT-PT-H-004)
    if (req.isAgentKey && req.boundMachine && req.boundMachine.toUpperCase() !== 'UNNAMED-ENDPOINT') {
      if (req.boundMachine.toLowerCase() !== machine.trim().toLowerCase()) {
        return res.status(403).json({
          error: 'Forbidden: Machine identity mismatch. This agent key is already bound to another machine.'
        });
      }
    }

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'events must be an array' });
    }
    const MAX_BATCH_EVENTS = 25000;
    if (events.length > MAX_BATCH_EVENTS) {
      return res.status(400).json({ error: `Exceeded maximum events per batch (${MAX_BATCH_EVENTS})` });
    }

    const safeLabel = typeof label === 'string' ? sanitizeText(label).slice(0, 128) : machine;

    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
      .split(',')[0].trim().replace(/^::ffff:/, '').slice(0, 45);

    const displayTimezone = 'UTC';
    const isAggNode = isAggregator();
    const aggregatorName = isAggNode ? (process.env.INSTANCE_NAME || 'aggregator') : 'direct';

    const rows = events
      .filter(e => e && typeof e === 'object' && e.ts && typeof e.message === 'string')
      .map(e => {
        const rawMsg = String(e.message).slice(0, 2000);
        const rawTag = typeof e.tag === 'string' ? e.tag.slice(0, 128) : '';
        const sev = classifySeverity(rawTag, rawMsg);
        return {
          machine,
          ts: normalizeToUTC(e.ts, displayTimezone),
          tag: rawTag,
          severity: sev,
          category: typeof e.category === 'string' ? e.category.slice(0, 64) : parseCategory(rawTag, rawMsg),
          message: rawMsg,
          is_noise: detectNoise(rawTag, rawMsg, sev),
        };
      });

    const tenantPool = await req.getTenantPool();
    const client = await tenantPool.connect();
    
    let uniqueRows = [];
    try {
      // 1. Perform high-performance duplicate checking
      if (rows.length <= 100) {
        for (const r of rows) {
          const dupRes = await client.query(
            'SELECT 1 FROM events WHERE machine=$1 AND ts=$2 AND tag=$3 AND message=$4 LIMIT 1',
            [r.machine, r.ts, r.tag, r.message]
          );
          if (dupRes.rowCount === 0) {
            uniqueRows.push(r);
          }
        }
      } else {
        // Optimized bulk deduplication using timestamp window and hash lookup
        const timestamps = rows.map(r => r.ts).filter(Boolean);
        const minTs = timestamps.reduce((a, b) => a < b ? a : b);
        const maxTs = timestamps.reduce((a, b) => a > b ? a : b);
        const existingSet = new Set();
        
        try {
          const existingRes = await client.query(
            'SELECT ts, tag, md5(message) as msg_hash FROM events WHERE machine=$1 AND ts >= $2 AND ts <= $3',
            [machine, minTs, maxTs]
          );
          for (const er of existingRes.rows) {
            existingSet.add(`${new Date(er.ts).toISOString()}|${er.tag}|${er.msg_hash}`);
          }
        } catch (_) {}

        const crypto = require('crypto');
        for (const r of rows) {
          const msgHash = crypto.createHash('md5').update(r.message).digest('hex');
          const key = `${new Date(r.ts).toISOString()}|${r.tag}|${msgHash}`;
          if (!existingSet.has(key)) {
            existingSet.add(key);
            uniqueRows.push(r);
          }
        }
      }

      if (uniqueRows.length > 0) {
        await client.query('BEGIN');
        
        // 2. Bulk insert events in safe chunks of 1000 to respect Postgres 65535 parameter limit
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
          const slice = uniqueRows.slice(i, i + CHUNK_SIZE);
          const insertValues = [];
          const insertParams = [];
          let pIdx = 1;
          
          for (const e of slice) {
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

          await client.query(`
            INSERT INTO events (aggregator_name, machine, label, ts, tag, severity, category, message, is_noise, received, is_forwarded)
            VALUES ${insertValues.join(', ')}
          `, insertParams);
        }

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

        // Buffer critical severity logs for SOC email notification background worker
        const criticalEvents = uniqueRows.filter(e => String(e.severity).toLowerCase() === 'critical');
        if (criticalEvents.length > 0) {
          try {
            const { getRedisClient } = require('../config/redisClient');
            const redis = getRedisClient();
            const tenantId = req.tenantId || 'default';
            const pipeline = redis.pipeline();
            for (const ce of criticalEvents) {
              pipeline.rpush(`critical_alert_buffer:${tenantId}`, JSON.stringify({
                machine: ce.machine,
                label: label || ce.machine,
                tag: ce.tag || 'CRITICAL',
                category: ce.category || 'SECURITY',
                message: ce.message || '',
                severity: 'critical',
                ts: ce.ts || new Date()
              }));
            }
            await pipeline.exec();
            console.log(`[AgentLogController] Buffered ${criticalEvents.length} critical log(s) for tenant "${tenantId}" alert worker`);
          } catch (bufErr) {
            console.error(`[AgentLogController] Error buffering critical logs:`, bufErr.message);
          }
        }
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
