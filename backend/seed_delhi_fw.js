const { Pool } = require('pg');

const db = new Pool({
  connectionString: 'postgres://iochunt:iochunt_password@localhost:5433/iochunt_central',
});

async function run() {
  await db.query(`
    INSERT INTO fw_events (
      aggregator_name, ts, devname, src_ip, src_port, dst_ip, dst_port, 
      action, service, policy, proto, src_country, dst_country, 
      sent_bytes, rcv_bytes, duration, session_id, severity, raw
    ) VALUES
    ('delhi', '2026-07-22 10:15:00', 'DEL-FW-01', '10.1.0.55', '50123', '142.250.190.46', '443', 'accept', 'HTTPS', '1', '6', 'IN', 'US', 4500, 12000, 45, 'sess-100', 'notice', 'raw log data'),
    ('delhi', '2026-07-22 11:30:00', 'DEL-FW-01', '10.1.0.99', '49123', '8.8.8.8', '53', 'deny', 'DNS', '2', '17', 'IN', 'US', 60, 0, 0, 'sess-101', 'high', 'raw log data'),
    ('delhi', '2026-07-22 12:45:00', 'DEL-FW-02', '192.168.5.10', '3389', '10.1.0.50', '3389', 'deny', 'RDP', '3', '6', 'IN', 'IN', 120, 0, 0, 'sess-102', 'critical', 'raw log data');
  `);
  console.log("Inserted Delhi firewall logs into central DB.");
  process.exit(0);
}

run();
