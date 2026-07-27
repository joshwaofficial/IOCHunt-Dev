const fs = require('fs');

const code = `const db = require('../config/db');
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function getCentralUrl() {
  const res = await db.query('SELECT central_server_url, central_api_key FROM settings LIMIT 1');
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

async function getMachinePolicy(req, res) {
  try {
    const machine = req.params.machine;
    const settings = await getCentralUrl();
    if (!settings || !settings.central_server_url) {
      return res.status(503).json({ error: 'Aggregator not configured with Central Server' });
    }
    
    const centralRes = await axios.get(\`\${settings.central_server_url}/api/policy/\${machine}\`, {
      headers: { 'Authorization': \`Bearer \${settings.central_api_key}\` },
      httpsAgent
    });
    
    res.json(centralRes.data);
  } catch (error) {
    console.error('[Policy Proxy] Failed to get machine policy:', error.message);
    res.status(500).json({ error: 'Failed to retrieve machine policy from Central Server' });
  }
}

async function updateMachineCurrentPolicy(req, res) {
  try {
    const machine = req.params.machine;
    const { policy } = req.body;
    
    const settings = await getCentralUrl();
    if (!settings || !settings.central_server_url) {
      return res.status(503).json({ error: 'Aggregator not configured with Central Server' });
    }
    
    const centralRes = await axios.post(\`\${settings.central_server_url}/api/policy/\${machine}/current\`, { policy }, {
      headers: { 'Authorization': \`Bearer \${settings.central_api_key}\` },
      httpsAgent
    });
    
    res.json(centralRes.data);
  } catch (error) {
    console.error('[Policy Proxy] Failed to update current policy:', error.message);
    res.status(500).json({ error: 'Failed to update current policy on Central Server' });
  }
}

async function setMachinePolicy(req, res) {
  return res.status(403).json({ error: 'Policy modification must be done from the Central Server.' });
}

async function ackMachinePolicy(req, res) {
  try {
    const machine = req.params.machine;
    const settings = await getCentralUrl();
    if (!settings || !settings.central_server_url) {
      return res.status(503).json({ error: 'Aggregator not configured with Central Server' });
    }
    
    const centralRes = await axios.patch(\`\${settings.central_server_url}/api/policy/\${machine}/ack\`, {}, {
      headers: { 'Authorization': \`Bearer \${settings.central_api_key}\` },
      httpsAgent
    });
    
    res.json(centralRes.data);
  } catch (error) {
    console.error('[Policy Proxy] Failed to ack policy:', error.message);
    res.status(500).json({ error: 'Failed to ack policy on Central Server' });
  }
}

async function getAllPolicies(req, res) {
  try {
    const settings = await getCentralUrl();
    if (!settings || !settings.central_server_url) {
      return res.status(503).json({ error: 'Aggregator not configured with Central Server' });
    }
    
    const centralRes = await axios.get(\`\${settings.central_server_url}/api/policy/\`, {
      headers: { 'Authorization': \`Bearer \${settings.central_api_key}\` },
      httpsAgent
    });
    
    res.json(centralRes.data);
  } catch (error) {
    console.error('[Policy Proxy] Failed to list policies:', error.message);
    res.status(500).json({ error: 'Failed to list policies from Central Server' });
  }
}

module.exports = {
  getMachinePolicy,
  updateMachineCurrentPolicy,
  setMachinePolicy,
  ackMachinePolicy,
  getAllPolicies
};
`;

fs.writeFileSync('src/controllers/policyController.js', code);
console.log('Done updating Aggregator policyController.js');
