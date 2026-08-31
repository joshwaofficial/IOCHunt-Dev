const dgram = require('dgram');
const db = require('../config/db'); // Control plane database
const { parseFwLog, batchIngestFw } = require('./fwWatcher');
const { publishToStream } = require('../services/redisIngestion');
const { isOnPrem, isAggregator } = require('../config/appMode');

async function initSyslogReceiver() {
  console.log('[SYSLOG] Starting syslog receiver...');
  
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

  // Ensure default container port 5514 is ALWAYS bound for the current/default tenant
  const defaultPort = Number(process.env.SYSLOG_PORT || 5514);
  const defaultTenant = process.env.TENANT_ID || 'default';
  
  const hasDefaultPort = portMappings.some(m => Number(m.port) === defaultPort);
  if (!hasDefaultPort) {
    portMappings.unshift({ port: defaultPort, tenant_id: defaultTenant });
  }

  // Also if in SaaS mode, allow all provisioned tenants to be reached on 5514 as fallback
  const boundPorts = new Set();

  // 2. Start a UDP listener for each configured port
  for (const mapping of portMappings) {
    const port = Number(mapping.port);
    const tenant_id = mapping.tenant_id || defaultTenant;
    
    if (boundPorts.has(port)) continue;
    boundPorts.add(port);

    const syslogServer = dgram.createSocket('udp4');
    
    syslogServer.on('error', (err) => {
      console.error(`[SYSLOG-ERR] Port ${port}:`, err.message);
    });
    
    syslogServer.on('message', async (msg, rinfo) => {
      const rawText = msg.toString('utf8').trim();
      const lines = rawText.split(/\r?\n/);
      const rows = [];

      lines.forEach(line => {
        try { 
          const p = parseFwLog(line, rinfo.address, 'UTC'); 
          if (p) {
            p.raw = p.raw || line;
            rows.push(p);
          }
        } catch (e) { }
      });
      
      if (rows.length) {
        console.log(`[SYSLOG] Received ${rows.length} firewall event(s) from ${rinfo.address} on port ${port} (Tenant: ${tenant_id})`);
        
        try {
          // Publish to Redis Stream for bulk ingestion
          await publishToStream('ingest:syslog', tenant_id, rows);
        } catch (e) {
          console.warn(`[SYSLOG] Redis stream publish error on port ${port}, attempting direct database insert:`, e.message);
          try {
            await batchIngestFw(rows);
          } catch (dbErr) {
            console.error(`[SYSLOG] Direct DB insert failed:`, dbErr.message);
          }
        }
      }
    });
    
    syslogServer.bind(port, () => {
      console.log(`[SYSLOG] UDP listener bound on :${port} for tenant: ${tenant_id}`);
    });
  }
}

module.exports = {
  initSyslogReceiver
};
