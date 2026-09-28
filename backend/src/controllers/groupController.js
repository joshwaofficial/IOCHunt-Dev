
const appMode = require('../config/appMode');
const { isString, isIdentifier, sanitizeText } = require('../utils/inputValidator');

async function getGroups(req, res) {
  try {
    const rowsRes = await req.queryTenant('SELECT * FROM pol_groups ORDER BY name ASC');
    const groups = [];
    for (const g of rowsRes.rows) {
      const machinesRes = await req.queryTenant(`
        SELECT mg.machine, p.policy_json, p.applied_at, p.updated_at
        FROM machine_groups mg
        LEFT JOIN policies p ON LOWER(p.machine) = LOWER(mg.machine)
        WHERE mg.group_id=$1
      `, [g.id]);
      
      const machines = [];
      const overriddenMachines = [];
      const inSyncMachines = [];

      for (const r of machinesRes.rows) {
        machines.push(r.machine);
        let hasOverride = false;
        try {
          const pj = JSON.parse(r.policy_json || '{}');
          if (Object.keys(pj).length > 0) hasOverride = true;
        } catch (_) {}
        if (hasOverride) {
          overriddenMachines.push(r.machine);
        } else {
          inSyncMachines.push(r.machine);
        }
      }

      groups.push({
        id: g.id, 
        name: g.name, 
        policy: JSON.parse(g.policy_json || '{}'),
        updated_at: g.updated_at,
        machines,
        overridden_machines: overriddenMachines,
        in_sync_machines: inSyncMachines
      });
    }
    res.json(groups);
  } catch (error) {
    console.error('[Groups] Failed to get groups:', error);
    res.status(500).json({ error: 'Failed to retrieve groups' });
  }
}

