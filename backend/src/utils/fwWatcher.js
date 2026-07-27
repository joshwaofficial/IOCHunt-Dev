const fs = require('fs');
const db = require('../config/db');
const { DateTime } = require('luxon');

const insertFwEventSql = `
  INSERT INTO fw_events (
    ts, devname, src_ip, src_port, dst_ip, dst_port, action, service, policy,
    proto, src_country, dst_country, sent_bytes, rcv_bytes, duration, session_id, severity, raw
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
`;

const updateSourceSql = `
  UPDATE fw_sources SET last_size=$1, last_read=$2, lines_ingested=lines_ingested+$3 WHERE id=$4
`;

async function batchIngestFw(rows) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(insertFwEventSql, [
        r.ts, r.devname, r.src_ip, r.src_port, r.dst_ip, r.dst_port, r.action, r.service, r.policy,
        r.proto, r.src_country, r.dst_country, r.sent_bytes, r.rcv_bytes, r.duration, r.session_id, r.severity, r.raw
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function isPrivateIp(ip) {
  return /^10\./.test(ip) || /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^169\.254\./.test(ip);
}

function guessProto(port) {
  const m = {
    3389: 'RDP', 445: 'SMB', 5985: 'WinRM', 5986: 'WinRM-S', 22: 'SSH', 23: 'Telnet',
    88: 'Kerberos', 389: 'LDAP', 636: 'LDAPS', 135: 'RPC', 139: 'SMB',
    4444: 'Meterpreter', 80: 'HTTP', 443: 'HTTPS', 8080: 'HTTP-Alt',
    21: 'FTP', 25: 'SMTP', 53: 'DNS',
  };
  return m[port] || ('TCP:' + port);
}

function classifyFwSeverity(action, dstPort, srcIp) {
  const HIGH_RISK = new Set([3389, 22, 5985, 5986, 445, 135, 139, 23, 4444, 1433, 3306, 5432]);
  const isExt = !isPrivateIp(srcIp);
  const denied = action === 'deny' || action === 'drop';
  const accept = action === 'accept' || action === 'allow';
  if (denied) {
    if (isExt && HIGH_RISK.has(dstPort)) return 'critical';
    if (isExt) return 'high';
    return 'medium';
  }
  if (accept) {
    if (isExt && HIGH_RISK.has(dstPort)) return 'high';
    if (isExt) return 'medium';
    if (HIGH_RISK.has(dstPort)) return 'medium';
    return 'low';
  }
  if (isExt && HIGH_RISK.has(dstPort)) return 'medium';
  return 'info';
}

function parseFwLog(raw, remoteIp = '', sourceTZ = 'UTC') {
  const clean = raw.replace(/^<\d+>/, '').replace(/^[\d\-T:+.]+\s+[\d.]+\s+/, '').trim();
  const fields = {};
  const re = /(\w+)=(?:"([^"]*?)"|(\S+))/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    fields[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }

  // Accept traffic logs (need src/dst) OR event logs (type=event)
  const isEventLog = fields.type === 'event' ||
    fields.subtype === 'system' ||
    fields.subtype === 'user';

  if (!fields.srcip && !fields.dstip && !isEventLog) return null;

  let ts;
  if (fields.date && fields.time && fields.tz) {
    // Fortinet with tz= field — self-describing
    const tz = fields.tz === 'UTC' ? '+00:00'
      : `${fields.tz.slice(0, 3)}:${fields.tz.slice(3)}`;
    const dt = DateTime.fromISO(`${fields.date}T${fields.time}${tz}`);
    ts = dt.isValid
      ? dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss')
      : `${fields.date} ${fields.time}`;
  } else if (fields.date && fields.time) {
    // No tz= field — apply the source's configured timezone
    const dt = DateTime.fromFormat(
      `${fields.date} ${fields.time}`,
      'yyyy-MM-dd HH:mm:ss',
      { zone: sourceTZ || 'UTC' }
    );
    ts = dt.isValid
      ? dt.toUTC().toFormat('yyyy-MM-dd HH:mm:ss')
      : `${fields.date} ${fields.time}`;
  } else {
    ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  const action = (fields.action || '').toLowerCase().replace(/"/g, '');
  const dstPort = parseInt(fields.dstport) || 0;
  const srcIp = fields.srcip || '';
  let proto = fields.proto || '';
  if (proto === '6') proto = 'TCP';
  if (proto === '17') proto = 'UDP';

  let severity;
  if (isEventLog) {
    if (action === 'login' && fields.status === 'failed') severity = 'high';
    else if (fields.cfgpath) severity = 'medium';
    else severity = 'info';
  } else {
    severity = classifyFwSeverity(action, dstPort, srcIp);
  }

  return {
    ts,
    devname: fields.devname || remoteIp || '',
    src_ip: srcIp || fields.ui || '',
    src_port: parseInt(fields.srcport) || 0,
    dst_ip: fields.dstip || fields.dstip || '',
    dst_port: dstPort,
    action,
    service: fields.service || guessProto(dstPort),
    policy: fields.policyname || fields.cfgpath || '',
    proto,
    src_country: fields.srccountry || '',
    dst_country: fields.dstcountry || '',
    sent_bytes: parseInt(fields.sentbyte) || 0,
    rcv_bytes: parseInt(fields.rcvdbyte) || 0,
    duration: parseInt(fields.duration) || 0,
    session_id: fields.sessionid || fields.logid || '',
    severity,
    raw: raw.slice(0, 4000), 
  };
}


const fsWatchers = {};   // id → fs.FSWatcher
const fsIntervals = {};  // id → setInterval handle

function readNewLinesFromSource(src) {
  try {
    if (!fs.existsSync(src.log_path)) return;
    const stat = fs.statSync(src.log_path);
    let lastSize = src.last_size || 0;

    // File was rotated / truncated
    if (stat.size < lastSize) lastSize = 0;
    if (stat.size === lastSize) return;

    const stream = fs.createReadStream(src.log_path, {
      start: lastSize,
      end: stat.size - 1,
      encoding: 'utf8',
    });

    let buffer = '';
    stream.on('data', chunk => { buffer += chunk; });
    stream.on('end', async () => {
      // Update persisted size
      const newSize = stat.size;
      const lines = buffer.split(/\r?\n/).filter(l => l.trim());
      const rows = [];

      lines.forEach(line => {
        try {
          const parsed = parseFwLog(line, src.name, src.source_timezone || 'UTC');
          if (parsed) {
            parsed.devname = parsed.devname || src.name;
            rows.push(parsed);
          }
        } catch (e) { }
      });

      // Update in-memory copy so next poll uses new size
      src.last_size = newSize;

      try {
        await db.query(updateSourceSql, [newSize, Math.floor(Date.now() / 1000), rows.length, src.id]);
        if (rows.length) {
          await batchIngestFw(rows);
        }
      } catch (err) {
        console.error(`[WATCHER:${src.name}] db error:`, err.message);
      }
    });
    stream.on('error', e => console.error(`[WATCHER:${src.name}] read error:`, e.message));
  } catch (e) {
    console.error(`[WATCHER:${src.name}] stat error:`, e.message);
  }
}

function startWatchingSource(src) {
  if (!src.enabled) return;
  stopWatchingSource(src.id); // clear any existing watcher for this id

  console.log(`[WATCHER] Starting FW Source: ${src.name} → ${src.log_path}`);

  // Poll every 2 seconds (reliable across all platforms + NFS)
  fsIntervals[src.id] = setInterval(() => readNewLinesFromSource(src), 2000);

  // Also use fs.watch for instant trigger
  try {
    fsWatchers[src.id] = fs.watch(src.log_path, (event) => {
      if (event === 'change') readNewLinesFromSource(src);
    });
  } catch (e) {
    console.log(`[WATCHER:${src.name}] fs.watch unavailable, polling only`);
  }
}

function stopWatchingSource(id) {
  if (fsWatchers[id]) { try { fsWatchers[id].close(); } catch (e) { } delete fsWatchers[id]; }
  if (fsIntervals[id]) { clearInterval(fsIntervals[id]); delete fsIntervals[id]; }
}

async function initSourceWatchers() {
  try {
    const sourcesRes = await db.query('SELECT * FROM fw_sources WHERE enabled=1');
    const sources = sourcesRes.rows;
    sources.forEach(startWatchingSource);
    console.log(`[WATCHER] Loaded ${sources.length} FW source(s) from DB`);
  } catch (e) {
    console.error('[WATCHER] Error initializing FW sources:', e.message);
  }
}

module.exports = {
  initSourceWatchers,
  startWatchingSource,
  stopWatchingSource,
  parseFwLog,
  batchIngestFw,
};
