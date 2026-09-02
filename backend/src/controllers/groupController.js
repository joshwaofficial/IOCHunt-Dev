
const appMode = require('../config/appMode');

async function getGroups(req, res) {
  try {
    const rowsRes = await req.queryTenant('SELECT * FROM pol_groups');
    const groups = [];
    for (const g of rowsRes.rows) {
      const machinesRes = await req.queryTenant('SELECT machine FROM machine_groups WHERE group_id=$1', [g.id]);
      const machines = machinesRes.rows.map(r => r.machine);
      groups.push({
        id: g.id, 
        name: g.name, 
        policy: JSON.parse(g.policy_json || '{}'),
        updated_at: g.updated_at,
        machines
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
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
    await req.queryTenant(`INSERT INTO pol_groups (id, name, updated_at) VALUES ($1, $2, EXTRACT(EPOCH FROM NOW())::INTEGER)`, [id, name]);
    res.json({ id, name });
  } catch (error) {
    console.error('[Groups] Failed to create group:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
}

async function deleteGroup(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    await req.queryTenant('DELETE FROM pol_groups WHERE id=$1', [req.params.id]);
    await req.queryTenant('DELETE FROM machine_groups WHERE group_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Groups] Failed to delete group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
}

async function updateGroupPolicy(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const { policy } = req.body;
    const now = Math.floor(Date.now() / 1000);
    await req.queryTenant(`
      UPDATE pol_groups SET policy_json=$1, updated_at=$2 WHERE id=$3
    `, [JSON.stringify(policy || {}), now, req.params.id]);

    // Reset applied_at and advance updated_at for all machines in this group that don't have overrides
    await req.queryTenant(`
      UPDATE policies 
      SET applied_at = NULL, updated_at = $1
      WHERE LOWER(machine) IN (
        SELECT LOWER(machine) FROM machine_groups WHERE group_id = $2
      ) AND (policy_json = '{}' OR policy_json IS NULL)
    `, [now, req.params.id]);

    res.json({ ok: true });
  } catch (error) {
    console.error('[Groups] Failed to update group policy:', error);
    res.status(500).json({ error: 'Failed to update group policy' });
  }
}

async function updateGroupMachines(req, res) {
  try {
    if (appMode.isAggregator()) return res.status(403).json({ error: 'Policies are managed centrally. This instance is read-only.' });
    const groupId = req.params.id;
    const machines = req.body.machines || [];
    
    const tenantPool = await req.getTenantPool();
    const client = await tenantPool.connect();
    try {
      await client.query('BEGIN');
      for (const m of machines) {
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
    
    await req.queryTenant('DELETE FROM machine_groups WHERE group_id=$1 AND machine=$2', [groupId, machineId]);
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
  removeMachineFromGroup
};
