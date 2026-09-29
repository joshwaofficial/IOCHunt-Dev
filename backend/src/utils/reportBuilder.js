const db = require('../config/db');
const { getSmtpConfig, createTransporter } = require('./emailHelper');

async function generateAndSendReport(schedule, queryFn = null, isManual = false) {
  const q = queryFn || db.query.bind(db);

  // ── Validate SMTP ──────────────────────────────────────────────────────────
  const cfg = await getSmtpConfig(q);
  if (!cfg || !cfg.host) {
    throw new Error('SMTP Host is not configured. Please save your SMTP Configuration first.');
  }
  if (!isManual && !cfg.enabled) {
    throw new Error('Scheduled Emails Engine is disabled. Turn it on in the top section and click Save Configuration.');
  }

  // ── Time window ────────────────────────────────────────────────────────────
  const to = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let from;
  const isToday = schedule.duration === 'today';
  const hours = isToday ? 24 : (Number(schedule.duration) || 24);
  if (isToday) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    from = d.toISOString().slice(0, 19).replace('T', ' ');
  } else {
    from = new Date(Date.now() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  }

  // ── Build WHERE clause with filters ────────────────────────────────────────
  const evConds = ['ts>=$1', 'ts<=$2', 'is_noise=false'];
  const evParams = [from, to];
  let pIdx = 3;

  if (schedule.aggregator) {
    const aggrs = schedule.aggregator.split(',');
    const inClause = aggrs.map((_, i) => `$${pIdx + i}`).join(',');
    evConds.push(`aggregator_name IN (${inClause})`);
    aggrs.forEach(a => evParams.push(a));
    pIdx += aggrs.length;
  }
  if (schedule.machine)  { evConds.push(`machine=$${pIdx++}`);  evParams.push(schedule.machine); }
  if (schedule.severity) { evConds.push(`severity=$${pIdx++}`); evParams.push(schedule.severity); }
  if (schedule.category) { evConds.push(`category=$${pIdx++}`); evParams.push(schedule.category); }
  const evWhere = 'WHERE ' + evConds.join(' AND ');

  // ── Query event statistics ─────────────────────────────────────────────────
  const totalEventsRes = await q(
    `SELECT COUNT(*) AS n FROM events ${evWhere}`, evParams
  );
  const totalEvents = parseInt(totalEventsRes.rows[0]?.n || 0, 10);

  const bySeverityRes = await q(
    `SELECT severity,COUNT(*) AS n FROM events ${evWhere}
     GROUP BY severity
     ORDER BY CASE severity
       WHEN 'critical' THEN 0
       WHEN 'high' THEN 1
       WHEN 'medium' THEN 2
       ELSE 3
     END`, evParams
  );
  const bySeverity = bySeverityRes.rows || [];

  const byCategoryRes = await q(
    `SELECT category,COUNT(*) AS n FROM events ${evWhere}
     GROUP BY category ORDER BY n DESC LIMIT 10`, evParams
  );
  const byCategory = byCategoryRes.rows || [];

  const evListWhere = schedule.severity ? evWhere : `${evWhere} AND severity IN ('critical','high')`;
  const critEventsRes = await q(
    `SELECT machine,ts,tag,category,severity,message FROM events
     ${evListWhere}
     ORDER BY ts DESC LIMIT 100`, evParams
  );
  const critEvents = critEventsRes.rows || [];

  let machQuery = 'SELECT * FROM machines';
  const machParams = [];
  if (schedule.aggregator) {
    const aggrs = schedule.aggregator.split(',');
    const inClause = aggrs.map((_, i) => `$${i + 1}`).join(',');
    machQuery += ` WHERE aggregator_name IN (${inClause})`;
    aggrs.forEach(a => machParams.push(a));
  }
  machQuery += ' ORDER BY last_seen DESC';
  
  const machinesRes = await q(machQuery, machParams);
  const machines = machinesRes.rows || [];

  // ── AD attack indicators ──────────────────────────────────────────────────
  const adEventsRes = await q(
    `SELECT machine,ts,tag,severity,message FROM events ${evWhere}
     AND (category='DOMAIN' OR category='ADCS'
       OR tag LIKE '%DCSYNC%' OR tag LIKE '%KERBEROAST%'
       OR tag LIKE '%SPRAY%' OR tag LIKE '%SHADOW-CRED%'
       OR tag LIKE '%PASS-THE-HASH%')
     ORDER BY ts DESC LIMIT 20`, evParams
  );
  const adEvents = adEventsRes.rows || [];

  // ── Calculate threat level ─────────────────────────────────────────────────
  const sevMap = {};
  bySeverity.forEach(r => { sevMap[r.severity] = parseInt(r.n, 10); });
  const critCount = sevMap.critical || 0;
  const highCount = sevMap.high || 0;
  const adCount = adEvents.length;

  const threatLevel =
    critCount > 5 || adCount > 2 ? 'CRITICAL' :
    critCount > 0 || highCount > 5 ? 'HIGH' :
    highCount > 0 ? 'ELEVATED' : 'NORMAL';

  const tlColor = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    ELEVATED: '#eab308',
    NORMAL: '#22c55e'
  }[threatLevel];

  // ── Build HTML Email ───────────────────────────────────────────────────────
  const durLabel = isToday ? 'Today (Since 00:00)'
    : hours === 1 ? 'Last 1 hour'
    : hours === 2 ? 'Last 2 hours'
    : hours === 4 ? 'Last 4 hours'
    : hours === 6 ? 'Last 6 hours'
    : hours === 12 ? 'Last 12 hours'
    : hours === 24 ? 'Last 24 hours'
    : hours === 72 ? 'Last 3 days'
    : hours === 168 ? 'Last 7 days'
    : hours === 720 ? 'Last 30 days'
    : `Last ${hours} hours`;
  const nowStr = new Date().toLocaleString();

  const catColors = {
    DOMAIN: '#a855f7', ADCS: '#8b5cf6', NETWORK: '#3b82f6',
    SENSITIVE: '#ef4444', ENUM: '#f97316', PROCESSES: '#ec4899',
    CONFIG: '#eab308', REGISTRY: '#22c55e', LOGON: '#06b6d4',
    SERVICES: '#fb923c', TASKS: '#a3e635', USB: '#f43f5e',
    DEFENDER: '#ef4444', OTHER: '#6b7280'
  };

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;font-size:12px;color:#1a2540;background:#f0f4fc;margin:0;padding:20px}
.wrap{max-width:800px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.hdr{background:#1e3a5f;color:#fff;padding:24px 28px}
.hdr h1{margin:0 0 4px;font-size:20px;letter-spacing:1px}
.hdr .meta{font-size:11px;color:#90afd0;margin-top:6px}
.threat{padding:16px 28px;background:${tlColor}18;border-left:4px solid ${tlColor}}
.threat-l{font-size:20px;font-weight:800;color:${tlColor};margin-bottom:6px;letter-spacing:1px}
.threat-p{font-size:13px;line-height:1.6;color:#4a5578;margin:0}
.section{padding:24px 28px;border-top:1px solid #e8eef8}
.section h2{font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 16px 0;text-transform:uppercase;letter-spacing:1px}
.stats-grid{display:flex;gap:12px;flex-wrap:wrap}
.stat{background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;min-width:100px}
.stat-n{font-size:22px;font-weight:800;margin-bottom:2px}
.stat-l{font-size:10px;color:#6b82a0;text-transform:uppercase;letter-spacing:.5px}
table{width:100%;border-collapse:collapse;font-size:11px;text-align:left}
th{padding:8px 12px;background:#f8faff;color:#6b82a0;font-size:10px;text-transform:uppercase;letter-spacing:.8px;border-bottom:2px solid #e2e8f0;font-weight:700}
td{padding:10px 12px;border-bottom:1px solid #f0f4fc;vertical-align:middle}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase}
.c{background:#fef2f2;color:#ef4444}.h{background:#fff7ed;color:#f97316}
.m{background:#fefce8;color:#ca8a04}.l{background:#f0fdf4;color:#16a34a}
.ad{background:#faf5ff;color:#a855f7}
.bar-bg{background:#e2e8f0;height:6px;border-radius:3px;width:100%;overflow:hidden}
.bar-fg{height:100%;border-radius:3px}
.footer{padding:20px 28px;background:#1e3a5f;color:#90afd0;font-size:10px;text-align:center}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <h1>IOC HUNT SECURITY REPORT</h1>
    <div class="meta">Generated: ${nowStr} &nbsp;|&nbsp; Period: ${durLabel} &nbsp;|&nbsp; Machine: ${schedule.machine || 'All'} &nbsp;|&nbsp; Sev: ${schedule.severity || 'All'}</div>
  </div>

  <div class="threat">
    <div class="threat-l">${threatLevel} THREAT LEVEL</div>
    <p class="threat-p">
      <b>${totalEvents.toLocaleString()}</b> total events recorded.
      ${critCount > 0 ? `<span style="color:#ef4444;font-weight:700">${critCount} critical</span>, ` : ''}
      <span style="color:#f97316;font-weight:700">${highCount} high</span> severity events.
      ${adCount > 0 ? `<br><span style="color:#a855f7;font-weight:700">⚠️ ${adCount} AD Attack Indicators detected!</span>` : ''}
    </p>
  </div>

  <div class="section">
    <h2>Summary Statistics</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-n" style="color:#1e3a5f">${totalEvents.toLocaleString()}</div><div class="stat-l">Total Events</div></div>
      <div class="stat"><div class="stat-n" style="color:#ef4444">${critCount}</div><div class="stat-l">Critical</div></div>
      <div class="stat"><div class="stat-n" style="color:#f97316">${highCount}</div><div class="stat-l">High</div></div>
      <div class="stat"><div class="stat-n" style="color:#a855f7">${adCount}</div><div class="stat-l">AD Indicators</div></div>
      <div class="stat"><div class="stat-n" style="color:#4a5578">${machines.length}</div><div class="stat-l">Active Machines</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Top Event Categories</h2>
    <table><thead><tr><th>Category</th><th>Count</th><th style="width:40%">Distribution</th></tr></thead><tbody>`;

  // Category bar chart
  const maxCat = byCategory.length ? Math.max(...byCategory.map(r => parseInt(r.n, 10))) : 1;
  byCategory.forEach(r => {
    const col = catColors[r.category] || '#6b7280';
    const pct = Math.round(parseInt(r.n, 10) / maxCat * 100);
    html += `<tr>
      <td style="font-weight:700;color:#4a5578">${r.category}</td>
      <td>${parseInt(r.n, 10).toLocaleString()}</td>
      <td><div class="bar-bg"><div class="bar-fg" style="width:${pct}%;background:${col}"></div></div></td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  // Events table
  if (critEvents.length) {
    const listTitle = schedule.severity 
      ? `Recent ${schedule.severity.toUpperCase()} Events` 
      : 'Recent Critical & High Events';
    html += `<div class="section"><h2>${listTitle}</h2>
      <table><thead><tr><th>Time</th><th>Machine</th><th>Sev</th><th>Category</th><th>Message</th></tr></thead><tbody>`;
    critEvents.forEach(e => {
      const sevClass = (e.severity || 'l').toLowerCase().charAt(0);
      html += `<tr>
        <td style="white-space:nowrap;color:#4a5578">${(e.ts || '').toString().slice(0, 16)}</td>
        <td style="color:#2563eb;font-weight:700">${e.machine}</td>
        <td><span class="badge ${sevClass}">${e.severity}</span></td>
        <td style="color:#4a5578;font-size:10px">${e.category}</td>
        <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // AD Attack Indicators table
  if (adEvents.length) {
    html += `<div class="section"><h2>AD Attack Indicators</h2>
      <table><thead><tr><th>Time</th><th>Machine</th><th>Severity</th><th>Message</th></tr></thead><tbody>`;
    adEvents.forEach(e => {
      html += `<tr>
        <td style="white-space:nowrap;color:#4a5578">${(e.ts || '').toString().slice(0, 16)}</td>
        <td style="color:#2563eb;font-weight:700">${e.machine}</td>
        <td><span class="badge ad">${e.severity}</span></td>
        <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Footer
  html += `<div class="footer">IOC Hunt Security Report &nbsp;|&nbsp; ${schedule.name} &nbsp;|&nbsp; ${durLabel} &nbsp;|&nbsp; ${nowStr}</div>`;
  html += `</div></body></html>`;

  // ── Send the email ─────────────────────────────────────────────────────────
  const recipients = schedule.recipients.split(',').map(r => r.trim()).filter(Boolean);
  const t = createTransporter(cfg);
  await t.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_addr}>`,
    to: recipients.join(', '),
    subject: `[IOC Hunt] ${schedule.name} — ${threatLevel} — ${nowStr}`,
    html,
  });
}

module.exports = {
  generateAndSendReport
};
