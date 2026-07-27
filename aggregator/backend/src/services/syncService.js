const db = require('../config/db');
const axios = require('axios');
const https = require('https');
const zlib = require('zlib');

const BATCH_SIZE = 1000;
const SYNC_INTERVAL_MS = 10000; // 10 seconds

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function syncQueueToCentral() {
  let client;
  try {
    const settingsRes = await db.query('SELECT central_server_url, central_api_key FROM settings LIMIT 1');
    if (settingsRes.rows.length === 0) return;
    
    const { central_server_url, central_api_key } = settingsRes.rows[0];
    if (!central_server_url || !central_api_key) return;

    client = await db.connect();
    
    // Grab un-forwarded events
    const eventsRes = await client.query('SELECT * FROM events WHERE is_forwarded = FALSE ORDER BY id ASC LIMIT $1', [BATCH_SIZE]);
    const events = eventsRes.rows;
    
    // Grab un-forwarded firewall events
    const fwEventsRes = await client.query('SELECT * FROM fw_events WHERE is_forwarded = FALSE ORDER BY id ASC LIMIT $1', [BATCH_SIZE]);
    const fw_events = fwEventsRes.rows;
    
    // Get total agent count for heartbeat
    const agentCountRes = await client.query('SELECT COUNT(*) FROM machines');
    const totalAgents = parseInt(agentCountRes.rows[0].count, 10);

    let machines = [];
    if (events.length > 0) {
      // Get unique machines from these events to sync machine details
      const machineIds = [...new Set(events.map(e => e.machine))];
      
      // Fetch machine details
      const machinesRes = await client.query('SELECT * FROM machines WHERE id = ANY($1)', [machineIds]);
      machines = machinesRes.rows.map(m => ({
        name: m.id,
        label: m.label || m.id,
        first_seen: m.last_seen,
        last_seen: m.last_seen,
        os: m.os || 'unknown',
        ip: m.ip || '',
        user: m.user || 'system'
      }));
    }

    const payload = {
      events: events.map(e => ({
        machine: e.machine,
        label: e.machine,
        tag: e.tag,
        severity: e.severity,
        category: e.category,
        message: e.message,
        ts: e.ts,
        is_noise: e.is_noise,
        is_alert: e.is_alert || false
      })),
      fw_events: fw_events.map(e => ({
        ts: e.ts,
        devname: e.devname,
        src_ip: e.src_ip,
        src_port: e.src_port,
        dst_ip: e.dst_ip,
        dst_port: e.dst_port,
        action: e.action,
        service: e.service,
        policy: e.policy,
        proto: e.proto,
        src_country: e.src_country,
        dst_country: e.dst_country,
        sent_bytes: e.sent_bytes,
        rcv_bytes: e.rcv_bytes,
        duration: e.duration,
        session_id: e.session_id,
        severity: e.severity,
        raw: e.raw
      })),
      machines,
      total_agents: totalAgents
    };

    // Compress payload
    const rawJson = JSON.stringify(payload);
    const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));

    // Send to central server batch endpoint
    await axios.post(`${central_server_url}/api/ingest/batch`, gzipped, {
      headers: {
        'x-aggregator-key': central_api_key,
        'Content-Type': 'application/octet-stream'
      },
      httpsAgent
    });

    // Mark as forwarded
    if (events.length > 0) {
      const eventIds = events.map(e => e.id);
      await client.query('UPDATE events SET is_forwarded = TRUE WHERE id = ANY($1)', [eventIds]);
    }
    
    if (fw_events.length > 0) {
      const fwEventIds = fw_events.map(e => e.id);
      await client.query('UPDATE fw_events SET is_forwarded = TRUE WHERE id = ANY($1)', [fwEventIds]);
    }
  } catch (error) {
    const errorMsg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
    console.error('[SyncService] Failed to sync batch to Central Server:', errorMsg);
  } finally {
    if (client) client.release();
  }
}

function startSyncService() {
  console.log('[SyncService] Starting background log forwarding queue...');
  setInterval(syncQueueToCentral, SYNC_INTERVAL_MS);
  
  // Do a first run immediately
  setTimeout(syncQueueToCentral, 2000);
}

module.exports = { startSyncService };
