const db = require('../config/db');

const { DateTime } = require('luxon');
const displayTz = process.env.DISPLAY_TZ || 'UTC';

function displayTs(tsStr) {
  if (!tsStr) return '';
  
  // If the string doesn't end in Z, assume it's UTC if it looks like an ISO string
  let parseStr = tsStr;
  if (!parseStr.endsWith('Z') && parseStr.includes('T')) {
    parseStr += 'Z';
  }

  const dt = DateTime.fromISO(parseStr, { zone: 'utc' });
  if (dt.isValid) {
    return dt.setZone(displayTz).toFormat('yyyy-MM-dd HH:mm:ss');
  }
  
  // Fallback if parsing fails
  return tsStr.replace('T', ' ').replace('Z', '');
}

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const p = parseInt(ip.split('.')[1], 10);
    return p >= 16 && p <= 31;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;
  return false;
}

exports.getFirewallStats = async (req, res) => {
  try {
    const { 
      from = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' '),
      to = new Date().toISOString().slice(0, 19).replace('T', ' '),
      action, service, ip, src_ip, dst_ip, severity, device, aggregator, limit = 200, offset = 0 
    } = req.query;

    const conds = ['ts>=$1', 'ts<=$2'];
    const p = [from, to];
    let pIdx = 3;

    if (action) {
      if (action === 'block') {
        conds.push(`(action='block' OR action='deny' OR action='drop')`);
      } else if (action === 'accept') {
        conds.push(`(action='accept' OR action='allow' OR action='permit')`);
      } else {
        conds.push(`action=$${pIdx++}`); p.push(action); 
      }
    }
    if (service) {
      const svcs = service.split(',').filter(Boolean);
      if (svcs.length === 1) {
        conds.push(`service LIKE $${pIdx++}`); p.push('%' + svcs[0] + '%');
      } else if (svcs.length > 1) {
        conds.push('(' + svcs.map(() => `service LIKE $${pIdx++}`).join(' OR ') + ')');
        svcs.forEach(s => p.push('%' + s + '%'));
      }
    }
    if (ip) { conds.push(`(src_ip LIKE $${pIdx} OR dst_ip LIKE $${pIdx+1})`); p.push('%' + ip + '%', '%' + ip + '%'); pIdx += 2; }
    if (src_ip) { conds.push(`src_ip=$${pIdx++}`); p.push(src_ip); }
    if (dst_ip) { conds.push(`dst_ip=$${pIdx++}`); p.push(dst_ip); }
    if (severity) { conds.push(`severity=$${pIdx++}`); p.push(severity); }
    if (device) { conds.push(`devname=$${pIdx++}`); p.push(device); }
    if (aggregator) { conds.push(`aggregator_name=$${pIdx++}`); p.push(aggregator); }

    const w = 'WHERE ' + conds.join(' AND ');

    const totalRes = await db.query('SELECT COUNT(*) AS n FROM fw_events ' + w, p);
    const total = parseInt(totalRes.rows[0].n, 10);
    const bySev = (await db.query('SELECT severity,COUNT(*) AS n FROM fw_events ' + w + ' GROUP BY severity', p)).rows;
    const byAction = (await db.query('SELECT action,COUNT(*) AS n FROM fw_events ' + w + ' GROUP BY action ORDER BY n DESC', p)).rows;
    const byService = (await db.query('SELECT service,COUNT(*) AS n FROM fw_events ' + w + ' GROUP BY service ORDER BY n DESC LIMIT 10', p)).rows;
    const topSrc = (await db.query('SELECT src_ip,COUNT(*) AS n FROM fw_events ' + w + ' GROUP BY src_ip ORDER BY n DESC LIMIT 10', p)).rows;
    const topDst = (await db.query('SELECT dst_ip,dst_port,service,COUNT(*) AS n FROM fw_events ' + w + ' GROUP BY dst_ip,dst_port,service ORDER BY n DESC LIMIT 10', p)).rows;
    
    const eventsRes = await db.query(`SELECT * FROM fw_events ${w} ORDER BY ts DESC LIMIT $${pIdx} OFFSET $${pIdx+1}`, [...p, Number(limit), Number(offset)]);
    const events = eventsRes.rows.map(e => ({ ...e, ts: displayTs(e.ts) }));

    res.json({
      total, bySev, byAction, byService, topSrc, topDst, events,
      has_more: Number(offset) + events.length < total
    });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
};

