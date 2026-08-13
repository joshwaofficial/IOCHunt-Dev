const dgram = require('dgram');
const db = require('../config/db'); // Control plane database
const { parseFwLog } = require('./fwWatcher');
const { publishToStream } = require('../services/redisIngestion');

async function initSyslogReceiver() {
  console.log('[SYSLOG] Starting multi-tenant syslog receiver...');
  
  // 1. Fetch active port mappings from the control plane
  let portMappings = [];
  try {
    const res = await db.query(
      'SELECT port, tenant_id FROM syslog_port_map WHERE enabled = TRUE AND protocol = $1',
      ['udp']
    );
    portMappings = res.rows;
  } catch (err) {
    console.error('[SYSLOG] Failed to load port mappings:', err.message);
    return;
  }

  if (portMappings.length === 0) {
    console.log('[SYSLOG] No active syslog ports configured in control plane.');
    return;
  }

  // 2. Start a UDP listener for each configured port
  for (const mapping of portMappings) {
    const { port, tenant_id } = mapping;
    const syslogServer = dgram.createSocket('udp4');
    
    syslogServer.on('error', (err) => {
      console.error(`[SYSLOG-ERR] Port ${port}:`, err.message);
    });
    
    syslogServer.on('message', async (msg, rinfo) => {
      const lines = msg.toString('utf8').trim().split(/\r?\n/);
      const rows = [];

      lines.forEach(line => {
        try { 
          // Default to UTC since tenant-specific TZ lookup is now handled later or standardized
          const p = parseFwLog(line, rinfo.address, 'UTC'); 
          if (p) rows.push(p); 
        } catch (e) { }
      });
      
      if (rows.length) {
        try {
          // Publish to Redis Stream for bulk ingestion
          await publishToStream('ingest:syslog', tenant_id, rows);
        } catch (e) {
          console.error(`[SYSLOG] Redis publish error on port ${port}:`, e.message);
        }
      }
    });
    
    syslogServer.bind(port, () => {
      console.log(`[SYSLOG] UDP listener for tenant ${tenant_id} bound on :${port}`);
    });
  }
}

module.exports = {
  initSyslogReceiver
};
