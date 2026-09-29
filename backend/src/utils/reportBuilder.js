const db = require('../config/db');
const { getSmtpConfig, createTransporter } = require('./emailHelper');
const { generatePdfReport } = require('./pdfReportBuilder');

function formatTs(ts) {
  if (!ts) return '';
  if (ts instanceof Date) {
    return ts.toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(ts);
}

function buildCsvReport(events) {
  const headers = ['Timestamp', 'Machine', 'Severity', 'Category', 'Tag', 'Aggregator / Branch', 'Message'];
  const lines = [headers.join(',')];
  for (const e of events) {
    const tsStr = formatTs(e.ts);
    const row = [
      `"${tsStr.replace(/"/g, '""')}"`,
      `"${String(e.machine || '').replace(/"/g, '""')}"`,
      `"${String(e.severity || '').toUpperCase().replace(/"/g, '""')}"`,
      `"${String(e.category || '').replace(/"/g, '""')}"`,
      `"${String(e.tag || '').replace(/"/g, '""')}"`,
      `"${String(e.aggregator_name || '').replace(/"/g, '""')}"`,
      `"${String(e.message || '').replace(/"/g, '""')}"`
    ];
    lines.push(row.join(','));
  }
  return Buffer.from(lines.join('\r\n'), 'utf-8');
}

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

  // ── Time window determination ──────────────────────────────────────────────
  const now = new Date();
  const to = now.toISOString().slice(0, 19).replace('T', ' ');
  let from;
  let durLabel = 'Last 24 hours';

  const cronExpr = (schedule.cron_expr || '').trim();

  if (cronExpr.startsWith('0 8 * * *')) {
    from = new Date(now.getTime() - 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    durLabel = `Daily (24 Hours: ${from} to ${to})`;
  } else if (cronExpr.endsWith('* * 1')) {
    from = new Date(now.getTime() - 7 * 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    durLabel = `Weekly (7 Days: ${from} to ${to})`;
  } else if (cronExpr.includes(' 1 * *')) {
    from = new Date(now.getTime() - 30 * 24 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    durLabel = `Monthly (30 Days: ${from} to ${to})`;
  } else if (schedule.last_run) {
    const lastRunMs = Number(schedule.last_run) * 1000;
    from = new Date(lastRunMs).toISOString().slice(0, 19).replace('T', ' ');
    durLabel = `${from} to ${to}`;
  } else {
    const hours = Number(schedule.duration) || 24;
    from = new Date(now.getTime() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    durLabel = `${from} to ${to}`;
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

  // Query priority events (Critical, High & Medium) for the PDF report
  const evListWhere = schedule.severity 
    ? evWhere 
    : `${evWhere} AND severity IN ('critical','high','medium')`;
  const critEventsRes = await q(
    `SELECT machine,ts,tag,category,severity,message FROM events
     ${evListWhere}
     ORDER BY ts DESC LIMIT 100`, evParams
  );
  const critEvents = critEventsRes.rows || [];

  // ── Query ALL logs for complete CSV attachment (no LIMIT, all severities) ──
  const allLogsRes = await q(
    `SELECT ts, machine, severity, category, tag, message, aggregator_name FROM events
     ${evWhere}
     ORDER BY ts DESC`, evParams
  );
  const allLogs = allLogsRes.rows || [];

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

  // ── Calculate threat level & counts ────────────────────────────────────────
  const sevMap = {};
  bySeverity.forEach(r => { sevMap[(r.severity || '').toLowerCase()] = parseInt(r.n, 10); });
  const critCount = sevMap.critical || 0;
  const highCount = sevMap.high || 0;
  const medCount = sevMap.medium || 0;
  const lowCount = (sevMap.low || 0) + (sevMap.info || 0);
  const adCount = adEvents.length;

  const threatLevel =
    critCount > 5 || adCount > 2 ? 'CRITICAL' :
    critCount > 0 || highCount > 5 ? 'HIGH' :
    highCount > 0 || medCount > 10 ? 'ELEVATED' : 'NORMAL';

  const tlColor = {
    CRITICAL: '#ef4444',
    HIGH: '#f97316',
    ELEVATED: '#eab308',
    NORMAL: '#22c55e'
  }[threatLevel];

  const catColors = {
    PROCESSES: '#ef4444',
    POWERSHELL: '#f97316',
    NETWORK: '#3b82f6',
    PERSISTENCE: '#8b5cf6',
    DLP: '#ec4899',
    USB: '#eab308',
    DOMAIN: '#a855f7',
    ADCS: '#06b6d4',
  };

  const nowStr = now.toLocaleString();

  // ── Generate PDF and CSV attachments in memory ─────────────────────────────
  let pdfBuffer = null;
  let csvBuffer = null;

  try {
    pdfBuffer = await generatePdfReport({
      scheduleName: schedule.name,
      generatedAt: nowStr,
      periodLabel: durLabel,
      machine: schedule.machine || 'All',
      branch: schedule.aggregator || 'All',
      threatLevel,
      tlColor,
      totalEvents,
      critCount,
      highCount,
      medCount,
      lowCount,
      adCount,
      activeMachinesCount: machines.length,
      byCategory,
      critEvents,
      adEvents
    });
  } catch (pdfErr) {
    console.error('[REPORT BUILDER] Failed to generate PDF buffer:', pdfErr);
  }

  try {
    csvBuffer = buildCsvReport(allLogs);
  } catch (csvErr) {
    console.error('[REPORT BUILDER] Failed to generate CSV buffer:', csvErr);
  }

  // ── Build HTML Email Body (Dashboard & Stats only — no inline raw table) ──
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #1e293b; margin: 0; padding: 24px; }
  .wrap { max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
  .hdr { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 28px 32px; color: #fff; }
  .hdr h1 { margin: 0 0 6px; font-size: 20px; letter-spacing: 0.5px; font-weight: 800; }
  .hdr .meta { font-size: 11px; color: #94a3b8; font-family: monospace; line-height: 1.6; }
  .attachments-banner { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; margin: 20px 32px 0; padding: 14px 18px; }
  .attachments-banner .title { font-size: 12px; color: #1d4ed8; font-weight: 700; margin-bottom: 4px; }
  .attachments-banner .desc { font-size: 11px; color: #3b82f6; }
  .threat { margin: 20px 32px 0; border-radius: 8px; padding: 16px 20px; background: ${tlColor}15; border-left: 5px solid ${tlColor}; }
  .threat-l { font-weight: 800; font-size: 14px; color: ${tlColor}; letter-spacing: 0.5px; }
  .threat-p { margin: 4px 0 0; font-size: 12px; color: #334155; line-height: 1.5; }
  .section { padding: 20px 32px; }
  .section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #475569; margin: 0 0 12px; font-weight: 700; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; }
  .stats-grid { display: table; width: 100%; border-collapse: separate; border-spacing: 6px; }
  .stat { display: table-cell; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 6px; text-align: center; }
  .stat-n { font-size: 18px; font-weight: 800; line-height: 1.2; }
  .stat-l { font-size: 8.5px; text-transform: uppercase; color: #64748b; margin-top: 4px; font-weight: 600; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th { background: #f8fafc; padding: 8px 10px; text-align: left; font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .badge.ad { background: #f3e8ff; color: #7e22ce; }
  .bar-bg { background: #f1f5f9; border-radius: 3px; height: 6px; width: 100%; overflow: hidden; }
  .bar-fg { height: 100%; border-radius: 3px; }
  .footer { background: #f8fafc; padding: 14px 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; font-family: monospace; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>IOC HUNT SECURITY REPORT</h1>
    <div class="meta">
      <b>Generated:</b> ${nowStr}<br>
      <b>Time Window:</b> ${durLabel}<br>
      <b>Filters:</b> Branch: ${schedule.aggregator || 'All'} | Machine: ${schedule.machine || 'All'} | Severity: ${schedule.severity || 'All'}
    </div>
  </div>

  <div class="attachments-banner">
    <div class="title">📎 2 Reports Attached to this Email:</div>
    <div class="desc">• <b>Executive Report (PDF)</b>: High-level visual dashboard with charts & incident alerts.<br>• <b>Full Event Logs (Excel/CSV)</b>: Complete log dataset (${totalEvents.toLocaleString()} records) for deep analysis.</div>
  </div>

  <div class="threat">
    <div class="threat-l">${threatLevel} THREAT LEVEL</div>
    <p class="threat-p">
      <b>${totalEvents.toLocaleString()}</b> total events recorded: 
      <span style="color:#ef4444;font-weight:700">${critCount} critical</span>, 
      <span style="color:#f97316;font-weight:700">${highCount} high</span>, 
      <span style="color:#eab308;font-weight:700">${medCount} medium</span>, 
      <span style="color:#3b82f6;font-weight:700">${lowCount} low</span> severity events.
      ${adCount > 0 ? `<br><span style="color:#a855f7;font-weight:700">⚠️ ${adCount} AD Attack Indicators detected!</span>` : ''}
    </p>
  </div>

  <div class="section">
    <h2>Summary Statistics</h2>
    <div class="stats-grid">
      <div class="stat"><div class="stat-n" style="color:#1e3a5f">${totalEvents.toLocaleString()}</div><div class="stat-l">Total</div></div>
      <div class="stat"><div class="stat-n" style="color:#ef4444">${critCount}</div><div class="stat-l">Critical</div></div>
      <div class="stat"><div class="stat-n" style="color:#f97316">${highCount}</div><div class="stat-l">High</div></div>
      <div class="stat"><div class="stat-n" style="color:#eab308">${medCount}</div><div class="stat-l">Medium</div></div>
      <div class="stat"><div class="stat-n" style="color:#3b82f6">${lowCount}</div><div class="stat-l">Low</div></div>
      <div class="stat"><div class="stat-n" style="color:#a855f7">${adCount}</div><div class="stat-l">AD Alerts</div></div>
      <div class="stat"><div class="stat-n" style="color:#4a5578">${machines.length}</div><div class="stat-l">Machines</div></div>
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

  // AD Attack Indicators table (if any)
  if (adEvents.length) {
    html += `<div class="section"><h2>AD Attack Indicators</h2>
      <table><thead><tr><th>Time</th><th>Machine</th><th>Severity</th><th>Message</th></tr></thead><tbody>`;
    adEvents.forEach(e => {
      const tsFormatted = formatTs(e.ts).slice(0, 16);
      html += `<tr>
        <td style="white-space:nowrap;color:#4a5578">${tsFormatted}</td>
        <td style="color:#2563eb;font-weight:700">${e.machine}</td>
        <td><span class="badge ad">${e.severity}</span></td>
        <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }

  // Footer
  html += `<div class="footer">IOC Hunt Security Report &nbsp;|&nbsp; ${schedule.name} &nbsp;|&nbsp; ${durLabel}</div>`;
  html += `</div></body></html>`;

  // ── Prepare attachments ────────────────────────────────────────────────────
  const dateStr = now.toISOString().slice(0, 10);
  const safeName = (schedule.name || 'Report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const attachments = [];

  if (pdfBuffer) {
    attachments.push({
      filename: `IOCHunt_${safeName}_Executive_Report_${dateStr}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    });
  }

  if (csvBuffer) {
    attachments.push({
      filename: `IOCHunt_${safeName}_All_Logs_${dateStr}.csv`,
      content: csvBuffer,
      contentType: 'text/csv'
    });
  }

  // ── Send the email ─────────────────────────────────────────────────────────
  const recipients = schedule.recipients.split(',').map(r => r.trim()).filter(Boolean);
  const t = createTransporter(cfg);
  await t.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_addr}>`,
    to: recipients.join(', '),
    subject: `[IOC Hunt] ${schedule.name} — ${threatLevel} Threat Level — ${nowStr}`,
    html,
    attachments
  });
}

module.exports = {
  generateAndSendReport,
  buildCsvReport
};
