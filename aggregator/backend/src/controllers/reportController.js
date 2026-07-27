const db = require('../config/db');

const generateReport = async (req, res) => {
  try {
    const {
      duration = '24',
      from_date = '',
      to_date = '',
      machine = '',
      severity = '',
      category = '',
      src_ip = '',
      dst_ip = '',
      action = '',
      include_fw = '1',
    } = req.query;

    let fromDate, toDate;
    if (from_date && to_date) {
      fromDate = new Date(from_date);
      toDate = new Date(to_date);
    } else {
      const hours = parseFloat(duration) || 24;
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - hours * 3600000);
    }

    // SQLite format: YYYY-MM-DD HH:MM:SS (UTC) -> We can still use it for PG
    const to = toDate.toISOString().slice(0, 19).replace('T', ' ');
    const from = fromDate.toISOString().slice(0, 19).replace('T', ' ');

    // ── Base event query builder ──────────────────────────────────────────────
    const evConds = ['ts>=$1', 'ts<=$2', 'is_noise=0', "message NOT ILIKE '%iochuntwatchdog%'", "tag NOT ILIKE '%iochuntwatchdog%'"];
    const evParams = [from, to];
    let evIdx = 3;
    if (machine) { evConds.push(`machine=$${evIdx++}`); evParams.push(machine); }
    if (severity) { evConds.push(`severity=$${evIdx++}`); evParams.push(severity); }
    if (category) { evConds.push(`category=$${evIdx++}`); evParams.push(category); }
    const evWhere = 'WHERE ' + evConds.join(' AND ');

    // ── Event stats ───────────────────────────────────────────────────────────
    const totalEvents = parseInt((await db.query(`SELECT COUNT(*) AS n FROM events ${evWhere}`, evParams)).rows[0].n, 10);

    const bySeverity = (await db.query(`SELECT severity, COUNT(*) AS n FROM events ${evWhere} GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`, evParams)).rows;

    const byCategory = (await db.query(`SELECT category, COUNT(*) AS n FROM events ${evWhere} GROUP BY category ORDER BY n DESC LIMIT 15`, evParams)).rows;

    const byMachine = (await db.query(`SELECT machine, COUNT(*) AS n FROM events ${evWhere} GROUP BY machine ORDER BY n DESC LIMIT 20`, evParams)).rows;

    const hourly = (await db.query(`SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour, severity, COUNT(*) AS n FROM events ${evWhere} GROUP BY hour, severity ORDER BY hour ASC`, evParams)).rows;

    const topTags = (await db.query(`SELECT tag, COUNT(*) AS n FROM events ${evWhere} GROUP BY tag ORDER BY n DESC LIMIT 10`, evParams)).rows;

    const criticalEvents = (await db.query(`SELECT machine, ts, tag, category, severity, message FROM events ${evWhere.replace('is_noise=0', "is_noise=0 AND severity IN ('critical','high')")} ORDER BY ts DESC LIMIT 300`, evParams)).rows;

    // ── AD attacks in window ──────────────────────────────────────────────────
    const adWhere = evWhere + ` AND (category='DOMAIN' OR category='ADCS'
      OR tag LIKE '%DCSYNC%' OR tag LIKE '%KERBEROAST%' OR tag LIKE '%SPRAY%'
      OR tag LIKE '%SHADOW-CRED%' OR tag LIKE '%ESC%' OR tag LIKE '%CERTIPY%'
      OR tag LIKE '%PASS-THE-HASH%' OR tag LIKE '%SKELETON-KEY%')`;
    const adEvents = (await db.query(`SELECT machine, ts, tag, severity, message FROM events ${adWhere} ORDER BY ts DESC LIMIT 50`, evParams)).rows;

    // ── User account events ───────────────────────────────────────────────────
    const userWhere = evWhere + ` AND (tag LIKE '%USER-CREATED%' OR tag LIKE '%USER-DELETED%'
      OR tag LIKE '%USER-ENABLED%' OR tag LIKE '%USER-DISABLED%'
      OR tag LIKE '%GROUP-MEMBER%' OR tag LIKE '%LOG-CLEARED%'
      OR tag LIKE '%PASSWORD-RESET%' OR tag LIKE '%AUDIT-POLICY%')`;
    const userEvents = (await db.query(`SELECT machine, ts, tag, severity, message FROM events ${userWhere} ORDER BY ts DESC LIMIT 50`, evParams)).rows;

    // ── Machine summary ───────────────────────────────────────────────────────
    const machines = (await db.query('SELECT * FROM machines ORDER BY last_seen DESC')).rows;
    const machineSummary = [];
    for (const m of machines) {
      const p2 = [...evParams]; const c2 = [...evConds, `machine=$${evIdx}`]; p2.push(m.id);
      const w2 = 'WHERE ' + c2.join(' AND ');
      const stats = (await db.query(`SELECT severity, COUNT(*) AS n FROM events ${w2} GROUP BY severity`, p2)).rows;
      const sv = {}; stats.forEach(r => { sv[r.severity] = r.n; });
      const age = Math.floor(Date.now() / 1000) - (m.last_seen || 0);
      machineSummary.push({
        id: m.id, label: m.label || m.id, ip: m.ip || '',
        last_seen: m.last_seen, event_count: m.event_count || 0,
        critical: sv.critical || 0, high: sv.high || 0, medium: sv.medium || 0,
        age_seconds: age,
        status: age < 180 ? 'Online' : age < 600 ? 'Recent' : age < 3600 ? 'Away' : 'Offline',
      });
    }

    // ── Firewall stats ────────────────────────────────────────────────────────
    let fwStats = null;
    if (include_fw === '1') {
      const fwConds = ['ts>=$1', 'ts<=$2'];
      const fwParams = [from, to];
      let fwIdx = 3;
      if (src_ip) { fwConds.push(`src_ip LIKE $${fwIdx++}`); fwParams.push('%' + src_ip + '%'); }
      if (dst_ip) { fwConds.push(`dst_ip LIKE $${fwIdx++}`); fwParams.push('%' + dst_ip + '%'); }
      if (action) { fwConds.push(`action=$${fwIdx++}`); fwParams.push(action); }
      const fwWhere = 'WHERE ' + fwConds.join(' AND ');

      const fwTotal = parseInt((await db.query(`SELECT COUNT(*) AS n FROM fw_events ${fwWhere}`, fwParams)).rows[0].n, 10);
      const fwBySev = (await db.query(`SELECT severity, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY severity`, fwParams)).rows;
      const fwByAct = (await db.query(`SELECT action, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY action ORDER BY n DESC`, fwParams)).rows;
      const fwTopSrc = (await db.query(`SELECT src_ip, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY src_ip ORDER BY n DESC LIMIT 10`, fwParams)).rows;
      const fwTopDst = (await db.query(`SELECT dst_ip, dst_port, service, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY dst_ip, dst_port, service ORDER BY n DESC LIMIT 10`, fwParams)).rows;
      const fwTopSvc = (await db.query(`SELECT service, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY service ORDER BY n DESC LIMIT 10`, fwParams)).rows;
      const fwBlocked = (await db.query(`SELECT * FROM fw_events ${fwWhere} AND (action='deny' OR action='drop') ORDER BY ts DESC LIMIT 50`, fwParams)).rows;
      const fwHourly = (await db.query(`SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour, action, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY hour, action ORDER BY hour ASC`, fwParams)).rows;

      fwStats = { total: fwTotal, bySev: fwBySev, byAction: fwByAct, topSrc: fwTopSrc, topDst: fwTopDst, topService: fwTopSvc, blocked: fwBlocked, hourly: fwHourly };
    }

    res.json({
      generated: new Date().toISOString(),
      filters: { from, to, duration, machine, severity, category, src_ip, dst_ip, action },
      events: { total: totalEvents, bySeverity, byCategory, byMachine, hourly, topTags, critical: criticalEvents },
      ad_attacks: adEvents,
      user_events: userEvents,
      machines: machineSummary,
      firewall: fwStats,
    });
  } catch (e) {
    console.error('[reports]', e.message);
    res.status(500).json({ error: e.message });
  }
};

