const Event = require('../models/Event');
const { parseAdEvent, parseMaliciousEvent, parseUsbEvent, parseUserEvent } = require('../utils/eventParsers');
const appMode = require('../config/appMode');

/**
 * Resolves the effective aggregator to query based on user role and request query parameters.
 * - If Central Server: Admins can view all (null) or filter by query.aggregator
 * - If Aggregator Admin: Can ONLY view their own aggregator_name
 */
function getEffectiveAggregator(req) {
  if (req.session && req.session.role === 'AGGREGATOR_ADMIN') {
    return req.session.aggregator_name;
  }
  return req.query.aggregator || null;
}

const getEvents = async (req, res) => {
  try {
    const {
      machine,
      hours,
      from,
      to,
      severity,
      category,
      search,
      q,
      show_noise,
      limit = 50,
      offset = 0,
      hourOfDay
    } = req.query;

    const aggregator = getEffectiveAggregator(req);
    
    let whereClauses = ["message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'"];
    const params = [];

    // Noise filtering
    if (show_noise !== '1' && show_noise !== 'true') {
      whereClauses.push('is_noise = false');
    }
    
    // Aggregator / Branch
    if (aggregator) {
      params.push(aggregator);
      whereClauses.push(`aggregator_name = $${params.length}`);
    }
    
    // Machine
    if (machine && machine !== 'All Machines' && machine !== 'all' && machine !== '') {
      params.push(machine);
      whereClauses.push(`(machine = $${params.length} OR label = $${params.length})`);
    }
    
    // Time Filtering
    if (from) {
      params.push(from);
      whereClauses.push(`ts >= $${params.length}`);
    } else if (hours && Number(hours) > 0) {
      const hoursNum = Number(hours);
      const computedFrom = hoursAgoUTC(hoursNum);
      params.push(computedFrom);
      whereClauses.push(`ts >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      whereClauses.push(`ts <= $${params.length}`);
    }
    
    // Severity
    if (severity && severity !== 'All Severities' && severity !== 'all' && severity !== '') {
      params.push(severity.toLowerCase());
      whereClauses.push(`LOWER(severity) = $${params.length}`);
    }
    
    // Category (flexible case-insensitive match on category or tag)
    if (category && category !== 'All Categories' && category !== 'all' && category !== '') {
      params.push(`%${category}%`);
      whereClauses.push(`(category ILIKE $${params.length} OR tag ILIKE $${params.length})`);
    }

    // Search query across fields
    const queryTerm = search || q;
    if (queryTerm && queryTerm.trim() !== '') {
      params.push(`%${queryTerm.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(`(
        message ILIKE $${pIdx} OR 
        tag ILIKE $${pIdx} OR 
        machine ILIKE $${pIdx} OR 
        label ILIKE $${pIdx} OR 
        category ILIKE $${pIdx} OR
        aggregator_name ILIKE $${pIdx}
      )`);
    }
    
    if (hourOfDay) {
      params.push(hourOfDay);
      whereClauses.push(`TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') = $${params.length}`);
    }
    
    const whereString = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM events ${whereString}`;
    const countRes = await req.queryTenant(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);
    
    // Get paginated events
    params.push(parseInt(limit, 10));
    const limitIdx = params.length;
    params.push(parseInt(offset, 10));
    const offsetIdx = params.length;
    
    const query = `SELECT * FROM events ${whereString} ORDER BY ts DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    
    const result = await req.queryTenant(query, params);
    res.json({ events: result.rows, total });
  } catch (error) {
    console.error('[Dashboard] getEvents error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMachines = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);

    
    let query = 'SELECT * FROM machines';
    const params = [];
    
    if (aggregator) {
      query += ' WHERE aggregator_name = $1';
      params.push(aggregator);
    }
    
    const result = await req.queryTenant(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[Dashboard] getMachines error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

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

const crypto = require('crypto');

async function buildChains(req, from, to, machine, aggregator) {
  let params = [from, to];
  let pIdx = 3;
  let where = "WHERE ts>=$1 AND ts<=$2 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
  
  if (machine) {
    where += ` AND machine=$${pIdx}`;
    params.push(machine);
    pIdx++;
  }
  
  if (aggregator) {
    where += ` AND aggregator_name=$${pIdx}`;
    params.push(aggregator);
    pIdx++;
  }
  const eventsRes = await req.queryTenant(`SELECT e.*, i.id as incident_id, i.assigned_to as incident_assigned_to, i.status as incident_status
     FROM events e
     LEFT JOIN incident_events ie ON ie.event_id = e.id
     LEFT JOIN incidents i ON i.id = ie.incident_id
     ${where.replace(/ts/g, 'e.ts').replace(/message/g, 'e.message').replace(/tag/g, 'e.tag').replace(/machine/g, 'e.machine').replace(/aggregator_name/g, 'e.aggregator_name')} AND e.is_noise=false AND e.severity IN ('critical','high','medium') ORDER BY e.machine,e.ts`, params
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
    const aggregator = getEffectiveAggregator(req);
    const machine = req.query.machine || '';
    const hours = Number(req.query.hours || req.query.range || 24);
    const to = nowUTC();
    const from = hoursAgoUTC(hours);

    
    let nw = "WHERE ts>=$1 AND ts<=$2 AND is_noise=false AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
    const bp = [from, to];
    let pIdx = 3;
    
    if (machine) {
      nw += ` AND machine=$${pIdx}`;
      bp.push(machine);
      pIdx++;
    }
    
    if (aggregator) {
      nw += ` AND aggregator_name=$${pIdx}`;
      bp.push(aggregator);
      pIdx++;
    }
    
    const totalRes = await req.queryTenant('SELECT COUNT(*) AS n FROM events ' + nw, bp);
    const total = parseInt(totalRes.rows[0].n, 10);

    const bySevRes = await req.queryTenant('SELECT severity,COUNT(*) AS n FROM events ' + nw + ' GROUP BY severity', bp);
    const bySev = bySevRes.rows;

    const byCatRes = await req.queryTenant('SELECT category,COUNT(*) AS n FROM events ' + nw + ' GROUP BY category ORDER BY n DESC', bp);
    const byCat = byCatRes.rows;

    const byMachineRes = await req.queryTenant('SELECT machine,COUNT(*) AS n FROM events ' + nw + ' GROUP BY machine ORDER BY n DESC', bp);
    const byMachine = byMachineRes.rows;

    const byMachineSevRes = await req.queryTenant("SELECT machine,severity,COUNT(*) AS n FROM events " + nw + " AND severity IN ('critical','high') GROUP BY machine,severity", bp);
    const byMachineSev = byMachineSevRes.rows;

    let machinesQuery = 'SELECT * FROM machines';
    const machinesParams = [];
    if (aggregator) {
      machinesQuery += ' WHERE aggregator_name=$1';
      machinesParams.push(aggregator);
    }
    machinesQuery += ' ORDER BY last_seen DESC';
    const machinesRes = await req.queryTenant(machinesQuery, machinesParams);
    const machines = machinesRes.rows;

    const hourlyRes = await req.queryTenant("SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour,severity,COUNT(*) AS n FROM events " + nw + " GROUP BY hour,severity ORDER BY hour", bp);
    const hourly = hourlyRes.rows;

    const criticalRes = await req.queryTenant("SELECT * FROM events " + nw.replace('WHERE', "WHERE severity = 'critical' AND") + " ORDER BY ts DESC LIMIT 20", bp);
    const critical = criticalRes.rows;

    const criticalStatsRes = await req.queryTenant("SELECT COALESCE(category, tag, 'Unknown') as type, COUNT(*) as n FROM events " + nw.replace('WHERE', "WHERE severity = 'critical' AND") + " GROUP BY type", bp);
    const criticalStats = criticalStatsRes.rows;
    const totalCritical = criticalStats.reduce((sum, row) => sum + parseInt(row.n, 10), 0);

    const chains = await buildChains(req, from, to, machine, aggregator);

    res.json({ total, bySev, byCat, byMachine, byMachineSev, machines, hourly, critical, criticalStats, totalCritical, chains });
  } catch (error) {
    console.error('[Dashboard] getStats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


const getADAttacks = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);
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

    const rows = await Event.getAdAttacks(req, aggregator, machine, 3000, from, to);
    let events = rows.map(r => {
      const ad = parseAdEvent(r.machine, r.tag, r.message, r.severity);
      if (!ad) return null;
      return { ...ad, ts: r.ts, machine: r.machine, tag: r.tag, id: r.id, aggregator_name: r.aggregator_name, incident_id: r.incident_id, incident_assigned_to: r.incident_assigned_to, incident_status: r.incident_status };
    }).filter(Boolean);

    if (machine) {
      events = events.filter(a => a.machine === machine || a.target_machine === machine || a.actor === machine || a.remote_ip === machine);
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

    const offset = (page - 1) * limit;
    const paginatedEvents = events.slice(offset, offset + limit);

    return res.status(200).json({ events: paginatedEvents, stats: { total, critical, high } });
  } catch (error) {
    console.error('[Dashboard] Failed to get AD attacks:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getMaliciousEvents = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);
    const machine = req.query.machine || '';
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

    const rows = await Event.getMaliciousEvents(req, aggregator, machine, 3000, from, to);
    let events = rows.map(r => {
      const parsed = parseMaliciousEvent(r);
      if (!parsed) return null;
      return { ...parsed, id: r.id, aggregator_name: r.aggregator_name, incident_id: r.incident_id, incident_assigned_to: r.incident_assigned_to, incident_status: r.incident_status };
    }).filter(Boolean);

    if (search) {
      events = events.filter(a => Object.values(a).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(search)));
    }
    if (severity !== 'all') {
      events = events.filter(a => (a.severity || 'info').toLowerCase() === severity);
    }

    const total = events.length;
    const critical = events.filter(a => (a.severity || '').toLowerCase() === 'critical').length;
    const high = events.filter(a => (a.severity || '').toLowerCase() === 'high').length;

    const offset = (page - 1) * limit;
    const paginatedEvents = events.slice(offset, offset + limit);

    return res.status(200).json({ events: paginatedEvents, stats: { total, critical, high } });
  } catch (error) {
    console.error('[Dashboard] Failed to get malicious events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getUsbEvents = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);
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
    const rows = await Event.getUsbEvents(req, aggregator, machine, 500, from, to);
    const out = rows.map(r => ({ ...parseUsbEvent(r), aggregator_name: r.aggregator_name })).filter(Boolean);
    return res.status(200).json({ events: out, stats: { total: out.length } });
  } catch (error) {
    console.error('[Dashboard] Failed to get USB events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getUserEvents = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);
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
    const rows = await Event.getUserEvents(req, aggregator, machine, 500, from, to);
    let out = rows.map(r => ({ ...parseUserEvent(r), aggregator_name: r.aggregator_name }));
    
    const search = (req.query.search || '').toLowerCase();
    const actor = (req.query.actor || '').toLowerCase();
    const action = (req.query.action || '').toLowerCase();
    const sort = req.query.sort || 'newest';
    const severity = (req.query.severity || 'all').toLowerCase();
    const isPrivileged = req.query.isPrivileged === 'true';
    const excludeSystem = req.query.excludeSystem === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (search) {
      out = out.filter(a => Object.values(a).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(search)));
    }
    if (severity !== 'all') {
      out = out.filter(a => (a.severity || 'info').toLowerCase() === severity);
    }
    if (actor) {
      out = out.filter(a => (a.actor || '').toLowerCase().includes(actor));
    }
    if (action) {
      out = out.filter(a => (a.action || '').toLowerCase().includes(action));
    }
    if (isPrivileged) {
      out = out.filter(a => !!a.is_privileged);
    }
    if (excludeSystem) {
      out = out.filter(a => !/\b(system|SYSTEM)\b/.test(a.actor) && !a.actor.endsWith('$') && !/\b(system|SYSTEM)\b/.test(a.target_machine));
    }
    
    if (sort === 'oldest') {
      out.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    } else if (sort === 'severity') {
      const sevMap = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      out.sort((a, b) => sevMap[(b.severity || 'info').toLowerCase()] - sevMap[(a.severity || 'info').toLowerCase()]);
    } else {
      out.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    }

    const total = out.length;

    return res.status(200).json({ events: out, stats: { total, critical: 0, high: 0 } });
  } catch (error) {
    console.error('[Dashboard] Failed to get user events:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};


const getTopLevelStats = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);

    
    let condition = '';
    const params = [];
    
    if (aggregator) {
      condition = 'WHERE aggregator_name = $1';
      params.push(aggregator);
    }
    
    const countRes = await req.queryTenant(`SELECT COUNT(*) FROM events ${condition}`, params);
    
    res.json({ total: parseInt(countRes.rows[0].count, 10) });
  } catch (error) {
    console.error('[Dashboard] getTopLevelStats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const getNetworkTopology = async (req, res) => {
  try {
    const aggregator = getEffectiveAggregator(req);

    const { machine, hours = 24 } = req.query;
    
    let whereClauses = ["last_seen >= NOW() - INTERVAL '1 hour' * $1"];
    const params = [hours];
    
    if (aggregator) {
      params.push(aggregator);
      whereClauses.push(`aggregator_name = $${params.length}`);
    }
    
    if (machine) {
      params.push(machine);
      whereClauses.push(`name = $${params.length}`);
    }
    
    const mRes = await req.queryTenant(`SELECT * FROM machines WHERE ${whereClauses.join(' AND ')}`, params);
    const machines = mRes.rows;
    
    if (machines.length === 0) {
      return res.json({ inbound: [], outbound: [], lateral: [], ad_attacks: [], machines: [] });
    }

    const inbound = [];
    const outbound = [];
    const lateral = [];
    const ad_attacks = [];
    
    // Cleaned up mock network simulation. 
    // Return real machines with empty connection arrays until real network tracking is implemented.
    
    res.json({
      inbound,
      outbound,
      lateral,
      ad_attacks,
      machines
    });

  } catch (error) {
    console.error('[Dashboard] Error generating topology:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getADAttacks,
  getMaliciousEvents,
  getUsbEvents,
  getUserEvents,
  getEvents,
  getMachines,
  getStats,
    getTopLevelStats,
  getNetworkTopology
};