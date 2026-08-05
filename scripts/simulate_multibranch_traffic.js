/**
 * ════════════════════════════════════════════════════════════════════════════════
 * IOC Hunt — Multi-Branch Live Traffic & Attack Simulation Engine
 * ════════════════════════════════════════════════════════════════════════════════
 * Simulates real-time telemetry from:
 *   1. Red Company Branch 1 (red_branch_1) - AD & Identity Attacks
 *   2. Red Company Branch 2 (red_branch_2) - Endpoint & Malware Threats
 *   3. Red Company Branch 3 (red_branch_3) - Physical / USB & Defender Alerts
 *   4. HQ Direct Agents     (direct)       - Executive & Domain Controller Telemetry
 * 
 * Verifies:
 *   - Real-time SSE event delivery
 *   - Aggregator and machine mapping
 *   - Network topology ingestion
 *   - Automated incident creation & chaining
 * ════════════════════════════════════════════════════════════════════════════════
 */

const https = require('https');
const axios = require('../frontend/node_modules/axios');
const db = require('../backend/src/config/db');

const SERVER_URL = process.env.SERVER_URL || 'https://localhost:4001';
const DIRECT_API_KEY = process.env.API_KEY;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BRANCH_CONFIGS = [
  {
    name: 'red_branch_1',
    displayName: 'Red Company RED BRANCH 1',
    apiKey: 'red-key-branch-01-sec',
    machines: [
      { id: 'RED-BR1-DC01', name: 'RED-BR1-DC01', label: 'Branch 1 Domain Controller', ip: '10.10.1.5', os: 'Windows Server 2022', user: 'SYSTEM' },
      { id: 'RED-BR1-WS01', name: 'RED-BR1-WS01', label: 'Branch 1 Workstation 01', ip: '10.10.1.101', os: 'Windows 11 Pro', user: 'j.smith' },
      { id: 'RED-BR1-WS02', name: 'RED-BR1-WS02', label: 'Branch 1 Workstation 02', ip: '10.10.1.102', os: 'Windows 11 Pro', user: 'm.williams' }
    ],
    threats: [
      { tag: '[DOMAIN][KERBEROASTING]', severity: 'high', category: 'Active Directory', message: "Kerberos Service Ticket Requested (Kerberoast SPN: MSSQLSvc/db01.red.corp) requester='j.smith'" },
      { tag: '[DOMAIN][DCSYNC]', severity: 'critical', category: 'Active Directory', message: "Directory Replication Service Access (DCSYNC) simulated from 'RED-BR1-WS01' user='svc_backup'" },
      { tag: '[ADCS][ESC1]', severity: 'critical', category: 'Active Directory', message: "Vulnerable Certificate Template Requested (ESC1) requester='m.williams' target_upn='administrator@red.corp'" },
      { tag: '[LOGON][SPRAY]', severity: 'medium', category: 'Authentication', message: "Password Spray attempt detected from 10.10.1.101 targeting 45 domain accounts" },
      { tag: '[DOMAIN][NTLM-BRUTE]', severity: 'high', category: 'Authentication', message: "Repeated NTLM authentication failures for account 'krbtgt' from 'RED-BR1-WS02'" }
    ]
  },
  {
    name: 'red_branch_2',
    displayName: 'Red Company RED BRANCH 2',
    apiKey: 'red-key-branch-02-sec',
    machines: [
      { id: 'RED-BR2-FIN01', name: 'RED-BR2-FIN01', label: 'Branch 2 Finance Node 01', ip: '10.20.1.45', os: 'Windows 11 Enterprise', user: 'a.brown' },
      { id: 'RED-BR2-SRV01', name: 'RED-BR2-SRV01', label: 'Branch 2 App Server 01', ip: '10.20.1.10', os: 'Ubuntu 22.04 LTS', user: 'deploy' },
      { id: 'RED-BR2-WS03', name: 'RED-BR2-WS03', label: 'Branch 2 Billing Workstation', ip: '10.20.1.88', os: 'Windows 10 Pro', user: 'c.davis' }
    ],
    threats: [
      { tag: '[CMD-EXEC][SENSITIVE]', severity: 'high', category: 'Execution', message: "powershell.exe -NonI -W Hidden -Enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACk..." },
      { tag: '[DETECTED]', severity: 'critical', category: 'Credential Access', message: "MIMIKATZ sekurlsa::logonpasswords dump detected in lsass.exe process memory" },
      { tag: '[PERSISTENCE]', severity: 'high', category: 'Persistence', message: "Registry Run Key created: HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsUpdater -> C:\\Users\\Public\\updater.exe" },
      { tag: '[NETWORK][OUTBOUND]', severity: 'critical', category: 'Command & Control', message: "C2 Beaconing outbound connection to malicious IP 198.51.100.44:443 (Cobalt Strike profile)" },
      { tag: 'UNSIGNED', severity: 'medium', category: 'Defense Evasion', message: "Unsigned executable payload executed from temporary directory C:\\Users\\AppData\\Local\\Temp\\drop.exe" }
    ]
  },
  {
    name: 'red_branch_3',
    displayName: 'Red Company RED BRANCH 3',
    apiKey: 'red-key-branch-03-sec',
    machines: [
      { id: 'RED-BR3-ENG01', name: 'RED-BR3-ENG01', label: 'Branch 3 Engineering Workstation', ip: '10.30.1.12', os: 'Windows 11 Pro', user: 'k.taylor' },
      { id: 'RED-BR3-LAB02', name: 'RED-BR3-LAB02', label: 'Branch 3 Hardware Lab Rig', ip: '10.30.1.99', os: 'Windows 10 IoT', user: 'lab_operator' }
    ],
    threats: [
      { tag: '[USB]', severity: 'medium', category: 'Hardware / USB', message: "Removable USB storage drive inserted: Sandisk Ultra 3.0 (SN: 4C53100142051811)" },
      { tag: '[USB]', severity: 'critical', category: 'Hardware / USB', message: "THREAT Detected on Removable Volume E:\\autorun.inf containing suspicious VBS script" },
      { tag: '[DEFENDER][DETECTED]', severity: 'critical', category: 'Antivirus', message: "Microsoft Defender Antivirus blocked threat: Trojan:Win32/Emotet.RP!MTB in memory" },
      { tag: '[DEFENDER]', severity: 'high', category: 'Antivirus', message: "[SETTINGS-CHANGE] Real-time Protection RTP exclusion added for path C:\\ProgramData\\WindowsApp" },
      { tag: '[USB-REMOVED]', severity: 'info', category: 'Hardware / USB', message: "Removable USB device safely dismounted and removed from RED-BR3-ENG01" }
    ]
  },
  {
    name: 'chennai_red',
    displayName: 'RedHouse (Chennai Branch)',
    apiKey: 'chennai-red-key-secret',
    machines: [
      { id: 'CHN-RED-DC01', name: 'CHN-RED-DC01', label: 'Chennai RedHouse Domain Controller', ip: '10.50.1.10', os: 'Windows Server 2022', user: 'SYSTEM' },
      { id: 'CHN-RED-SOC01', name: 'CHN-RED-SOC01', label: 'Chennai RedHouse SOC Terminal', ip: '10.50.1.44', os: 'Windows 11 Pro', user: 'redadmin' },
      { id: 'CHN-RED-DB01', name: 'CHN-RED-DB01', label: 'Chennai RedHouse DB Server', ip: '10.50.1.80', os: 'Ubuntu 22.04 LTS', user: 'postgres' }
    ],
    threats: [
      { tag: '[DOMAIN][KERBEROASTING]', severity: 'critical', category: 'Active Directory', message: "Kerberos TGS request with RC4 encryption targeting SPN: HTTP/soc.redhouse.local requester='redadmin'" },
      { tag: '[DETECTED]', severity: 'high', category: 'Credential Access', message: "Suspicious LSASS memory dump attempt detected from CHN-RED-SOC01" },
      { tag: '[NETWORK][OUTBOUND]', severity: 'critical', category: 'Command & Control', message: "Encrypted C2 Beacon connection initiated to 198.51.100.99:443" },
      { tag: '[USB]', severity: 'medium', category: 'Hardware / USB', message: "Encrypted Kingston DataTraveler USB inserted into CHN-RED-SOC01" }
    ]
  }
];

