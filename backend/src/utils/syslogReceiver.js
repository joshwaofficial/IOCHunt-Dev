const dgram = require('dgram');
const db = require('../config/db'); // Control plane database
const { parseFwLog, batchIngestFw } = require('./fwWatcher');
const { publishToStream } = require('../services/redisIngestion');

const activeListeners = new Map(); // port -> socket

function startListenerOnPort(port, tenantId) {
  const p = Number(port);
  if (!p || isNaN(p)) return;
  if (activeListeners.has(p)) return;

  const syslogServer = dgram.createSocket('udp4');
  
  syslogServer.on('error', (err) => {
    console.error(`[SYSLOG-ERR] Port ${p}:`, err.message);
  });
  
  syslogServer.on('message', async (msg, rinfo) => {
    const rawText = msg.toString('utf8').trim();
    const lines = rawText.split(/\r?\n/);
    const rows = [];

    lines.forEach(line => {
      try { 
        const parsed = parseFwLog(line, rinfo.address, 'UTC'); 
        if (parsed) {
          parsed.raw = parsed.raw || line;
          rows.push(parsed);
        }
      } catch (e) { }
    });
    
    if (rows.length) {
      console.log(`[SYSLOG] Received ${rows.length} firewall event(s) from ${rinfo.address} on port ${p} (Tenant: ${tenantId})`);
      
      try {
        await publishToStream('ingest:syslog', tenantId, rows);
      } catch (e) {
        console.warn(`[SYSLOG] Redis stream publish error on port ${p}, falling back to direct DB insert:`, e.message);
        try {
          await batchIngestFw(rows);
        } catch (dbErr) {
          console.error(`[SYSLOG] Direct DB insert failed:`, dbErr.message);
        }
      }
    }
  });
  
  try {
    syslogServer.bind(p, () => {
      console.log(`[SYSLOG] UDP listener bound on :${p} for tenant: ${tenantId}`);
      activeListeners.set(p, syslogServer);
    });
  } catch (err) {
    console.error(`[SYSLOG] Failed to bind port ${p}:`, err.message);
  }
}

async function initSyslogReceiver() {
  console.log('[SYSLOG] Starting multi-tenant syslog receiver...');
  
  // 1. Fetch active port mappings from the control plane
  let portMappings = [];
  try {
    const res = await db.query(
      'SELECT port, tenant_id FROM syslog_port_map WHERE enabled = TRUE AND protocol = $1',
      ['udp']
    );
    portMappings = res.rows || [];
  } catch (err) {
    console.warn('[SYSLOG] No control plane port mappings table or query error:', err.message);
  }

  // Ensure default container port 5514 is ALWAYS bound for default tenant
  const defaultPort = Number(process.env.SYSLOG_PORT || 5514);
  const defaultTenant = process.env.TENANT_ID || 'default';
  
  const hasDefaultPort = portMappings.some(m => Number(m.port) === defaultPort);
  if (!hasDefaultPort) {
    portMappings.unshift({ port: defaultPort, tenant_id: defaultTenant });
  }

  // Start listener for each configured port
  for (const mapping of portMappings) {
    const port = Number(mapping.port);
    const tenantId = mapping.tenant_id || defaultTenant;
    startListenerOnPort(port, tenantId);
  }
}

module.exports = {
  initSyslogReceiver,
  startListenerOnPort
};
