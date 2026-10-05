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

  const maxTotal = Math.max(...buckets.map(b => b.total), 1);
  const roundedMax = Math.ceil(maxTotal * 1.15);

  const svgW = 760;
  const svgH = 175;
  const padL = 40;
  const padR = 20;
  const padT = 28;
  const padB = 26;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const barCount = buckets.length;
  const slotW = plotW / barCount;
  const barW = Math.max(3, Math.min(24, slotW * 0.72));

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

  // Bars and X-axis labels
  let barsSvg = '';
  const labelStep = Math.max(1, Math.ceil(barCount / 10));

  buckets.forEach((b, idx) => {
    const xCenter = padL + idx * slotW + slotW / 2;
    const x = xCenter - barW / 2;

    const scale = (val) => (val / roundedMax) * plotH;
    const hLow = scale(b.low);
    const hMed = scale(b.med);
    const hHigh = scale(b.high);
    const hCrit = scale(b.crit);

    let currY = padT + plotH;

    // Draw stacked segments from bottom up
    if (hLow > 0) {
      currY -= hLow;
      barsSvg += `<rect x="${x}" y="${currY}" width="${barW}" height="${hLow}" fill="#3b82f6" rx="1" />`;
    }
    if (hMed > 0) {
      currY -= hMed;
      barsSvg += `<rect x="${x}" y="${currY}" width="${barW}" height="${hMed}" fill="#ca8a04" rx="1" />`;
    }
    if (hHigh > 0) {
      currY -= hHigh;
      barsSvg += `<rect x="${x}" y="${currY}" width="${barW}" height="${hHigh}" fill="#f97316" rx="1" />`;
    }
    if (hCrit > 0) {
      currY -= hCrit;
      barsSvg += `<rect x="${x}" y="${currY}" width="${barW}" height="${hCrit}" fill="#ef4444" rx="1" />`;
    }

    // Label
    if (idx % labelStep === 0 || idx === barCount - 1) {
      let lbl = b.time;
      if (isMultiDay) {
        lbl = b.time.slice(5); // MM-DD
      } else {
        lbl = b.time.length >= 16 ? b.time.slice(11, 16) : b.time;
      }
      barsSvg += `
        <text x="${xCenter}" y="${padT + plotH + 14}" font-size="8" fill="#64748b" text-anchor="middle" font-family="monospace">${lbl}</text>
      `;
    }
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-size:11px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px;">
          Security Activity & Threat Timeline &nbsp;<span style="font-size:9px; font-weight:normal; color:#64748b;">(${periodLabel})</span>
        </div>
        <div style="display:flex; gap:12px; font-size:9px; font-family:monospace;">
          <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#ef4444; border-radius:2px;"></span>Critical</span>
          <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#f97316; border-radius:2px;"></span>High</span>
          <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#ca8a04; border-radius:2px;"></span>Medium</span>
          <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:8px; height:8px; background:#3b82f6; border-radius:2px;"></span>Low/Info</span>
        </div>
      </div>
      <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" height="${svgH}" style="display:block; overflow:visible;">
        ${gridLines}
        ${barsSvg}
      </svg>
    </div>
  `;
}

export function generateCategoryDonutSvg(byCategory = [], totalEvents = 0, catColors = {}) {
  const sorted = [...(byCategory || [])]
    .map(c => ({ category: c.category || 'OTHER', n: Number(c.n || c.count || 0) }))
    .filter(c => c.n > 0)
    .sort((a, b) => b.n - a.n);

  const total = totalEvents > 0 ? totalEvents : sorted.reduce((sum, c) => sum + c.n, 0);
  if (sorted.length === 0 || total === 0) return '';

  const cx = 95;
  const cy = 85;
  const R = 68;
  const r = 40;

  let slicesSvg = '';
  let startAngle = -Math.PI / 2;

  if (sorted.length === 1) {
    const col = catColors[sorted[0].category] || '#3b82f6';
    slicesSvg = `
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="${col}" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" />
    `;
  } else {
    sorted.forEach(c => {
      const sliceAngle = (c.n / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;
      const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#64748b';

      const x1o = cx + R * Math.cos(startAngle);
      const y1o = cy + R * Math.sin(startAngle);
      const x2o = cx + R * Math.cos(endAngle);
      const y2o = cy + R * Math.sin(endAngle);
      const x2i = cx + r * Math.cos(endAngle);
      const y2i = cy + r * Math.sin(endAngle);
      const x1i = cx + r * Math.cos(startAngle);
      const y1i = cy + r * Math.sin(startAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const d = `M ${x1o.toFixed(1)} ${y1o.toFixed(1)} A ${R} ${R} 0 ${largeArc} 1 ${x2o.toFixed(1)} ${y2o.toFixed(1)} L ${x2i.toFixed(1)} ${y2i.toFixed(1)} A ${r} ${r} 0 ${largeArc} 0 ${x1i.toFixed(1)} ${y1i.toFixed(1)} Z`;

      slicesSvg += `<path d="${d}" fill="${col}" stroke="#ffffff" stroke-width="1.5" />`;
      startAngle = endAngle;
    });
  }

  // Legend rows for top categories
  const topCategories = sorted.slice(0, 8);
  let legendHtml = '';
  topCategories.forEach(c => {
    const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#64748b';
    const pct = Math.round((c.n / total) * 100);
    legendHtml += `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; margin-bottom:3px;">
        <span style="display:flex; align-items:center; gap:5px;">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${col};"></span>
          <b style="color:#1e3a5f;">${c.category}</b>
        </span>
        <span style="font-family:monospace; color:#4a5578;">${c.n.toLocaleString()} (${pct}%)</span>
      </div>
    `;
  });

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; flex:1; min-width:320px;">
      <div style="font-size:11px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
        Event Distribution by Category
      </div>
      <div style="display:flex; align-items:center; gap:16px;">
        <div style="width:190px; height:170px; flex-shrink:0; position:relative;">
          <svg viewBox="0 0 190 170" width="100%" height="100%">
            ${slicesSvg}
            <text x="${cx}" y="${cy - 3}" font-size="14" font-weight="700" fill="#1e3a5f" text-anchor="middle" font-family="monospace">${total.toLocaleString()}</text>
            <text x="${cx}" y="${cy + 10}" font-size="7" font-weight="700" fill="#64748b" text-anchor="middle" font-family="monospace">TOTAL</text>
          </svg>
        </div>
        <div style="flex:1; border-left:1px solid #f1f5f9; padding-left:14px;">
          ${legendHtml}
        </div>
      </div>
    </div>
  `;
}

export function generateSeverityProportionSvg(sevMap = {}, totalEvents = 0) {
  const crit = Number(sevMap.critical || 0);
  const high = Number(sevMap.high || 0);
  const med = Number(sevMap.medium || 0);
  const low = Number(sevMap.low || 0) + Number(sevMap.info || 0);
  const sum = crit + high + med + low;
  const total = totalEvents > 0 ? totalEvents : Math.max(sum, 1);

  const pCrit = Math.round((crit / total) * 100);
  const pHigh = Math.round((high / total) * 100);
  const pMed = Math.round((med / total) * 100);
  const pLow = Math.max(0, 100 - pCrit - pHigh - pMed);

  return `
    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:12px 14px; flex:1; min-width:280px;">
      <div style="font-size:11px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">
        Threat Severity Composition
      </div>
      <!-- Stacked Proportion Bar -->
      <div style="display:flex; height:14px; border-radius:4px; overflow:hidden; margin-bottom:14px; background:#f1f5f9;">
        ${crit > 0 ? `<div style="width:${(crit / total) * 100}%; background:#ef4444;" title="Critical: ${crit}"></div>` : ''}
        ${high > 0 ? `<div style="width:${(high / total) * 100}%; background:#f97316;" title="High: ${high}"></div>` : ''}
        ${med > 0 ? `<div style="width:${(med / total) * 100}%; background:#ca8a04;" title="Medium: ${med}"></div>` : ''}
        ${low > 0 ? `<div style="width:${(low / total) * 100}%; background:#3b82f6;" title="Low/Info: ${low}"></div>` : ''}
      </div>

      <!-- Severity Details Table -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:4px; padding:6px 10px;">
          <div style="font-size:8px; font-weight:700; color:#ef4444; text-transform:uppercase;">Critical</div>
          <div style="font-size:14px; font-weight:700; color:#dc2626; font-family:monospace;">${crit.toLocaleString()} <span style="font-size:9px; font-weight:normal;">(${pCrit}%)</span></div>
        </div>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:4px; padding:6px 10px;">
          <div style="font-size:8px; font-weight:700; color:#f97316; text-transform:uppercase;">High</div>
          <div style="font-size:14px; font-weight:700; color:#ea580c; font-family:monospace;">${high.toLocaleString()} <span style="font-size:9px; font-weight:normal;">(${pHigh}%)</span></div>
        </div>
        <div style="background:#fefce8; border:1px solid #fef08a; border-radius:4px; padding:6px 10px;">
          <div style="font-size:8px; font-weight:700; color:#ca8a04; text-transform:uppercase;">Medium</div>
          <div style="font-size:14px; font-weight:700; color:#a16207; font-family:monospace;">${med.toLocaleString()} <span style="font-size:9px; font-weight:normal;">(${pMed}%)</span></div>
        </div>
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; padding:6px 10px;">
          <div style="font-size:8px; font-weight:700; color:#3b82f6; text-transform:uppercase;">Low / Info</div>
          <div style="font-size:14px; font-weight:700; color:#2563eb; font-family:monospace;">${low.toLocaleString()} <span style="font-size:9px; font-weight:normal;">(${pLow}%)</span></div>
        </div>
      </div>
    </div>
  `;
}