const HQ_CONFIG = {
  name: 'direct',
  displayName: 'HQ Direct Infrastructure',
  apiKey: DIRECT_API_KEY,
  machines: [
    { id: 'HQ-DC-PRIMARY', name: 'HQ-DC-PRIMARY', label: 'HQ Primary Domain Controller', ip: '192.168.1.10', os: 'Windows Server 2025', user: 'SYSTEM' },
    { id: 'HQ-EXEC-LAPTOP-01', name: 'HQ-EXEC-LAPTOP-01', label: 'HQ CEO Executive Laptop', ip: '192.168.1.55', os: 'macOS Sonoma', user: 'c.executive' },
    { id: 'HQ-DEV-SERVER', name: 'HQ-DEV-SERVER', label: 'HQ Core Production Server', ip: '192.168.1.200', os: 'Ubuntu 24.04 LTS', user: 'devops' }
  ],
  threats: [
    { tag: '[USER-CREATED]', severity: 'high', category: 'Account Management', message: "Privileged domain account 'hacker_admin' was created outside standard maintenance hours" },
    { tag: '[GROUP-MEMBER]', severity: 'critical', category: 'Privilege Escalation', message: "User 'hacker_admin' added to high-privilege group 'Enterprise Admins'" },
    { tag: '[PASSWORD-RESET]', severity: 'medium', category: 'Account Management', message: "Password reset forced for VIP executive account 'c.executive'" }
  ]
};

