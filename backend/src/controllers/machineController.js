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
        [m.id]
      );
      const incidentsCount = parseInt(activeIncidentCount.rows[0].count, 10);

      const statsRes = await req.queryTenant(
        `SELECT 
          COUNT(*) as total_recent,
          SUM(CASE WHEN LOWER(severity) = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN LOWER(severity) = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN category IN ('DOMAIN','ADCS') OR tag ILIKE '%DCSYNC%' OR tag ILIKE '%KERBEROAST%' OR tag ILIKE '%SPRAY%' OR tag ILIKE '%NTLM-BRUTE%' THEN 1 ELSE 0 END) as ad_events
         FROM events 
         WHERE machine = $1 AND ts >= $2`,
        [m.id, from]
      );
      const totalRecent = parseInt(statsRes.rows[0].total_recent || 0, 10);
      const criticalCount = parseInt(statsRes.rows[0].critical || 0, 10);
      const highCount = parseInt(statsRes.rows[0].high || 0, 10);
      const adEventsCount = parseInt(statsRes.rows[0].ad_events || 0, 10);

      const policyRes = await req.queryTenant('SELECT updated_at FROM policies WHERE machine=$1', [m.id]);
      const lastPolicyUpdate = policyRes.rows.length ? policyRes.rows[0].updated_at : 0;
      
      let pendingUpdates = false;
      if (lastPolicyUpdate > 0 && lastPolicyUpdate > lastSeenEpoch) {
        pendingUpdates = true;
      }

      let riskScore = 0;
      if (incidentsCount > 0) riskScore += 50;
      if (criticalCount > 0) riskScore += 30;
      if (highCount > 0) riskScore += 15;
      if (adEventsCount > 0) riskScore += 10;
      if (m.os && m.os.toLowerCase().includes('windows 7')) riskScore += 20; 
      if (!isOnline && (now - lastSeenEpoch) > 86400 * 7) riskScore += 10; 
      
      const finalRisk = Math.min(riskScore, 100);
      const riskLabel = finalRisk >= 75 ? 'Critical' : finalRisk >= 50 ? 'High' : finalRisk >= 25 ? 'Medium' : 'Low';
      const statusCol = isOnline ? '#22c55e' : '#64748b';

      clients.push({
        id: m.id,
        label: m.label || m.name || m.id,
        ip: m.ip || '-',
        os: m.os || 'unknown',
        status: isOnline ? 'Online' : 'Offline',
        statusCol: statusCol,
        last_seen_str: m.last_seen,
        total_recent: totalRecent,
        critical: criticalCount,
        high: highCount,
        ad_events: adEventsCount,
        risk: finalRisk,
        riskLabel: riskLabel,
        pending_updates: pendingUpdates,
        aggregator: m.aggregator_name || 'direct'
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
