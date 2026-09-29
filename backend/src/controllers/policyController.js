
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
  const normalized = {
    ...DEFAULT_POLICY,
    ...rawPolicy,
    catModes: mergedCatModes,
    officeHoursStart: rawPolicy.officeHoursStart !== undefined ? parseInt(rawPolicy.officeHoursStart, 10) : DEFAULT_POLICY.officeHoursStart,
    officeHoursEnd: rawPolicy.officeHoursEnd !== undefined ? parseInt(rawPolicy.officeHoursEnd, 10) : DEFAULT_POLICY.officeHoursEnd,
    officeHoursDays: rawPolicy.officeHoursDays !== undefined ? parseInt(rawPolicy.officeHoursDays, 10) : DEFAULT_POLICY.officeHoursDays,
    failedLogonThreshold: rawPolicy.failedLogonThreshold !== undefined ? parseInt(rawPolicy.failedLogonThreshold, 10) : DEFAULT_POLICY.failedLogonThreshold,
    failedLogonWindowMins: rawPolicy.failedLogonWindowMins !== undefined ? parseInt(rawPolicy.failedLogonWindowMins, 10) : DEFAULT_POLICY.failedLogonWindowMins,
    dlpFolders: Array.isArray(rawPolicy.dlpFolders)
      ? rawPolicy.dlpFolders.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim())
      : [],
    usbLock: rawPolicy.usbLock === 'locked' ? 'locked' : 'unlocked'
  };
  delete normalized.learningMode;
  return normalized;
}

