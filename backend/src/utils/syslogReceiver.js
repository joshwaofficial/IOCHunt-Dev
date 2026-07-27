const dgram = require('dgram');
const db = require('../config/db');
const { parseFwLog, batchIngestFw } = require('./fwWatcher');

async function initSyslogReceiver() {
  const SYSLOG_PORT = process.env.SYSLOG_PORT || 5514;
  const syslogServer = dgram.createSocket('udp4');
  
  syslogServer.on('error', (err) => {
    console.error('[SYSLOG-ERR]', err.message);
  });
  
  syslogServer.on('message', async (msg, rinfo) => {
    const lines = msg.toString('utf8').trim().split(/\r?\n/);

    // Look up timezone for this sender IP
    let sourceTZ = 'UTC';
    try {
      const regSrcRes = await db.query(
        "SELECT source_timezone FROM fw_sources WHERE name LIKE $1 OR log_path LIKE $2 LIMIT 1",
        [`%${rinfo.address}%`, `%${rinfo.address}%`]
      );
      if (regSrcRes.rows.length > 0) {
        sourceTZ = regSrcRes.rows[0].source_timezone || 'UTC';
      }
    } catch (err) {
      console.error('[SYSLOG] TZ lookup error:', err.message);
    }

    const rows = [];
    lines.forEach(line => {
      try { 
        const p = parseFwLog(line, rinfo.address, sourceTZ); 
        if (p) rows.push(p); 
      } catch (e) { }
    });
    
    if (rows.length) {
      try { 
        await batchIngestFw(rows); 
      } catch (e) {
        console.error('[SYSLOG] Ingest error:', e.message);
      }
    }
  });
  
  syslogServer.bind(SYSLOG_PORT, () => {
    console.log(`[SYSLOG] UDP listener on :${SYSLOG_PORT}`);
    console.log(`[SYSLOG] Forward 514: sudo iptables -t nat -A PREROUTING -p udp --dport 514 -j REDIRECT --to-port ${SYSLOG_PORT}`);
  });
}

module.exports = {
  initSyslogReceiver
};
