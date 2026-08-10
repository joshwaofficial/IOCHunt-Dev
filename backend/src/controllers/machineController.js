const Machine = require('../models/Machine');
const { getAggregatorPool } = require('../config/aggregatorDbManager');
const db = require('../config/db');

function getDb(aggregator) {
  if (aggregator && aggregator !== 'All Aggregators' && aggregator !== 'All Branches' && aggregator !== 'default' && aggregator !== 'direct') {
    try {
      return getAggregatorPool(aggregator);
    } catch(e) {
      return db.pool;
    }
  }
  return db.pool;
}

/**
 * Get all machines/clients
 */
async function getAllMachines(req, res) {
  try {
    const userAgg = req.session?.aggregator_name || req.query.aggregator;
    const machines = await Machine.getAllMachines(userAgg);
    return res.status(200).json({ data: machines });
  } catch (error) {
    console.error('[Machine Error] Failed to get machines:', error);
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

    const agg = req.session?.aggregator_name || (req.query.aggregator !== 'All Aggregators' ? req.query.aggregator : '');
    const pool = getDb(agg);

    let machinesQuery = 'SELECT * FROM machines';
    const params = [];
    if (agg && agg !== 'all' && agg !== '') {
      machinesQuery += ' WHERE aggregator_name = $1';
      params.push(agg);
    }
    machinesQuery += ' ORDER BY last_seen DESC';

    const machinesRes = await pool.query(machinesQuery, params);
    const machines = machinesRes.rows;

    const clients = [];
    for (const m of machines) {
      const lastSeenEpoch = m.last_seen ? Math.floor(new Date(m.last_seen).getTime() / 1000) : 0;
      const age = now - lastSeenEpoch;
      let status, statusCol;
      if (age < 180) { status = 'Online'; statusCol = '#22c55e'; }
      else if (age < 600) { status = 'Recent'; statusCol = '#84cc16'; }
      else if (age < 3600) { status = 'Away'; statusCol = '#f97316'; }
      else { status = 'Offline'; statusCol = '#ef4444'; }

      const statsRes = await pool.query(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity='high'     THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN severity='medium'   THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN category IN ('DOMAIN','ADCS') THEN 1 ELSE 0 END) as ad_events
        FROM events WHERE machine=$1 AND ts>=$2 AND ts<=$3 AND is_noise=false`,
        [m.name, from, to]
      );
      const s = statsRes.rows[0] || {};
      const risk = Math.min(100,
        parseInt(s.critical || 0, 10) * 10 + parseInt(s.high || 0, 10) * 3 + parseInt(s.medium || 0, 10) + parseInt(s.ad_events || 0, 10) * 5
      );
      const riskLabel = risk >= 50 ? 'Critical' : risk >= 20 ? 'High' : risk >= 5 ? 'Medium' : 'Low';

      clients.push({
        id: m.name, 
        label: m.name || m.label, 
        ip: m.ip || '',
        aggregator: m.aggregator_name,
        last_seen: m.last_seen,
        status,
        status_col: statusCol,
        total: parseInt(s.total || 0, 10),
        critical: parseInt(s.critical || 0, 10),
        high: parseInt(s.high || 0, 10),
        ad_events: parseInt(s.ad_events || 0, 10),
        risk_score: risk,
        risk_label: riskLabel,
        group_name: m.group_name || ''
      });
    }

    const top5 = new Set(
      [...clients].sort((a, b) => b.risk_score - a.risk_score).slice(0, 5)
        .filter(c => c.risk_score > 0).map(c => c.id)
    );
    clients.forEach(c => { c.is_top5 = top5.has(c.id); });

    return res.status(200).json({ clients, online: clients.filter(c => c.status === 'Online').length });
  } catch (error) {
    console.error('[Machine Error] Failed to get clients:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getAllMachines,
  getClients
};
