
const appMode = require('../config/appMode');

const DEFAULT_POLICY = {
  catModes: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
  officeHoursStart: 9,
  officeHoursEnd: 18,
  officeHoursDays: 62,
  failedLogonThreshold: 5,
  failedLogonWindowMins: 10,
  learningMode: true
};

async function getMachinePolicy(req, res) {
  try {
    const machine = (req.params.machine || '').trim();
    const rowRes = await req.queryTenant('SELECT * FROM policies WHERE LOWER(machine) = LOWER($1) ORDER BY updated_at DESC LIMIT 1', [machine]);
    const row = rowRes.rows[0];
    
    // Find group policy for this machine (first group wins)
    const groupRowRes = await req.queryTenant(`
      SELECT pg.id, pg.name, pg.policy_json, pg.updated_at
      FROM machine_groups mg
      JOIN pol_groups pg ON pg.id = mg.group_id
      WHERE LOWER(mg.machine) = LOWER($1)
      ORDER BY pg.updated_at DESC LIMIT 1
    `, [machine]);
    const groupRow = groupRowRes.rows[0];

    const machinePolicy = row ? JSON.parse(row.policy_json || '{}') : {};
    const groupPolicy = groupRow ? JSON.parse(groupRow.policy_json || '{}') : {};
    
    // Determine effective policy: Machine Override > Group Policy > System Default Policy
    let effectivePolicy;
    let policySource;
    let effectiveUpdatedAt = row?.updated_at || 0;

    if (Object.keys(machinePolicy).length > 0) {
      effectivePolicy = machinePolicy;
      policySource = 'machine';
      effectiveUpdatedAt = row?.updated_at || 0;
    } else if (groupRow && Object.keys(groupPolicy).length > 0) {
      effectivePolicy = groupPolicy;
      policySource = 'group';
      effectiveUpdatedAt = Math.max(groupRow.updated_at || 0, row?.updated_at || 0);
    } else {
      effectivePolicy = DEFAULT_POLICY;
      policySource = 'default';
      effectiveUpdatedAt = row?.updated_at || 0;
    }

    console.log(`[Policy] GET request for '${machine}' (Auth: ${req.authType || 'session'}) -> Source: ${policySource}, catModes: ${JSON.stringify(effectivePolicy.catModes || 'default')}`);

    const currentJsonObj = JSON.parse((row && row.current_json) || '{}');

    res.json({
      ...(row || { machine: machine, policy_json: '{}', current_json: '{}', applied_at: null }),
      ...effectivePolicy, // Top-level catModes, etc. for direct C# deserialization
      machine: row?.machine || machine,
      policy: effectivePolicy,
      effective_policy: effectivePolicy,
      policy_json: JSON.stringify(effectivePolicy), // Ensure never empty {}
      current: currentJsonObj,
      current_json: (row && row.current_json) || '{}',
      group: groupRow ? { id: groupRow.id, name: groupRow.name, policy: groupPolicy } : null,
      effective_policy: effectivePolicy,
      policy_source: policySource,
      updated_at: effectiveUpdatedAt,
      applied_at: row?.applied_at || null
    });
  } catch (error) {
    console.error('[Policy] Failed to get machine policy:', error);
    res.status(500).json({ error: 'Failed to retrieve machine policy' });
  }
}

async function updateMachineCurrentPolicy(req, res) {
  try {
    const machine = (req.params.machine || '').trim();
    const policy = req.body?.policy;
    if (!policy) return res.status(400).json({ error: 'policy required' });
    
    const rowRes = await req.queryTenant('SELECT machine FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [machine]);
    const targetMachine = rowRes.rows[0]?.machine || machine;

    console.log(`[Policy] Current state reported for '${machine}' -> catModes: ${JSON.stringify(policy.catModes || [])}`);

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, current_json, updated_at)
      VALUES ($1, '{}', $2, (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET 
        current_json = excluded.current_json
    `, [targetMachine, JSON.stringify(policy)]);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[Policy] Failed to update current policy:', error);
    res.status(500).json({ error: 'Failed to update current policy' });
  }
}

async function setMachinePolicy(req, res) {
  try {
    if (appMode.isAggregator()) {
      return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    }
    const machine = (req.params.machine || '').trim();
    const policy = req.body?.policy;
    if (!policy) return res.status(400).json({ error: 'policy object required' });
    
    const rowRes = await req.queryTenant('SELECT machine FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [machine]);
    const targetMachine = rowRes.rows[0]?.machine || machine;

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, updated_at)
      VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET
        policy_json = excluded.policy_json,
        updated_at  = excluded.updated_at,
        applied_at  = NULL
    `, [targetMachine, JSON.stringify(policy)]);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[Policy] Failed to set machine policy:', error);
    res.status(500).json({ error: 'Failed to set machine policy' });
  }
}

async function ackMachinePolicy(req, res) {
  try {
    const machine = (req.params.machine || '').trim();
    const policy = req.body?.policy;
    
    // Get effective policy to synchronize current_json immediately on ACK
    const rowRes = await req.queryTenant('SELECT machine, policy_json FROM policies WHERE LOWER(machine) = LOWER($1) ORDER BY updated_at DESC LIMIT 1', [machine]);
    const actualMachine = rowRes.rows[0]?.machine || machine;
    let effectivePolicy = rowRes.rows[0]?.policy_json;
    if (!effectivePolicy || effectivePolicy === '{}') {
      const grpRes = await req.queryTenant(`
        SELECT pg.policy_json FROM machine_groups mg
        JOIN pol_groups pg ON pg.id = mg.group_id
        WHERE LOWER(mg.machine) = LOWER($1) ORDER BY pg.updated_at DESC LIMIT 1
      `, [machine]);
      if (grpRes.rows[0]?.policy_json && grpRes.rows[0]?.policy_json !== '{}') {
        effectivePolicy = grpRes.rows[0].policy_json;
      } else {
        effectivePolicy = JSON.stringify(DEFAULT_POLICY);
      }
    }

    const payloadPolicy = (policy && typeof policy === 'object' && Object.keys(policy).length > 0)
      ? JSON.stringify(policy)
      : (effectivePolicy || '{}');

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, current_json, updated_at, applied_at)
      VALUES ($1, '{}', $2, (EXTRACT(EPOCH FROM NOW())::INTEGER), (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET
        applied_at = (EXTRACT(EPOCH FROM NOW())::INTEGER),
        current_json = EXCLUDED.current_json
    `, [actualMachine, payloadPolicy]);

    console.log(`[Policy] ACK received for '${machine}' (Actual: '${actualMachine}') -> Applied now. Status: in sync`);

    res.json({ ok: true });
  } catch (error) {
    console.error('[Policy] Failed to ack policy:', error);
    res.status(500).json({ error: 'Failed to ack policy' });
  }
}

async function getAllPolicies(req, res) {
  try {
    const rowsRes = await req.queryTenant('SELECT * FROM policies ORDER BY updated_at DESC');
    res.json(rowsRes.rows.map(r => ({ ...r, policy: JSON.parse(r.policy_json || '{}') })));
  } catch (error) {
    console.error('[Policy] Failed to list policies:', error);
    res.status(500).json({ error: 'Failed to list policies' });
  }
}

module.exports = {
  getMachinePolicy,
  updateMachineCurrentPolicy,
  setMachinePolicy,
  ackMachinePolicy,
  getAllPolicies
};