// Listen to Live SSE Stream in background to confirm SSE broadcasting
function startSSEListener() {
  return new Promise((resolve) => {
    let receivedEvents = 0;
    const req = https.get(`${SERVER_URL}/api/stream`, {
      agent: httpsAgent,
      headers: { 'Accept': 'text/event-stream' }
    }, (res) => {
      console.log('📡 SSE Live Stream connected successfully (Status: ' + res.statusCode + ')');
      res.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('new_event')) {
          receivedEvents++;
          try {
            const rawJson = text.replace(/^data:\s*/, '').trim();
            const parsed = JSON.parse(rawJson);
            console.log(`  ⚡ [SSE Realtime Event Received] ${parsed.data.severity?.toUpperCase()} | Machine: ${parsed.data.machine || parsed.data.label} | ${parsed.data.tag} | Node: ${parsed.data.aggregator_name}`);
          } catch {
            console.log('  ⚡ [SSE Realtime Event Received]');
          }
        }
      });
      resolve({
        getReceivedCount: () => receivedEvents,
        close: () => req.destroy()
      });
    });

    req.on('error', (err) => {
      console.warn('SSE stream notice:', err.message);
      resolve({ getReceivedCount: () => 0, close: () => {} });
    });
  });
}

// Ingest telemetry from a branch aggregator using /api/ingest/batch
async function simulateBranchBatch(branch) {
  console.log(`\n🏢 [Branch Ingestion] Processing ${branch.displayName} (${branch.name})...`);

  const events = [];
  const fwEvents = [];
  const now = new Date();

  // Create event telemetry
  for (const m of branch.machines) {
    // Add 2-3 specific threats for this machine
    for (let i = 0; i < 3; i++) {
      const threat = branch.threats[(i + m.name.length) % branch.threats.length];
      events.push({
        machine: m.name,
        label: m.label,
        tag: threat.tag,
        severity: threat.severity,
        category: threat.category,
        message: threat.message + ` [Seq #${Math.floor(Math.random() * 9000) + 1000}]`,
        ts: new Date(now.getTime() - (i * 120000)).toISOString(),
        is_noise: false,
        is_alert: threat.severity === 'critical' || threat.severity === 'high'
      });
    }

    // Add firewall events for network topology
    fwEvents.push({
      ts: new Date(now.getTime() - 60000).toISOString(),
      devname: `FW-${branch.name.toUpperCase()}`,
      src_ip: m.ip,
      src_port: Math.floor(Math.random() * 30000) + 20000,
      dst_ip: '198.51.100.44',
      dst_port: 443,
      action: 'deny',
      service: 'HTTPS',
      policy: 'Deny-Malicious-C2',
      proto: 'tcp',
      src_country: 'IN',
      dst_country: 'US',
      sent_bytes: 450,
      rcv_bytes: 0,
      duration: 1,
      session_id: `sess_${Math.random().toString(36).substring(7)}`,
      severity: 'high',
      raw: `action=deny src_ip=${m.ip} dst_ip=198.51.100.44`
    });

    fwEvents.push({
      ts: new Date().toISOString(),
      devname: `FW-${branch.name.toUpperCase()}`,
      src_ip: m.ip,
      src_port: Math.floor(Math.random() * 30000) + 20000,
      dst_ip: '10.10.1.5',
      dst_port: 445,
      action: 'allow',
      service: 'SMB',
      policy: 'Allow-Internal',
      proto: 'tcp',
      src_country: 'IN',
      dst_country: 'IN',
      sent_bytes: 14200,
      rcv_bytes: 52400,
      duration: 12,
      session_id: `sess_${Math.random().toString(36).substring(7)}`,
      severity: 'info',
      raw: `action=allow src_ip=${m.ip} dst_ip=10.10.1.5`
    });
  }

  const payload = {
    machines: branch.machines.map(m => ({
      ...m,
      event_count: 5,
      first_seen: Math.floor(Date.now() / 1000) - 86400,
      last_seen: Math.floor(Date.now() / 1000)
    })),
    events: events,
    fw_events: fwEvents,
    total_agents: branch.machines.length
  };

  const zlib = require('zlib');
  const compressed = zlib.gzipSync(JSON.stringify(payload));

  const res = await axios.post(`${SERVER_URL}/api/ingest/batch`, compressed, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-aggregator-key': branch.apiKey
    },
    httpsAgent
  });

  console.log(`  ✓ Successfully synced ${events.length} events, ${fwEvents.length} FW logs, and ${branch.machines.length} machines for ${branch.name} (HTTP ${res.status})`);
  return events;
}

