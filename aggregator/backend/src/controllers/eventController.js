const Event = require('../models/Event');
const { parseAdEvent, parseMaliciousEvent, parseUsbEvent, parseNetworkEvent, parseUserEvent } = require('../utils/eventParsers');
const db = require('../config/db');

function nowUTC() {
  const d = new Date();
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0') + ' ' +
    String(d.getUTCHours()).padStart(2, '0') + ':' +
    String(d.getUTCMinutes()).padStart(2, '0') + ':' +
    String(d.getUTCSeconds()).padStart(2, '0');
}

function hoursAgoUTC(hours) {
  const d = new Date(Date.now() - hours * 3600000);
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0') + ' ' +
    String(d.getUTCHours()).padStart(2, '0') + ':' +
    String(d.getUTCMinutes()).padStart(2, '0') + ':' +
    String(d.getUTCSeconds()).padStart(2, '0');
}

/**
 * Controller for retrieving standard events
 */
async function getEvents(req, res) {
  try {
    let {
      machine, severity, category, tag, search, show_noise,
      from, to, hours, hourOfDay,
      limit = 1000, offset = 0,
    } = req.query;

    if (hours && !from) {
      from = hoursAgoUTC(Number(hours));
    } else if (!from) {
      from = hoursAgoUTC(24);
    }
    if (!to) to = nowUTC();

    const conds = ['ts>=$1', 'ts<=$2', "message NOT ILIKE '%iochuntwatchdog%'", "tag NOT ILIKE '%iochuntwatchdog%'"];
    const params = [from, to];
    let pIdx = 3;

    if (show_noise !== '1') conds.push('is_noise=0');
    if (machine) { conds.push(`machine=$${pIdx++}`); params.push(machine); }
    if (severity) { conds.push(`severity=$${pIdx++}`); params.push(severity); }
    if (category) { conds.push(`category=$${pIdx++}`); params.push(category); }
    if (tag) { conds.push(`tag ILIKE $${pIdx++}`); params.push('%' + tag + '%'); }
    if (search) {
      conds.push(`(message ILIKE $${pIdx} OR tag ILIKE $${pIdx + 1})`);
      params.push('%' + search + '%', '%' + search + '%');
      pIdx += 2;
    }
    if (hourOfDay) {
      conds.push(`EXTRACT(HOUR FROM ts::timestamp) = $${pIdx++}`);
      params.push(parseInt(hourOfDay, 10));
    }

    const w = 'WHERE ' + conds.join(' AND ');
    const countSql = 'SELECT COUNT(*) as cnt FROM events ' + w;
    const sql = `SELECT * FROM events ${w} ORDER BY ts DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`;

    const fetchParams = [...params, Number(limit), Number(offset)];

    const dataRes = await db.query(sql, fetchParams);
    const data = dataRes.rows;

    if (req.query.include_total === 'true') {
      const countRes = await db.query(countSql, params);
      const cnt = parseInt(countRes.rows[0].cnt, 10);
      return res.status(200).json({ total: cnt, events: data, has_more: Number(offset) + data.length < cnt });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[Event Error] Failed to get events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Controller for retrieving AD Attack events
 */
async function getADAttacks(req, res) {
  try {
    const machine = req.query.machine || '';
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      to = nowUTC();
      from = hoursAgoUTC(hours);
    }
    const source = (req.query.source || '').toLowerCase();
    const action = (req.query.action || '').toLowerCase();
    const isPrivileged = req.query.isPrivileged === 'true';
    const excludeSystem = req.query.excludeSystem === 'true';
    const incidentLink = req.query.incidentLink || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? req.query.search.toLowerCase() : '';
    const actor = (req.query.actor || '').toLowerCase();
    const attackType = (req.query.attackType || '').toLowerCase();
    const sort = req.query.sort || 'newest';
    const severity = req.query.severity || 'all';
    const protocol = (req.query.protocol || '').toLowerCase();
    const tactic = (req.query.tactic || '').toLowerCase();

    // Fetch a large pool to ensure we don't miss true AD attacks
    const rows = await Event.getAdAttacks(machine, 3000, from, to);
    let events = rows.map(r => {
      const ad = parseAdEvent(r.machine, r.tag, r.message, r.severity);
      if (!ad) return null;
      return { ...ad, ts: r.ts, machine: r.machine, tag: r.tag, id: r.id, incident_id: r.incident_id, incident_assigned_to: r.incident_assigned_to, incident_status: r.incident_status };
    }).filter(Boolean);

    // Apply backend filtering to ensure accurate pagination and stats
    if (machine) {
      events = events.filter(a =>
        a.machine === machine ||
        a.target_machine === machine ||
        a.actor === machine ||
        a.remote_ip === machine
      );
    }
    if (search) {
      events = events.filter(a => Object.values(a).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(search)));
    }
    if (severity !== 'all') {
      events = events.filter(a => (a.severity || 'info').toLowerCase() === severity);
    }
    if (source) {
      events = events.filter(a => (a.source || '').toLowerCase().includes(source));
    }
    if (action) {
      events = events.filter(a => (a.action || '').toLowerCase().includes(action));
    }
    if (excludeSystem) {
      events = events.filter(a => !/\b(system|SYSTEM)\b/.test(a.process) && !/\b(system|SYSTEM)\b/.test(a.machine));
    }
    if (incidentLink === 'unassigned') {
      events = events.filter(a => !a.incident_id);
    } else if (incidentLink === 'linked') {
      events = events.filter(a => !!a.incident_id);
    }

    if (actor) {
      events = events.filter(a => (a.actor || '').toLowerCase().includes(actor));
    }
    if (attackType) {
      events = events.filter(a => (a.attack_type || '').toLowerCase().includes(attackType));
    }
    if (protocol) {
      events = events.filter(a => (a.protocol || '').toLowerCase().includes(protocol));
    }
    if (tactic) {
      events = events.filter(a => (a.tactic || '').toLowerCase().includes(tactic));
    }
    if (excludeSystem) {
      events = events.filter(a => !/\b(system|SYSTEM)\b/.test(a.actor) && !a.actor.endsWith('$') && !/\b(system|SYSTEM)\b/.test(a.target_machine));
    }
    if (sort === 'oldest') {
      events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    } else if (sort === 'severity') {
      const sevMap = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      events.sort((a, b) => sevMap[(b.severity || 'info').toLowerCase()] - sevMap[(a.severity || 'info').toLowerCase()]);
    } else {
      events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    }

    const total = events.length;
    const critical = events.filter(a => (a.severity || '').toLowerCase() === 'critical').length;
    const high = events.filter(a => (a.severity || '').toLowerCase() === 'high').length;

    // Slicing for backend pagination
    const offset = (page - 1) * limit;
    const paginatedEvents = events.slice(offset, offset + limit);

    return res.status(200).json({ events: paginatedEvents, stats: { total, critical, high } });
  } catch (error) {
    console.error('[Event Error] Failed to get AD attacks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Controller for retrieving Malicious/Defender events
 */
async function getMaliciousEvents(req, res) {
  try {
    const machine = req.query.machine || '';
    const hours = Number(req.query.hours || 168);
    const search = (req.query.search || '').toLowerCase();
    const processFilter = (req.query.process || '').toLowerCase();
    const sort = req.query.sort || 'newest';
    const severity = (req.query.severity || 'all').toLowerCase();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      to = nowUTC();
      from = hoursAgoUTC(hours);
    }

    const rows = await Event.getMaliciousEvents(machine, 3000, from, to);
    let events = rows.map(r => {
      const parsed = parseMaliciousEvent(r);
      if (!parsed) return null;
      return { ...parsed, id: r.id, incident_id: r.incident_id, incident_assigned_to: r.incident_assigned_to, incident_status: r.incident_status };
    }).filter(Boolean);

    if (search) {
      events = events.filter(a => Object.values(a).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(search)));
    }
    if (severity !== 'all') {
      events = events.filter(a => (a.severity || 'info').toLowerCase() === severity);
    }
    if (processFilter) {
      events = events.filter(a => (a.process || '').toLowerCase().includes(processFilter));
    }
    if (sort === 'oldest') {
      events.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    } else if (sort === 'severity') {
      const sevMap = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      events.sort((a, b) => sevMap[(b.severity || 'info').toLowerCase()] - sevMap[(a.severity || 'info').toLowerCase()]);
    } else {
      events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    }

    const total = events.length;
    const critical = events.filter(a => (a.severity || '').toLowerCase() === 'critical').length;
    const high = events.filter(a => (a.severity || '').toLowerCase() === 'high').length;

    const offset = (page - 1) * limit;
    const paginatedEvents = events.slice(offset, offset + limit);

    return res.status(200).json({ events: paginatedEvents, stats: { total, critical, high } });
  } catch (error) {
    console.error('[Event Error] Failed to get malicious events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Controller for retrieving USB events
 */
async function getUsbEvents(req, res) {
  try {
    const machine = req.query.machine || '';
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      to = nowUTC();
      from = hoursAgoUTC(hours);
    }

    const rows = await Event.getUsbEvents(machine, 500, from, to);
    const out = rows.map(parseUsbEvent);

    
  } catch (error) {
    console.error('[Event Error] Failed to get USB events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Controller for retrieving User Account events
 */
async function getUserEvents(req, res) {
  try {
    const machine = req.query.machine || '';
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      to = nowUTC();
      from = hoursAgoUTC(hours);
    }

    const rows = await Event.getUserEvents(machine, 500, from, to);
    const out = rows.map(parseUserEvent);

    return res.status(200).json(out);
  } catch (error) {
    console.error('[Event Error] Failed to get user events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Controller for retrieving Firewall events
 */
async function getFirewallEvents(req, res) {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = parseInt(req.query.offset, 10) || 0;

    const events = await Event.getFirewallEvents(limit, offset);
    return res.status(200).json(events);
  } catch (error) {
    console.error('[Event Error] Failed to get firewall events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const crypto = require('crypto');

async function buildChains(from, to, machine) {
  let params = [from, to];
  let pIdx = 3;
  let where = "WHERE ts>=$1 AND ts<=$2 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
  if (machine) {
    where += ` AND machine=$${pIdx}`;
    params.push(machine);
  }

  const eventsRes = await db.query(
    `SELECT * FROM events ${where} AND is_noise=0 AND severity IN ('critical','high','medium') ORDER BY machine,ts`, params
  );
  const events = eventsRes.rows;

  const chains = [];
  let current = null;
  const WINDOW_MS = 90000;

  for (const e of events) {
    const eMs = new Date(e.ts).getTime();
    if (!current || e.machine !== current.machine ||
      eMs - new Date(current.events[current.events.length - 1].ts).getTime() > WINDOW_MS) {
      if (current && current.events.length >= 2) chains.push(current);
      current = {
        id: crypto.randomUUID().slice(0, 8),
        machine: e.machine,
        events: [e],
        severity: e.severity,
        start: e.ts,
        end: e.ts,
      };
    } else {
      current.events.push(e);
      current.end = e.ts;
      if (e.severity === 'critical') current.severity = 'critical';
      else if (e.severity === 'high' && current.severity !== 'critical') current.severity = 'high';
    }
  }
  if (current && current.events.length >= 2) chains.push(current);
  return chains.slice(0, 50);
}

const getStats = async (req, res) => {
  try {
    const machine = req.query.machine || '';
    const hours = Number(req.query.hours || req.query.range || 24);
    const to = nowUTC();
    const from = hoursAgoUTC(hours);

    const nw = machine
      ? "WHERE ts>=$1 AND ts<=$2 AND machine=$3 AND is_noise=0 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'"
      : "WHERE ts>=$1 AND ts<=$2 AND is_noise=0 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
    const bp = machine ? [from, to, machine] : [from, to];

    const totalRes = await db.query('SELECT COUNT(*) AS n FROM events ' + nw, bp);
    const total = parseInt(totalRes.rows[0].n, 10);

    const bySevRes = await db.query('SELECT severity,COUNT(*) AS n FROM events ' + nw + ' GROUP BY severity', bp);
    const bySev = bySevRes.rows;

    const byCatRes = await db.query('SELECT category,COUNT(*) AS n FROM events ' + nw + ' GROUP BY category ORDER BY n DESC', bp);
    const byCat = byCatRes.rows;

    const byMachineRes = await db.query('SELECT machine,COUNT(*) AS n FROM events ' + nw + ' GROUP BY machine ORDER BY n DESC', bp);
    const byMachine = byMachineRes.rows;

    const byMachineSevRes = await db.query("SELECT machine,severity,COUNT(*) AS n FROM events " + nw + " AND severity IN ('critical','high') GROUP BY machine,severity", bp);
    const byMachineSev = byMachineSevRes.rows;

    const machinesRes = await db.query('SELECT * FROM machines ORDER BY last_seen DESC');
    const machines = machinesRes.rows;

    const hourlyRes = await db.query("SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour,severity,COUNT(*) AS n FROM events " + nw + " GROUP BY hour,severity ORDER BY hour", bp);
    const hourly = hourlyRes.rows;

    const criticalRes = await db.query("SELECT * FROM events " + nw.replace('WHERE', "WHERE severity = 'critical' AND") + " ORDER BY ts DESC LIMIT 20", bp);
    const critical = criticalRes.rows;

    const criticalStatsRes = await db.query("SELECT COALESCE(category, tag, 'Unknown') as type, COUNT(*) as n FROM events " + nw.replace('WHERE', "WHERE severity = 'critical' AND") + " GROUP BY type", bp);
    const criticalStats = criticalStatsRes.rows;
    const totalCritical = criticalStats.reduce((sum, row) => sum + parseInt(row.n, 10), 0);

    const chains = await buildChains(from, to, machine);

    res.json({ total, bySev, byCat, byMachine, byMachineSev, machines, hourly, critical, criticalStats, totalCritical, chains });
  } catch (error) {
    console.error('[Event Error] Failed to get stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function getTopology(req, res) {
  try {
    const hours = Number(req.query.hours || 24);
    const to = nowUTC();
    const from = hoursAgoUTC(hours);
    const machinesRes = await db.query('SELECT * FROM machines ORDER BY last_seen DESC');
    const machines = machinesRes.rows;
    const ipToMachine = {};
    machines.forEach(m => { if (m.ip) ipToMachine[m.ip] = m.id; });

    const machine = req.query.machine;
    let baseWhere = "ts>=$1 AND ts<=$2 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
    let bp = [from, to];

    if (machine) {
      baseWhere += " AND (machine=$3 OR message LIKE $4)";
      bp.push(machine, `%${machine}%`);
    }

    const netWhere =
      `WHERE ${baseWhere} AND (category='NETWORK' OR category='DOMAIN' OR category='ADCS' ` +
      "OR tag LIKE '%NET%' OR tag LIKE '%OUTBOUND%' OR tag LIKE '%CONN%' " +
      "OR tag LIKE '%SHARE%' OR tag LIKE '%DETECTED%' OR tag LIKE '%BLOCKED%' " +
      "OR tag LIKE '%FAILED-LOGON%' OR tag LIKE '%IOCHunt-Block%' " +
      "OR tag LIKE '%DCSYNC%' OR tag LIKE '%DCSHADOW%' OR tag LIKE '%KERBEROAST%' " +
      "OR tag LIKE '%RBCD%' OR tag LIKE '%SPRAY%' OR tag LIKE '%NTLM-BRUTE%' " +
      "OR tag LIKE '%SHADOW-CRED%' OR tag LIKE '%ESC%' OR tag LIKE '%PKINIT%' " +
      "OR tag LIKE '%GOLDEN-CERT%' OR tag LIKE '%CERTIPY%' OR tag LIKE '%LDAP-ENUM%' " +
      "OR tag LIKE '%COMPUTER-ACCT%' OR tag LIKE '%EXPLICIT-CRED%' " +
      "OR message LIKE '%IOCHunt-Block%' OR message LIKE '%SMB%' " +
      "OR message LIKE '%RDP%' OR message LIKE '%WinRM%' OR message LIKE '%[NETWORK]%')";

    const rawRowsRes = await db.query(
      'SELECT machine,ts,tag,severity,message FROM events ' + netWhere.replace('WHERE', 'WHERE is_noise=0 AND') + ' ORDER BY ts DESC LIMIT 8000',
      bp
    );
    const rawRows = rawRowsRes.rows;

    const inboundMap = {}, outboundMap = {}, adAttackMap = {};

    rawRows.forEach(row => {
      const parsed = parseNetworkEvent(row.machine, row.tag, row.message, row.severity);
      if (!parsed) return;

      if (parsed.direction === 'ad_attack') {
        const key = row.machine + '|' + (parsed.actor || '?') + '|' + parsed.attack_type;
        if (!adAttackMap[key])
          adAttackMap[key] = { target_machine: parsed.target_machine || row.machine, actor: parsed.actor, remote_ip: parsed.remote_ip || '', attack_type: parsed.attack_type, description: parsed.description, protocol: parsed.protocol, severity: parsed.severity, count: 0, first_seen: row.ts, last_seen: row.ts };
        adAttackMap[key].count++;
        if (row.ts < adAttackMap[key].first_seen) adAttackMap[key].first_seen = row.ts;
        if (row.ts > adAttackMap[key].last_seen) adAttackMap[key].last_seen = row.ts;
        if (parsed.severity === 'critical') adAttackMap[key].severity = 'critical';
        else if (parsed.severity === 'high' && adAttackMap[key].severity !== 'critical') adAttackMap[key].severity = 'high';
        return;
      }

      if (parsed.direction === 'inbound') {
        const key2 = row.machine + '|' + parsed.remote_ip + '|' + parsed.protocol;
        if (!inboundMap[key2])
          inboundMap[key2] = { to_machine: row.machine, from_ip: parsed.remote_ip, from_machine: ipToMachine[parsed.remote_ip] || '', protocol: parsed.protocol, port: parsed.port, severity: parsed.severity, description: row.message, count: 0, blocked: 0, first_seen: row.ts, last_seen: row.ts };
        inboundMap[key2].count++;
        if (parsed.blocked) inboundMap[key2].blocked++;
        if (row.ts < inboundMap[key2].first_seen) inboundMap[key2].first_seen = row.ts;
        if (row.ts > inboundMap[key2].last_seen) inboundMap[key2].last_seen = row.ts;
        if (parsed.severity === 'critical') inboundMap[key2].severity = 'critical';
        else if (parsed.severity === 'high' && inboundMap[key2].severity !== 'critical') inboundMap[key2].severity = 'high';
      } else {
        const key3 = row.machine + '|' + parsed.remote_ip + '|' + parsed.protocol;
        if (!outboundMap[key3])
          outboundMap[key3] = { from_machine: row.machine, to_ip: parsed.remote_ip, to_machine: ipToMachine[parsed.remote_ip] || '', protocol: parsed.protocol, port: parsed.port, severity: parsed.severity, description: row.message, count: 0, blocked: 0, first_seen: row.ts, last_seen: row.ts };
        outboundMap[key3].count++;
        if (parsed.blocked) outboundMap[key3].blocked++;
        if (row.ts < outboundMap[key3].first_seen) outboundMap[key3].first_seen = row.ts;
        if (row.ts > outboundMap[key3].last_seen) outboundMap[key3].last_seen = row.ts;
        if (parsed.severity === 'critical') outboundMap[key3].severity = 'critical';
        else if (parsed.severity === 'high' && outboundMap[key3].severity !== 'critical') outboundMap[key3].severity = 'high';
      }
    });

    const lateralMap = {};
    Object.values(outboundMap).forEach(conn => {
      if (!conn.to_machine || conn.from_machine === conn.to_machine) return;
      const k = conn.from_machine + '|' + conn.to_machine + '|' + conn.protocol;
      if (!lateralMap[k])
        lateralMap[k] = { source: conn.from_machine, target: conn.to_machine, protocol: conn.protocol, port: conn.port, description: conn.description, count: 0, blocked: 0, severity: conn.severity };
      lateralMap[k].count += conn.count;
      lateralMap[k].blocked += conn.blocked;
    });
    Object.values(inboundMap).forEach(conn => {
      if (!conn.from_machine || conn.from_machine === conn.to_machine) return;
      const k = conn.from_machine + '|' + conn.to_machine + '|' + conn.protocol;
      if (!lateralMap[k])
        lateralMap[k] = { source: conn.from_machine, target: conn.to_machine, protocol: conn.protocol, port: conn.port, description: conn.description, count: 0, blocked: 0, severity: conn.severity };
      lateralMap[k].count += conn.count;
      lateralMap[k].blocked += conn.blocked;
    });

    return res.status(200).json({
      machines,
      inbound: Object.values(inboundMap),
      outbound: Object.values(outboundMap),
      lateral: Object.values(lateralMap),
      ad_attacks: Object.values(adAttackMap),
    });
  } catch (error) {
    console.error('[Event Error] Failed to get topology:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getMachines(req, res) {
  try {
    const machinesRes = await db.query('SELECT * FROM machines ORDER BY last_seen DESC');
    return res.status(200).json(machinesRes.rows);
  } catch (error) {
    console.error('[Event Error] Failed to get machines:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getClients(req, res) {
  try {
    let from, to;
    if (req.query.from && req.query.to) {
      from = req.query.from;
      to = req.query.to;
    } else {
      const hours = Number(req.query.hours || 168);
      from = hoursAgoUTC(hours);
      to = nowUTC();
    }
    const now = Math.floor(Date.now() / 1000);
    const machinesRes = await db.query('SELECT * FROM machines ORDER BY last_seen DESC');
    const machines = machinesRes.rows;

    const clients = [];
    for (const m of machines) {
      const age = now - (m.last_seen || 0);
      let status, statusCol;
      if (age < 180) { status = 'Online'; statusCol = '#22c55e'; }
      else if (age < 600) { status = 'Recent'; statusCol = '#84cc16'; }
      else if (age < 3600) { status = 'Away'; statusCol = '#f97316'; }
      else { status = 'Offline'; statusCol = '#ef4444'; }

      const statsRes = await db.query(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity='high'     THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN severity='medium'   THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN category IN ('DOMAIN','ADCS') THEN 1 ELSE 0 END) as ad_events
        FROM events WHERE machine=$1 AND ts>=$2 AND ts<=$3 AND is_noise=0 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'`,
        [m.id, from, to]
      );
      const s = statsRes.rows[0] || {};
      const risk = Math.min(100,
        parseInt(s.critical || 0, 10) * 10 + parseInt(s.high || 0, 10) * 3 + parseInt(s.medium || 0, 10) + parseInt(s.ad_events || 0, 10) * 5
      );
      const riskLabel = risk >= 50 ? 'Critical' : risk >= 20 ? 'High' : risk >= 5 ? 'Medium' : 'Low';

      clients.push({
        id: m.id, label: m.label || m.id, ip: m.ip || '',
        last_seen: m.last_seen,
        last_seen_str: m.last_seen
          ? new Date(m.last_seen * 1000).toISOString().slice(0, 19).replace('T', ' ')
          : 'Never',
        event_count: m.event_count || 0,
        status, statusCol, age,
        total_recent: parseInt(s.total || 0, 10), critical: parseInt(s.critical || 0, 10), high: parseInt(s.high || 0, 10),
        medium: parseInt(s.medium || 0, 10), ad_events: parseInt(s.ad_events || 0, 10),
        risk, riskLabel,
      });
    }

    const top5 = new Set(
      [...clients].sort((a, b) => b.risk - a.risk).slice(0, 5)
        .filter(c => c.risk > 0).map(c => c.id)
    );
    clients.forEach(c => { c.is_top5 = top5.has(c.id); });

    return res.status(200).json({ clients, online: clients.filter(c => c.status === 'Online').length });
  } catch (error) {
    console.error('[Event Error] Failed to get clients:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getEvents,
  getADAttacks,
  getMaliciousEvents,
  getUsbEvents,
  getFirewallEvents,
  getStats,
  getTopology,
  getMachines,
  getUserEvents,
  getClients
};