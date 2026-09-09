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
const { isString, isPositiveInteger, parseSafeInt, isIdentifier, isEnum } = require('../utils/inputValidator');

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');

const batchIngest = async (req, res) => {
  try {
    // 1. Verify aggregator API key
    const rawApiKey = req.headers['x-aggregator-key'] || req.headers['x-api-key'];
    if (!isString(rawApiKey, 1, 256)) return res.status(401).json({ error: 'Missing or invalid API key header' });
    const apiKey = rawApiKey.trim();

    let isAggregatorClient = false;
    let aggregatorName = null;
    let aggResult = await req.queryControlPlane(
      'SELECT tenant_id as id, status FROM tenants WHERE api_key_hash = $1',
      [hash(apiKey)]
    );

    if (aggResult.rows.length === 0) {
      aggResult = await req.queryControlPlane(
        'SELECT name as id, tenant_id, status FROM aggregators WHERE api_key_hash = $1',
        [hash(apiKey)]
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

    // 2. Decompress gzip with size limits to prevent zip bombs
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Payload must be a binary gzip stream' });
    }
    if (req.body.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'Payload exceeds maximum compressed size of 25MB' });
    }

    let raw;
    try {
      raw = zlib.gunzipSync(req.body, { maxOutputLength: 100 * 1024 * 1024 });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid gzip payload or uncompressed size exceeded' });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({ error: 'Payload is not valid JSON' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'JSON payload must be an object' });
    }

    if (!Array.isArray(data.events) || !Array.isArray(data.machines)) {
      return res.status(400).json({ error: 'Payload must contain events[] and machines[] arrays' });
    }

    if (data.events.length > 10000 || data.machines.length > 5000) {
      return res.status(400).json({ error: 'Batch limits exceeded (max 10000 events, 5000 machines)' });
    }

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
    res.status(500).json({ error: 'Internal server error' });
  }
};

const ingestEvents = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const apiKey = authHeader.split(' ')[1];
    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid Authorization header format' });
    }

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
    if (!isIdentifier(machine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Payload must contain events[] array' });
    }
    if (events.length > 2000) {
      return res.status(400).json({ error: 'Exceeded maximum events per batch (2000)' });
    }

    const safeLabel = typeof label === 'string' ? label.slice(0, 128) : machine;

    if (events.length > 0) {
      await publishToStream('ingest:agent', tenant.tenant_id, events.map(e => ({
        ...e,
        machine,
        label: safeLabel,
        aggregator_name: 'direct',
        ts: normalizeToUTC(e.ts) || new Date()
      })));
    }

    events.forEach(e => {
      if (!e.is_noise) {
        sseBroadcaster.broadcast('new_event', { ...e, machine, label: safeLabel, aggregator_name: 'direct' });
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
      if (!isString(aggregator_name, 1, 64)) {
        return res.status(400).json({ error: 'Invalid aggregator_name' });
      }
      queryText += ` AND aggregator_name = $${pIdx++}`;
      params.push(aggregator_name.trim());
    }
    if (severity) {
      const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
      const sevUpper = String(severity).toUpperCase().trim();
      if (!validSeverities.includes(sevUpper)) {
        return res.status(400).json({ error: 'Invalid severity value' });
      }
      queryText += ` AND severity = $${pIdx++}`;
      params.push(sevUpper);
    }
    if (status) {
      const validStatuses = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'];
      const statUpper = String(status).toUpperCase().trim();
      if (!validStatuses.includes(statUpper)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      queryText += ` AND status = $${pIdx++}`;
      params.push(statUpper);
    }

    const safeLimit = parseSafeInt(limit, 50, 1, 500);
    queryText += ` ORDER BY created_at DESC LIMIT $${pIdx}`;
    params.push(safeLimit);

    const result = await req.queryTenant(queryText, params);
    res.json({ incidents: result.rows });
  } catch (error) {
    console.error('[Get Aggregator Incidents Error]', error);
    res.status(500).json({ error: 'Failed to retrieve aggregator incidents' });
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
    res.status(500).json({ error: 'Failed to retrieve incident summary' });
  }
};

const getAggregatorIncident = async (req, res) => {
  try {
    if (!isPositiveInteger(req.params.id)) {
      return res.status(400).json({ error: 'Invalid incident ID' });
    }
    const incidentId = parseInt(req.params.id, 10);

    const result = await req.queryTenant('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Get Incident Error]', error);
    res.status(500).json({ error: 'Failed to retrieve incident' });
  }
};

module.exports = {
  batchIngest,
  ingestEvents,
  getAggregatorIncidents,
  getAggregatorIncidentSummary,
  getAggregatorIncident
};