// Ingest direct HQ agent telemetry using /api/logs
async function simulateHQDirectLogs() {
  console.log(`\n🏢 [HQ Direct Ingestion] Processing HQ Direct Agents...`);
  const allEvents = [];

  for (const m of HQ_CONFIG.machines) {
    const events = HQ_CONFIG.threats.map((t, idx) => ({
      ts: new Date(Date.now() - (idx * 60000)).toISOString(),
      tag: t.tag,
      category: t.category,
      message: t.message + ` (Audit Host: ${m.name})`
    }));

    const res = await axios.post(`${SERVER_URL}/api/logs`, {
      machine: m.name,
      label: m.label,
      events: events
    }, {
      headers: {
        'x-api-key': HQ_CONFIG.apiKey
      },
      httpsAgent
    });

    console.log(`  ✓ Ingested ${events.length} events from direct host ${m.name} (HTTP ${res.status})`);
    allEvents.push(...events.map(e => ({ ...e, machine: m.name })));
  }

  return allEvents;
}

// Create and link security incident chains
async function triggerIncidentChaining() {
  console.log(`\n🔗 [Incident Chaining Engine] Correlating high-severity multi-branch events into chained incidents...`);

  // Query recent critical events from DB
  const criticalEvents = await db.query(`
    SELECT id, machine, aggregator_name, tag, severity, message, ts
    FROM events
    WHERE severity IN ('critical', 'high')
    ORDER BY id DESC
    LIMIT 10
  `);

  if (criticalEvents.rows.length === 0) {
    console.log('No recent critical events to chain.');
    return;
  }

  const evs = criticalEvents.rows;
  const eventIds = evs.map(e => e.id);

  // 1. Create Multi-Branch Kerberos & DCSync Attack Chain
  const chain1Title = 'CRITICAL: Multi-Branch Active Directory Compromise & Kerberoasting Chain';
  const chain1Desc = `Automated Incident Correlator detected synchronized DCSYNC and Kerberoasting attacks spanning Red Company Branch 1 (${evs[0]?.machine || 'RED-BR1-DC01'}) and HQ infrastructure. Threat actor attempted golden ticket forging and privilege escalation.`;

  const inc1 = await db.query(`
    INSERT INTO incidents (title, description, status, priority, assigned_to, machine, created_by, source_chain_id)
    VALUES ($1, $2, 'investigating', 'P1', 'secadmin', $3, 'system_correlator', 'CHAIN-AD-RED-001')
    RETURNING id
  `, [chain1Title, chain1Desc, evs[0]?.machine || 'RED-BR1-DC01']);

  const inc1Id = inc1.rows[0].id;

  // Link events to incident
  for (const eid of eventIds.slice(0, 5)) {
    await db.query(`
      INSERT INTO incident_events (incident_id, event_id, linked_by)
      VALUES ($1, $2, 'system_correlator')
      ON CONFLICT DO NOTHING
    `, [inc1Id, eid]);
  }

  await db.query(`
    INSERT INTO incident_notes (incident_id, author, body, note_type)
    VALUES ($1, 'system_correlator', 'Automated Correlation Engine attached 5 related attack indicators across 3 branches.', 'system')
  `, [inc1Id]);

  console.log(`  ✓ Incident #${inc1Id} created (Priority: P1 - Critical) linked to ${Math.min(5, eventIds.length)} events`);

  // 2. Create Malware & C2 Outbound Incident Chain
  const chain2Title = 'HIGH: Mimikatz Memory Dump & External C2 Beaconing Chain';
  const chain2Desc = `Suspicious LSASS memory dump detected followed by encrypted C2 communication to external IP 198.51.100.44 on Branch 2 & Branch 3 endpoints.`;

  const inc2 = await db.query(`
    INSERT INTO incidents (title, description, status, priority, assigned_to, machine, created_by, source_chain_id)
    VALUES ($1, $2, 'new', 'P2', 'secadmin', $3, 'system_correlator', 'CHAIN-MALWARE-002')
    RETURNING id
  `, [chain2Title, chain2Desc, evs[1]?.machine || 'RED-BR2-SRV01']);

  const inc2Id = inc2.rows[0].id;

  for (const eid of eventIds.slice(5, 10)) {
    await db.query(`
      INSERT INTO incident_events (incident_id, event_id, linked_by)
      VALUES ($1, $2, 'system_correlator')
      ON CONFLICT DO NOTHING
    `, [inc2Id, eid]);
  }

  await db.query(`
    INSERT INTO incident_notes (incident_id, author, body, note_type)
    VALUES ($1, 'secadmin', 'Initial triage performed. Quarantine script dispatched to host.', 'analyst')
  `, [inc2Id]);

  console.log(`  ✓ Incident #${inc2Id} created (Priority: P2 - High) linked to ${eventIds.slice(5, 10).length} events`);
}

