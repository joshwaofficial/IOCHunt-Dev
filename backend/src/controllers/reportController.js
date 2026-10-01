

const { parseSafeInt, isIdentifier } = require('../utils/inputValidator');

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
      aggregator = '',
    } = req.query || {};

    let fromDate, toDate;
    if (from_date && to_date) {
      fromDate = new Date(from_date);
      toDate = new Date(to_date);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        toDate = new Date();
        fromDate = new Date(toDate.getTime() - 24 * 3600000);
      }
    } else if (duration === 'today') {
      toDate = new Date();
      fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0);
    } else {
      const rawHours = parseFloat(duration);
      const hours = (!isNaN(rawHours) && rawHours > 0 && rawHours <= 8760) ? rawHours : 24;
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - hours * 3600000);
    }
    
    // SQLite format: YYYY-MM-DD HH:MM:SS (UTC) -> We can still use it for PG
    const to = toDate.toISOString().slice(0, 19).replace('T', ' ');
    const from = fromDate.toISOString().slice(0, 19).replace('T', ' ');

    // ── Base event query builder ──────────────────────────────────────────────
    const evConds = ['ts>=$1', 'ts<=$2', 'is_noise=false'];
    const evParams = [from, to];
    let evIdx = 3;
    if (machine) { evConds.push(`machine=$${evIdx++}`); evParams.push(machine); }
    
    let aggrs = [];
    if (aggregator && aggregator !== 'All Aggregators') {
      aggrs = aggregator.split(',').map(a => a.trim()).filter(a => isIdentifier(a, 1, 64));
      if (aggrs.length > 0) {
        const placeholders = aggrs.map(a => {
          evParams.push(a);
          return `$${evIdx++}`;
        }).join(',');
        evConds.push(`aggregator_name IN (${placeholders})`);
      }
    }

    if (severity) { evConds.push(`severity=$${evIdx++}`); evParams.push(severity); }

    let selectedCats = [];
    if (category && category !== 'All Categories') {
      selectedCats = (Array.isArray(category) ? category : category.split(','))
        .map(c => c.trim().toUpperCase())
        .filter(Boolean);
    }

    const nonFwCats = selectedCats.filter(c => c !== 'FIREWALL');
    const hasFwSelected = selectedCats.includes('FIREWALL');

    if (selectedCats.length > 0) {
      if (nonFwCats.length > 0) {
        const catPlaceholders = nonFwCats.map(c => {
          evParams.push(c);
          return `$${evIdx++}`;
        }).join(',');
        evConds.push(`category IN (${catPlaceholders})`);
      } else {
        // User selected ONLY 'FIREWALL' category
        evConds.push('1=0');
      }
    }
    const evWhere = 'WHERE ' + evConds.join(' AND ');

    // ── Event stats ───────────────────────────────────────────────────────────
    const totalEvents = parseInt((await req.queryTenant(`SELECT COUNT(*) AS n FROM events ${evWhere}`, evParams)).rows[0].n, 10);

    const bySeverity = (await req.queryTenant(`SELECT severity, COUNT(*) AS n FROM events ${evWhere} GROUP BY severity ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`, evParams)).rows;

    const byCategory = (await req.queryTenant(`SELECT category, COUNT(*) AS n FROM events ${evWhere} GROUP BY category ORDER BY n DESC LIMIT 15`, evParams)).rows;

    const byMachine = (await req.queryTenant(`SELECT machine, COUNT(*) AS n FROM events ${evWhere} GROUP BY machine ORDER BY n DESC LIMIT 20`, evParams)).rows;

    const hourly = (await req.queryTenant(`SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour, severity, COUNT(*) AS n FROM events ${evWhere} GROUP BY hour, severity ORDER BY hour ASC`, evParams)).rows;

    const topTags = (await req.queryTenant(`SELECT tag, COUNT(*) AS n FROM events ${evWhere} GROUP BY tag ORDER BY n DESC LIMIT 25`, evParams)).rows;

    // Retrieve ALL events matching the filters without any limitation
    const reportEvents = (await req.queryTenant(
      `SELECT machine, ts, tag, category, severity, message FROM events ${evWhere} ORDER BY ts DESC`,
      evParams
    )).rows;

    // ── AD attacks in window ──────────────────────────────────────────────────
    const adWhere = evWhere + ` AND (category='DOMAIN' OR category='ADCS'
      OR tag LIKE '%DCSYNC%' OR tag LIKE '%KERBEROAST%' OR tag LIKE '%SPRAY%'
      OR tag LIKE '%SHADOW-CRED%' OR tag LIKE '%ESC%' OR tag LIKE '%CERTIPY%'
      OR tag LIKE '%PASS-THE-HASH%' OR tag LIKE '%SKELETON-KEY%')`;
    const adEvents = (await req.queryTenant(`SELECT machine, ts, tag, severity, message FROM events ${adWhere} ORDER BY ts DESC`, evParams)).rows;

    // ── User account events ───────────────────────────────────────────────────
    const userWhere = evWhere + ` AND (tag LIKE '%USER-CREATED%' OR tag LIKE '%USER-DELETED%'
      OR tag LIKE '%USER-ENABLED%' OR tag LIKE '%USER-DISABLED%'
      OR tag LIKE '%GROUP-MEMBER%' OR tag LIKE '%LOG-CLEARED%'
      OR tag LIKE '%PASSWORD-RESET%' OR tag LIKE '%AUDIT-POLICY%')`;
    const userEvents = (await req.queryTenant(`SELECT machine, ts, tag, severity, message FROM events ${userWhere} ORDER BY ts DESC`, evParams)).rows;

    // ── Machine summary (Optimized single-query group by) ──────────────────────
    const machines = (await req.queryTenant('SELECT * FROM machines ORDER BY last_seen DESC')).rows;
    const machSevRows = (await req.queryTenant(`
      SELECT machine, severity, COUNT(*) AS n 
      FROM events ${evWhere} 
      GROUP BY machine, severity
    `, evParams)).rows;

    const machSevMap = {};
    machSevRows.forEach(r => {
      if (!machSevMap[r.machine]) machSevMap[r.machine] = {};
      machSevMap[r.machine][r.severity] = parseInt(r.n, 10);
    });

    const machineSummary = [];
    for (const m of machines) {
      if (aggrs.length > 0 && !aggrs.includes(m.aggregator_name)) continue;
      const sv = machSevMap[m.id] || {};
      const lastSeenEpoch = m.last_seen ? Math.floor(new Date(m.last_seen).getTime() / 1000) : 0;
      const age = Math.floor(Date.now() / 1000) - lastSeenEpoch;
      machineSummary.push({
        id: m.id, label: m.label || m.id, ip: m.ip || '',
        last_seen: m.last_seen, event_count: m.event_count || 0,
        critical: sv.critical || 0, high: sv.high || 0, medium: sv.medium || 0,
        age_seconds: age,
        status: age < 180 ? 'Online' : age < 600 ? 'Recent' : age < 3600 ? 'Away' : 'Offline',
      });
    }

    // ── USB Policy & Machine Compliance Summary ───────────────────────────────
    let usbCompliance = null;
    try {
      const polRows = (await req.queryTenant('SELECT machine, policy_json, current_json, applied_at, updated_at FROM policies')).rows;
      const grpRows = (await req.queryTenant('SELECT id, name, policy_json, updated_at FROM pol_groups')).rows;
      const mgRows = (await req.queryTenant('SELECT machine, group_id FROM machine_groups')).rows;

      // Count USB events in the report window per machine
      const usbEventRows = (await req.queryTenant(`
        SELECT machine, COUNT(*) AS n 
        FROM events 
        WHERE (category='USB' OR tag ILIKE '%USB%' OR message ILIKE '%USB%')
          AND ts>=$1 AND ts<=$2
        GROUP BY machine
      `, [from, to])).rows;
      const usbEventMap = {};
      usbEventRows.forEach(r => { usbEventMap[r.machine] = parseInt(r.n, 10); });

      const polMap = {};
      polRows.forEach(p => { polMap[(p.machine || '').toLowerCase()] = p; });

      const grpMap = {};
      grpRows.forEach(g => { grpMap[g.id] = g; });

      const mgMap = {};
      mgRows.forEach(mg => { mgMap[(mg.machine || '').toLowerCase()] = mg.group_id; });

      const complianceList = [];
      let totalLocked = 0;
      let totalUnlocked = 0;
      let totalCompliant = 0;
      let totalNonCompliant = 0;
      let totalViolations = 0;

      for (const m of machines) {
        if (aggrs.length > 0 && !aggrs.includes(m.aggregator_name)) continue;

        const mKey = (m.id || '').toLowerCase();
        const p = polMap[mKey] || {};
        const gId = mgMap[mKey];
        const g = gId ? grpMap[gId] : null;

        let pj = {};
        let cj = {};
        let gj = {};
        try { pj = JSON.parse(p.policy_json || '{}'); } catch (_) {}
        try { cj = JSON.parse(p.current_json || '{}'); } catch (_) {}
        try { gj = JSON.parse(g?.policy_json || '{}'); } catch (_) {}

        // Target configured USB lock: machine override > group setting > default ('unlocked')
        const targetUsbLock = pj.usbLock !== undefined ? pj.usbLock : (gj.usbLock !== undefined ? gj.usbLock : 'unlocked');
        const configuredState = targetUsbLock === 'locked' ? 'Disabled (Locked)' : 'Enabled (Allowed)';

        // Current reported USB lock from agent:
        const currentUsbLock = cj.usbLock !== undefined ? cj.usbLock : null;
        const currentState = currentUsbLock ? (currentUsbLock === 'locked' ? 'Disabled (Locked)' : 'Enabled (Allowed)') : 'Unknown';

        // Pickup / sync evaluation
        const effectiveUpdatedAt = Math.max(g?.updated_at || 0, p.updated_at || 0);
        const isTimeSynced = Boolean(p.applied_at && (!effectiveUpdatedAt || p.applied_at >= effectiveUpdatedAt));
        const isStateSynced = currentUsbLock !== null ? (currentUsbLock === targetUsbLock) : isTimeSynced;

        const lastSeenEpoch = m.last_seen ? Math.floor(new Date(m.last_seen).getTime() / 1000) : 0;
        const age = Math.floor(Date.now() / 1000) - lastSeenEpoch;
        const isOnline = age < 600;

        let status = 'Compliant';
        let statusBadge = 'success'; // 'success', 'warning', 'danger', 'offline'

        if (!isOnline && age > 86400) {
          status = 'Offline';
          statusBadge = 'offline';
          totalNonCompliant++;
        } else if (!isStateSynced || !isTimeSynced) {
          if (currentUsbLock && currentUsbLock !== targetUsbLock) {
            status = 'Policy Mismatch';
            statusBadge = 'danger';
            totalNonCompliant++;
          } else {
            status = 'Pending Sync';
            statusBadge = 'warning';
            totalNonCompliant++;
          }
        } else {
          status = 'Compliant';
          statusBadge = 'success';
          totalCompliant++;
        }

        if (targetUsbLock === 'locked') totalLocked++;
        else totalUnlocked++;

        const usbEventsCount = usbEventMap[m.id] || 0;
        if (targetUsbLock === 'locked' && usbEventsCount > 0) {
          totalViolations += usbEventsCount;
        }

        complianceList.push({
          machine: m.id,
          label: m.label || m.id,
          ip: m.ip || '-',
          aggregator_name: m.aggregator_name || 'direct',
          group_name: g?.name || 'Ungrouped',
          configured_usb: configuredState,
          configured_lock: targetUsbLock,
          current_usb: currentState,
          current_lock: currentUsbLock,
          status,
          status_badge: statusBadge,
          is_compliant: status === 'Compliant',
          applied_at: p.applied_at ? new Date(p.applied_at * 1000).toISOString() : null,
          usb_events_count: usbEventsCount,
          last_seen: m.last_seen
        });
      }

      usbCompliance = {
        summary: {
          total_machines: complianceList.length,
          total_locked: totalLocked,
          total_unlocked: totalUnlocked,
          compliant: totalCompliant,
          non_compliant: totalNonCompliant,
          total_violations: totalViolations
        },
        machines: complianceList
      };
    } catch (usbErr) {
      console.warn('[reports usb compliance error]', usbErr.message);
      usbCompliance = null;
    }

    // ── Firewall stats ────────────────────────────────────────────────────────
    let shouldIncludeFw = include_fw === '1';
    if (selectedCats.length > 0) {
      shouldIncludeFw = hasFwSelected;
    }

    let fwStats = null;
    if (shouldIncludeFw) {
      try {
        const fwConds = ['ts>=$1', 'ts<=$2'];
        const fwParams = [from, to];
        let fwIdx = 3;
        if (src_ip) { fwConds.push(`src_ip LIKE $${fwIdx++}`); fwParams.push('%' + src_ip + '%'); }
        if (dst_ip) { fwConds.push(`dst_ip LIKE $${fwIdx++}`); fwParams.push('%' + dst_ip + '%'); }
        if (action) { fwConds.push(`action=$${fwIdx++}`); fwParams.push(action); }
        if (aggrs.length > 0) {
          const fwPlaceholders = aggrs.map(a => {
            fwParams.push(a);
            return `$${fwIdx++}`;
          }).join(',');
          fwConds.push(`aggregator_name IN (${fwPlaceholders})`);
        }
        const fwWhere = 'WHERE ' + fwConds.join(' AND ');

        const fwTotal = parseInt((await req.queryTenant(`SELECT COUNT(*) AS n FROM fw_events ${fwWhere}`, fwParams)).rows[0]?.n || 0, 10);
        const fwBySev = (await req.queryTenant(`SELECT severity, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY severity`, fwParams)).rows;
        const fwByAct = (await req.queryTenant(`SELECT action, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY action ORDER BY n DESC`, fwParams)).rows;
        const fwTopSrc = (await req.queryTenant(`SELECT src_ip, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY src_ip ORDER BY n DESC LIMIT 10`, fwParams)).rows;
        const fwTopDst = (await req.queryTenant(`SELECT dst_ip, dst_port, service, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY dst_ip, dst_port, service ORDER BY n DESC LIMIT 10`, fwParams)).rows;
        const fwTopSvc = (await req.queryTenant(`SELECT service, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY service ORDER BY n DESC LIMIT 10`, fwParams)).rows;
        const fwBlocked = (await req.queryTenant(`SELECT * FROM fw_events ${fwWhere} AND (action='deny' OR action='drop') ORDER BY ts DESC LIMIT 50`, fwParams)).rows;
        
        let fwHourly = [];
        try {
          fwHourly = (await req.queryTenant(`SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour, action, COUNT(*) AS n FROM fw_events ${fwWhere} GROUP BY hour, action ORDER BY hour ASC`, fwParams)).rows;
        } catch (_) {}

        // Detailed firewall event log entries (safe SELECT * avoids missing column errors)
        const fwDetailedRows = (await req.queryTenant(`
          SELECT *
          FROM fw_events ${fwWhere}
          ORDER BY ts DESC LIMIT 200
        `, fwParams)).rows;

        const fwDetailedEvents = fwDetailedRows.map(e => ({
          id: e.id,
          ts: e.ts,
          devname: e.devname || e.machine || '',
          src_ip: e.src_ip || '',
          dst_ip: e.dst_ip || '',
          dst_port: e.dst_port || 0,
          action: e.action || '',
          service: e.service || '',
          severity: e.severity || 'info',
          policy: e.policy || '',
          fw_user: e.fw_user || '',
          fw_ui: e.fw_ui || '',
          msg: e.msg || e.raw || '',
          subtype: e.subtype || '',
          log_type: e.log_type || '',
          cfgpath: e.cfgpath || '',
          cfgobj: e.cfgobj || '',
          cfgattr: e.cfgattr || '',
          logdesc: e.logdesc || '',
          session_id: e.session_id || ''
        }));

        fwStats = { total: fwTotal, bySev: fwBySev, byAction: fwByAct, topSrc: fwTopSrc, topDst: fwTopDst, topService: fwTopSvc, blocked: fwBlocked, hourly: fwHourly, events: fwDetailedEvents };
      } catch (fwErr) {
        console.warn('[reports firewall query note]', fwErr.message);
        fwStats = null;
      }
    }

    res.json({
      generated: new Date().toISOString(),
      filters: { from, to, duration, machine, severity, category: selectedCats.length > 0 ? selectedCats.join(', ') : '', src_ip, dst_ip, action },
      events: { total: totalEvents, bySeverity, byCategory, byMachine, hourly, topTags, critical: reportEvents, items: reportEvents },
      ad_attacks: adEvents,
      user_events: userEvents,
      machines: machineSummary,
      firewall: fwStats,
      usb_compliance: usbCompliance,
    });
  } catch (e) {
    console.error('[reports]', e.message);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

const generateBaseline = async (req, res) => {
  try {
    const machine = req.query.machine || null;
    const days = parseSafeInt(req.query.days, 7, 1, 365);
    const from = new Date(Date.now() - days * 86400000)
      .toISOString().slice(0, 19).replace('T', ' ');

    const where = machine ? 'AND machine=$2' : '';
    const args = machine ? [from, machine] : [from];

    // ── Total events
    const total = parseInt((await req.queryTenant(`SELECT COUNT(*) as n FROM events WHERE ts>=$1 ${where}`, args)).rows[0].n, 10);

    // ── By severity
    const bySeverity = (await req.queryTenant(
      `SELECT severity, COUNT(*) as n FROM events WHERE ts>=$1 ${where}
       GROUP BY severity ORDER BY n DESC`, args)).rows;

    // ── By category
    const byCategory = (await req.queryTenant(
      `SELECT category, COUNT(*) as n FROM events WHERE ts>=$1 ${where}
       GROUP BY category ORDER BY n DESC LIMIT 20`, args)).rows;

    // ── By machine (for overall report)
    const byMachine = machine ? [] : (await req.queryTenant(
      `SELECT machine, COUNT(*) as n FROM events WHERE ts>=$1
       GROUP BY machine ORDER BY n DESC LIMIT 20`, [from])).rows;

    // ── Top IOCs (blocklist hits)
    const topIocs = (await req.queryTenant(
      `SELECT message, COUNT(*) as n FROM events
       WHERE ts>=$1 ${where} AND (category='DOMAIN' OR category='NETWORK' OR message LIKE '%block%')
       GROUP BY message ORDER BY n DESC LIMIT 10`, args)).rows;

    // ── Critical events
    const criticals = (await req.queryTenant(
      `SELECT ts, machine, category, message FROM events
       WHERE ts>=$1 ${where} AND severity='critical'
       ORDER BY ts DESC LIMIT 50`, args)).rows;

    // ── Tamper events
    const tampers = (await req.queryTenant(
      `SELECT ts, machine, message FROM events
       WHERE ts>=$1 ${where} AND (message LIKE '%TAMPER%' OR message LIKE '%MITM%')
       ORDER BY ts DESC LIMIT 20`, args)).rows;

    // ── Hourly activity (last 24h)
    const hourlyWhere = machine ? 'AND machine=$1' : '';
    const hourlyArgs = machine ? [machine] : [];
    const hourly = (await req.queryTenant(
      `SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') as hour, COUNT(*) as n
       FROM events WHERE ts>=NOW() - INTERVAL '1 day' ${hourlyWhere}
       GROUP BY hour ORDER BY hour ASC`, hourlyArgs)).rows;

    // ── Daily trend
    const daily = (await req.queryTenant(
      `SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD') as day, COUNT(*) as n
       FROM events WHERE ts>=$1 ${where}
       GROUP BY day ORDER BY day ASC`, args)).rows;

    // ── Machine list
    const machines = (await req.queryTenant(
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
    res.status(500).json({ error: 'Failed to generate baseline' });
  }
};

const generateFirewallReport = async (req, res) => {
  try {
    const {
      duration = '24',
      from_date = '',
      to_date = '',
      device = '',
      aggregator = '',
      action = '',
      severity = '',
      service = '',
      ip = '',
      search = '',
      alert_type = '',
      limit = 1000,
    } = req.query || {};

    let fromDate, toDate;
    if (from_date && to_date) {
      fromDate = new Date(from_date);
      toDate = new Date(to_date);
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        toDate = new Date();
        fromDate = new Date(toDate.getTime() - 24 * 3600000);
      }
    } else if (duration === 'today') {
      toDate = new Date();
      fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 0, 0, 0, 0);
    } else {
      const rawHours = parseFloat(duration);
      const hours = (!isNaN(rawHours) && rawHours > 0 && rawHours <= 8760) ? rawHours : 24;
      toDate = new Date();
      fromDate = new Date(toDate.getTime() - hours * 3600000);
    }

    const to = toDate.toISOString().slice(0, 19).replace('T', ' ');
    const from = fromDate.toISOString().slice(0, 19).replace('T', ' ');

    // ── Build Filter Conditions ─────────────────────────────────────────────
    const conds = ['ts>=$1', 'ts<=$2'];
    const params = [from, to];
    let idx = 3;

    if (device && device !== 'All Firewalls' && device !== 'All Machines') {
      conds.push(`devname=$${idx++}`);
      params.push(device);
    }

    let aggrs = [];
    if (aggregator && aggregator !== 'All Aggregators' && aggregator !== 'All Branches') {
      aggrs = aggregator.split(',').map(a => a.trim()).filter(a => isIdentifier(a, 1, 64));
      if (aggrs.length > 0) {
        const placeholders = aggrs.map(a => {
          params.push(a);
          return `$${idx++}`;
        }).join(',');
        conds.push(`aggregator_name IN (${placeholders})`);
      }
    }

    if (action && action !== 'All Actions') {
      if (action === 'block' || action === 'deny' || action === 'drop') {
        conds.push(`(action='deny' OR action='drop' OR action='block')`);
      } else if (action === 'accept' || action === 'allow') {
        conds.push(`(action='accept' OR action='allow' OR action='permit')`);
      } else {
        conds.push(`action=$${idx++}`);
        params.push(action);
      }
    }

    if (severity && severity !== 'All Severities') {
      conds.push(`severity=$${idx++}`);
      params.push(severity.toLowerCase());
    }

    if (service && service !== 'All Services') {
      conds.push(`service ILIKE $${idx++}`);
      params.push('%' + service + '%');
    }

    if (ip) {
      conds.push(`(src_ip LIKE $${idx} OR dst_ip LIKE $${idx+1})`);
      params.push('%' + ip + '%', '%' + ip + '%');
      idx += 2;
    }

    if (search) {
      conds.push(`(msg ILIKE $${idx} OR raw ILIKE $${idx+1} OR cfgpath ILIKE $${idx+2} OR fw_user ILIKE $${idx+3} OR devname ILIKE $${idx+4})`);
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%', '%' + search + '%');
      idx += 5;
    }

    const whereClause = 'WHERE ' + conds.join(' AND ');

    // ── Metrics & Aggregations ──────────────────────────────────────────────
    const totalRow = (await req.queryTenant(`SELECT COUNT(*) AS n FROM fw_events ${whereClause}`, params)).rows[0];
    const totalConnections = parseInt(totalRow?.n || 0, 10);

    const byActionRows = (await req.queryTenant(`SELECT action, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY action ORDER BY n DESC`, params)).rows;
    const bySevRows = (await req.queryTenant(`SELECT severity, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY severity ORDER BY n DESC`, params)).rows;
    const topSrcRows = (await req.queryTenant(`SELECT src_ip, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY src_ip ORDER BY n DESC LIMIT 10`, params)).rows;
    const topDstRows = (await req.queryTenant(`SELECT dst_ip, dst_port, service, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY dst_ip, dst_port, service ORDER BY n DESC LIMIT 10`, params)).rows;
    const topSvcRows = (await req.queryTenant(`SELECT service, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY service ORDER BY n DESC LIMIT 10`, params)).rows;
    let hourlyRows = [];
    try {
      hourlyRows = (await req.queryTenant(`SELECT TO_CHAR(ts::timestamp, 'YYYY-MM-DD HH24:00') AS hour, action, COUNT(*) AS n FROM fw_events ${whereClause} GROUP BY hour, action ORDER BY hour ASC`, params)).rows;
    } catch (_) {}

    const actMap = {};
    byActionRows.forEach(r => { actMap[(r.action || '').toLowerCase()] = parseInt(r.n, 10); });
    const sevMap = {};
    bySevRows.forEach(r => { sevMap[(r.severity || '').toLowerCase()] = parseInt(r.n, 10); });

    // ── Connection Logs (Safe SELECT * handles schema variances) ────────────
    const rawConnRows = (await req.queryTenant(`
      SELECT *
      FROM fw_events ${whereClause}
      ORDER BY ts DESC
      LIMIT ${Math.min(parseInt(limit, 10) || 1000, 2000)}
    `, params)).rows;

    const connRows = rawConnRows.map(r => ({
      id: r.id,
      ts: r.ts,
      machine: r.devname || r.machine || '-',
      aggregator_name: r.aggregator_name || '',
      src_ip: r.src_ip || '',
      src_port: r.src_port || 0,
      dst_ip: r.dst_ip || '',
      dst_port: r.dst_port || 0,
      action: r.action || '',
      proto: r.proto || '',
      service: r.service || '',
      sent_byte: Number(r.sent_bytes || r.sent_byte || 0),
      rcvd_byte: Number(r.rcv_bytes || r.rcvd_byte || 0),
      duration: r.duration || 0,
      country: r.dst_country || r.src_country || r.country || '',
      policy: r.policy || '',
      severity: r.severity || 'info',
      fw_user: r.fw_user || '',
      fw_ui: r.fw_ui || '',
      msg: r.msg || '',
      subtype: r.subtype || '',
      log_type: r.log_type || '',
      cfgpath: r.cfgpath || '',
      cfgobj: r.cfgobj || '',
      cfgattr: r.cfgattr || '',
      logdesc: r.logdesc || '',
      message: r.raw || r.msg || ''
    }));

    // ── Security Alerts Query & Parsing ─────────────────────────────────────
    const alertConds = ['ts>=$1', 'ts<=$2'];
    const alertParams = [from, to];
    let aIdx = 3;

    if (device && device !== 'All Firewalls' && device !== 'All Machines') {
      alertConds.push(`devname=$${aIdx++}`);
      alertParams.push(device);
    }
    if (aggrs.length > 0) {
      const placeholders = aggrs.map(a => {
        alertParams.push(a);
        return `$${aIdx++}`;
      }).join(',');
      alertConds.push(`aggregator_name IN (${placeholders})`);
    }

    alertConds.push(`(
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

    const alertWhere = 'WHERE ' + alertConds.join(' AND ');
    const rawAlertRows = (await req.queryTenant(`
      SELECT *
      FROM fw_events ${alertWhere}
      ORDER BY ts DESC
      LIMIT 500
    `, alertParams)).rows.map(e => ({
      id: e.id,
      ts: e.ts,
      machine: e.devname || e.machine || '-',
      aggregator_name: e.aggregator_name || '',
      severity: e.severity || 'medium',
      src_ip: e.src_ip || '',
      fw_user: e.fw_user || '',
      fw_ui: e.fw_ui || '',
      msg: e.msg || '',
      subtype: e.subtype || '',
      log_type: e.log_type || '',
      cfgpath: e.cfgpath || '',
      cfgobj: e.cfgobj || '',
      cfgattr: e.cfgattr || '',
      logdesc: e.logdesc || '',
      message: e.raw || e.msg || ''
    }));

    const NOISE_PATTERNS = [
      'type="traffic"', 'subtype="forward"', 'subtype="local"', 'subtype="multicast"',
      'subtype="sniffer"', 'dhcp statistics', 'performance statistics', 'average cpu',
      'concurrent sessions', 'setup-rate', 'ntp sync', 'ha heartbeat', 'link monitor',
      'interface monitor', 'av update', 'ips update', 'app-ctrl update', 'license update',
      'conserve mode', 'logid="0100022922"', 'logid="0100022923"', 'logid="0104048001"',
      'logid="0100022906"', 'logid="0100020001"', 'logid="0100026001"', 'logid="0100026002"',
    ];

    const counts = {
      all: 0,
      bruteForce: 0,
      loginFailed: 0,
      configChange: 0,
      mfa: 0,
      adminLogin: 0,
    };

    const parsedAlerts = [];

    rawAlertRows.forEach(e => {
      const raw = e.message || '';
      const low = raw.toLowerCase();
      if (NOISE_PATTERNS.some(p => low.includes(p))) return;

      const rawO = raw.replace(/^[\d\-T:+.]+\s+[\d.]+\s+/, '');
      const rawLow = rawO.toLowerCase();

      const cfgpath = e.cfgpath || (rawO.match(/cfgpath="([^"]+)"/) || [])[1] || '';
      const actionVal = (rawO.match(/action="([^"]+)"/) || [])[1] || '';
      const subtype = e.subtype || (rawO.match(/subtype="([^"]+)"/) || [])[1] || '';
      const msgM = e.msg ? [null, e.msg] : rawO.match(/msg="([^"]+)"/);
      const cfgobj = e.cfgobj || (rawO.match(/cfgobj="([^"]+)"/) || [])[1] || '';
      const cfgattr = e.cfgattr || (rawO.match(/cfgattr="([^"]+)"/) || [])[1] || '';
      const user = e.fw_user || (rawO.match(/user="([^"]+)"/) || [])[1] || '';
      const srcip = e.src_ip || (rawO.match(/srcip=([\d.]+)/) || [])[1] || '';
      const ui = e.fw_ui || (rawO.match(/ui="([^"]+)"/) || [])[1] || '';
      const logdesc = e.logdesc || (rawO.match(/logdesc="([^"]+)"/) || [])[1] || '';

      let alertType = null;

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
        counts.loginFailed++;
      }
      else if (cfgpath.includes('firewall.policy') || rawLow.includes('policy-add') ||
        rawLow.includes('policy-delete') || rawLow.includes('policy-modify')) {
        if (actionVal === 'Add' || rawLow.includes('policy-add')) { alertType = 'Policy Added'; }
        else if (actionVal === 'Delete' || rawLow.includes('policy-delete')) { alertType = 'Policy Deleted'; }
        else { alertType = 'Policy Modified'; }
        counts.configChange++;
      }
      else if (cfgpath || rawLow.includes('cfg_change')) {
        if (actionVal === 'Add') { alertType = 'Config Added'; }
        else if (actionVal === 'Delete') { alertType = 'Config Deleted'; }
        else { alertType = 'Config Changed'; }
        counts.configChange++;
      }
      else if (rawLow.includes('user-add') || (cfgpath.includes('user') && actionVal === 'Add')) {
        alertType = 'User Added'; counts.configChange++;
      }
      else if (rawLow.includes('user-delete') || (cfgpath.includes('user') && actionVal === 'Delete')) {
        alertType = 'User Deleted'; counts.configChange++;
      }
      else if (rawLow.includes('user-passwd')) {
        alertType = 'Password Changed'; counts.configChange++;
      }
      else if ((subtype === 'user' && actionVal.toLowerCase() === 'login') ||
        (rawLow.includes('admin') && rawLow.includes('login'))) {
        alertType = 'Admin Login';
        counts.adminLogin++;
      }

      if (!alertType) return;
      counts.all++;

      let displayMsg = rawO;
      if (msgM && msgM[1]) {
        displayMsg = msgM[1];
        if (user && !displayMsg.includes(user)) displayMsg += ' by ' + user;
        if (ui && !displayMsg.includes(ui)) displayMsg += ' from ' + ui;
      } else if (cfgpath) {
        displayMsg = `${actionVal || 'Config'} ${cfgpath}`;
        if (cfgobj) displayMsg += ` ${cfgobj}`;
        if (user) displayMsg += ` by ${user}`;
        if (ui) displayMsg += ` from ${ui}`;
      }

      parsedAlerts.push({
        id: e.id,
        ts: e.ts,
        machine: e.machine,
        aggregator_name: e.aggregator_name,
        alertType,
        user: user || '-',
        src_ip: ui || srcip || '-',
        severity: e.severity || (alertType.includes('Failed') || alertType.includes('Deleted') ? 'high' : 'medium'),
        displayMsg,
        cfgpath,
        cfgobj,
        cfgattr,
        logdesc
      });
    });

    const critCount = sevMap['critical'] || 0;
    const highCount = sevMap['high'] || 0;
    const deniedCount = (actMap['deny'] || 0) + (actMap['drop'] || 0) + (actMap['block'] || 0);

    let threatLevel = 'NORMAL';
    if (critCount > 0 || counts.loginFailed >= 5 || counts.bruteForce > 0) {
      threatLevel = 'CRITICAL';
    } else if (highCount > 0 || counts.loginFailed > 0 || counts.configChange >= 5) {
      threatLevel = 'HIGH';
    } else if (counts.configChange > 0 || deniedCount > 10 || counts.adminLogin > 0) {
      threatLevel = 'ELEVATED';
    }

    res.json({
      report_type: 'firewall',
      generated: new Date().toISOString(),
      threat_level: threatLevel,
      filters: {
        duration, from, to,
        device: device || 'All Firewalls',
        aggregator: aggrs.length > 0 ? aggrs.join(', ') : 'All Branches',
        action: action || 'All Actions',
        severity: severity || 'All Severities',
        service: service || 'All Services',
        ip: ip || '',
        search: search || '',
        alert_type: alert_type || 'All'
      },
      summary: {
        total: totalConnections,
        accepted: actMap['accept'] || actMap['allow'] || actMap['permit'] || 0,
        denied: deniedCount,
        rstTimeout: (actMap['rst'] || 0) + (actMap['timeout'] || 0) + (actMap['close'] || 0),
        critical: critCount,
        high: highCount,
        medium: sevMap['medium'] || 0,
        low: sevMap['low'] || 0,
        totalAlerts: parsedAlerts.length,
        loginFailed: counts.loginFailed,
        configChange: counts.configChange,
        adminLogin: counts.adminLogin,
        mfa: counts.mfa,
        bruteForce: counts.bruteForce,
      },
      alerts: {
        counts,
        items: parsedAlerts,
      },
      connections: {
        total: totalConnections,
        items: connRows,
      },
      analytics: {
        byAction: byActionRows,
        bySeverity: bySevRows,
        topSrc: topSrcRows,
        topDst: topDstRows,
        topServices: topSvcRows,
        hourly: hourlyRows,
      }
    });

  } catch (err) {
    console.error('[Firewall Report Error]', err.message);
    res.status(500).json({ error: 'Failed to generate firewall report' });
  }
};

module.exports = {
  generateReport,
  generateBaseline,
  generateFirewallReport
};
