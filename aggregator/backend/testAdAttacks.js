require('dotenv').config();
const db = require('./src/config/db');

async function test() {
  try {
    const from = '2026-07-09 09:51:27';
    const to = '2026-07-10 09:51:27';
    const limit = 3000;
    
    let sql = `SELECT e.id, e.machine, e.ts, e.tag, e.severity, e.message,
                      i.id as incident_id, i.assigned_to as incident_assigned_to, i.status as incident_status
      FROM events e
      LEFT JOIN incident_events ie ON ie.event_id = e.id::TEXT
      LEFT JOIN incidents i ON i.id = ie.incident_id
      WHERE e.ts>=$1 AND e.ts<=$2 AND e.is_noise=0
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
    sql += ` ORDER BY e.ts DESC LIMIT $${pIdx}`;
    params.push(limit);

    const res = await db.query(sql, params);
    console.log("SUCCESS:", res.rows.length);
  } catch(e) {
    console.error("ERROR:", e);
  }
  process.exit(0);
}
test();