const generateBaseline = async (req, res) => {
  try {
    const machine = req.query.machine || null;
    const days = parseInt(req.query.days) || 7;
    const from = new Date(Date.now() - days * 86400000)
      .toISOString().slice(0, 19).replace('T', ' ');

    const where = machine ? "AND machine=$2 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'" : "AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
    const args = machine ? [from, machine] : [from];

    // ── Total events
    const total = parseInt((await db.query(`SELECT COUNT(*) as n FROM events WHERE ts>=$1 ${where}`, args)).rows[0].n, 10);

    // ── By severity
    const bySeverity = (await db.query(
      `SELECT severity, COUNT(*) as n FROM events WHERE ts>=$1 ${where}
       GROUP BY severity ORDER BY n DESC`, args)).rows;

    // ── By category
    const byCategory = (await db.query(
      `SELECT category, COUNT(*) as n FROM events WHERE ts>=$1 ${where}
       GROUP BY category ORDER BY n DESC LIMIT 20`, args)).rows;

    // ── By machine (for overall report)
    const byMachine = machine ? [] : (await db.query(
      `SELECT machine, COUNT(*) as n FROM events WHERE ts>=$1
       GROUP BY machine ORDER BY n DESC LIMIT 20`, [from])).rows;

    // ── Top IOCs (blocklist hits)
    const topIocs = (await db.query(
      `SELECT message, COUNT(*) as n FROM events
       WHERE ts>=$1 ${where} AND (category='DOMAIN' OR category='NETWORK' OR message LIKE '%block%')
       GROUP BY message ORDER BY n DESC LIMIT 10`, args)).rows;

    // ── Critical events
    const criticals = (await db.query(
      `SELECT ts, machine, category, message FROM events
       WHERE ts>=$1 ${where} AND severity='critical'
       ORDER BY ts DESC LIMIT 50`, args)).rows;

    // ── Tamper events
    const tampers = (await db.query(
      `SELECT ts, machine, message FROM events
       WHERE ts>=$1 ${where} AND (message LIKE '%TAMPER%' OR message LIKE '%MITM%')
       ORDER BY ts DESC LIMIT 20`, args)).rows;

    // ── Hourly activity (last 24h)
    const hourlyWhere = machine ? "AND machine=$1 AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'" : "AND message NOT ILIKE '%iochuntwatchdog%' AND tag NOT ILIKE '%iochuntwatchdog%'";
    const hourlyArgs = machine ? [machine] : [];
    const hourly = (await db.query(
      `SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') as hour, COUNT(*) as n
       FROM events WHERE ts>=NOW() - INTERVAL '1 day' ${hourlyWhere}
       GROUP BY hour ORDER BY hour ASC`, hourlyArgs)).rows;

    // ── Daily trend
    const daily = (await db.query(
      `SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD') as day, COUNT(*) as n
       FROM events WHERE ts>=$1 ${where}
       GROUP BY day ORDER BY day ASC`, args)).rows;

    // ── Machine list
    const machines = (await db.query(
      `SELECT DISTINCT machine FROM events WHERE ts>=$1 ${where} ORDER BY machine`, args
    )).rows.map(r => r.machine);

    res.json({
      generated: new Date().toISOString(),
      machine: machine || 'ALL',
      days,
      from,
      total,
      bySeverity,
      byCategory,
      byMachine,
      topIocs,
      criticals,
      tampers,
      hourly,
      daily,
      machines
    });
  } catch (e) {
    console.error('[baseline]', e.message);
    res.status(500).json({ error: e.message });
  }
};

module.exports = {
  generateReport,
  generateBaseline
};
