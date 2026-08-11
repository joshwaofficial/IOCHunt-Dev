const syncService = require("../modules/aggregator/services/syncService");

// ════════════════════════════════════════════════════════════════
// IOC Hunt — Ingestion Controller (Central Server Hub)
// ════════════════════════════════════════════════════════════════
// Receives batched, gzipped log streams from branch aggregators
// ════════════════════════════════════════════════════════════════

const zlib = require('zlib');
const crypto = require('crypto');
const db = require('../config/db');
const { getAggregatorPool } = require('../config/aggregatorDbManager');
const sseBroadcaster = require('../services/sseBroadcaster');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

async function syncToAggregatorDatabase(aggName, data) {
  try {
    const pool = getAggregatorPool(aggName);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (data.events && data.events.length > 0) {
        for (const event of data.events) {
          await client.query(`
            INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            aggName,
            event.machine,
            event.label || event.machine,
            event.tag || '',
            event.severity || 'info',
            event.category || '',
            event.message,
            event.ts || new Date(),
            Boolean(event.is_noise),
            Boolean(event.is_alert)
          ]);
        }
      }
      if (data.fw_events && data.fw_events.length > 0) {
        for (const event of data.fw_events) {
          await client.query(`
            INSERT INTO fw_events (
              aggregator_name, ts, devname, src_ip, src_port, dst_ip, dst_port, 
              action, service, policy, proto, src_country, dst_country, 
              sent_bytes, rcv_bytes, duration, session_id, severity, raw
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          `, [
            aggName,
            event.ts || new Date(),
            event.devname || '',
            event.src_ip || '',
            event.src_port || 0,
            event.dst_ip || '',
            event.dst_port || 0,
            event.action || '',
            event.service || '',
            event.policy || '',
            event.proto || '',
            event.src_country || '',
            event.dst_country || '',
            event.sent_bytes || 0,
            event.rcv_bytes || 0,
            event.duration || 0,
            event.session_id || '',
            event.severity || 'info',
            event.raw || ''
          ]);
        }
      }
      if (data.machines && data.machines.length > 0) {
        for (const m of data.machines) {
          const firstSeenDt = m.first_seen ? (!isNaN(Number(m.first_seen)) ? new Date(Number(m.first_seen) * 1000) : new Date(m.first_seen)) : new Date();
          const lastSeenDt = m.last_seen ? (!isNaN(Number(m.last_seen)) ? new Date(Number(m.last_seen) * 1000) : new Date(m.last_seen)) : new Date();

          await client.query(`
            INSERT INTO machines (id, aggregator_name, name, label, first_seen, last_seen, os, ip, "user", event_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              ip = CASE WHEN EXCLUDED.ip != '' THEN EXCLUDED.ip ELSE machines.ip END,
              "user" = EXCLUDED."user",
              label = EXCLUDED.label,
              event_count = machines.event_count + EXCLUDED.event_count
          `, [
            m.id || m.name,
            aggName,
            m.name || m.id,
            m.label || m.name || m.id,
            isNaN(firstSeenDt.getTime()) ? new Date() : firstSeenDt,
            isNaN(lastSeenDt.getTime()) ? new Date() : lastSeenDt,
            m.os || 'unknown',
            m.ip || '',
            m.user || 'system',
            m.event_count || 1
          ]);
        }
      }
      await client.query('COMMIT');
        syncService.triggerSync();
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(`[Ingest] Notice: Could not sync to dedicated database for ${aggName}:`, err.message);
  }
}

const batchIngest = async (req, res) => {
  try {
    // 1. Verify aggregator API key
    const apiKey = req.headers['x-aggregator-key'] || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing API key header' });

    const aggResult = await db.query(
      'SELECT * FROM aggregators WHERE api_key_hash = $1',
      [hash(apiKey.trim())]
    );

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const agg = aggResult.rows[0];
    if (agg.status !== 'active') {
      return res.status(403).json({ error: 'Aggregator is not in active status' });
    }

    // 2. Decompress gzip
    let raw;
    try {
      raw = zlib.gunzipSync(req.body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid gzip payload' });
    }

    const data = JSON.parse(raw);
    if (!data.events || !data.machines) {
      return res.status(400).json({ error: 'Payload must contain events and machines' });
    }

    // 3. Bulk insert events
    if (data.events.length > 0) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const event of data.events) {
          await client.query(`
            INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            agg.name,
            event.machine,
            event.label || event.machine,
            event.tag || '',
            event.severity || 'info',
            event.category || '',
            event.message,
            event.ts || new Date(),
            Boolean(event.is_noise),
            Boolean(event.is_alert)
          ]);
        }
        await client.query('COMMIT');
        syncService.triggerSync();
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 4. Ingest firewall events
    if (data.fw_events && data.fw_events.length > 0) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const event of data.fw_events) {
          await client.query(`
            INSERT INTO fw_events (
              aggregator_name, ts, devname, src_ip, src_port, dst_ip, dst_port, 
              action, service, policy, proto, src_country, dst_country, 
              sent_bytes, rcv_bytes, duration, session_id, severity, raw
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          `, [
            agg.name,
            event.ts || new Date(),
            event.devname || '',
            event.src_ip || '',
            event.src_port || 0,
            event.dst_ip || '',
            event.dst_port || 0,
            event.action || '',
            event.service || '',
            event.policy || '',
            event.proto || '',
            event.src_country || '',
            event.dst_country || '',
            event.sent_bytes || 0,
            event.rcv_bytes || 0,
            event.duration || 0,
            event.session_id || '',
            event.severity || 'info',
            event.raw || ''
          ]);
        }
        await client.query('COMMIT');
        syncService.triggerSync();
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 5. Upsert machines
    if (data.machines.length > 0) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const m of data.machines) {
          const firstSeenDt = m.first_seen ? (!isNaN(Number(m.first_seen)) ? new Date(Number(m.first_seen) * 1000) : new Date(m.first_seen)) : new Date();
          const lastSeenDt = m.last_seen ? (!isNaN(Number(m.last_seen)) ? new Date(Number(m.last_seen) * 1000) : new Date(m.last_seen)) : new Date();

          await client.query(`
            INSERT INTO machines (id, aggregator_name, name, label, first_seen, last_seen, os, ip, "user", event_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              ip = CASE WHEN EXCLUDED.ip != '' THEN EXCLUDED.ip ELSE machines.ip END,
              "user" = EXCLUDED."user",
              label = EXCLUDED.label,
              event_count = machines.event_count + EXCLUDED.event_count
          `, [
            m.id || m.name,
            agg.name,
            m.name || m.id,
            m.label || m.name || m.id,
            isNaN(firstSeenDt.getTime()) ? new Date() : firstSeenDt,
            isNaN(lastSeenDt.getTime()) ? new Date() : lastSeenDt,
            m.os || 'unknown',
            m.ip || '',
            m.user || 'system',
            m.event_count || 1
          ]);
        }
        await client.query('COMMIT');
        syncService.triggerSync();
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 5.5 Process machine policies (current_json from agent)
    if (data.policies && data.policies.length > 0) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const p of data.policies) {
          await client.query(`
            INSERT INTO policies (machine, policy_json, current_json, applied_at)
            VALUES ($1, '{}', $2, $3)
            ON CONFLICT (machine) DO UPDATE SET
              current_json = EXCLUDED.current_json,
              applied_at = EXCLUDED.applied_at
          `, [p.machine, p.current_json, p.applied_at]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 6. Sync to the dedicated separate Aggregator PostgreSQL Database
    await syncToAggregatorDatabase(agg.name, data);

    // 7. Update aggregator heartbeat
    const totalAgents = data.total_agents !== undefined ? data.total_agents : data.machines.length;
    await db.query(
      'UPDATE aggregators SET last_sync = CURRENT_TIMESTAMP, agent_count = $1 WHERE id = $2',
      [totalAgents, agg.id]
    );

    // 7. SSE Broadcast
    data.events.forEach(e => {
      if (e.severity === 'critical' || e.severity === 'high') {
        sseBroadcaster.broadcast('new_event', { ...e, aggregator_name: agg.name });
      }
    });

    sseBroadcaster.broadcast('aggregator_update', {
      name: agg.name,
      last_sync: new Date(),
      agent_count: totalAgents
    });

    // 8. Fetch global policies and groups to send back to aggregator
    const globalPoliciesRes = await db.query('SELECT machine, policy_json, updated_at FROM policies WHERE policy_json IS NOT NULL');
    const polGroupsRes = await db.query('SELECT id, name, policy_json, updated_at FROM pol_groups');
    const machineGroupsRes = await db.query('SELECT machine, group_id FROM machine_groups');

    console.log(`[IngestController] Sending ${globalPoliciesRes.rows.length} policies down to aggregator ${agg.name}`);

    res.json({
      success: true,
      ingested: data.events.length,
      sync_data: {
        global_policies: globalPoliciesRes.rows,
        pol_groups: polGroupsRes.rows,
        machine_groups: machineGroupsRes.rows
      }
    });
  } catch (error) {
    console.error('[Ingest Batch Error]', error.message);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const ingestEvents = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const apiKey = authHeader.split(' ')[1];

    const aggResult = await db.query(
      'SELECT * FROM aggregators WHERE api_key_hash = $1 AND status = $2',
      [hash(apiKey.trim()), 'active']
    );

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const agg = aggResult.rows[0];
    const { machine, label, events } = req.body;
    if (!machine || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Payload must contain machine and events[]' });
    }

    if (events.length > 0) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const event of events) {
          await client.query(`
            INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            agg.name,
            machine,
            label || machine,
            event.tag || '',
            event.severity || 'info',
            event.category || '',
            event.message,
            event.ts || new Date(),
            Boolean(event.is_noise),
            Boolean(event.is_alert)
          ]);
        }

        await client.query(`
          INSERT INTO machines (id, aggregator_name, name, label, last_seen, event_count)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
          ON CONFLICT (id) DO UPDATE SET
            last_seen = CURRENT_TIMESTAMP,
            label = EXCLUDED.label,
            event_count = machines.event_count + EXCLUDED.event_count
        `, [machine, agg.name, machine, label || machine, events.length]);

        await client.query('COMMIT');
        syncService.triggerSync();
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    await db.query('UPDATE aggregators SET last_sync = CURRENT_TIMESTAMP WHERE id = $1', [agg.id]);

    events.forEach(e => {
      if (!e.is_noise) {
        sseBroadcaster.broadcast('new_event', { ...e, machine, label: label || machine, aggregator_name: agg.name });
      }
    });

    res.json({ success: true, ingested: events.length });
  } catch (error) {
    console.error('[Ingest Events Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncidents = async (req, res) => {
  try {
    const { aggregator_name, severity, status, limit = 50 } = req.query;
    let queryText = 'SELECT * FROM incidents WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (aggregator_name) {
      queryText += ` AND aggregator_name = $${pIdx++}`;
      params.push(aggregator_name);
    }
    if (severity) {
      queryText += ` AND severity = $${pIdx++}`;
      params.push(severity);
    }
    if (status) {
      queryText += ` AND status = $${pIdx++}`;
      params.push(status);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${pIdx}`;
    params.push(parseInt(limit, 10));

    const result = await db.query(queryText, params);
    res.json({ incidents: result.rows });
  } catch (error) {
    console.error('[Get Aggregator Incidents Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncidentSummary = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'INVESTIGATING' THEN 1 END) as investigating,
        COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved,
        COUNT(CASE WHEN severity = 'CRITICAL' THEN 1 END) as critical,
        COUNT(CASE WHEN severity = 'HIGH' THEN 1 END) as high
      FROM incidents
    `);
    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('[Incident Summary Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncident = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Get Incident Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  batchIngest,
  ingestEvents,
  getAggregatorIncidents,
  getAggregatorIncidentSummary,
  getAggregatorIncident
};
