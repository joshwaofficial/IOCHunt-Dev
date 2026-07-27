const zlib = require('zlib');
const crypto = require('crypto');
const db = require('../config/db');
const sseBroadcaster = require('../services/sseBroadcaster');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

const batchIngest = async (req, res) => {
  try {
    // 1. Verify aggregator API key
    const apiKey = req.headers['x-aggregator-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing x-aggregator-key header' });

    const aggResult = await db.query(
      'SELECT * FROM aggregators WHERE api_key_hash = $1',
      [hash(apiKey)]
    );

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const agg = aggResult.rows[0];
    if (agg.status !== 'active') {
      return res.status(403).json({ error: 'Aggregator is not active' });
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
      // Instead of loop, we could do bulk insert, but loop with BEGIN/COMMIT is fine for now as per plan
      await db.query('BEGIN');
      for (const event of data.events) {
        await db.query(`
          INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          agg.name,
          event.machine,
          event.label,
          event.tag,
          event.severity,
          event.category,
          event.message,
          event.ts,
          Boolean(event.is_noise),
          Boolean(event.is_alert)
        ]);
      }
      await db.query('COMMIT');
    }

    if (data.fw_events && data.fw_events.length > 0) {
      await db.query('BEGIN');
      for (const event of data.fw_events) {
        await db.query(`
          INSERT INTO fw_events (
            aggregator_name, ts, devname, src_ip, src_port, dst_ip, dst_port, 
            action, service, policy, proto, src_country, dst_country, 
            sent_bytes, rcv_bytes, duration, session_id, severity, raw
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
          agg.name,
          event.ts,
          event.devname,
          event.src_ip,
          event.src_port,
          event.dst_ip,
          event.dst_port,
          event.action,
          event.service,
          event.policy,
          event.proto,
          event.src_country,
          event.dst_country,
          event.sent_bytes,
          event.rcv_bytes,
          event.duration,
          event.session_id,
          event.severity,
          event.raw
        ]);
      }
      await db.query('COMMIT');
    }

    // 4. Update machines
    if (data.machines.length > 0) {
      for (const m of data.machines) {
          const firstSeenDt = m.first_seen ? (!isNaN(Number(m.first_seen)) ? new Date(Number(m.first_seen) * 1000) : new Date(m.first_seen)) : new Date();
          const lastSeenDt = m.last_seen ? (!isNaN(Number(m.last_seen)) ? new Date(Number(m.last_seen) * 1000) : new Date(m.last_seen)) : new Date();
          
          if (isNaN(firstSeenDt.getTime()) || isNaN(lastSeenDt.getTime())) {
            console.error('[Ingest Error] Invalid date for machine', m);
          }

          await db.query(`
            INSERT INTO machines (aggregator_name, name, label, first_seen, last_seen, os, ip, "user")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (aggregator_name, name) DO UPDATE SET
              last_seen = EXCLUDED.last_seen,
              ip = EXCLUDED.ip,
              "user" = EXCLUDED."user",
              label = EXCLUDED.label
          `, [
            agg.name,
            m.name,
            m.label,
            isNaN(firstSeenDt.getTime()) ? new Date() : firstSeenDt,
            isNaN(lastSeenDt.getTime()) ? new Date() : lastSeenDt,
            m.os,
            m.ip,
            m.user
          ]);
      }
    }

    // 5. Update aggregator heartbeat
    const totalAgents = data.total_agents !== undefined ? data.total_agents : data.machines.length;
    await db.query(
      'UPDATE aggregators SET last_sync = CURRENT_TIMESTAMP, agent_count = $1 WHERE id = $2',
      [totalAgents, agg.id]
    );

    // 6. SSE Broadcast
    data.events.forEach(e => {
      // Broadcast critical events immediately
      if (e.severity === 'critical') {
        sseBroadcaster.broadcast('new_event', { ...e, aggregator_name: agg.name });
      }
    });
    
    // Broadcast aggregator health update
    sseBroadcaster.broadcast('aggregator_update', {
      name: agg.name,
      last_sync: new Date(),
      agent_count: totalAgents
    });

    res.json({ success: true, ingested: data.events.length });
  } catch (error) {
    console.error('[Ingest Error]', error.message, error.stack);
    try { await db.query('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};

const ingestEvents = async (req, res) => {
  try {
    // 1. Verify API Key from Bearer Token
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const apiKey = authHeader.split(' ')[1];

    const aggResult = await db.query(
      'SELECT * FROM aggregators WHERE api_key_hash = $1',
      [hash(apiKey)]
    );

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const agg = aggResult.rows[0];
    if (agg.status !== 'active') {
      return res.status(403).json({ error: 'Aggregator is not active' });
    }

    const { machine, label, events } = req.body;
    if (!machine || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Payload must contain machine and events[]' });
    }

    // 2. Insert Events
    if (events.length > 0) {
      await db.query('BEGIN');
      for (const event of events) {
        await db.query(`
          INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          agg.name,
          event.machine,
          label || event.machine,
          event.tag,
          event.severity,
          event.category,
          event.message,
          event.ts,
          Boolean(event.is_noise),
          Boolean(event.is_alert)
        ]);
      }
      
      // Update machine info
      await db.query(`
        INSERT INTO machines (aggregator_name, name, label, last_seen)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (aggregator_name, name) DO UPDATE SET
          last_seen = CURRENT_TIMESTAMP,
          label = EXCLUDED.label
      `, [agg.name, machine, label || machine]);
      
      await db.query('COMMIT');
    }

    // 3. Update aggregator heartbeat
    await db.query(
      'UPDATE aggregators SET last_sync = CURRENT_TIMESTAMP WHERE id = $1',
      [agg.id]
    );

    // 4. SSE Broadcast (so dashboard updates in real-time)
    events.forEach(e => {
      if (!e.is_noise) {
        sseBroadcaster.broadcast('new_event', { ...e, machine, label: label || machine, aggregator_name: agg.name });
      }
    });

    sseBroadcaster.broadcast('aggregator_update', {
      name: agg.name,
      last_sync: new Date()
    });

    res.json({ success: true, ingested: events.length });
  } catch (error) {
    console.error('[Ingest Events Error]', error);
    try { await db.query('ROLLBACK'); } catch(e) {}
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncidents = async (req, res) => {
  try {
    const apiKey = req.headers['x-aggregator-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing x-aggregator-key' });
    const aggResult = await db.query('SELECT name FROM aggregators WHERE api_key_hash = $1 AND status=$2', [hash(apiKey), 'active']);
    if (aggResult.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const aggName = aggResult.rows[0].name;

    const { status, priority, limit = 100, offset = 0 } = req.query;
    const conds = [`i.machine IN (SELECT name FROM machines WHERE aggregator_name = $1)`];
    const p = [aggName];
    let paramIndex = 2;
    
    if (status) { conds.push(`i.status=$${paramIndex++}`); p.push(status); }
    if (priority) { conds.push(`i.priority=$${paramIndex++}`); p.push(priority); }
    
    const w = 'WHERE ' + conds.join(' AND ');
    const totalRes = await db.query(`SELECT COUNT(*) AS n FROM incidents i ${w}`, p);
    
    const rowsRes = await db.query(`
      SELECT i.*,
        (SELECT COUNT(*) FROM incident_notes WHERE incident_id=i.id) AS note_count,
        (SELECT COUNT(*) FROM incident_events WHERE incident_id=i.id) AS event_count
      FROM incidents i ${w}
      ORDER BY i.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex+1}
    `, [...p, Number(limit), Number(offset)]);
    
    res.json({ total: parseInt(totalRes.rows[0].n, 10), incidents: rowsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncidentSummary = async (req, res) => {
  try {
    const apiKey = req.headers['x-aggregator-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing x-aggregator-key' });
    const aggResult = await db.query('SELECT name FROM aggregators WHERE api_key_hash = $1 AND status=$2', [hash(apiKey), 'active']);
    if (aggResult.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const aggName = aggResult.rows[0].name;

    const cond = `WHERE machine IN (SELECT name FROM machines WHERE aggregator_name = $1)`;
    
    const byStatus = await db.query(`SELECT status, COUNT(*) AS n FROM incidents ${cond} GROUP BY status`, [aggName]);
    const byPriority = await db.query(`SELECT priority, COUNT(*) AS n FROM incidents ${cond} GROUP BY priority`, [aggName]);
    
    const totalRes = await db.query(`SELECT COUNT(*) AS n FROM incidents ${cond}`, [aggName]);
    const openRes = await db.query(`SELECT COUNT(*) AS n FROM incidents ${cond} AND status NOT IN ('resolved','closed')`, [aggName]);
    const p1OpenRes = await db.query(`SELECT COUNT(*) AS n FROM incidents ${cond} AND status NOT IN ('resolved','closed') AND priority='P1'`, [aggName]);

    res.json({
      byStatus: byStatus.rows,
      byPriority: byPriority.rows,
      total: parseInt(totalRes.rows[0].n,10),
      open: parseInt(openRes.rows[0].n,10),
      p1Open: parseInt(p1OpenRes.rows[0].n,10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncident = async (req, res) => {
  try {
    const apiKey = req.headers['x-aggregator-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing x-aggregator-key' });
    const aggResult = await db.query('SELECT name FROM aggregators WHERE api_key_hash = $1 AND status=$2', [hash(apiKey), 'active']);
    if (aggResult.rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });
    const aggName = aggResult.rows[0].name;

    const { id } = req.params;
    const incRes = await db.query(`SELECT * FROM incidents WHERE id=$1 AND machine IN (SELECT name FROM machines WHERE aggregator_name = $2)`, [id, aggName]);
    if (incRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    const incident = incRes.rows[0];
    
    const notesRes = await db.query('SELECT * FROM incident_notes WHERE incident_id=$1 ORDER BY created_at ASC', [id]);
    incident.notes = notesRes.rows;
    
    const eventsRes = await db.query(`
      SELECT e.* 
      FROM events e
      JOIN incident_events ie ON ie.event_id = e.id
      WHERE ie.incident_id = $1
      ORDER BY e.ts DESC
    `, [id]);
    incident.events = eventsRes.rows;

    res.json(incident);
  } catch (err) {
    console.error(err);
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