exports.getTopology = async (req, res) => {
  try {
    const { 
      from = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' '),
      to = new Date().toISOString().slice(0, 19).replace('T', ' '),
      action, service, ip, src_ip, dst_ip, device, severity, aggregator
    } = req.query;

    const conds = ['ts>=$1', 'ts<=$2'];
    const p = [from, to];
    let pIdx = 3;

    if (action) {
      if (action === 'block') {
        conds.push(`(action='block' OR action='deny' OR action='drop')`);
      } else if (action === 'accept') {
        conds.push(`(action='accept' OR action='allow' OR action='permit')`);
      } else {
        conds.push(`action=$${pIdx++}`); p.push(action); 
      }
    }
    if (service) {
      const svcs = service.split(',').filter(Boolean);
      if (svcs.length === 1) {
        conds.push(`service LIKE $${pIdx++}`); p.push('%' + svcs[0] + '%');
      } else if (svcs.length > 1) {
        conds.push('(' + svcs.map(() => `service LIKE $${pIdx++}`).join(' OR ') + ')');
        svcs.forEach(s => p.push('%' + s + '%'));
      }
    }
    if (ip) { conds.push(`(src_ip LIKE $${pIdx} OR dst_ip LIKE $${pIdx+1})`); p.push('%' + ip + '%', '%' + ip + '%'); pIdx += 2; }
    if (src_ip) { conds.push(`src_ip=$${pIdx++}`); p.push(src_ip); }
    if (dst_ip) { conds.push(`dst_ip=$${pIdx++}`); p.push(dst_ip); }
    if (device) { conds.push(`devname=$${pIdx++}`); p.push(device); }
    if (severity) { conds.push(`severity=$${pIdx++}`); p.push(severity); }
    if (aggregator) { conds.push(`aggregator_name=$${pIdx++}`); p.push(aggregator); }

    const w = 'WHERE ' + conds.join(' AND ');

    const groupedRes = await db.query(`
      SELECT src_ip,dst_ip,dst_port,service,action,severity,
             COUNT(*) AS count, MIN(ts) AS first_seen, MAX(ts) AS last_seen
      FROM fw_events ${w}
      GROUP BY src_ip,dst_ip,dst_port,service,action,severity
      ORDER BY count DESC LIMIT 2000
    `, p);
    const grouped = groupedRes.rows;

    const ipSet = new Set();
    grouped.forEach(r => { ipSet.add(r.src_ip); ipSet.add(r.dst_ip); });
    
    const devices = [...ipSet].map(ip => ({ ip, is_internal: isPrivateIp(ip) }));

    res.json({ devices, connections: grouped });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
};

