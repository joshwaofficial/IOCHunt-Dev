const db = require('../backend/src/config/db');
const { getAggregatorPool } = require('../backend/src/config/aggregatorDbManager');

const AGG_NAME = 'whitehouse_mumbai';

const events = [
  { tag: '[DOMAIN][KERBEROASTING]', severity: 'critical', message: "Kerberos TGS request with RC4 encryption targeting SPN: HTTP/soc.mumbai.local requester='admin'", machine: 'MUM-DC-01' },
  { tag: '[DETECTED]', severity: 'high', message: "Suspicious LSASS memory dump attempt detected from MUM-SOC-01", machine: 'MUM-SOC-01' },
  { tag: '[NETWORK][OUTBOUND]', severity: 'critical', message: "Encrypted C2 Beacon connection initiated to 198.51.100.99:443", machine: 'MUM-SOC-01' },
  { tag: '[USB]', severity: 'medium', message: "Encrypted Kingston DataTraveler USB inserted into MUM-SOC-01", machine: 'MUM-SOC-01' },
  { tag: '[USER-CREATED]', severity: 'high', message: "Privileged domain account 'hacker_mumbai' was created outside standard maintenance hours", machine: 'MUM-DC-01' },
  { tag: '[GROUP-MEMBER]', severity: 'critical', message: "User 'hacker_mumbai' added to high-privilege group 'Enterprise Admins'", machine: 'MUM-DC-01' },
  { tag: '[PASSWORD-RESET]', severity: 'medium', message: "Password reset forced for VIP executive account 'mumbai.executive'", machine: 'MUM-DC-01' },
  { tag: '[RDP][BRUTEFORCE]', severity: 'high', message: "Excessive failed RDP login attempts (Event ID 4625) from unknown IP", machine: 'MUM-APP-01' },
  { tag: '[MALWARE][DETECTED]', severity: 'critical', message: "Ransomware behavior detected: Mass file encryption in C:\\Data\\", machine: 'MUM-FS-01' },
  { tag: '[DEFENDER][DISABLED]', severity: 'critical', message: "Windows Defender Real-time Protection was unexpectedly disabled", machine: 'MUM-APP-01' }
];

async function insertEvents(pool, isCentral) {
  for (const e of events) {
    const ts = new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString();
    
    if (isCentral) {
      await pool.query(`
        INSERT INTO events (machine, ts, tag, severity, message, is_noise, aggregator_name)
        VALUES ($1, $2, $3, $4, $5, false, $6)
      `, [e.machine, ts, e.tag, e.severity, e.message, AGG_NAME]);
    } else {
      try {
        await pool.query(`
          INSERT INTO events (machine, ts, tag, severity, message, is_noise, aggregator_name)
          VALUES ($1, $2, $3, $4, $5, false, $6)
        `, [e.machine, ts, e.tag, e.severity, e.message, AGG_NAME]);
      } catch (err) {
        if (err.message.includes('column "aggregator_name" of relation "events" does not exist')) {
          await pool.query(`
            INSERT INTO events (machine, ts, tag, severity, message, is_noise)
            VALUES ($1, $2, $3, $4, $5, false)
          `, [e.machine, ts, e.tag, e.severity, e.message]);
        } else {
          throw err;
        }
      }
    }
  }
}

async function run() {
  console.log(`Simulating real agent data for ${AGG_NAME}...`);
  
  // Clean up bad data first
  try {
    await db.query("DELETE FROM events WHERE aggregator_name = 'whitehousemumbai'");
    await db.query("DELETE FROM machines WHERE aggregator_name = 'whitehousemumbai'");
  } catch(e) {}
  
  // 1. Central DB (db)
  try {
    for (const machine of ['MUM-DC-01', 'MUM-SOC-01', 'MUM-APP-01', 'MUM-FS-01']) {
      await db.query(`
        INSERT INTO machines (id, name, os, ip, "user", aggregator_name)
        VALUES ($1, $2, 'Windows Server 2022', '10.0.0.1', 'SYSTEM', $3)
        ON CONFLICT (id) DO NOTHING
      `, [machine, machine, AGG_NAME]);
    }
    await insertEvents(db, true);
    console.log("✅ Successfully injected data into Central Database");
  } catch (err) {
    console.error("❌ Failed to inject into Central DB:", err.message);
  }

  // 2. Branch DB
  try {
    const branchPool = getAggregatorPool(AGG_NAME);
    for (const machine of ['MUM-DC-01', 'MUM-SOC-01', 'MUM-APP-01', 'MUM-FS-01']) {
      try {
        await branchPool.query(`
          INSERT INTO machines (id, name, os, ip, "user", aggregator_name)
          VALUES ($1, $2, 'Windows Server 2022', '10.0.0.1', 'SYSTEM', $3)
          ON CONFLICT (id) DO NOTHING
        `, [machine, machine, AGG_NAME]);
      } catch (err) {
        if (err.message.includes('column "aggregator_name" of relation "machines" does not exist')) {
          await branchPool.query(`
            INSERT INTO machines (id, name, os, ip, "user")
            VALUES ($1, $2, 'Windows Server 2022', '10.0.0.1', 'SYSTEM')
            ON CONFLICT (id) DO NOTHING
          `, [machine, machine]);
        } else {
          throw err;
        }
      }
    }
    await insertEvents(branchPool, false);
    console.log(`✅ Successfully injected data into Branch Database (${AGG_NAME})`);
  } catch (err) {
    console.error("❌ Failed to inject into Branch DB:", err.message);
  }
  
  console.log("Simulation complete!");
  process.exit(0);
}

run();