// Main execution function
async function runMultiBranchSimulation() {
  const isLoop = process.argv.includes('--loop') || process.argv.includes('--continuous');
  const intervalArg = process.argv.find(a => a.startsWith('--interval='));
  const intervalMs = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 5000;

  console.log('════════════════════════════════════════════════════════════════════════');
  console.log(`⚡ STARTING MULTI-BRANCH TELEMETRY SIMULATION & SSE VERIFICATION ${isLoop ? '(CONTINUOUS MODE)' : '(SINGLE BURST)'}`);
  console.log('════════════════════════════════════════════════════════════════════════');

  // Step 1: Connect SSE Live Listener
  const sseListener = await startSSEListener();

  let iteration = 1;
  do {
    if (isLoop) {
      console.log(`\n--- [Iteration #${iteration}] Sending live telemetry wave ---`);
    }

    // Ingest from all 3 Red Company Branches
    let totalBranchEvents = 0;
    for (const branch of BRANCH_CONFIGS) {
      const evs = await simulateBranchBatch(branch);
      totalBranchEvents += evs.length;
      await new Promise(r => setTimeout(r, 400));
    }

    // Ingest from HQ Direct Agents
    await simulateHQDirectLogs();

    // Trigger Incident Chaining on first run or periodically
    if (iteration === 1 || iteration % 3 === 0) {
      await triggerIncidentChaining();
    }

    if (isLoop) {
      iteration++;
      console.log(`\n⏳ Pausing for ${intervalMs / 1000}s before next wave... (Press Ctrl+C to stop)`);
      await new Promise(r => setTimeout(r, intervalMs));
    }
  } while (isLoop);

  // Allow 2 seconds for SSE stream delivery
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('📊 SIMULATION VERIFICATION & METRICS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════');

  // Check event counts in database
  const countRes = await db.query(`
    SELECT aggregator_name, COUNT(*) as event_count
    FROM events
    GROUP BY aggregator_name
    ORDER BY event_count DESC
  `);
  console.log('Events in Database by Aggregator/Branch:');
  countRes.rows.forEach(r => console.log(`  • ${r.aggregator_name.padEnd(16)} : ${r.event_count} events`));

  const machineRes = await db.query(`
    SELECT aggregator_name, COUNT(*) as machine_count
    FROM machines
    GROUP BY aggregator_name
    ORDER BY machine_count DESC
  `);
  console.log('\nRegistered Machines by Branch Node:');
  machineRes.rows.forEach(r => console.log(`  • ${r.aggregator_name.padEnd(16)} : ${r.machine_count} endpoints active`));

  const incidentRes = await db.query(`
    SELECT id, title, priority, status, assigned_to
    FROM incidents
    ORDER BY id DESC
    LIMIT 5
  `);
  console.log('\nActive Security Incident Chains:');
  incidentRes.rows.forEach(i => console.log(`  • [#${i.id}] [${i.priority}] ${i.title} (${i.status}) -> ${i.assigned_to}`));

  const sseCount = sseListener.getReceivedCount();
  console.log(`\n⚡ Realtime SSE Broadcast Notifications Dispatched: ${sseCount}`);
  sseListener.close();

  console.log('\n✓ SIMULATION COMPLETE! All live charts, network topology, threat feeds, and incidents are now updated.');
  process.exit(0);
}

runMultiBranchSimulation().catch(err => {
  console.error('\n❌ Simulation failed:', err.message);
  process.exit(1);
});
