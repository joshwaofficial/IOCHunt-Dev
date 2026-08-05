const axios = require('axios');
const https = require('https');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4001';
const API_KEY = process.env.API_KEY;
const TENANT_ID = process.env.TENANT_ID || 'default';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const adAttacks = [
  { tag: '[DOMAIN][DCSYNC]', message: "Directory Service Access DCSYNC simulated by 'hacker_admin'" },
  { tag: '[DOMAIN][KERBEROASTING]', message: "Kerberos Service Ticket Requested (Kerberoast) simulated from 'j.doe'" },
  { tag: '[ADCS][ESC1]', message: "Certificate requested using ESC1 vulnerable template requester='m.smith'" },
  { tag: '[LOGON][SPRAY]', message: 'Password Spray simulated from 192.168.1.100' },
  { tag: '[DOMAIN][NTLM-BRUTE]', message: "NTLM brute force detected workstation 'WIN-ATTACKER'" },
];

const malicious = [
  { tag: '[CMD-EXEC][SENSITIVE]', message: 'Process Create: powershell.exe -enc <malicious>' },
  { tag: '[DETECTED]', message: 'MIMIKATZ found in memory' },
  { tag: '[DEFENDER][DETECTED]', message: 'THREAT: Trojan:Win32/Emotet detected' },
  { tag: '[DEFENDER]', message: '[RTP-DISABLED] Real-time protection was disabled' },
  { tag: '[DEFENDER]', message: '[SETTINGS-CHANGE] Exclusion path added' },
  { tag: '[NETWORK][OUTBOUND]', message: 'Network Connection to suspicious IP 198.51.100.44' },
  { tag: '[PERSISTENCE]', message: 'New registry run key added HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
  { tag: 'UNSIGNED', message: 'Unsigned binary executed from temp folder C:\\Users\\Temp\\loader.exe' },
];

const usb = [
  { tag: '[USB]', message: 'USB Device Inserted: KINGSTON DRIVE' },
  { tag: '[USB-REMOVED]', message: 'USB Device Removed: KINGSTON DRIVE' },
  { tag: '[USB]', message: 'THREAT Found on Removable Drive D: (Autorun.inf)' },
  { tag: '[USB]', message: 'SUSPICIOUS activity on Removable Media' },
];

const users = [
  { tag: '[USER-CREATED]', message: 'A user account was created: hacker_admin' },
  { tag: '[PASSWORD-RESET]', message: 'An attempt was made to reset an accounts password' },
  { tag: '[GROUP-MEMBER]', message: 'User added to Domain Admins' },
  { tag: '[USER-DELETED]', message: 'User account deleted' },
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
  console.log(`📡 Sending mock logs to ${SERVER_URL} (Tenant: ${TENANT_ID})...`);
  let totalSent = 0;
  const machineCount = 5;
  const eventsPerMachine = 20;

  for (let i = 1; i <= machineCount; i++) {
    const machineName = `MOCK-ENDPOINT-${i.toString().padStart(2, '0')}`;
    const events = [];
    for (let j = 0; j < eventsPerMachine; j++) {
      events.push(getRandomEvent());
    }

    try {
      await axios.post(`${SERVER_URL}/api/logs`, {
        machine: machineName,
        label: `Simulated Workstation ${i}`,
        tenant_id: TENANT_ID,
        events: events
      }, {
        headers: {
          'x-api-key': API_KEY,
          'x-tenant-id': TENANT_ID
        },
        httpsAgent
      });
      totalSent += events.length;
      console.log(`Sent ${events.length} logs from ${machineName}`);
    } catch (err) {
      console.error(`Failed to send from ${machineName}:`, err.message);
    }
  }

  console.log(`\n🎉 Total mock logs sent successfully: ${totalSent}`);
}

sendLogs();
