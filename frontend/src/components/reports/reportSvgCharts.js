/**
 * reportSvgCharts.js
 * Generates pure vector SVG chart markup for inclusion in printable PDF reports.
 * 100% self-contained, no external dependencies, prints razor-sharp at 300+ DPI.
 */

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

  const maxSeriesVal = Math.max(
    ...buckets.map(b => Math.max(b.crit, b.high, b.med, b.low)),
    1
  );
  const roundedMax = Math.ceil(maxSeriesVal * 1.15 / 10) * 10;

  const svgW = 760;
  const svgH = 195;
  const padL = 45;
  const padR = 25;
  const padT = 30;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const barCount = buckets.length;
  const slotW = plotW / barCount;

  // Y-axis gridlines
  let gridLines = '';
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const val = Math.round((roundedMax / steps) * i);
    const y = padT + plotH - (plotH / steps) * i;
    gridLines += `
      <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3" stroke-width="1" />
      <text x="${padL - 6}" y="${y + 3}" font-size="8" fill="#64748b" text-anchor="end" font-family="monospace">${val}</text>
    `;
  }

  // --- Multi-Line Trend Chart (NO stacked vertical bars) ---
  const getY = (val) => padT + plotH - (val / roundedMax) * plotH;
  const getX = (idx) => padL + idx * slotW + slotW / 2;

  const selectedSevs = Array.isArray(filters.severity)
    ? filters.severity.map(s => s.trim().toLowerCase())
    : (typeof filters.severity === 'string' && filters.severity && filters.severity !== 'All Severities' && filters.severity !== 'ALL'
        ? filters.severity.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : []);

  let seriesMeta = [
    { key: 'crit', color: '#ef4444', label: 'Critical', bg: 'rgba(239, 68, 68, 0.08)' },
    { key: 'high', color: '#f97316', label: 'High', bg: 'rgba(249, 115, 22, 0.08)' },
    { key: 'med',  color: '#ca8a04', label: 'Medium', bg: 'rgba(202, 138, 4, 0.08)' },
    { key: 'low',  color: '#3b82f6', label: 'Low/Info', bg: 'rgba(59, 130, 246, 0.08)' }
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

  let linesSvg = '';
  let dotsSvg = '';
  let dateLabelsSvg = '';

  const labelStep = Math.max(1, Math.ceil(barCount / 10));

  buckets.forEach((b, idx) => {
    const x = getX(idx);
    if (idx % labelStep === 0 || idx === barCount - 1) {
      let lbl = b.time;
      if (isMultiDay) {
        lbl = b.time.slice(5);
      } else {
        lbl = b.time.length >= 16 ? b.time.slice(11, 16) : b.time;
      }
      dateLabelsSvg += `
        <text x="${x}" y="${padT + plotH + 16}" font-size="9" fill="#475569" font-weight="600" text-anchor="middle" font-family="monospace">${lbl}</text>
      `;
    }
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
      <path d="${pathD}" fill="none" stroke="${sm.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    `;
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; margin-bottom:18px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div style="font-size:12px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px;">
          Security Activity & Threat Timeline &nbsp;<span style="font-size:10px; font-weight:normal; color:#64748b;">(${periodLabel})</span>
        </div>
        <div style="display:flex; gap:12px; font-size:9px; font-family:monospace;">
          ${seriesMeta.map(sm => `
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:${sm.color}; border-radius:2px;"></span>${sm.label}</span>
          `).join('')}
        </div>
      </div>
      <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
        ${gridLines}
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
