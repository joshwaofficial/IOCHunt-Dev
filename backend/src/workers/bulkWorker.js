const { redis } = require('../services/redisIngestion');
const tenantDbManager = require('../config/tenantDbManager');

const STREAM_KEYS = ['ingest:syslog', 'ingest:agent'];
const CONSUMER_GROUP = 'bulk_inserters';
const CONSUMER_NAME = `worker-${process.pid}`;

async function initGroups() {
  for (const streamKey of STREAM_KEYS) {
    try {
      await redis.xgroup('CREATE', streamKey, CONSUMER_GROUP, '0', 'MKSTREAM');
      console.log(`[BulkWorker] Created consumer group for ${streamKey}`);
    } catch (err) {
      if (!err.message.includes('BUSYGROUP')) {
        console.error(`[BulkWorker] Error creating group for ${streamKey}:`, err.message);
      }
    }
  }
}

async function processBatch(streamKey, messages) {
  if (!messages || messages.length === 0) return;

  // Group messages by tenant_id
  const tenantGroups = {};
  const messageIds = [];

  for (const [msgId, fields] of messages) {
    messageIds.push(msgId);
    let tenantId = null;
    let payloadStr = null;

    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === 'tenant_id') tenantId = fields[i + 1];
      if (fields[i] === 'payload') payloadStr = fields[i + 1];
    }

    if (!tenantId || !payloadStr) continue;

    try {
      const payload = JSON.parse(payloadStr);
      if (!tenantGroups[tenantId]) {
        tenantGroups[tenantId] = { events: [], fw_events: [], machines: [] };
      }
      
      // Determine event type based on payload fields
      if (payload.src_ip && payload.action) {
        tenantGroups[tenantId].fw_events.push(payload);
      } else if (payload.os || payload.first_seen) {
        tenantGroups[tenantId].machines.push(payload);
      } else {
        tenantGroups[tenantId].events.push(payload);
      }
    } catch (e) {
      console.error(`[BulkWorker] Error parsing payload for msg ${msgId}:`, e.message);
    }
  }

  // Insert into tenant databases
  for (const [tenantId, data] of Object.entries(tenantGroups)) {
    let pool;
    try {
      pool = await tenantDbManager.getTenantPool(tenantId);
    } catch (err) {
      console.error(`[BulkWorker] Could not get pool for tenant ${tenantId}:`, err.message);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      if (data.events.length > 0) {
        const eventValues = [];
        const eventParams = [];
        let pIdx = 1;
        for (const event of data.events) {
          eventValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          eventParams.push(
            event.aggregator_name || 'syslog',
            event.machine || 'unknown',
            event.label || event.machine || 'unknown',
            event.tag || '',
            event.severity || 'info',
            event.category || '',
            event.message || '',
            event.ts || new Date(),
            Boolean(event.is_noise),
            Boolean(event.is_alert)
          );
        }
        await client.query(`
          INSERT INTO events (aggregator_name, machine, label, tag, severity, category, message, ts, is_noise, is_alert)
          VALUES ${eventValues.join(', ')}
        `, eventParams);
      }

      if (data.fw_events && data.fw_events.length > 0) {
        const fwValues = [];
        const fwParams = [];
        let pIdx = 1;
        for (const event of data.fw_events) {
          fwValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
          fwParams.push(
            event.aggregator_name || 'syslog',
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
          );
        }
        await client.query(`
          INSERT INTO fw_events (
            aggregator_name, ts, devname, src_ip, src_port, dst_ip, dst_port, 
            action, service, policy, proto, src_country, dst_country, 
            sent_bytes, rcv_bytes, duration, session_id, severity, raw
          )
          VALUES ${fwValues.join(', ')}
        `, fwParams);
      }

      if (data.machines && data.machines.length > 0) {
        for (const m of data.machines) {
          const firstSeenDt = m.first_seen ? new Date(m.first_seen) : new Date();
          const lastSeenDt = m.last_seen ? new Date(m.last_seen) : new Date();

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
            m.id || m.name || m.ip,
            m.aggregator_name || 'syslog',
            m.name || m.id || m.ip,
            m.label || m.name || m.id || m.ip,
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
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[BulkWorker] Transaction error for tenant ${tenantId}:`, err.message);
    } finally {
      client.release();
    }
  }

  // Acknowledge processed messages
  if (messageIds.length > 0) {
    await redis.xack(streamKey, CONSUMER_GROUP, ...messageIds);
  }
}

async function startWorker() {
  await initGroups();
  console.log(`[BulkWorker] Started consumer ${CONSUMER_NAME}`);

  while (true) {
    try {
      // Read up to 100 messages from each stream, blocking for up to 5 seconds
      const streamsArgs = [];
      STREAM_KEYS.forEach(k => streamsArgs.push(k));
      STREAM_KEYS.forEach(() => streamsArgs.push('>')); // '>' means messages never delivered to other consumers in group

      const result = await redis.xreadgroup(
        'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
        'COUNT', 100,
        'BLOCK', 5000,
        'STREAMS',
        ...streamsArgs
      );

      if (result) {
        for (const [streamKey, messages] of result) {
          await processBatch(streamKey, messages);
        }
      }
    } catch (err) {
      console.error('[BulkWorker] Read error:', err.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

module.exports = {
  startWorker
};
