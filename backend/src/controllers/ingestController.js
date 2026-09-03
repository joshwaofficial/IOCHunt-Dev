const syncService = require("../modules/aggregator/services/syncService");

// ════════════════════════════════════════════════════════════════
// IOC Hunt — Ingestion Controller (Central Server Hub)
// ════════════════════════════════════════════════════════════════
// Receives batched, gzipped log streams from branch aggregators
// ════════════════════════════════════════════════════════════════

const zlib = require('zlib');
const crypto = require('crypto');
const sseBroadcaster = require('../services/sseBroadcaster');
const { publishToStream } = require('../services/redisIngestion');
const { normalizeToUTC } = require('../utils/ingestHelpers');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

const batchIngest = async (req, res) => {
  try {
    // 1. Verify aggregator API key
    const apiKey = req.headers['x-aggregator-key'] || req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'Missing API key header' });

    let isAggregatorClient = false;
    let aggregatorName = null;
    let aggResult = await req.queryControlPlane(
      'SELECT tenant_id as id, status FROM tenants WHERE api_key_hash = $1',
      [hash(apiKey.trim())]
    );

    if (aggResult.rows.length === 0) {
      aggResult = await req.queryControlPlane(
        'SELECT name as id, tenant_id, status FROM aggregators WHERE api_key_hash = $1',
        [hash(apiKey.trim())]
      );
      if (aggResult.rows.length > 0) {
        isAggregatorClient = true;
        aggregatorName = aggResult.rows[0].id;
      }
    }

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const tenant = aggResult.rows[0];
    if (tenant.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }
    
    // For aggregators: resolve to the owning tenant so logs and policies route to the dedicated DB
    // For tenants: use the tenant_id directly
    if (isAggregatorClient) {
      req.tenantId = tenant.tenant_id || 'default';
    } else {
      req.tenantId = tenant.id;
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

    // >>> TEMPORARY DEBUG LOGGING (DELETE LATER) >>>
    console.log('\n================== [CENTRAL BATCH INGEST RECEIVED] ==================');
    console.log(`[DEBUG] Time: ${new Date().toISOString()} | Tenant: ${req.tenantId} | Aggregator: ${aggregatorName || 'direct'}`);
    console.log(`[DEBUG] Events: ${data.events?.length || 0} | FW Events: ${data.fw_events?.length || 0} | Machines: ${data.machines?.length || 0}`);
    console.log(`[DEBUG] Full Incoming Batch Payload:`);
    console.dir(data, { depth: null, colors: true });
    console.log('=====================================================================\n');
    // <<< TEMPORARY DEBUG LOGGING (DELETE LATER) <<<

    // 3. Bulk insert events
    if (data.events.length > 0) {
      await publishToStream('ingest:agent', req.tenantId, data.events.map(e => ({
        ...e,
        aggregator_name: isAggregatorClient ? aggregatorName : (e.aggregator_name || 'direct'),
        ts: normalizeToUTC(e.ts) || new Date()
      })));
    }

    // 4. Ingest firewall events
    if (data.fw_events && data.fw_events.length > 0) {
      await publishToStream('ingest:agent', req.tenantId, data.fw_events.map(e => ({
        ...e,
        aggregator_name: isAggregatorClient ? aggregatorName : (e.aggregator_name || 'direct'),
        ts: normalizeToUTC(e.ts) || new Date()
      })));
    }

    // 5. Ingest machines
    if (data.machines && data.machines.length > 0) {
      await publishToStream('ingest:agent', req.tenantId, data.machines.map(m => ({
        ...m,
        aggregator_name: isAggregatorClient ? aggregatorName : (m.aggregator_name || 'direct')
      })));
    }

    // 5.5 Process machine policies (current_json from agent)
    // Kept synchronous as it requires updating the policy DB table and we want it immediately applied
    if (data.policies && data.policies.length > 0) {
      const tenantPool = await req.getTenantPool();
      const client = await tenantPool.connect();
      try {
        await client.query('BEGIN');
        for (const p of data.policies) {
          const existingRes = await client.query('SELECT machine FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [p.machine]);
          const targetMachine = existingRes.rows[0]?.machine || p.machine;

          await client.query(`
            INSERT INTO policies (machine, policy_json, current_json, applied_at)
            VALUES ($1, '{}', $2, $3)
            ON CONFLICT (machine) DO UPDATE SET
              current_json = EXCLUDED.current_json,
              applied_at = CASE WHEN COALESCE(policies.updated_at, 0) > COALESCE(EXCLUDED.applied_at, 0) THEN policies.applied_at ELSE EXCLUDED.applied_at END
          `, [targetMachine, p.current_json, p.applied_at]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // 7. Update aggregator heartbeat
    const totalAgents = data.total_agents !== undefined ? data.total_agents : data.machines.length;
    // Removing the aggregators table update since it is now in the control plane

    // 7. SSE Broadcast
    data.events.forEach(e => {
      if (e.severity === 'critical' || e.severity === 'high') {
        sseBroadcaster.broadcast('new_event', { ...e, aggregator_name: 'direct' });
      }
    });

    sseBroadcaster.broadcast('aggregator_update', {
      name: tenant.company_name,
      last_sync: new Date(),
      agent_count: totalAgents
    });

    // 8. Fetch global policies and groups to send back to aggregator
    const globalPoliciesRes = await req.queryTenant('SELECT machine, policy_json, updated_at FROM policies WHERE policy_json IS NOT NULL');
    const polGroupsRes = await req.queryTenant('SELECT id, name, policy_json, updated_at FROM pol_groups');
    const machineGroupsRes = await req.queryTenant('SELECT machine, group_id FROM machine_groups');

    console.log(`[IngestController] Sending ${globalPoliciesRes.rows.length} policies down to aggregator`);

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
    console.error('[Ingest Batch Error]', error);
    res.status(500).json({ error: 'Server error: ' + (error.stack || error.message || String(error)) });
  }
};

const ingestEvents = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const apiKey = authHeader.split(' ')[1];

    const aggResult = await req.queryControlPlane(
      'SELECT * FROM tenants WHERE api_key_hash = $1 AND status = $2',
      [hash(apiKey.trim()), 'active']
    );

    if (aggResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const tenant = aggResult.rows[0];
    req.tenantId = tenant.tenant_id;

    const { machine, label, events } = req.body;
    if (!machine || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Payload must contain machine and events[]' });
    }

    if (events.length > 0) {
      await publishToStream('ingest:agent', tenant.tenant_id, events.map(e => ({
        ...e,
        machine,
        label: label || machine,
        aggregator_name: 'direct',
        ts: normalizeToUTC(e.ts) || new Date()
      })));
    }

    events.forEach(e => {
      if (!e.is_noise) {
        sseBroadcaster.broadcast('new_event', { ...e, machine, label: label || machine, aggregator_name: 'direct' });
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

    const result = await req.queryTenant(queryText, params);
    res.json({ incidents: result.rows });
  } catch (error) {
    console.error('[Get Aggregator Incidents Error]', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getAggregatorIncidentSummary = async (req, res) => {
  try {
    const result = await req.queryTenant(`
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
    const result = await req.queryTenant('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
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
