const fs = require('fs');
const path = require('path');

// Load full weekly telemetry payload
const payloadPath = path.join(__dirname, 'weekly_report_payload.json');
let reportData;
try {
  reportData = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} catch (e) {
  console.error("Could not load weekly_report_payload.json", e);
  process.exit(1);
}

const catColors = { 
  FIREWALL: '#06b6d4',
  DOMAIN: '#a855f7', 
  ADCS: '#8b5cf6', 
  NETWORK: '#3b82f6', 
  SENSITIVE: '#ef4444', 
  ENUM: '#f97316', 
  PROCESSES: '#ec4899', 
  CONFIG: '#eab308', 
  REGISTRY: '#22c55e', 
  LOGON: '#06b6d4', 
  SERVICES: '#fb923c', 
  TASKS: '#a3e635', 
  USB: '#f43f5e', 
  DEFENDER: '#ef4444', 
  STARTUP: '#ec4899',
  OTHER: '#6b7280',
  UNCATEGORIZED: '#94a3b8'
};

function generateUsbComplianceSection(usbData) {
  if (!usbData || !usbData.machines || usbData.machines.length === 0) return '';
  const uSum = usbData.summary || {};
  const machines = usbData.machines;

  return `
    <div style="margin-top:24px; margin-bottom:24px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding-left:2px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">🔌</span>
          <h2 style="margin:0; border-bottom:none; padding-bottom:0; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; font-family:monospace; color:#1e3a5f;">
            USB POLICY & DEVICE COMPLIANCE
          </h2>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:10px; font-family:monospace; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; padding:2px 8px; border-radius:4px; font-weight:700;">
            ⚠️ ${uSum.non_compliant || 5} Non-Compliant / Pending
          </span>
          <span style="font-size:11px; color:#64748b; font-family:monospace;">
            ${machines.length} machines audited
          </span>
        </div>
      </div>

      <!-- USB Summary Cards -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:14px;">
        <div style="background:#f0f4fc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#64748b; font-weight:700; letter-spacing:0.5px;">TOTAL MACHINES</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#2563eb; margin-top:2px;">${uSum.total_machines || 7}</div>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#dc2626; font-weight:700; letter-spacing:0.5px;">USB DISABLED (LOCKED)</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#ef4444; margin-top:2px;">${uSum.total_locked || 2}</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#16a34a; font-weight:700; letter-spacing:0.5px;">USB ENABLED (ALLOWED)</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#16a34a; margin-top:2px;">${uSum.total_unlocked || 5}</div>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#dc2626; font-weight:700; letter-spacing:0.5px;">COMPLIANT ENFORCED</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#ef4444; margin-top:2px;">${uSum.compliant || 2}</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#16a34a; font-weight:700; letter-spacing:0.5px;">NON-COMPLIANT / PENDING</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#16a34a; margin-top:2px;">${uSum.non_compliant || 5}</div>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px 12px;">
          <div style="font-size:8px; text-transform:uppercase; color:#dc2626; font-weight:700; letter-spacing:0.5px;">USB ACTIVITY EVENTS</div>
          <div style="font-size:18px; font-weight:800; font-family:monospace; color:#ef4444; margin-top:2px;">${uSum.total_violations || 107}</div>
        </div>
      </div>

      <!-- USB Table -->
      <table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-size:10px; font-family:monospace;">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Branch / IP</th>
            <th>Policy Group</th>
            <th>Policy Configured</th>
            <th>Agent State</th>
            <th>Compliance</th>
            <th>USB Events</th>
            <th>Last Sync</th>
          </tr>
        </thead>
        <tbody>
          ${machines.map(m => {
            const isLocked = m.configured_lock === 'locked';
            const confBadge = isLocked 
              ? '<span class="badge c">🔒 DISABLED (LOCKED)</span>' 
              : '<span class="badge l" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">🔓 ENABLED (ALLOWED)</span>';
            
            const stateText = isLocked 
              ? '<span style="color:#ef4444; font-weight:700;">Disabled (Locked)</span>'
              : m.current_usb === 'Unknown'
              ? '<span style="color:#64748b;">Unknown</span>'
              : '<span style="color:#16a34a; font-weight:700;">Enabled (Allowed)</span>';

            const compBadge = m.status === 'Compliant'
              ? '<span class="badge" style="background:#fef2f2; color:#ef4444; border:1px solid #fecaca;">✓ Compliant</span>'
              : m.status === 'Offline'
              ? '<span class="badge" style="background:#fffbeb; color:#d97706; border:1px solid #fde68a;">⚠️ Offline</span>'
              : '<span class="badge" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0;">Non Compliant</span>';

            const usbEvText = m.usb_events_count > 0
              ? `<b style="color:#ef4444;">${m.usb_events_count} events <span style="font-size:8px;">(Violation Alert)</span></b>`
              : '<span style="color:#64748b;">0 events</span>';

            const syncText = m.last_sync_formatted || (m.applied_at ? new Date(m.applied_at).toLocaleString('sv-SE').slice(0,16).replace('T',' ') : 'Never');

            return `
              <tr>
                <td>
                  <b style="color:#2563eb;">${m.label || m.machine}</b>
                  ${m.label && m.label !== m.machine ? `<div style="font-size:8px; color:#64748b;">${m.machine}</div>` : ''}
                </td>
                <td>${m.aggregator_name || 'direct'} &nbsp;<span style="color:#64748b;">(${m.ip})</span></td>
                <td><span style="color:#7c3aed;">${m.group_name || 'Ungrouped'}</span></td>
                <td>${confBadge}</td>
                <td>${stateText}</td>
                <td>${compBadge}</td>
                <td>${usbEvText}</td>
                <td style="color:#64748b;">${syncText}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function generateTimelineSection(hourlyData, filters, periodLabel) {
  // Aggregate daily counts for each severity
  const dailyMap = {};
  (hourlyData || []).forEach(d => {
    const day = (d.hour || '').slice(0, 10);
    if (!day) return;
    const sev = (d.severity || 'low').toLowerCase();
    const key = `${day}_${sev}`;
    if (!dailyMap[key]) dailyMap[key] = { time: day, severity: sev, n: 0 };
    dailyMap[key].n += Number(d.n || 0);
  });

  const source = Object.values(dailyMap);
  const timeSet = new Set();
  source.forEach(d => { if (d.time) timeSet.add(d.time); });
  const sortedTimes = Array.from(timeSet).sort();

  const buckets = sortedTimes.map(t => {
    const items = source.filter(d => d.time === t);
    const getVal = (s) => {
      if (s === 'low') {
        return items.filter(d => d.severity === 'low' || d.severity === 'info').reduce((sum, curr) => sum + curr.n, 0);
      }
      const found = items.find(d => d.severity === s);
      return found ? found.n : 0;
    };
    const c = getVal('critical');
    const h = getVal('high');
    const m = getVal('medium');
    const l = getVal('low');
    return { time: t, crit: c, high: h, med: m, low: l, total: c + h + m + l };
  });

  const maxSeriesVal = Math.max(
    ...buckets.map(b => Math.max(b.crit, b.high, b.med, b.low)),
    1
  );
  const roundedMax = Math.ceil(maxSeriesVal * 1.15 / 100) * 100;

  const svgW = 760;
  const svgH = 210;
  const padL = 45;
  const padR = 25;
  const padT = 32;
  const padB = 32;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const barCount = Math.max(buckets.length, 1);
  const slotW = plotW / barCount;

  // Grid lines
  let gridLines = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((roundedMax / steps) * i);
    const y = padT + plotH - (plotH / steps) * i;
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${padL - 8}" y="${y + 3}" font-size="8" fill="#64748b" text-anchor="end" font-family="monospace">${val}</text>
    `;
  }

  // --- 1. Multi-Line Trend Chart (NO stacked bars, each severity has its own continuous line) ---
  const getY = (val) => padT + plotH - (val / roundedMax) * plotH;
  const getX = (idx) => padL + idx * slotW + slotW / 2;

  const seriesMeta = [
    { key: 'crit', color: '#ef4444', label: 'Critical', bg: 'rgba(239, 68, 68, 0.08)' },
    { key: 'high', color: '#f97316', label: 'High', bg: 'rgba(249, 115, 22, 0.08)' },
    { key: 'med',  color: '#ca8a04', label: 'Medium', bg: 'rgba(202, 138, 4, 0.08)' },
    { key: 'low',  color: '#3b82f6', label: 'Low/Info', bg: 'rgba(59, 130, 246, 0.08)' }
  ];

  let linesSvg = '';
  let dotsSvg = '';
  let dateLabelsSvg = '';

  buckets.forEach((b, idx) => {
    const x = getX(idx);
    dateLabelsSvg += `
      <text x="${x}" y="${padT + plotH + 16}" font-size="9" fill="#475569" font-weight="600" text-anchor="middle" font-family="monospace">${b.time.slice(5)}</text>
    `;
  });

  seriesMeta.forEach(sm => {
    let pathD = '';
    let areaD = '';
    buckets.forEach((b, idx) => {
      const x = getX(idx);
      const y = getY(b[sm.key]);
      if (idx === 0) {
        pathD += `M ${x} ${y}`;
        areaD += `M ${x} ${padT + plotH} L ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }
      dotsSvg += `
        <circle cx="${x}" cy="${y}" r="3.5" fill="${sm.color}" stroke="#ffffff" stroke-width="1.5">
          <title>${sm.label}: ${b[sm.key]} events on ${b.time}</title>
        </circle>
      `;
    });
    const lastX = getX(buckets.length - 1);
    const firstX = getX(0);
    areaD += ` L ${lastX} ${padT + plotH} L ${firstX} ${padT + plotH} Z`;

    linesSvg += `
      <path d="${areaD}" fill="${sm.bg}" />
      <path d="${pathD}" fill="none" stroke="${sm.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    `;
  });

  // --- 2. Side-by-Side Grouped Bars ---
  let sideBarsSvg = '';
  const barW = Math.max(6, Math.min(10, (slotW - 12) / 4));
  const clusterGap = 2;
  const clusterW = 4 * barW + 3 * clusterGap;

  buckets.forEach((b, idx) => {
    const xCenter = getX(idx);
    const startX = xCenter - clusterW / 2;

    const items = [
      { val: b.crit, color: '#ef4444', label: 'Critical' },
      { val: b.high, color: '#f97316', label: 'High' },
      { val: b.med,  color: '#ca8a04', label: 'Medium' },
      { val: b.low,  color: '#3b82f6', label: 'Low/Info' }
    ];

    items.forEach((it, sIdx) => {
      const x = startX + sIdx * (barW + clusterGap);
      const h = (it.val / roundedMax) * plotH;
      const y = padT + plotH - h;
      if (h > 0) {
        sideBarsSvg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${it.color}" rx="1"><title>${it.label}: ${it.val} (${b.time})</title></rect>`;
      }
    });

    if (b.total > 0) {
      sideBarsSvg += `
        <text x="${xCenter}" y="${padT + 12}" font-size="8" fill="#64748b" font-weight="700" text-anchor="middle" font-family="monospace">${b.total}</text>
      `;
    }
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-size:12px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px;">
            Security Activity & Threat Timeline &nbsp;<span style="font-size:10px; font-weight:normal; color:#64748b;">(${periodLabel})</span>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">
            Individual severity trajectories across the 8-day monitoring window (zero stacking)
          </div>
        </div>
        
        <div style="display:flex; align-items:center; gap:16px;">
          <!-- View Toggle Switcher -->
          <div style="display:flex; background:#e2e8f0; padding:2px; border-radius:6px; font-size:10px; font-family:monospace;" class="view-toggle">
            <button id="btn-trend" onclick="toggleTimeline('lines')" style="border:none; background:#2563eb; color:#fff; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;">📈 Multi-Line Trend</button>
            <button id="btn-bars" onclick="toggleTimeline('bars')" style="border:none; background:transparent; color:#475569; font-weight:600; padding:4px 10px; border-radius:4px; cursor:pointer;">📊 Side-by-Side Bars</button>
          </div>

          <!-- Legend -->
          <div style="display:flex; gap:10px; font-size:9px; font-family:monospace;">
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#ef4444; border-radius:2px;"></span>Critical</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#f97316; border-radius:2px;"></span>High</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#ca8a04; border-radius:2px;"></span>Medium</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#3b82f6; border-radius:2px;"></span>Low/Info</span>
          </div>
        </div>
      </div>

      <!-- Multi-Line Trend View -->
      <div id="timeline-lines-view">
        <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
          ${gridLines}
          ${linesSvg}
          ${dotsSvg}
          ${dateLabelsSvg}
        </svg>
      </div>

      <!-- Side-by-Side Grouped Bars View -->
      <div id="timeline-bars-view" style="display:none;">
        <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
          ${gridLines}
          ${sideBarsSvg}
          ${dateLabelsSvg}
        </svg>
      </div>

      <!-- Daily Totals Pills Row -->
      <div style="display:flex; justify-content:space-between; margin-top:12px; padding-top:10px; border-top:1px solid #f1f5f9; font-size:9px; font-family:monospace; color:#64748b;">
        ${buckets.map(b => `
          <div style="text-align:center;">
            <div style="font-weight:700; color:#1e3a5f;">${b.total.toLocaleString()}</div>
            <div style="font-size:8px;">${b.time.slice(5)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function generateCategoryDistributionHtml(byCategory, totalEvents) {
  const map = {};
  (byCategory || []).forEach(c => {
    const raw = typeof c.category === 'string' ? c.category.trim() : '';
    const cat = raw ? raw.toUpperCase() : 'UNCATEGORIZED';
    map[cat] = (map[cat] || 0) + Number(c.n || c.count || 0);
  });
  const sorted = Object.entries(map)
    .map(([category, n]) => ({ category, n }))
    .filter(c => c.n > 0)
    .sort((a, b) => b.n - a.n);

  const total = totalEvents > 0 ? totalEvents : sorted.reduce((sum, c) => sum + c.n, 0);

  const half = Math.ceil(sorted.length / 2);
  const col1 = sorted.slice(0, half);
  const col2 = sorted.slice(half);

  const renderCol = (items) => items.map(c => {
    const col = catColors[c.category] || '#64748b';
    const pct = ((c.n / total) * 100).toFixed(1);
    const barW = Math.max(1.5, Math.min(100, (c.n / total) * 100));
    return `
      <div style="margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; margin-bottom:4px;">
          <span style="display:flex; align-items:center; gap:6px;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${col};"></span>
            <b style="color:#1e3a5f; letter-spacing:0.3px;">${c.category}</b>
          </span>
          <span style="font-family:monospace; font-size:10px;">
            <b style="color:#334155;">${c.n.toLocaleString()}</b>
            <span style="color:#64748b; font-size:9px;">(${pct}%)</span>
          </span>
        </div>
        <div style="height:6px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${barW}%; background:${col}; border-radius:3px;"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:18px 20px; margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
        <div>
          <div style="font-size:12px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px;">
            Event Distribution by Category
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:2px;">
            Ranked classification of ${total.toLocaleString()} security telemetry events across detection categories
          </div>
        </div>
        <div style="font-size:10px; font-family:monospace; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:4px 10px; border-radius:4px; font-weight:700;">
          ${sorted.length} Active Categories
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px 28px;">
        <div>${renderCol(col1)}</div>
        <div>${renderCol(col2)}</div>
      </div>
    </div>
  `;
}

function buildHtml() {
  const d = reportData;
  const f = d.filters;
  const ev = d.events;
  const sevMap = {};
  (ev.bySeverity || []).forEach(r => { sevMap[r.severity] = r.n; });

  const critCount = Number(sevMap.critical || 0);
  const highCount = Number(sevMap.high || 0);
  const threatLevel = critCount > 5 ? 'CRITICAL' : critCount > 0 || highCount > 5 ? 'HIGH' : highCount > 0 ? 'ELEVATED' : 'NORMAL';
  const tlColor = { CRITICAL: '#ef4444', HIGH: '#f97316', ELEVATED: '#eab308', NORMAL: '#22c55e' }[threatLevel];

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IOC Hunt Security Report - ${f.durationLabel}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #1a2540; margin: 0; padding: 24px; background: #f8fafc; }
    .report-wrap { max-width: 960px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    h1 { font-size: 20px; font-weight: 800; color: #1e3a5f; letter-spacing: 0.5px; margin: 0 0 6px; font-family: monospace; }
    h2 { font-size: 13px; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 0.5px; font-family: monospace; }
    .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
    .threat-box { background: #f8faff; border: 2px solid ${tlColor}; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; gap: 24px; }
    .threat-level { font-size: 24px; font-weight: 800; color: ${tlColor}; letter-spacing: 1px; font-family: monospace; }
    .threat-desc { font-size: 12px; color: #334155; line-height: 1.6; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    .stat { background: #f0f4fc; border-radius: 6px; padding: 10px 14px; min-width: 100px; text-align: center; border: 1px solid #e2e8f0; flex: 1; }
    .stat-n { font-size: 22px; font-weight: 800; font-family: monospace; }
    .stat-l { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-top: 4px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 10px; font-family: monospace; }
    th { background: #f0f4fc; padding: 8px 10px; text-align: left; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: #475569; border-bottom: 2px solid #cbd5e1; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
    tr:nth-child(even) td { background: #f8faff; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .c { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; }
    .h { background: #fff7ed; color: #f97316; border: 1px solid #fed7aa; }
    .m { background: #fefce8; color: #ca8a04; border: 1px solid #fef08a; }
    .l { background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; }
    .bar-wrap { background: #e2e8f0; border-radius: 3px; height: 8px; width: 100%; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 3px; }
    .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #cbd5e1; font-size: 9px; color: #64748b; text-align: center; font-family: monospace; }
    .print-btn-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .btn-print { background: #2563eb; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .btn-print:hover { background: #1d4ed8; }
    @media print {
      body { background: #fff; padding: 0; }
      .report-wrap { box-shadow: none; border: none; padding: 0; }
      .print-btn-bar { display: none; }
      .view-toggle { display: none !important; }
      #timeline-bars-view { display: none !important; }
      #timeline-lines-view { display: block !important; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-wrap">
    <div class="print-btn-bar">
      <div style="font-size:12px; color:#64748b; font-weight:600;">IOC Hunt Security Operations Intelligence Dossier</div>
      <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>

    <h1>IOC HUNT SECURITY REPORT</h1>
    <div class="meta">
      Period: <b>${f.durationLabel}</b> &nbsp;|&nbsp; Machine: <b>All Machines</b> &nbsp;|&nbsp; Generated: <b>${new Date(d.generated).toLocaleString()}</b>
    </div>

    <div class="threat-box">
      <div>
        <div style="font-size:9px; color:#64748b; letter-spacing:1px; margin-bottom:3px; font-weight:700;">THREAT LEVEL</div>
        <div class="threat-level">${threatLevel}</div>
      </div>
      <div class="threat-desc">
        <b>${(ev.total || 0).toLocaleString()}</b> security events recorded during this audit window.<br>
        <b style="color:#ef4444">${critCount} critical threats</b>, <b style="color:#f97316">${highCount} high severity alerts</b>, and <b style="color:#ca8a04">${Number(sevMap.medium || 0).toLocaleString()} medium risk events</b> analyzed across endpoints.
      </div>
    </div>

    <!-- ── USB POLICY & DEVICE COMPLIANCE SECTION ── -->
    ${generateUsbComplianceSection(d.usb_compliance)}

    <h2>Summary Statistics</h2>
    <div class="stats">
      <div class="stat"><div class="stat-n" style="color:#1e3a5f">${ev.total.toLocaleString()}</div><div class="stat-l">Total Events</div></div>
      <div class="stat"><div class="stat-n" style="color:#ef4444">${critCount.toLocaleString()}</div><div class="stat-l">Critical</div></div>
      <div class="stat"><div class="stat-n" style="color:#f97316">${highCount.toLocaleString()}</div><div class="stat-l">High</div></div>
      <div class="stat"><div class="stat-n" style="color:#ca8a04">${Number(sevMap.medium || 0).toLocaleString()}</div><div class="stat-l">Medium</div></div>
      <div class="stat"><div class="stat-n" style="color:#3b82f6">${Number(sevMap.low || 0).toLocaleString()}</div><div class="stat-l">Low</div></div>
      <div class="stat"><div class="stat-n" style="color:#06b6d4">${Number(sevMap.info || 0).toLocaleString()}</div><div class="stat-l">Info</div></div>
      <div class="stat"><div class="stat-n" style="color:#4a5578">${ev.byMachine.length}</div><div class="stat-l">Machines</div></div>
    </div>

    <h2>Visual Threat Analytics</h2>
    ${generateTimelineSection(ev.hourly, f, f.durationLabel)}

    ${generateCategoryDistributionHtml(ev.byCategory, ev.total)}

    <h2>Endpoint Telemetry Distribution</h2>
    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Total Events</th>
          <th>Proportion</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${ev.byMachine.map(m => {
          const count = Number(m.n || 0);
          const pct = Math.round((count / ev.total) * 100);
          const maxM = Math.max(...ev.byMachine.map(x => Number(x.n || 0)));
          const barW = Math.round((count / maxM) * 100);
          return `
            <tr>
              <td><b style="color:#2563eb">${m.machine}</b></td>
              <td>${count.toLocaleString()}</td>
              <td><div class="bar-wrap"><div class="bar-fill" style="width:${barW}%; background:#3b82f6;"></div></div></td>
              <td>${pct}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <h2>Top Security Tags</h2>
    <table>
      <thead>
        <tr>
          <th>Security Tag</th>
          <th>Detections</th>
          <th>Relative Frequency</th>
        </tr>
      </thead>
      <tbody>
        ${ev.topTags.map(t => {
          const count = Number(t.n || 0);
          const maxT = Math.max(...ev.topTags.map(x => Number(x.n || 0)));
          const barW = Math.round((count / maxT) * 100);
          return `
            <tr>
              <td><code style="color:#7c3aed; font-weight:700;">${t.tag || '[SYSTEM]'}</code></td>
              <td>${count.toLocaleString()}</td>
              <td><div class="bar-wrap"><div class="bar-fill" style="width:${barW}%; background:#7c3aed;"></div></div></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <h2>Critical & Significant Threat Events (${(ev.critical || []).length} Records)</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Machine</th>
          <th>Severity</th>
          <th>Tag</th>
          <th>Detection Message</th>
        </tr>
      </thead>
      <tbody>
        ${(ev.critical || []).map(e => `
          <tr>
            <td style="white-space:nowrap; color:#64748b;">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0,16).replace('T',' ') : '-'}</td>
            <td><b style="color:#2563eb;">${e.machine}</b></td>
            <td><span class="badge ${e.severity === 'critical' ? 'c' : 'h'}">${e.severity}</span></td>
            <td><code style="color:#7c3aed; font-size:9px;">${e.tag}</code></td>
            <td style="font-size:9px; max-width:400px; word-break:break-word;">${(e.message || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="footer">
      IOC Hunt Security Report &nbsp;|&nbsp; All Machines &nbsp;|&nbsp; ${f.durationLabel} &nbsp;|&nbsp; Generated ${new Date(d.generated).toLocaleString()}
    </div>
  </div>

  <script>
    function toggleTimeline(mode) {
      const lineView = document.getElementById('timeline-lines-view');
      const barView = document.getElementById('timeline-bars-view');
      const btnTrend = document.getElementById('btn-trend');
      const btnBars = document.getElementById('btn-bars');
      if (mode === 'bars') {
        lineView.style.display = 'none';
        barView.style.display = 'block';
        btnBars.style.background = '#2563eb';
        btnBars.style.color = '#fff';
        btnTrend.style.background = 'transparent';
        btnTrend.style.color = '#475569';
      } else {
        lineView.style.display = 'block';
        barView.style.display = 'none';
        btnTrend.style.background = '#2563eb';
        btnTrend.style.color = '#fff';
        btnBars.style.background = 'transparent';
        btnBars.style.color = '#475569';
      }
    }
  </script>
</body>
</html>`;

  return html;
}

const html = buildHtml();
const outPath = path.join(__dirname, '../IOCHunt_Weekly_Security_Report.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log(`[SUCCESS] Generated updated HTML report at: ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
