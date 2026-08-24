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

class Event {
  static async getAdAttacks(aggregator = '', machine = '', limit = 3000, from, to) {
    let sql = `SELECT e.id, e.machine, e.ts, e.tag, e.severity, e.message, e.aggregator_name,
                      i.id as incident_id, i.assigned_to as incident_assigned_to, i.status as incident_status
      FROM events e
      LEFT JOIN incident_events ie ON ie.event_id = e.id
      LEFT JOIN incidents i ON i.id = ie.incident_id
      WHERE e.ts>=$1 AND e.ts<=$2 AND e.is_noise=false
      AND (e.category='DOMAIN' OR e.category='ADCS'
        OR e.tag LIKE '%DCSYNC%' OR e.tag LIKE '%DCSHADOW%' OR e.tag LIKE '%KERBEROAST%'
        OR e.tag LIKE '%RBCD%' OR e.tag LIKE '%SPRAY%' OR e.tag LIKE '%NTLM-BRUTE%'
        OR e.tag LIKE '%SHADOW-CRED%' OR e.tag LIKE '%ESC1%' OR e.tag LIKE '%ESC2%'
        OR e.tag LIKE '%ESC3%' OR e.tag LIKE '%ESC6%' OR e.tag LIKE '%PKINIT%'
        OR e.tag LIKE '%GOLDEN-CERT%' OR e.tag LIKE '%CERTIPY%' OR e.tag LIKE '%LDAP-ENUM%'
        OR e.tag LIKE '%EXPLICIT-CRED%' OR e.tag LIKE '%COMPUTER-ACCT%'
        OR e.tag LIKE '%ASREP-ROAST%' OR e.tag LIKE '%OVERPASS-HASH%'
        OR e.tag LIKE '%PASS-THE-HASH%' OR e.tag LIKE '%FORGED-PAC%'
        OR e.tag LIKE '%KERB-POLICY%' OR e.tag LIKE '%SKELETON-KEY%')`;

    const params = [from, to];
    let pIdx = 3;
    if (aggregator) {
      sql += ` AND e.aggregator_name=$${pIdx++}`;
      params.push(aggregator);
    }
    if (machine) { 
      sql += ` AND (e.machine=$${pIdx} OR e.message LIKE $${pIdx+1})`; 
      params.push(machine, `%${machine}%`); 
      pIdx += 2;
    }
    sql += ` ORDER BY e.ts DESC LIMIT $${pIdx}`;
    params.push(limit);

    const pool = getDb(aggregator);
    const res = await pool.query(sql, params);
    return res.rows;
  }

  static async getMaliciousEvents(aggregator = '', machine = '', limit = 3000, from, to) {
    let sql = `SELECT e.id, e.machine, e.ts, e.tag, e.severity, e.category, e.message, e.aggregator_name,
                      i.id as incident_id, i.assigned_to as incident_assigned_to, i.status as incident_status
      FROM events e
      LEFT JOIN incident_events ie ON ie.event_id = e.id
      LEFT JOIN incidents i ON i.id = ie.incident_id
      WHERE e.ts>=$1 AND e.ts<=$2 AND e.is_noise=false AND e.category NOT IN ('DOMAIN','ADCS')
      AND (e.severity IN ('critical','high')
        OR (e.severity='medium' AND e.category IN ('PROCESSES','SERVICES','TASKS','STARTUP','SENSITIVE')))
      AND (e.tag LIKE '%DETECTED%' OR e.tag LIKE '%BLOCKED%' OR e.tag LIKE '%AUTO-BLOCKED%'
        OR e.tag LIKE '%SUSPICIOUS%' OR e.tag LIKE '%MALWARE%' OR e.tag LIKE '%BEHAVIORAL%'
        OR e.tag LIKE '%PERSISTENCE%' OR e.tag LIKE '%SENSITIVE%' OR e.tag LIKE '%HIGH-RISK%'
        OR e.tag LIKE '%NET-ADMIN-SHARE%' OR e.tag LIKE '%AFTER-HOURS%' OR e.tag LIKE '%FAILED-LOGON%'
        OR e.tag LIKE '%UNSIGNED%' OR e.tag LIKE '%DEFENDER%'
        OR e.category IN ('PROCESSES','SERVICES','TASKS','STARTUP','SENSITIVE','DEFENDER'))`;

    const params = [from, to];
    let pIdx = 3;
    if (aggregator) { sql += ` AND e.aggregator_name=$${pIdx++}`; params.push(aggregator); }
    if (machine) { sql += ` AND e.machine=$${pIdx++}`; params.push(machine); }
    sql += ` ORDER BY e.ts DESC LIMIT $${pIdx}`;
    params.push(limit);

    const pool = getDb(aggregator);
    const res = await pool.query(sql, params);
    return res.rows;
  }

  static async getUsbEvents(aggregator = '', machine = '', limit = 500, from, to) {
    let sql = `SELECT machine,ts,tag,severity,message,aggregator_name FROM events
      WHERE ts>=$1 AND ts<=$2 AND (category='USB' OR tag LIKE '%USB%')`;
    const params = [from, to];
    let pIdx = 3;
    if (aggregator) { sql += ` AND aggregator_name=$${pIdx++}`; params.push(aggregator); }
    if (machine) { sql += ` AND machine=$${pIdx++}`; params.push(machine); }
    sql += ` ORDER BY ts DESC LIMIT $${pIdx}`;
    params.push(limit);

    const pool = getDb(aggregator);
    const res = await pool.query(sql, params);
    return res.rows;
  }

  static async getUserEvents(aggregator = '', machine = '', limit = 500, from, to) {
    let sql = `SELECT machine,ts,tag,severity,message,aggregator_name FROM events WHERE ts>=$1 AND ts<=$2 AND is_noise=false
      AND (tag LIKE '%USER-CREATED%' OR tag LIKE '%USER-DELETED%'
        OR tag LIKE '%USER-ENABLED%' OR tag LIKE '%USER-DISABLED%'
        OR tag LIKE '%GROUP-MEMBER%' OR tag LIKE '%GROUP-CHANGED%'
        OR tag LIKE '%AUDIT-POLICY%' OR tag LIKE '%LOG-CLEARED%'
        OR tag LIKE '%PASSWORD-CHANGE%' OR tag LIKE '%PASSWORD-RESET%'
        OR tag LIKE '%USER-BURST%' OR tag LIKE '%ENUM%'
        OR (tag LIKE '%CONFIG-CHANGE%' AND (message LIKE '%user%' OR message LIKE '%group%' OR message LIKE '%password%')))`;

    const params = [from, to];
    let pIdx = 3;
    if (aggregator) { sql += ` AND aggregator_name=$${pIdx++}`; params.push(aggregator); }
    if (machine) { sql += ` AND machine=$${pIdx++}`; params.push(machine); }
    sql += ` ORDER BY ts DESC LIMIT $${pIdx}`;
    params.push(limit);

    const pool = getDb(aggregator);
    const res = await pool.query(sql, params);
    return res.rows;
  }

  static async getFirewallEvents(aggregator = '', limit = 100, offset = 0) {
    const pool = getDb(aggregator);
    const res = await pool.query(`
      SELECT * FROM fw_events
      ORDER BY ts DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return res.rows;
  }
}

module.exports = Event;