function computeEffectivePolicy(machinePolicyRaw, groupPolicyRaw) {
  const machinePolicy = (machinePolicyRaw && typeof machinePolicyRaw === 'object' && !Array.isArray(machinePolicyRaw))
    ? machinePolicyRaw : {};
  const groupPolicy = (groupPolicyRaw && typeof groupPolicyRaw === 'object' && !Array.isArray(groupPolicyRaw))
    ? groupPolicyRaw : {};

  // Base is DEFAULT_POLICY
  // Layer Group Policy over DEFAULT_POLICY
  const groupNormalized = normalizePolicy(groupPolicy);

  // DLP folders are ADDITIVELY MERGED (Union of Group Folders + Machine Folders)
  const groupDlp = Array.isArray(groupPolicy.dlpFolders)
    ? groupPolicy.dlpFolders.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim())
    : [];
  const machineDlp = Array.isArray(machinePolicy.dlpFolders)
    ? machinePolicy.dlpFolders.filter(f => typeof f === 'string' && f.trim().length > 0).map(f => f.trim())
    : [];
  // Machine Local Folders are endpoint-specific and must exclude any group folders
  const onlyLocalDlp = machineDlp.filter(f => !groupDlp.includes(f));
  const effectiveDlp = Array.from(new Set([...groupDlp, ...onlyLocalDlp]));

  // Track which specific fields are customized/overridden at the machine level
  // NOTE: Machine Local Folders are endpoint-specific paths and NOT a policy override!
  const overriddenFields = [];
  if (Array.isArray(machinePolicy.catModes) && machinePolicy.catModes.length > 0) {
    const differs = machinePolicy.catModes.some((m, idx) => m !== undefined && m !== groupNormalized.catModes[idx]);
    if (differs) overriddenFields.push('catModes');
  }
  if (machinePolicy.officeHoursStart !== undefined && machinePolicy.officeHoursStart !== groupNormalized.officeHoursStart) overriddenFields.push('officeHoursStart');
  if (machinePolicy.officeHoursEnd !== undefined && machinePolicy.officeHoursEnd !== groupNormalized.officeHoursEnd) overriddenFields.push('officeHoursEnd');
  if (machinePolicy.officeHoursDays !== undefined && machinePolicy.officeHoursDays !== groupNormalized.officeHoursDays) overriddenFields.push('officeHoursDays');
  if (machinePolicy.failedLogonThreshold !== undefined && machinePolicy.failedLogonThreshold !== groupNormalized.failedLogonThreshold) overriddenFields.push('failedLogonThreshold');
  if (machinePolicy.failedLogonWindowMins !== undefined && machinePolicy.failedLogonWindowMins !== groupNormalized.failedLogonWindowMins) overriddenFields.push('failedLogonWindowMins');
  if (machinePolicy.usbLock !== undefined && machinePolicy.usbLock !== groupNormalized.usbLock) overriddenFields.push('usbLock');

  const hasMachineOverrides = overriddenFields.length > 0;

  let mergedCatModes = [...groupNormalized.catModes];
  if (Array.isArray(machinePolicy.catModes)) {
    for (let i = 0; i < 14; i++) {
      if (machinePolicy.catModes[i] !== undefined) {
        mergedCatModes[i] = Math.min(3, Math.max(0, parseInt(machinePolicy.catModes[i], 10) || 0));
      }
    }
  }

  const effective = {
    catModes: mergedCatModes,
    officeHoursStart: machinePolicy.officeHoursStart !== undefined ? parseInt(machinePolicy.officeHoursStart, 10) : groupNormalized.officeHoursStart,
    officeHoursEnd: machinePolicy.officeHoursEnd !== undefined ? parseInt(machinePolicy.officeHoursEnd, 10) : groupNormalized.officeHoursEnd,
    officeHoursDays: machinePolicy.officeHoursDays !== undefined ? parseInt(machinePolicy.officeHoursDays, 10) : groupNormalized.officeHoursDays,
    failedLogonThreshold: machinePolicy.failedLogonThreshold !== undefined ? parseInt(machinePolicy.failedLogonThreshold, 10) : groupNormalized.failedLogonThreshold,
    failedLogonWindowMins: machinePolicy.failedLogonWindowMins !== undefined ? parseInt(machinePolicy.failedLogonWindowMins, 10) : groupNormalized.failedLogonWindowMins,
    dlpFolders: effectiveDlp,
    usbLock: machinePolicy.usbLock !== undefined ? (machinePolicy.usbLock === 'locked' ? 'locked' : 'unlocked') : groupNormalized.usbLock
  };
  delete effective.learningMode;

  return {
    effectivePolicy: effective,
    groupDlpFolders: groupDlp,
    machineDlpFolders: onlyLocalDlp,
    hasMachineOverrides,
    overriddenFields
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

    const {
      effectivePolicy,
      groupDlpFolders,
      machineDlpFolders,
      hasMachineOverrides,
      overriddenFields
    } = computeEffectivePolicy(machinePolicy, groupPolicy);

    let policySource = 'default';
    if (groupRow && Object.keys(groupPolicy).length > 0) {
      policySource = hasMachineOverrides ? 'machine' : 'group';
    } else if (hasMachineOverrides) {
      policySource = 'machine';
    }

    const effectiveUpdatedAt = Math.max(groupRow?.updated_at || 0, row?.updated_at || 0);

    console.log(`[Policy] GET request for '${machine}' (Auth: ${req.authType || 'session'}) -> Source: ${policySource}, catModes: [${effectivePolicy.catModes.join(',')}], dlp: ${effectivePolicy.dlpFolders.length} (Group: ${groupDlpFolders.length}, Local: ${machineDlpFolders.length}), usbLock: ${effectivePolicy.usbLock}`);

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
      has_override: hasMachineOverrides,
      overridden_fields: overriddenFields,
      group_dlp_folders: groupDlpFolders,
      machine_dlp_folders: machineDlpFolders,
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

    const rowRes = await req.queryTenant('SELECT machine, policy_json FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1', [machine]);
    const targetMachine = rowRes.rows[0]?.machine || machine;
    const mPolicy = rowRes.rows[0]?.policy_json ? JSON.parse(rowRes.rows[0].policy_json) : {};

    const grpRes = await req.queryTenant(`
      SELECT pg.policy_json FROM machine_groups mg
      JOIN pol_groups pg ON pg.id = mg.group_id
      WHERE LOWER(mg.machine) = LOWER($1) LIMIT 1
    `, [machine]);
    const gPolicy = grpRes.rows[0]?.policy_json ? JSON.parse(grpRes.rows[0].policy_json) : {};

    const { effectivePolicy } = computeEffectivePolicy(mPolicy, gPolicy);
    const mergedCurrent = {
      ...effectivePolicy,
      ...(policy && typeof policy === 'object' ? policy : {})
    };
    if (!Array.isArray(policy?.dlpFolders) || policy.dlpFolders.length === 0) {
      mergedCurrent.dlpFolders = effectivePolicy.dlpFolders;
    }
    if (!policy?.usbLock) {
      mergedCurrent.usbLock = effectivePolicy.usbLock;
    }

    console.log(`[Policy] Current state reported for '${machine}' -> catModes: [${(mergedCurrent.catModes || []).join(',')}], dlp: ${(mergedCurrent.dlpFolders || []).length}, usbLock: ${mergedCurrent.usbLock || 'unlocked'}`);

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, current_json, updated_at)
      VALUES ($1, '{}', $2, (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET 
        current_json = excluded.current_json
    `, [targetMachine, JSON.stringify(mergedCurrent)]);

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

    let payloadPolicy = Object.keys(policy).length > 0 ? normalizePolicy(policy) : {};

    // If machine belongs to a group, ensure machine policy only stores local machine folders so group DLP updates remain additive
    const groupRowRes = await req.queryTenant(`
      SELECT pg.id, pg.policy_json
      FROM machine_groups mg
      JOIN pol_groups pg ON pg.id = mg.group_id
      WHERE LOWER(mg.machine) = LOWER($1)
      LIMIT 1
    `, [targetMachine]);

    if (groupRowRes.rows[0]) {
      const groupPolicy = JSON.parse(groupRowRes.rows[0].policy_json || '{}');
      const groupNormalized = normalizePolicy(groupPolicy);

      // Deduplicate group DLP folders so machine policy only stores genuine local folders
      const groupDlp = Array.isArray(groupPolicy.dlpFolders) ? groupPolicy.dlpFolders.map(f => f.trim()) : [];
      if (Array.isArray(req.body.machine_dlp_folders)) {
        payloadPolicy.dlpFolders = req.body.machine_dlp_folders.filter(f => typeof f === 'string' && f.trim().length > 0 && !groupDlp.includes(f));
      } else if (Array.isArray(payloadPolicy.dlpFolders)) {
        payloadPolicy.dlpFolders = payloadPolicy.dlpFolders.filter(f => !groupDlp.includes(f));
      }

      // If category modes match the group exactly, do not store them as an override
      if (Array.isArray(payloadPolicy.catModes) && payloadPolicy.catModes.every((m, idx) => m === groupNormalized.catModes[idx])) {
        delete payloadPolicy.catModes;
      }
      if (payloadPolicy.usbLock === groupNormalized.usbLock) {
        delete payloadPolicy.usbLock;
      }
      if (payloadPolicy.officeHoursStart === groupNormalized.officeHoursStart) delete payloadPolicy.officeHoursStart;
      if (payloadPolicy.officeHoursEnd === groupNormalized.officeHoursEnd) delete payloadPolicy.officeHoursEnd;
      if (payloadPolicy.officeHoursDays === groupNormalized.officeHoursDays) delete payloadPolicy.officeHoursDays;
      if (payloadPolicy.failedLogonThreshold === groupNormalized.failedLogonThreshold) delete payloadPolicy.failedLogonThreshold;
      if (payloadPolicy.failedLogonWindowMins === groupNormalized.failedLogonWindowMins) delete payloadPolicy.failedLogonWindowMins;
    } else {
      if (Array.isArray(req.body.machine_dlp_folders)) {
        payloadPolicy.dlpFolders = req.body.machine_dlp_folders.filter(f => typeof f === 'string' && f.trim().length > 0);
      }
    }

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, updated_at, applied_at)
      VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW())::INTEGER), NULL)
      ON CONFLICT(machine) DO UPDATE SET
        policy_json = excluded.policy_json,
        updated_at  = excluded.updated_at,
        applied_at  = NULL
    `, [targetMachine, JSON.stringify(payloadPolicy)]);

    console.log(`[Policy] Saved machine policy for '${targetMachine}' -> catModes: [${(payloadPolicy.catModes || []).join(',')}], local dlp: ${(payloadPolicy.dlpFolders || []).length}, usbLock: ${payloadPolicy.usbLock || 'none'}`);

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

    // Get effective policy using layered inheritance
    const rowRes = await req.queryTenant('SELECT machine, policy_json FROM policies WHERE LOWER(machine) = LOWER($1) ORDER BY updated_at DESC LIMIT 1', [machine]);
    const actualMachine = rowRes.rows[0]?.machine || machine;
    const mPolicy = rowRes.rows[0]?.policy_json ? JSON.parse(rowRes.rows[0].policy_json) : {};

    const grpRes = await req.queryTenant(`
      SELECT pg.policy_json FROM machine_groups mg
      JOIN pol_groups pg ON pg.id = mg.group_id
      WHERE LOWER(mg.machine) = LOWER($1) ORDER BY pg.updated_at DESC LIMIT 1
    `, [machine]);
    const gPolicy = grpRes.rows[0]?.policy_json ? JSON.parse(grpRes.rows[0].policy_json) : {};

    const { effectivePolicy } = computeEffectivePolicy(mPolicy, gPolicy);

    const mergedCurrent = {
      ...effectivePolicy,
      ...(policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {})
    };
    if (!Array.isArray(policy?.dlpFolders) || policy.dlpFolders.length === 0) {
      mergedCurrent.dlpFolders = effectivePolicy.dlpFolders;
    }
    if (!policy?.usbLock) {
      mergedCurrent.usbLock = effectivePolicy.usbLock;
    }

    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, current_json, updated_at, applied_at)
      VALUES ($1, '{}', $2, (EXTRACT(EPOCH FROM NOW())::INTEGER), (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET
        applied_at = (EXTRACT(EPOCH FROM NOW())::INTEGER),
        current_json = EXCLUDED.current_json
    `, [actualMachine, JSON.stringify(mergedCurrent)]);

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
