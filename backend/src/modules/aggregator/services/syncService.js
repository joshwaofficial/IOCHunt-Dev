const db = require('../../../config/db');
const axios = require('axios');
const https = require('https');
const zlib = require('zlib');
const appMode = require('../../../config/appMode');

const BATCH_SIZE = 10000;
const SYNC_INTERVAL_MS = 10000; // 10s Sweeper Fallback
const DEBOUNCE_DELAY_MS = 2000; // 2s Debounce

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let isSyncing = false;
let debounceTimer = null;

async function syncQueueToCentral() {
  if (isSyncing) return;
  isSyncing = true;

  let client;
  try {
    const settingsRes = await db.query('SELECT central_server_url, central_api_key FROM settings LIMIT 1');
    if (settingsRes.rows.length === 0) {
      console.log('[SyncService] Aborted: settings table is empty. Node not paired?');
      return;
    }
    
    const { central_server_url, central_api_key } = settingsRes.rows[0];
    if (!central_server_url || !central_api_key) {
      console.log('[SyncService] Aborted: missing central_server_url or central_api_key in settings.');
      return;
    }

    client = await db.connect();

    let hasMore = true;
    while (hasMore) {
      // 1. Grab un-forwarded events (up to 10,000)
      const eventsRes = await client.query(
        'SELECT * FROM events WHERE is_forwarded = FALSE ORDER BY id ASC LIMIT $1',
        [BATCH_SIZE]
      );
      const events = eventsRes.rows;

      // 2. Grab un-forwarded firewall events
      const fwEventsRes = await client.query(
        'SELECT * FROM fw_events WHERE is_forwarded = FALSE ORDER BY id ASC LIMIT $1',
        [BATCH_SIZE]
      );
      const fw_events = fwEventsRes.rows;

      // We used to break early here if no events, but we MUST proceed to fetch policy updates.
      // The loop will naturally terminate at the bottom since events.length < BATCH_SIZE.

      // 3. Prepare unique machine details
      let machines = [];
      if (events.length > 0) {
        const machineIds = [...new Set(events.map(e => e.machine))];
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

      const agentCountRes = await client.query('SELECT COUNT(*) FROM machines');
      const totalAgents = parseInt(agentCountRes.rows[0].count, 10);

      const policiesRes = await client.query('SELECT machine, current_json, applied_at FROM policies WHERE applied_at IS NOT NULL');
      const policies = policiesRes.rows;

      console.log(`[SyncService] Found ${events.length} events, ${fw_events.length} fw_events, ${policies.length} policies to push.`);

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
        policies,
        total_agents: totalAgents
      };

      // 4. Compress payload
      const rawJson = JSON.stringify(payload);
      const gzipped = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));

      // 5. Send to central server
      console.log(`[SyncService] POSTing to ${central_server_url}/api/ingest/batch ...`);
      const res = await axios.post(`${central_server_url}/api/ingest/batch`, gzipped, {
        headers: {
          'x-aggregator-key': central_api_key,
          'Content-Type': 'application/octet-stream'
        },
        httpsAgent,
        timeout: 60000 // IMPORTANT: Prevent infinite hanging if IP is wrong
      });
      console.log(`[SyncService] Success! Got response status ${res.status}.`);

      // 5.5 Process returned policy updates from central server
      if (res.data && res.data.sync_data) {
        const { global_policies, pol_groups, machine_groups } = res.data.sync_data;
        console.log(`[SyncService] Received ${global_policies ? global_policies.length : 0} global policies from central hub.`);

        
        if (pol_groups && pol_groups.length > 0) {
          for (const pg of pol_groups) {
            await client.query(`
              INSERT INTO pol_groups (id, name, policy_json, updated_at)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT(id) DO UPDATE SET
                name = EXCLUDED.name,
                policy_json = EXCLUDED.policy_json,
                updated_at = EXCLUDED.updated_at
            `, [pg.id, pg.name, pg.policy_json, pg.updated_at]);
          }
        }
        
        if (machine_groups && machine_groups.length > 0) {
          await client.query('TRUNCATE machine_groups');
          for (const mg of machine_groups) {
            await client.query(`
              INSERT INTO machine_groups (machine, group_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `, [mg.machine, mg.group_id]);
          }
        }
        
        if (global_policies && global_policies.length > 0) {
          for (const p of global_policies) {
            await client.query(`
              INSERT INTO policies (machine, policy_json, updated_at)
              VALUES ($1, $2, $3)
              ON CONFLICT(machine) DO UPDATE SET
                policy_json = EXCLUDED.policy_json,
                applied_at = CASE WHEN EXCLUDED.updated_at > policies.updated_at THEN NULL ELSE policies.applied_at END,
                updated_at = EXCLUDED.updated_at
            `, [p.machine, p.policy_json, p.updated_at]);
          }
        }
      }

      // 6. Mark as forwarded
      if (events.length > 0) {
        const eventIds = events.map(e => e.id);
        await client.query('UPDATE events SET is_forwarded = TRUE WHERE id = ANY($1)', [eventIds]);
      }
      if (fw_events.length > 0) {
        const fwEventIds = fw_events.map(e => e.id);
        await client.query('UPDATE fw_events SET is_forwarded = TRUE WHERE id = ANY($1)', [fwEventIds]);
      }

      // If we pulled less than BATCH_SIZE, the database is completely drained!
      if (events.length < BATCH_SIZE && fw_events.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        // 7. Event loop breathing pause
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    const errorMsg = error.response && error.response.data ? JSON.stringify(error.response.data) : error.message;
    console.error('[SyncService] Sync batch failed (stopping drain loop):', errorMsg);
  } finally {
    if (client) client.release();
    isSyncing = false;
  }
}

// Event-driven trigger with 2-second debounce
function triggerSync() {
  if (!appMode.isAggregator()) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    syncQueueToCentral();
  }, DEBOUNCE_DELAY_MS);
}

function startSyncService() {
  console.log('[SyncService] Starting background log forwarding queue & 10s sweeper...');
  setInterval(syncQueueToCentral, SYNC_INTERVAL_MS);
  setTimeout(syncQueueToCentral, 2000);
}

module.exports = { startSyncService, triggerSync, syncQueueToCentral };
