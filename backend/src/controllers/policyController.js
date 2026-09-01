
const appMode = require('../config/appMode');

async function getMachinePolicy(req, res) {
  try {
    const machine = req.params.machine;
    const rowRes = await req.queryTenant('SELECT * FROM policies WHERE machine=$1', [machine]);
    const row = rowRes.rows[0];
    
    // Find group policy for this machine (first group wins)
    const groupRowRes = await req.queryTenant(`
      SELECT pg.id, pg.name, pg.policy_json, pg.updated_at
      FROM machine_groups mg
      JOIN pol_groups pg ON pg.id = mg.group_id
      WHERE mg.machine = $1
      ORDER BY pg.updated_at DESC LIMIT 1
    `, [machine]);
    const groupRow = groupRowRes.rows[0];

    const machinePolicy = row ? JSON.parse(row.policy_json || '{}') : {};
    const groupPolicy = groupRow ? JSON.parse(groupRow.policy_json || '{}') : {};
    // Machine policy overrides group policy
    const effectivePolicy = Object.keys(machinePolicy).length > 0 ? machinePolicy : groupPolicy;

    res.json({
      ...(row || { machine: machine, policy_json: '{}', current_json: '{}', updated_at: 0, applied_at: null }),
      policy: effectivePolicy,
      current: JSON.parse((row && row.current_json) || '{}'),
      group: groupRow ? { id: groupRow.id, name: groupRow.name, policy: groupPolicy } : null,
      effective_policy: effectivePolicy,
      policy_source: Object.keys(machinePolicy).length > 0 ? 'machine' : (groupRow ? 'group' : 'default'),
    });
  } catch (error) {
    console.error('[Policy] Failed to get machine policy:', error);
    res.status(500).json({ error: 'Failed to retrieve machine policy' });
  }
}

async function updateMachineCurrentPolicy(req, res) {
  try {
    const machine = req.params.machine;
    const { policy } = req.body;
    if (!policy) return res.status(400).json({ error: 'policy required' });
    
    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, current_json, updated_at)
      VALUES ($1, '{}', $2, (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET current_json = excluded.current_json
    `, [machine, JSON.stringify(policy)]);
    
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
    const machine = req.params.machine;
    const { policy } = req.body;
    if (!policy) return res.status(400).json({ error: 'policy object required' });
    
    await req.queryTenant(`
      INSERT INTO policies (machine, policy_json, updated_at)
      VALUES ($1, $2, (EXTRACT(EPOCH FROM NOW())::INTEGER))
      ON CONFLICT(machine) DO UPDATE SET
        policy_json = excluded.policy_json,
        updated_at  = excluded.updated_at,
        applied_at  = NULL
    `, [machine, JSON.stringify(policy)]);
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[Policy] Failed to set machine policy:', error);
    res.status(500).json({ error: 'Failed to set machine policy' });
  }
}

async function ackMachinePolicy(req, res) {
  try {
    const machine = req.params.machine;
    
    // Get effective policy to synchronize current_json immediately on ACK
    const rowRes = await req.queryTenant('SELECT policy_json FROM policies WHERE machine=$1', [machine]);
    let effectivePolicy = rowRes.rows[0]?.policy_json;
    if (!effectivePolicy || effectivePolicy === '{}') {
      const grpRes = await req.queryTenant(`
        SELECT pg.policy_json FROM machine_groups mg
        JOIN pol_groups pg ON pg.id = mg.group_id
        WHERE mg.machine = $1 ORDER BY pg.updated_at DESC LIMIT 1
      `, [machine]);
      if (grpRes.rows[0]?.policy_json && grpRes.rows[0]?.policy_json !== '{}') {
        effectivePolicy = grpRes.rows[0].policy_json;
      }
    }

    await req.queryTenant(`
      UPDATE policies
      SET applied_at = (EXTRACT(EPOCH FROM NOW())::INTEGER),
          current_json = CASE 
            WHEN $2::text IS NOT NULL AND $2::text != '{}' THEN $2::text 
            ELSE current_json 
          END
      WHERE machine = $1
    `, [machine, effectivePolicy || null]);

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
