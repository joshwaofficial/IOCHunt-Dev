const axios = require('axios');
const https = require('https');

const API_KEY = 'iochunt-change-me';

const branches = [
  { name: 'chennai', port: 3005, machines: 30 },
  { name: 'mumbai', port: 3003, machines: 15 },
  { name: 'delhi', port: 3007, machines: 20 },
];

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const adAttacks = [
  { tag: '[DOMAIN][DCSYNC]', message: 'Directory Service Access DCSYNC simulated by \'hacker_admin\'' },
  { tag: '[DOMAIN][KERBEROASTING]', message: 'Kerberos Service Ticket Requested (Kerberoast) simulated from \'j.doe\'' },
  { tag: '[ADCS][ESC1]', message: 'Certificate requested using ESC1 vulnerable template requester=\'m.smith\'' },
  { tag: '[LOGON][SPRAY]', message: 'Password Spray simulated from 192.168.1.100' },
  { tag: '[DOMAIN][NTLM-BRUTE]', message: 'NTLM brute force detected workstation \'WIN-ATTACKER\'' },
];

const malicious = [
  { tag: '[CMD-EXEC][SENSITIVE]', message: 'Process Create: powershell.exe -enc <malicious>' },
  { tag: '[DETECTED]', message: 'MIMIKATZ found in memory' },
  { tag: '[DEFENDER][DETECTED]', message: 'THREAT: Trojan:Win32/Emotet detected' },
  { tag: '[DEFENDER]', message: '[RTP-DISABLED] Real-time protection was disabled' },
  { tag: '[DEFENDER]', message: '[SETTINGS-CHANGE] Exclusion path added' }, // Medium
  { tag: '[NETWORK][OUTBOUND]', message: 'Network Connection to suspicious IP' }, // Medium
  { tag: '[PERSISTENCE]', message: 'New registry run key added' }, // High
  { tag: 'UNSIGNED', message: 'Unsigned binary executed from temp folder' }, // High
];

const usb = [
  { tag: '[USB]', message: 'USB Device Inserted: KINGSTON DRIVE' }, // Low
  { tag: '[USB-REMOVED]', message: 'USB Device Removed: KINGSTON DRIVE' }, // Info
  { tag: '[USB]', message: 'THREAT Found on Removable Drive D: (Autorun.inf)' }, // High
  { tag: '[USB]', message: 'SUSPICIOUS activity on Removable Media' }, // High
];

const users = [
  { tag: '[USER-CREATED]', message: 'A user account was created: hacker_admin' }, // High
  { tag: '[PASSWORD-RESET]', message: 'An attempt was made to reset an accounts password' }, // High
  { tag: '[GROUP-MEMBER]', message: 'User added to Domain Admins' }, // High
  { tag: '[USER-DELETED]', message: 'User account deleted' }, // High
];

const allEvents = [...adAttacks, ...malicious, ...usb, ...users];

function getRandomEvent() {
  const ev = allEvents[Math.floor(Math.random() * allEvents.length)];
  return {
    ts: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
    tag: ev.tag,
    message: ev.message + ' (Mock ID: ' + Math.random().toString(36).substring(7) + ')'
  };
}

async function sendLogs() {
  let totalSent = 0;
  for (const branch of branches) {
    // Generate ~10000 events total per branch for a massive influx of data
    const eventsPerMachine = Math.floor(10000 / branch.machines);

    for (let i = 1; i <= branch.machines; i++) {
      const machineName = `MACHINE-${branch.name.toUpperCase()}-${i.toString().padStart(2, '0')}`;

      const events = [];
      for (let j = 0; j < eventsPerMachine; j++) {
        events.push(getRandomEvent());
      }

      try {
        await axios.post(`https://localhost:${branch.port}/api/logs`, {
          machine: machineName,
          label: `Simulated Machine ${i}`,
          events: events
        }, {
          headers: {
            'x-api-key': API_KEY
          },
          httpsAgent
        });
        totalSent += events.length;
        console.log(`Sent ${events.length} logs from ${machineName} to ${branch.name}`);
      } catch (err) {
        console.error(`Failed to send to ${branch.name} port ${branch.port}:`, err.message);
      }
    }
  }

  console.log(`Total logs sent: ${totalSent}`);
}

sendLogs();
