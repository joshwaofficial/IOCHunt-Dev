
const appMode = require('../config/appMode');
const { isRoleAboveOrEqual } = require('../config/roles');
const { isIdentifier, sanitizeText } = require('../utils/inputValidator');

const DEFAULT_POLICY = {
  catModes: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1],
  officeHoursStart: 9,
  officeHoursEnd: 18,
  officeHoursDays: 62,
  failedLogonThreshold: 5,
  failedLogonWindowMins: 10,
  learningMode: true,
  dlpFolders: [],
  usbLock: 'unlocked'
};

function normalizePolicy(rawPolicy) {
  if (!rawPolicy || typeof rawPolicy !== 'object' || Array.isArray(rawPolicy)) {
    return { ...DEFAULT_POLICY };
  }
  let mergedCatModes = [...DEFAULT_POLICY.catModes];
  if (Array.isArray(rawPolicy.catModes)) {
    for (let i = 0; i < 14; i++) {
      if (rawPolicy.catModes[i] !== undefined) {
        mergedCatModes[i] = Math.min(3, Math.max(0, parseInt(rawPolicy.catModes[i], 10) || 0));
      }
    }
  }
  return {
    ...DEFAULT_POLICY,
    ...rawPolicy,
    catModes: mergedCatModes,
    officeHoursStart: rawPolicy.officeHoursStart !== undefined ? parseInt(rawPolicy.officeHoursStart, 10) : DEFAULT_POLICY.officeHoursStart,
    officeHoursEnd: rawPolicy.officeHoursEnd !== undefined ? parseInt(rawPolicy.officeHoursEnd, 10) : DEFAULT_POLICY.officeHoursEnd,
    officeHoursDays: rawPolicy.officeHoursDays !== undefined ? parseInt(rawPolicy.officeHoursDays, 10) : DEFAULT_POLICY.officeHoursDays,
    failedLogonThreshold: rawPolicy.failedLogonThreshold !== undefined ? parseInt(rawPolicy.failedLogonThreshold, 10) : DEFAULT_POLICY.failedLogonThreshold,
    failedLogonWindowMins: rawPolicy.failedLogonWindowMins !== undefined ? parseInt(rawPolicy.failedLogonWindowMins, 10) : DEFAULT_POLICY.failedLogonWindowMins,
    learningMode: rawPolicy.learningMode !== undefined ? Boolean(rawPolicy.learningMode) : DEFAULT_POLICY.learningMode,
    dlpFolders: Array.isArray(rawPolicy.dlpFolders)
      ? rawPolicy.dlpFolders.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim())
      : [],
    usbLock: rawPolicy.usbLock === 'locked' ? 'locked' : 'unlocked'
  };
}