async function createGroup(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const { name } = req.body;
    if (!isString(name, 1, 100)) {
      return res.status(400).json({ error: 'Group name is required (1-100 characters)' });
    }
    const cleanName = sanitizeText(name);
    const id = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await req.queryTenant(`INSERT INTO pol_groups (id, name, updated_at) VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::INTEGER)`, [id, cleanName]);
    res.json({ id, name: cleanName });
  } catch (error) {
    console.error('[Groups] Failed to create group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
}

async function deleteGroup(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    if (!isIdentifier(groupId, 1, 64)) {
      return res.status(400).json({ error: 'Invalid group identifier' });
    }

    const existing = await req.queryTenant('SELECT id FROM pol_groups WHERE id=$1', [groupId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    await req.queryTenant('DELETE FROM pol_groups WHERE id=$1', [groupId]);
    await req.queryTenant('DELETE FROM machine_groups WHERE group_id=$1', [groupId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Groups] Failed to delete group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
}

async function updateGroupPolicy(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    if (!isIdentifier(groupId, 1, 64)) {
      return res.status(400).json({ error: 'Invalid group identifier' });
    }

    const existing = await req.queryTenant('SELECT id FROM pol_groups WHERE id=$1', [groupId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const { policy, forceSync, preserveLocalDlp } = req.body;
    if (policy !== undefined && (typeof policy !== 'object' || Array.isArray(policy) || policy === null)) {
      return res.status(400).json({ error: 'policy must be an object' });
    }

    const now = Math.floor(Date.now() / 1000);
    await req.queryTenant(`
      UPDATE pol_groups SET policy_json=$1, updated_at=$2 WHERE id=$3
    `, [JSON.stringify(policy || {}), now, groupId]);

    // Handle machines in this group
    if (forceSync) {
      // Force sync mode: Reset machine overrides so all machines are unified with the group!
      if (preserveLocalDlp !== false) {
        // Keep each machine's local DLP folders if any, but clear other overrides
        const overriddenRes = await req.queryTenant(`
          SELECT machine, policy_json FROM policies 
          WHERE LOWER(machine) IN (SELECT LOWER(machine) FROM machine_groups WHERE group_id = $1)
            AND policy_json != '{}' AND policy_json IS NOT NULL
        `, [groupId]);

        for (const row of overriddenRes.rows) {
          try {
            const mPol = JSON.parse(row.policy_json || '{}');
            const localDlp = Array.isArray(mPol.dlpFolders) ? mPol.dlpFolders : [];
            const preservedPolicy = localDlp.length > 0 ? { dlpFolders: localDlp } : {};
            await req.queryTenant(`
              UPDATE policies 
              SET policy_json = $1, applied_at = NULL, updated_at = $2 
              WHERE LOWER(machine) = LOWER($3)
            `, [JSON.stringify(preservedPolicy), now, row.machine]);
          } catch (_) {}
        }
      } else {
        // Full reset: completely clear policy_json for all machines in the group
        await req.queryTenant(`
          UPDATE policies 
          SET policy_json = '{}', applied_at = NULL, updated_at = $1 
          WHERE LOWER(machine) IN (SELECT LOWER(machine) FROM machine_groups WHERE group_id = $2)
        `, [now, groupId]);
      }
    }

    // Reset applied_at and advance updated_at for ALL machines in this group so agents poll and pick up changes
    await req.queryTenant(`
      UPDATE policies 
      SET applied_at = NULL, updated_at = $1
      WHERE LOWER(machine) IN (
        SELECT LOWER(machine) FROM machine_groups WHERE group_id = $2
      )
    `, [now, groupId]);

    res.json({ ok: true, synced: true });
  } catch (error) {
    console.error('[Groups] Failed to update group policy:', error);
    res.status(500).json({ error: 'Failed to update group policy' });
  }
}

async function resetMachineOverride(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    const rawMachine = req.params.machine;
    const preserveLocalDlp = req.body?.preserveLocalDlp !== false;
    const now = Math.floor(Date.now() / 1000);

    if (rawMachine === 'all') {
      const rowsRes = await req.queryTenant(`
        SELECT machine, policy_json FROM policies 
        WHERE LOWER(machine) IN (SELECT LOWER(machine) FROM machine_groups WHERE group_id = $1)
      `, [groupId]);

      for (const row of rowsRes.rows) {
        let newPol = {};
        if (preserveLocalDlp) {
          try {
            const mPol = JSON.parse(row.policy_json || '{}');
            const localDlp = Array.isArray(mPol.dlpFolders) ? mPol.dlpFolders : [];
            if (localDlp.length > 0) newPol = { dlpFolders: localDlp };
          } catch (_) {}
        }
        await req.queryTenant(`
          UPDATE policies 
          SET policy_json = $1, applied_at = NULL, updated_at = $2 
          WHERE LOWER(machine) = LOWER($3)
        `, [JSON.stringify(newPol), now, row.machine]);
      }
      return res.json({ ok: true, reset: 'all' });
    }

    if (!isIdentifier(rawMachine, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }
    const machine = rawMachine.trim();

    let newPol = {};
    if (preserveLocalDlp) {
      const rowRes = await req.queryTenant(`SELECT policy_json FROM policies WHERE LOWER(machine) = LOWER($1) LIMIT 1`, [machine]);
      try {
        const mPol = JSON.parse(rowRes.rows[0]?.policy_json || '{}');
        const localDlp = Array.isArray(mPol.dlpFolders) ? mPol.dlpFolders : [];
        if (localDlp.length > 0) newPol = { dlpFolders: localDlp };
      } catch (_) {}
    }

    await req.queryTenant(`
      UPDATE policies 
      SET policy_json = $1, applied_at = NULL, updated_at = $2 
      WHERE LOWER(machine) = LOWER($3)
    `, [JSON.stringify(newPol), now, machine]);

    res.json({ ok: true, machine });
  } catch (error) {
    console.error('[Groups] Failed to reset machine override:', error);
    res.status(500).json({ error: 'Failed to reset machine override' });
  }
}

async function updateGroupMachines(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    if (!isIdentifier(groupId, 1, 64)) {
      return res.status(400).json({ error: 'Invalid group identifier' });
    }

    const existing = await req.queryTenant('SELECT id FROM pol_groups WHERE id=$1', [groupId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const rawMachines = req.body.machines;
    if (!Array.isArray(rawMachines)) {
      return res.status(400).json({ error: 'machines must be an array' });
    }
    if (rawMachines.length > 500) {
      return res.status(400).json({ error: 'Too many machines in single update (max 500)' });
    }

    const validMachines = rawMachines.filter(m => isIdentifier(m, 1, 128)).map(m => m.trim());
    
    const tenantPool = await req.getTenantPool();
    const client = await tenantPool.connect();
    try {
      await client.query('BEGIN');
      for (const m of validMachines) {
        await client.query('INSERT INTO machine_groups (machine, group_id) VALUES ($1, $2) ON CONFLICT (machine, group_id) DO NOTHING', [m, groupId]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
    await req.queryTenant(`UPDATE pol_groups SET updated_at=EXTRACT(EPOCH FROM NOW())::INTEGER WHERE id=$1`, [groupId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Groups] Failed to update group machines:', error);
    res.status(500).json({ error: 'Failed to assign machines to group' });
  }
}

async function removeMachineFromGroup(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    const machineId = req.params.machine;
    if (!isIdentifier(groupId, 1, 64)) {
      return res.status(400).json({ error: 'Invalid group identifier' });
    }
    if (!isIdentifier(machineId, 1, 128)) {
      return res.status(400).json({ error: 'Invalid machine identifier' });
    }

    const existing = await req.queryTenant('SELECT id FROM pol_groups WHERE id=$1', [groupId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    await req.queryTenant('DELETE FROM machine_groups WHERE group_id=$1 AND machine=$2', [groupId, machineId.trim()]);
    await req.queryTenant(`UPDATE pol_groups SET updated_at=EXTRACT(EPOCH FROM NOW())::INTEGER WHERE id=$1`, [groupId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Groups] Failed to remove machine from group:', error);
    res.status(500).json({ error: 'Failed to remove machine from group' });
  }
}

module.exports = {
  getGroups,
  createGroup,
  deleteGroup,
  updateGroupPolicy,
  updateGroupMachines,
  removeMachineFromGroup,
  resetMachineOverride
};