exports.getDevices = async (req, res) => {
  try {
    const rowsRes = await db.query(
      "SELECT DISTINCT devname FROM fw_events WHERE devname != '' AND devname IS NOT NULL ORDER BY devname"
    );
    res.json(rowsRes.rows.map(r => r.devname));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.getLiveEvents = async (req, res) => {
  try {
    const { last_id = 0, limit = 50, aggregator, device } = req.query;
    const p = [Number(last_id)];
    let pIdx = 2;
    const conds = ['id>$1'];
    
    if (aggregator) { conds.push(`aggregator_name=$${pIdx++}`); p.push(aggregator); }
    if (device) { conds.push(`devname=$${pIdx++}`); p.push(device); }
    
    p.push(Number(limit));
    const query = `SELECT * FROM fw_events WHERE ${conds.join(' AND ')} ORDER BY id ASC LIMIT $${pIdx}`;
    
    const eventsRes = await db.query(query, p);
    const events = eventsRes.rows;
    res.json({ events, last_id: events.length ? events[events.length - 1].id : Number(last_id) });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
};

exports.getSecurityAlerts = async (req, res) => {
  try {
    const {
      from = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace('T', ' '),
      to = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' '),
      device = '',
      aggregator,
      severity,
      limit = 500,
      show_logins = '0',
    } = req.query;

    const NOISE_PATTERNS = [
      'type="traffic"', 'subtype="forward"', 'subtype="local"', 'subtype="multicast"',
      'subtype="sniffer"', 'dhcp statistics', 'performance statistics', 'average cpu',
      'concurrent sessions', 'setup-rate', 'ntp sync', 'ha heartbeat', 'link monitor',
      'interface monitor', 'av update', 'ips update', 'app-ctrl update', 'license update',
      'conserve mode', 'logid="0100022922"', 'logid="0100022923"', 'logid="0104048001"',
      'logid="0100022906"', 'logid="0100020001"', 'logid="0100026001"', 'logid="0100026002"',
    ];

    function isNoise(raw) {
      const low = (raw || '').toLowerCase();
      return NOISE_PATTERNS.some(p => low.includes(p));
    }

    const conds = ['ts>=$1', 'ts<=$2'];
    const params = [from, to];
    let pIdx = 3;

    if (device) {
      conds.push(`devname=$${pIdx++}`);
      params.push(device);
    }
    if (aggregator) {
      conds.push(`aggregator_name=$${pIdx++}`);
      params.push(aggregator);
    }
    if (severity) {
      conds.push(`severity=$${pIdx++}`);
      params.push(severity);
    }

    conds.push(`(
      raw LIKE '%subtype="user"%'
      OR raw LIKE '%subtype="system"%'
      OR raw LIKE '%status="failed"%'
      OR raw LIKE '%reason="passwd_invalid"%'
      OR raw LIKE '%reason="two_factor"%'
      OR raw LIKE '%reason="sslvpn_login_fail"%'
      OR raw LIKE '%logfail%'
      OR raw LIKE '%login failed%'
      OR raw LIKE '%authentication fail%'
      OR raw LIKE '%logid="0100032001"%'
      OR raw LIKE '%logid="0100032002"%'
      OR raw LIKE '%logid="0100044547"%'
      OR raw LIKE '%logid="0100044546"%'
      OR raw LIKE '%logid="0100044548"%'
      OR raw LIKE '%cfgpath=%'
      OR raw LIKE '%policy-add%'
      OR raw LIKE '%policy-delete%'
      OR raw LIKE '%policy-modify%'
      OR raw LIKE '%cfg_change%'
      OR raw LIKE '%user-add%'
      OR raw LIKE '%user-delete%'
      OR raw LIKE '%user-passwd%'
      OR raw LIKE '%mfa%'
      OR raw LIKE '%two-factor%'
      OR raw LIKE '%two_factor%'
      OR raw LIKE '%authenticator%'
      OR raw LIKE '%totp%'
      OR (raw LIKE '%otp%' AND raw NOT LIKE '%smtp%')
    )`);

    params.push(Number(limit));

    const rowsRes = await db.query(`
      SELECT id, devname AS machine, ts, severity, src_ip, raw AS message
      FROM fw_events
      WHERE ${conds.join(' AND ')}
      ORDER BY ts ASC
      LIMIT $${pIdx}
    `, params);
    const rows = rowsRes.rows;

    const counts = {
      bruteForce: 0,
      loginFailed: 0,
      configChange: 0,
      mfa: 0,
      adminLogin: 0,
    };

    const outEvents = [];

    rows.forEach(e => {
      const raw = e.message || '';
      if (isNoise(raw)) return;

      const rawO = raw.replace(/^[\d\-T:+.]+\s+[\d.]+\s+/, '');
      const rawLow = rawO.toLowerCase();

      const cfgpath = (rawO.match(/cfgpath="([^"]+)"/) || [])[1] || '';
      const action = (rawO.match(/action="([^"]+)"/) || [])[1] || '';
      const subtype = (rawO.match(/subtype="([^"]+)"/) || [])[1] || '';  
      const msgM = rawO.match(/msg="([^"]+)"/);
      const cfgobj = (rawO.match(/cfgobj="([^"]+)"/) || [])[1] || '';
      const cfgattr = (rawO.match(/cfgattr="([^"]+)"/) || [])[1] || '';
      const user = (rawO.match(/user="([^"]+)"/) || [])[1] || '';
      const srcip = e.src_ip || (rawO.match(/srcip=([\d.]+)/) || [])[1] || '';
      const ui = (rawO.match(/ui="([^"]+)"/) || [])[1] || '';
      const reason = (rawO.match(/reason="([^"]+)"/) || [])[1] || '';
      const logdesc = (rawO.match(/logdesc="([^"]+)"/) || [])[1] || '';

      let alertType = null;
      let isLoginFail = false;
      let isAdminLogin = false;

      if (rawLow.includes('mfa') || rawLow.includes('two-factor') ||
        rawLow.includes('two_factor') || rawLow.includes('authenticator') ||
        rawLow.includes('totp') ||
        (rawLow.includes('otp') && !rawLow.includes('smtp'))) {
        if (rawLow.includes('fail') || rawLow.includes('invalid') || rawLow.includes('wrong')) {
          alertType = 'MFA Failed';
        } else if (rawLow.includes('enabled') || rawLow.includes('activated') || rawLow.includes('enrolled')) {
          alertType = 'MFA Enabled';
        } else if (rawLow.includes('disabled') || rawLow.includes('removed') || rawLow.includes('deactivated')) {
          alertType = 'MFA Disabled';
        } else {
          alertType = 'MFA Event';
        }
        counts.mfa++;
      }
      else if (rawLow.includes('status="failed"') || rawLow.includes('passwd_invalid') ||
        rawLow.includes('login failed') || rawLow.includes('logfail') ||
        rawLow.includes('authentication fail') || rawLow.includes('sslvpn_login_fail')) {
        alertType = 'Login Failed';
        isLoginFail = true;
        counts.loginFailed++;
      }
      else if (cfgpath.includes('firewall.policy') || rawLow.includes('policy-add') ||
        rawLow.includes('policy-delete') || rawLow.includes('policy-modify')) {
        if (action === 'Add' || rawLow.includes('policy-add')) { alertType = 'Policy Added'; }
        else if (action === 'Delete' || rawLow.includes('policy-delete')) { alertType = 'Policy Deleted'; }
        else { alertType = 'Policy Modified'; }
        counts.configChange++;
      }
      else if (cfgpath || rawLow.includes('cfg_change')) {
        if (action === 'Add') { alertType = 'Config Added'; }
        else if (action === 'Delete') { alertType = 'Config Deleted'; }
        else { alertType = 'Config Changed'; }
        counts.configChange++;
      }
      else if (rawLow.includes('user-add') || (cfgpath.includes('user') && action === 'Add')) { alertType = 'User Added'; counts.configChange++; }
      else if (rawLow.includes('user-delete') || (cfgpath.includes('user') && action === 'Delete')) { alertType = 'User Deleted'; counts.configChange++; }
      else if (rawLow.includes('user-passwd')) { alertType = 'Password Changed'; counts.configChange++; }
      else if ((subtype === 'user' && action.toLowerCase() === 'login') ||
        (rawLow.includes('admin') && rawLow.includes('login'))) {
        alertType = 'Admin Login';
        isAdminLogin = true;
        counts.adminLogin++;
      }

      if (!alertType) return;

      let displayMsg = rawO;
      if (msgM) {
        displayMsg = msgM[1];
        if (cfgobj && !displayMsg.includes(cfgobj)) displayMsg += ' [ID: ' + cfgobj + ']';
        if (cfgpath && !displayMsg.includes(cfgpath)) displayMsg += ' [Path: ' + cfgpath + ']';
        if (user) displayMsg += ' by ' + user;
        if (ui) displayMsg += ' from ' + ui;
      } else if (cfgpath) {
        const parts = [];
        if (logdesc) parts.push(logdesc);
        if (cfgpath) parts.push('Path: ' + cfgpath);
        if (cfgobj) parts.push('Object: ' + cfgobj);
        if (action) parts.push('Action: ' + action);
        if (user) parts.push('By: ' + user);
        if (ui) parts.push('From: ' + ui);
        if (cfgattr) {
          const nm = cfgattr.match(/name\[([^\]]+)\]/);
          const src = cfgattr.match(/srcintf\[([^\]]+)\]/);
          const dst = cfgattr.match(/dstintf\[([^\]]+)\]/);
          const act = cfgattr.match(/action\[([^\]]+)\]/);
          const det = [];
          if (nm && nm[1] !== 'all') det.push('name=' + nm[1]);
          if (src && src[1] !== 'all') det.push('src=' + src[1]);
          if (dst && dst[1] !== 'all') det.push('dst=' + dst[1]);
          if (act && act[1] !== 'all') det.push('action=' + act[1]);
          if (det.length) parts.push('[' + det.join(', ') + ']');
        }
        displayMsg = parts.join(' | ');
      }

      if (isAdminLogin && show_logins !== '1') return;

      outEvents.push({
        id: e.id,
        ts: displayTs(e.ts),
        machine: e.machine,
        severity: e.severity,
        src_ip: srcip,
        alertType,
        msg: displayMsg,
        isAdminLogin,
        isLoginFail
      });
    });

    outEvents.reverse();

    res.json({ counts, events: outEvents });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