async function getMachinePolicy(req, res) {
  try {
    const rawMachine = req.params.machine;
    if (!isIdentifier(rawMachine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    const machine = rawMachine.trim();

    // Zero-Trust Machine Policy Isolation (INT-PT-L-002)
    if (req.isAgentKey && req.boundMachine) {
      if (req.boundMachine.toLowerCase() !== machine.toLowerCase()) {
        return res.status(403).json({
          error: `Forbidden: Unauthorized access to policy. This agent key is bound to '${req.boundMachine}', but requested policy for '${machine}'`
        });
      }
    }

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
    let rawEffective;
    let policySource;
    let effectiveUpdatedAt = row?.updated_at || 0;

    if (Object.keys(machinePolicy).length > 0) {
      rawEffective = machinePolicy;
      policySource = 'machine';
      effectiveUpdatedAt = row?.updated_at || 0;
    } else if (groupRow && Object.keys(groupPolicy).length > 0) {
      rawEffective = groupPolicy;
      policySource = 'group';
      effectiveUpdatedAt = Math.max(groupRow.updated_at || 0, row?.updated_at || 0);
    } else {
      rawEffective = DEFAULT_POLICY;
      policySource = 'default';
      effectiveUpdatedAt = row?.updated_at || 0;
    }

    const effectivePolicy = normalizePolicy(rawEffective);

    console.log(`[Policy] GET request for '${machine}' (Auth: ${req.authType || 'session'}) -> Source: ${policySource}, catModes: [${effectivePolicy.catModes.join(',')}], dlp: ${effectivePolicy.dlpFolders.length}, usbLock: ${effectivePolicy.usbLock}`);

    const currentJsonObj = JSON.parse((row && row.current_json) || '{}');

    res.json({
      ...(row || { machine: machine, policy_json: '{}', current_json: '{}', applied_at: null }),
      ...effectivePolicy, // Top-level catModes, dlpFolders, usbLock, etc. for direct C# deserialization
      machine: row?.machine || machine,
      policy: effectivePolicy,
      effective_policy: effectivePolicy,
      policy_json: JSON.stringify(effectivePolicy), // Ensure never empty {}
      current: currentJsonObj,
      current_json: (row && row.current_json) || '{}',
      group: groupRow ? { id: groupRow.id, name: groupRow.name, policy: normalizePolicy(groupPolicy) } : null,
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
    const rawMachine = req.params.machine;
    if (!isIdentifier(rawMachine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    const machine = rawMachine.trim();

    // Zero-Trust Machine Policy Isolation (INT-PT-L-002)
    if (req.isAgentKey && req.boundMachine) {
      if (req.boundMachine.toLowerCase() !== machine.toLowerCase()) {
        return res.status(403).json({
          error: `Forbidden: Unauthorized access to policy. This agent key is bound to '${req.boundMachine}', but requested update for '${machine}'`
        });
      }
    }

    const policy = req.body?.policy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return res.status(400).json({ error: 'policy object required' });
    }
    
    const rowRes = await req.queryTenant('SELECT machine FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [machine]);
    const targetMachine = rowRes.rows[0]?.machine || machine;

    console.log(`[Policy] Current state reported for '${machine}' -> catModes: [${(policy.catModes || []).join(',')}], dlp: ${(policy.dlpFolders || []).length}, usbLock: ${policy.usbLock || 'unlocked'}`);

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
    if (req.isAgentKey) {
      return res.status(403).json({ error: 'Forbidden: Agents cannot modify policies' });
    }
    if (req.session && !isRoleAboveOrEqual(req.session.role, 'ADMIN')) {
      return res.status(403).json({ error: 'Forbidden: Admin privileges required to modify policies' });
    }
    const rawMachine = req.params.machine;
    if (!isIdentifier(rawMachine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    const machine = rawMachine.trim();
    const policy = req.body?.policy;
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      return res.status(400).json({ error: 'policy object required' });
    }
    
    const rowRes = await req.queryTenant('SELECT machine FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [machine]);
    const targetMachine = rowRes.rows[0]?.machine || machine;

    const payloadPolicy = Object.keys(policy).length > 0 ? normalizePolicy(policy) : {};

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, updated_at, applied_at)
      VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW())::INTEGER), NULL)
      ON CONFLICT(machine) DO UPDATE SET
        policy_json = excluded.policy_json,
        updated_at  = excluded.updated_at,
        applied_at  = NULL
    `, [targetMachine, JSON.stringify(payloadPolicy)]);
    
    console.log(`[Policy] Saved machine policy for '${targetMachine}' -> catModes: [${(payloadPolicy.catModes || []).join(',')}], dlp: ${(payloadPolicy.dlpFolders || []).length}, usbLock: ${payloadPolicy.usbLock || 'none'}`);

    res.json({ ok: true });
  } catch (error) {
    console.error('[Policy] Failed to set machine policy:', error);
    res.status(500).json({ error: 'Failed to set machine policy' });
  }
}

async function ackMachinePolicy(req, res) {
  try {
    const rawMachine = req.params.machine;
    if (!isIdentifier(rawMachine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    const machine = rawMachine.trim();

    // Zero-Trust Machine Policy Isolation (INT-PT-L-002)
    if (req.isAgentKey && req.boundMachine) {
      if (req.boundMachine.toLowerCase() !== machine.toLowerCase()) {
        return res.status(403).json({
          error: `Forbidden: Unauthorized access to policy. This agent key is bound to '${req.boundMachine}', but requested ACK for '${machine}'`
        });
      }
    }

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

    const payloadPolicy = (policy && typeof policy === 'object' && !Array.isArray(policy) && Object.keys(policy).length > 0)
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
    if (req.isAgentKey) {
      return res.status(403).json({ error: 'Forbidden: Agents cannot list all fleet policies' });
    }
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
