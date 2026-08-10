const axios = require('axios');
const https = require('https');

const CHENNAI_URL = 'https://192.168.29.71:8083/api/logs';
// Uses the default agent API key from .env.example
const API_KEY = 'iochunt-change-me'; 

// Ignore self-signed certs since it's a local test environment
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const events = [
  { tag: '[DOMAIN][KERBEROASTING]', severity: 'critical', message: "Kerberos TGS request with RC4 encryption targeting SPN: HTTP/soc.chennai.local requester='admin'", machine: 'CHN-DC-01' },
  { tag: '[DETECTED]', severity: 'high', message: "Suspicious LSASS memory dump attempt detected from CHN-SOC-01", machine: 'CHN-SOC-01' },
  { tag: '[NETWORK][OUTBOUND]', severity: 'critical', message: "Encrypted C2 Beacon connection initiated to 198.51.100.99:443", machine: 'CHN-SOC-01' },
  { tag: '[USB]', severity: 'medium', message: "Encrypted Kingston DataTraveler USB inserted into CHN-SOC-01", machine: 'CHN-SOC-01' },
  { tag: '[USER-CREATED]', severity: 'high', message: "Privileged domain account 'hacker_chennai' was created outside standard maintenance hours", machine: 'CHN-DC-01' },
  { tag: '[GROUP-MEMBER]', severity: 'critical', message: "User 'hacker_chennai' added to high-privilege group 'Enterprise Admins'", machine: 'CHN-DC-01' },
  { tag: '[PASSWORD-RESET]', severity: 'medium', message: "Password reset forced for VIP executive account 'chennai.executive'", machine: 'CHN-DC-01' },
  { tag: '[RDP][BRUTEFORCE]', severity: 'high', message: "Excessive failed RDP login attempts (Event ID 4625) from unknown IP", machine: 'CHN-APP-01' },
  { tag: '[MALWARE][DETECTED]', severity: 'critical', message: "Ransomware behavior detected: Mass file encryption in C:\\Data\\", machine: 'CHN-FS-01' },
  { tag: '[DEFENDER][DISABLED]', severity: 'critical', message: "Windows Defender Real-time Protection was unexpectedly disabled", machine: 'CHN-APP-01' }
];

async function run() {
  console.log(`Sending real simulated agent logs to Chennai branch aggregator at ${CHENNAI_URL}...`);
  
  // Group events by machine to mimic a real agent payload
  const machines = ['CHN-DC-01', 'CHN-SOC-01', 'CHN-APP-01', 'CHN-FS-01'];
  
  for (const machine of machines) {
    const machineEvents = events.filter(e => e.machine === machine).map(e => ({
      ...e,
      // Randomize timestamp within the last hour
      ts: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString()
    }));
    
    if (machineEvents.length > 0) {
      try {
        const payload = {
          machine: machine,
          label: machine,
          events: machineEvents
        };
        
        await axios.post(CHENNAI_URL, payload, {
          headers: { 'x-api-key': API_KEY },
          httpsAgent
        });
        
        console.log(`✅ Successfully sent ${machineEvents.length} logs from agent ${machine}`);
      } catch (err) {
        console.error(`❌ Failed to send logs for ${machine}:`, err.message);
      }
    }
  }
  
  console.log("Simulation complete! Check the Chennai dashboard.");
}

run();
