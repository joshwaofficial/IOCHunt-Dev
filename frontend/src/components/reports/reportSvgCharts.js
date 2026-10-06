/**
 * reportSvgCharts.js
 * Generates pure vector SVG chart markup for inclusion in printable PDF reports.
 * 100% self-contained, no external dependencies, prints razor-sharp at 300+ DPI.
 * Renders smooth stacked cubic Bézier splines matching ECharts on-screen UI.
 */

function calculateNiceAxis(maxValue, targetSteps = 5) {
  if (maxValue <= 0) return { max: 10, step: 2, steps: 5 };
  const roughStep = maxValue / targetSteps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, roughStep))));
  const normalized = roughStep / magnitude;

  let niceStep;
  if (normalized <= 1.2) niceStep = 1;
  else if (normalized <= 2.2) niceStep = 2;
  else if (normalized <= 3.2) niceStep = 3;
  else if (normalized <= 6) niceStep = 5;
  else niceStep = 10;

  const step = Math.max(1, Math.round(niceStep * magnitude));
  const steps = Math.ceil(maxValue / step);
  const max = step * steps;
  return { max: Math.max(max, step * targetSteps), step, steps: Math.max(steps, targetSteps) };
}

function buildSmoothPath(pts, tension = 0.28) {
  if (!pts || pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

    let cp1x = p1.x + (p2.x - p0.x) * tension;
    let cp1y = p1.y + (p2.y - p0.y) * tension;
    let cp2x = p2.x - (p3.x - p1.x) * tension;
    let cp2y = p2.y - (p3.y - p1.y) * tension;

    // Prevent overshoot when both adjacent points have identical Y
    if (Math.abs(p1.y - p2.y) < 0.05) {
      cp1y = p1.y;
      cp2y = p2.y;
    }

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function buildSmoothArea(pts, baselineY, tension = 0.28) {
  if (!pts || pts.length === 0) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  const lineD = buildSmoothPath(pts, tension);
  return `${lineD} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

export function generateTimelineSvg(hourlyData = [], filters = {}, periodLabel = '') {
  if (!hourlyData || hourlyData.length === 0) {
    return `
      <div style="background:#f8faff; border:1px dashed #cbd5e1; border-radius:6px; padding:18px; text-align:center; color:#64748b; font-size:11px;">
        No timeline events recorded during ${periodLabel || 'this period'}.
      </div>
    `;
  }

  // Determine if daily or hourly bucketing
  const dur = String(filters.duration || '').toLowerCase();
  const isMultiDay = dur === '168' || dur === '720' || dur === '72' || (filters.from_date && filters.to_date && (new Date(filters.to_date) - new Date(filters.from_date) > 3 * 86400000));

  let source = [];
  if (isMultiDay) {
    const dailyMap = {};
    hourlyData.forEach(d => {
      const day = (d.hour || '').slice(0, 10);
      if (!day) return;
      const sev = (d.severity || 'low').toLowerCase();
      const key = `${day}_${sev}`;
      if (!dailyMap[key]) dailyMap[key] = { time: day, severity: sev, n: 0 };
      dailyMap[key].n += Number(d.n || 0);
    });
    source = Object.values(dailyMap);
  } else {
    source = hourlyData.map(d => ({
      time: d.hour || '',
      severity: (d.severity || 'low').toLowerCase(),
      n: Number(d.n || 0)
    }));
  }

  const timeSet = new Set();
  source.forEach(d => { if (d.time) timeSet.add(d.time); });
  const sortedTimes = Array.from(timeSet).sort();

  if (sortedTimes.length === 0) return '';

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

  const selectedSevs = Array.isArray(filters.severity)
    ? filters.severity.map(s => s.trim().toLowerCase())
    : (typeof filters.severity === 'string' && filters.severity && filters.severity !== 'All Severities' && filters.severity !== 'ALL'
        ? filters.severity.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : []);

  let seriesMeta = [
    { key: 'crit', color: '#ef4444', label: 'Critical', gradId: 'tl-grad-crit', gradStart: '#ef4444' },
    { key: 'high', color: '#f97316', label: 'High', gradId: 'tl-grad-high', gradStart: '#f97316' },
    { key: 'med',  color: '#eab308', label: 'Medium', gradId: 'tl-grad-med', gradStart: '#eab308' },
    { key: 'low',  color: '#3b82f6', label: 'Low/Info', gradId: 'tl-grad-low', gradStart: '#3b82f6' }
  ];

  if (selectedSevs.length > 0) {
    seriesMeta = seriesMeta.filter(sm => {
      if (sm.key === 'crit') return selectedSevs.includes('critical');
      if (sm.key === 'high') return selectedSevs.includes('high');
      if (sm.key === 'med') return selectedSevs.includes('medium');
      if (sm.key === 'low') return selectedSevs.includes('low') || selectedSevs.includes('info');
      return false;
    });
  }

  // Calculate cumulative stacked values per bucket matching ECharts stack: 'Total'
  buckets.forEach(b => {
    let acc = 0;
    seriesMeta.forEach(sm => {
      const val = b[sm.key] || 0;
      acc += val;
      b[`cum_${sm.key}`] = acc;
    });
    b.stackTotal = acc;
  });

  // Find peak bucket
  const peak = buckets.reduce((maxB, b) => (b.stackTotal > (maxB ? maxB.stackTotal : -1) ? b : maxB), null);

  const maxVal = Math.max(...buckets.map(b => b.stackTotal), 1);
  const { max: niceMax, step, steps } = calculateNiceAxis(maxVal, 5);

  const svgW = 760;
  const svgH = 205;
  const padL = 50;
  const padR = 25;
  const padT = 20;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const baselineY = padT + plotH;

  const barCount = buckets.length;
  const getX = (idx) => {
    if (barCount <= 1) return padL + plotW / 2;
    return padL + (idx / (barCount - 1)) * plotW;
  };
  const getY = (val) => padT + plotH - (val / niceMax) * plotH;

  // Y-axis horizontal gridlines
  let gridLines = '';
  for (let i = 0; i <= steps; i++) {
    const val = i * step;
    const y = getY(val);
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${padL - 8}" y="${y + 3.5}" font-size="8.5" fill="#64748b" text-anchor="end" font-family="monospace">${val.toLocaleString()}</text>
    `;
  }

  // Generate Area Fills (drawn in reverse order from top layer down to bottom layer)
  let areasSvg = '';
  seriesMeta.slice().reverse().forEach(sm => {
    const pts = buckets.map((b, idx) => ({ x: getX(idx), y: getY(b[`cum_${sm.key}`]) }));
    const areaD = buildSmoothArea(pts, baselineY, 0.28);
    areasSvg += `<path d="${areaD}" fill="url(#${sm.gradId})" />`;
  });

  // Generate Spline Stroke Lines (drawn in forward order from bottom layer to top layer)
  let linesSvg = '';
  let dotsSvg = '';
  seriesMeta.forEach(sm => {
    const pts = buckets.map((b, idx) => ({ x: getX(idx), y: getY(b[`cum_${sm.key}`]) }));
    const lineD = buildSmoothPath(pts, 0.28);
    linesSvg += `<path d="${lineD}" fill="none" stroke="${sm.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;

    if (barCount <= 35) {
      pts.forEach((pt, idx) => {
        const rawCount = buckets[idx][sm.key] || 0;
        dotsSvg += `
          <circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="${sm.color}" stroke="#ffffff" stroke-width="1.8">
            <title>${sm.label}: ${rawCount.toLocaleString()} events on ${buckets[idx].time}</title>
          </circle>
        `;
      });
    }
  });

  // X-axis date labels
  let dateLabelsSvg = '';
  const labelStep = Math.max(1, Math.ceil(barCount / 10));
  buckets.forEach((b, idx) => {
    if (idx % labelStep === 0 || idx === barCount - 1) {
      const x = getX(idx);
      let lbl = b.time;
      if (isMultiDay) {
        lbl = b.time.length >= 10 ? b.time.slice(5, 10) : b.time;
      } else {
        lbl = b.time.length >= 16 ? b.time.slice(11, 16) : b.time;
      }
      dateLabelsSvg += `
        <text x="${x}" y="${padT + plotH + 18}" font-size="9" fill="#475569" font-weight="600" text-anchor="middle" font-family="monospace">${lbl}</text>
      `;
    }
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:16px 20px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px; height:32px; border-radius:6px; background:#eff6ff; border:1px solid #bfdbfe; display:flex; align-items:center; justify-content:center; color:#2563eb;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
          </div>
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:12px; font-weight:800; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.8px; font-family:monospace;">
                SECURITY ACTIVITY & THREAT TIMELINE
              </span>
              ${periodLabel ? `
                <span style="font-size:9.5px; font-family:monospace; font-weight:700; padding:2px 8px; border-radius:10px; background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe;">
                  ${periodLabel}
                </span>
              ` : ''}
            </div>
            <div style="font-size:10px; color:#64748b; margin-top:3px;">
              Chronological security telemetry volume across the report window
              ${peak && peak.stackTotal > 0 ? ` &bull; Peak: <b style="color:#0f172a; font-family:monospace;">${peak.stackTotal.toLocaleString()} events</b> at ${peak.time}` : ''}
            </div>
          </div>
        </div>
        <div style="display:flex; gap:12px; font-size:9px; font-family:monospace;">
          ${seriesMeta.map(sm => `
            <span style="display:flex; align-items:center; gap:4px; color:#475569; font-weight:600;">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${sm.color};"></span>
              ${sm.label}
            </span>
          `).join('')}
        </div>
      </div>
      <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
        <defs>
          <linearGradient id="tl-grad-crit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef4444" stop-opacity="0.45" />
            <stop offset="100%" stop-color="#ef4444" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="tl-grad-high" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f97316" stop-opacity="0.40" />
            <stop offset="100%" stop-color="#f97316" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="tl-grad-med" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#eab308" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#eab308" stop-opacity="0.02" />
          </linearGradient>
          <linearGradient id="tl-grad-low" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.30" />
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.01" />
          </linearGradient>
        </defs>
        ${gridLines}
        ${areasSvg}
        ${linesSvg}
        ${dotsSvg}
        ${dateLabelsSvg}
      </svg>
    </div>
  `;
}

export function generateCategoryMatrixSvg(byCategory = [], totalEvents = 0, catColors = {}) {
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
  if (sorted.length === 0 || total === 0) return '';

  const half = Math.ceil(sorted.length / 2);
  const col1 = sorted.slice(0, half);
  const col2 = sorted.slice(half);

  const renderCol = (items) => items.map(c => {
    const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#64748b';
    const pct = ((c.n / total) * 100).toFixed(1);
    const barW = Math.max(1.5, Math.min(100, (c.n / total) * 100));
    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:9.5px; margin-bottom:3px;">
          <span style="display:flex; align-items:center; gap:5px;">
            <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${col}; flex-shrink:0;"></span>
            <b style="color:#1e3a5f; letter-spacing:0.2px;">${c.category}</b>
          </span>
          <span style="font-family:monospace; font-size:9.5px;">
            <b style="color:#334155;">${c.n.toLocaleString()}</b>
            <span style="color:#64748b; font-size:8.5px;">(${pct}%)</span>
          </span>
        </div>
        <div style="height:5px; background:#f1f5f9; border-radius:3px; overflow:hidden;">
          <div style="height:100%; width:${barW}%; background:${col}; border-radius:3px;"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px 18px; height:100%; box-sizing:border-box; display:flex; flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:30px; height:30px; border-radius:6px; background:#ecfeff; border:1px solid #a5f3fc; display:flex; align-items:center; justify-content:center; color:#06b6d4;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <div>
            <div style="font-size:11.5px; font-weight:800; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.8px; font-family:monospace;">
              Events by Category
            </div>
            <div style="font-size:9.5px; color:#64748b; margin-top:2px;">
              Ranked telemetry classification across ${sorted.length} categories
            </div>
          </div>
        </div>
        <div style="font-size:9.5px; font-family:monospace; color:#0284c7; background:#e0f2fe; border:1px solid #bae6fd; padding:2px 8px; border-radius:10px; font-weight:700;">
          ${total.toLocaleString()} total
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 20px; flex:1;">
        <div>${renderCol(col1)}</div>
        <div>${renderCol(col2)}</div>
      </div>
    </div>
  `;
}

export function generateMachineRiskSvg(machines = [], filters = {}) {
  const selectedSevs = Array.isArray(filters.severity)
    ? filters.severity.map(s => s.trim().toLowerCase())
    : (typeof filters.severity === 'string' && filters.severity && filters.severity !== 'All Severities' && filters.severity !== 'ALL'
        ? filters.severity.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : []);

  const activeCrit = selectedSevs.length === 0 || selectedSevs.includes('critical');
  const activeHigh = selectedSevs.length === 0 || selectedSevs.includes('high');
  const activeMed  = selectedSevs.length === 0 || selectedSevs.includes('medium');

  const topMachines = [...(machines || [])]
    .sort((a, b) => {
      const countA = Number(a.event_count || a.n || 0);
      const countB = Number(b.event_count || b.n || 0);
      const scoreA = (Number(a.critical || 0) * 10) + (Number(a.high || 0) * 3) + countA;
      const scoreB = (Number(b.critical || 0) * 10) + (Number(b.high || 0) * 3) + countB;
      return scoreB - scoreA;
    })
    .slice(0, 6);

  if (topMachines.length === 0) {
    return `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px 18px; height:100%; box-sizing:border-box;">
        <div style="font-size:12px; font-weight:800; color:#1e3a5f; text-transform:uppercase; font-family:monospace; margin-bottom:12px;">
          Endpoint Threat Distribution
        </div>
        <div style="text-align:center; padding:30px; color:#94a3b8; font-size:11px;">
          No endpoint data available for this period.
        </div>
      </div>
    `;
  }

  const hasSevBreakdown = topMachines.some(m => (Number(m.critical || 0) + Number(m.high || 0) + Number(m.medium || 0)) > 0);

  const processed = topMachines.map(m => {
    const crit = activeCrit ? Number(m.critical || 0) : 0;
    const high = activeHigh ? Number(m.high || 0) : 0;
    const med  = activeMed ? Number(m.medium || 0) : 0;
    const total = Number(m.event_count || m.n || 0);
    const stackTotal = (hasSevBreakdown && (crit + high + med > 0)) ? (crit + high + med) : total;
    return {
      name: m.label || m.machine || m.id || 'Unknown',
      crit,
      high,
      med,
      total,
      stackTotal
    };
  });

  const maxVal = Math.max(...processed.map(p => p.stackTotal), 1);
  const { max: niceMax, step, steps } = calculateNiceAxis(maxVal, 5);

  const svgW = 460;
  const padL = 70;
  const padR = 25;
  const padT = 16;
  const padB = 26;
  const plotW = svgW - padL - padR;

  const rowCount = processed.length;
  const rowH = rowCount === 1 ? 55 : Math.max(28, Math.min(42, 160 / rowCount));
  const barH = rowCount === 1 ? 18 : Math.max(12, Math.min(16, rowH - 12));
  const plotH = rowH * rowCount;
  const svgH = padT + plotH + padB;

  // Grid lines
  let gridLines = '';
  for (let i = 0; i <= steps; i++) {
    const val = i * step;
    const x = padL + (val / niceMax) * plotW;
    gridLines += `
      <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${x}" y="${padT + plotH + 16}" font-size="8.5" fill="#64748b" text-anchor="middle" font-family="monospace">${val.toLocaleString()}</text>
    `;
  }

  // Bars
  let barsSvg = '';
  processed.forEach((p, idx) => {
    const y = padT + idx * rowH + (rowH - barH) / 2;
    const displayName = p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name;
    const labelSvg = `
      <text x="${padL - 8}" y="${y + barH / 2 + 3.5}" font-size="10" fill="#1e3a5f" font-weight="700" text-anchor="end" font-family="monospace">${displayName}</text>
    `;

    const trackSvg = `<rect x="${padL}" y="${y}" width="${plotW}" height="${barH}" fill="#f8fafc" rx="3" />`;

    let segsSvg = '';
    if (hasSevBreakdown && (p.crit + p.high + p.med > 0)) {
      const critW = (p.crit / niceMax) * plotW;
      const highW = (p.high / niceMax) * plotW;
      const medW  = (p.med / niceMax) * plotW;

      let curX = padL;
      if (critW > 0) {
        segsSvg += `<rect x="${curX}" y="${y}" width="${critW}" height="${barH}" fill="#ef4444" rx="2" />`;
        curX += critW;
      }
      if (highW > 0) {
        segsSvg += `<rect x="${curX}" y="${y}" width="${highW}" height="${barH}" fill="#f97316" rx="2" />`;
        curX += highW;
      }
      if (medW > 0) {
        segsSvg += `<rect x="${curX}" y="${y}" width="${medW}" height="${barH}" fill="#eab308" rx="2" />`;
      }
    } else {
      const totW = Math.min(plotW, (p.total / niceMax) * plotW);
      segsSvg = `<rect x="${padL}" y="${y}" width="${totW}" height="${barH}" fill="#3b82f6" rx="2" />`;
    }

    barsSvg += `
      <g>
        ${labelSvg}
        ${trackSvg}
        ${segsSvg}
      </g>
    `;
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px 18px; height:100%; box-sizing:border-box; display:flex; flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:30px; height:30px; border-radius:6px; background:#fef2f2; border:1px solid #fecaca; display:flex; align-items:center; justify-content:center; color:#ef4444;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <div>
            <div style="font-size:11.5px; font-weight:800; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.8px; font-family:monospace;">
              Endpoint Threat Distribution
            </div>
            <div style="font-size:9.5px; color:#64748b; margin-top:2px;">
              Top targeted endpoints by severity in this report period
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:9.5px; font-family:monospace; color:#64748b; background:#f1f5f9; border:1px solid #e2e8f0; padding:2px 8px; border-radius:10px; font-weight:700;">
            ${machines.length} endpoint${machines.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:8px; font-size:9px; font-family:monospace;">
        <span style="display:flex; align-items:center; gap:4px; color:#475569;"><span style="display:inline-block; width:7px; height:7px; border-radius:2px; background:#ef4444;"></span>Critical</span>
        <span style="display:flex; align-items:center; gap:4px; color:#475569;"><span style="display:inline-block; width:7px; height:7px; border-radius:2px; background:#f97316;"></span>High</span>
        <span style="display:flex; align-items:center; gap:4px; color:#475569;"><span style="display:inline-block; width:7px; height:7px; border-radius:2px; background:#eab308;"></span>Medium</span>
      </div>

      <div style="flex:1; display:flex; align-items:center;">
        <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
          ${gridLines}
          ${barsSvg}
        </svg>
      </div>
    </div>
  `;
}
