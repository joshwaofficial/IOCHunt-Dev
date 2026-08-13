const Machine = require('../models/Machine');

/**
 * Get all machines/clients
 */
async function getAllMachines(req, res) {
  try {
    const machines = await Machine.getAllMachines(req.queryTenant);
    return res.status(200).json({ data: machines });
  } catch (error) {
    console.error('[Machine Error] Failed to get machines:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get a specific machine's policy
 */
async function getMachinePolicy(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Machine ID is required' });

    const policy = await Machine.getPolicy(req.queryTenant, id);
    return res.status(200).json({ data: policy || {} });
  } catch (error) {
    console.error('[Machine Error] Failed to get machine policy:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Update a machine's policy (Admin only)
 */
async function updateMachinePolicy(req, res) {
  try {
    const { id } = req.params;
    const policyData = req.body;

    if (!id || !policyData) {
      return res.status(400).json({ error: 'Machine ID and policy data are required' });
    }

    await Machine.updatePolicy(req.queryTenant, id, policyData);
    return res.status(200).json({ message: 'Policy updated successfully' });
  } catch (error) {
    console.error('[Machine Error] Failed to update policy:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get clients status and risk logic
 */
async function getClients(req, res) {
  try {
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      to = new Date().toISOString();
      from = new Date(Date.now() - hours * 3600000).toISOString();
    }
    const now = Math.floor(Date.now() / 1000);

    let machinesQuery = 'SELECT * FROM machines ORDER BY last_seen DESC';
    const machinesRes = await req.queryTenant(machinesQuery);
    const machines = machinesRes.rows;

    const clients = [];
    for (const m of machines) {
      const lastSeenEpoch = m.last_seen ? Math.floor(new Date(m.last_seen).getTime() / 1000) : 0;
      const isOnline = (now - lastSeenEpoch) <= 300; 

      const activeIncidentCount = await req.queryTenant(
        `SELECT COUNT(DISTINCT i.id) as count 
         FROM incidents i 
         JOIN incident_events ie ON i.id = ie.incident_id 
         JOIN events e ON ie.event_id = e.id 
         WHERE e.machine = $1 AND i.status != 'resolved'`,
        [m.name]
      );
      const incidentsCount = parseInt(activeIncidentCount.rows[0].count, 10);

      const policyRes = await req.queryTenant('SELECT updated_at FROM policies WHERE machine=$1', [m.name]);
      const lastPolicyUpdate = policyRes.rows.length ? policyRes.rows[0].updated_at : 0;
      
      let pendingUpdates = false;
      if (lastPolicyUpdate > 0 && lastPolicyUpdate > lastSeenEpoch) {
        pendingUpdates = true;
      }

      let riskScore = 0;
      if (incidentsCount > 0) riskScore += 50;
      if (m.os_type && m.os_type.toLowerCase().includes('windows 7')) riskScore += 20; 
      if (!isOnline && (now - lastSeenEpoch) > 86400 * 7) riskScore += 10; 

      clients.push({
        id: m.name,
        hostname: m.name,
        ip: m.ip_address,
        os: m.os_type,
        agent_version: m.agent_version,
        status: isOnline ? 'Online' : 'Offline',
        last_seen: m.last_seen,
        active_incidents: incidentsCount,
        risk_score: Math.min(riskScore, 100),
        pending_updates: pendingUpdates,
        aggregator_name: m.aggregator_name
      });
    }

    res.json({ clients });
  } catch (error) {
    console.error('[Machine Error] Failed to get clients list:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  getAllMachines,
  getMachinePolicy,
  updateMachinePolicy,
  getClients
};
