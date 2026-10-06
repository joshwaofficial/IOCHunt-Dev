import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

/**
 * ReportTimelineChart
 * Displays event and threat distribution over the selected period.
 * Supports hourly and daily bucketing with interactive severity toggling.
 */
export default function ReportTimelineChart({ hourlyData = [], periodLabel = '', filters = {}, theme = 'dark' }) {
  const chartRef = useRef(null);

  // Determine initial bucket mode based on period:
  // If period spans > 3 days (e.g. 168h weekly, 720h monthly, or custom > 3 days), default to 'daily'
  const isMultiDay = useMemo(() => {
    const dur = String(filters.duration || '').toLowerCase();
    if (dur === '168' || dur === '720' || dur === '72') return true;
    if (filters.from_date && filters.to_date) {
      const diffDays = (new Date(filters.to_date) - new Date(filters.from_date)) / (1000 * 3600 * 24);
      return diffDays > 3;
    }
    return false;
  }, [filters]);

  const [bucket, setBucket] = useState(isMultiDay ? 'daily' : 'hourly');

  // Update bucket when period changes drastically
  useEffect(() => {
    setBucket(isMultiDay ? 'daily' : 'hourly');
  }, [isMultiDay]);

  // Extract any active severity filter from props
  const selectedSevs = useMemo(() => {
    if (!filters.severity) return [];
    if (Array.isArray(filters.severity)) {
      return filters.severity.map(s => s.trim().toLowerCase()).filter(s => s && s !== 'all severities' && s !== 'all');
    }
    if (typeof filters.severity === 'string' && filters.severity !== 'All Severities' && filters.severity !== 'ALL') {
      return filters.severity.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    return [];
  }, [filters.severity]);

  // Active series toggles - defaults to filtered severities if specified
  const [activeSeries, setActiveSeries] = useState({
    critical: selectedSevs.length === 0 || selectedSevs.includes('critical'),
    high: selectedSevs.length === 0 || selectedSevs.includes('high'),
    medium: selectedSevs.length === 0 || selectedSevs.includes('medium'),
    low: selectedSevs.length === 0 || selectedSevs.includes('low') || selectedSevs.includes('info'),
  });

  useEffect(() => {
    if (selectedSevs.length > 0) {
      setActiveSeries({
        critical: selectedSevs.includes('critical'),
        high: selectedSevs.includes('high'),
        medium: selectedSevs.includes('medium'),
        low: selectedSevs.includes('low') || selectedSevs.includes('info'),
      });
    } else {
      setActiveSeries({
        critical: true,
        high: true,
        medium: true,
        low: true,
      });
    }
  }, [selectedSevs]);

  const toggleSeries = (sev) => {
    setActiveSeries(prev => {
      const next = { ...prev, [sev]: !prev[sev] };
      // Prevent turning all off
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const isLight = theme === 'light';
  const textColor = isLight ? '#334155' : '#cbd5e1';
  const mutedTextColor = isLight ? '#64748b' : '#94a3b8';
  const gridLineColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(148, 163, 184, 0.1)';
  const surfaceColor = isLight ? '#ffffff' : '#0f172a';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';

  // Process timeline data according to bucket
  const { labels, sevData, totalEventsInPeriod, peakBucket } = useMemo(() => {
    if (!hourlyData || hourlyData.length === 0) {
      return { labels: [], sevData: { critical: [], high: [], medium: [], low: [] }, totalEventsInPeriod: 0, peakBucket: null };
    }

    let source = hourlyData;
    if (bucket === 'daily') {
      const dailyMap = {};
      hourlyData.forEach(d => {
        const day = (d.hour || '').slice(0, 10);
        if (!day) return;
        const sev = (d.severity || 'low').toLowerCase();
        const key = `${day}_${sev}`;
        if (!dailyMap[key]) {
          dailyMap[key] = { time: day, severity: sev, n: 0 };
        }
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

    const dataMap = { critical: [], high: [], medium: [], low: [] };
    let totalSum = 0;
    let maxBucketCount = 0;
    let maxBucketTime = '';

    sortedTimes.forEach(t => {
      const items = source.filter(d => d.time === t);
      const getVal = (s) => {
        if (s === 'low') {
          // Group low and info together for clean visualization
          return items.filter(d => d.severity === 'low' || d.severity === 'info')
            .reduce((acc, curr) => acc + curr.n, 0);
        }
        const found = items.find(d => d.severity === s);
        return found ? found.n : 0;
      };

      const c = getVal('critical');
      const h = getVal('high');
      const m = getVal('medium');
      const l = getVal('low');
      const bucketTotal = c + h + m + l;
      totalSum += bucketTotal;

      if (bucketTotal > maxBucketCount) {
        maxBucketCount = bucketTotal;
        maxBucketTime = t;
      }

      dataMap.critical.push(c);
      dataMap.high.push(h);
      dataMap.medium.push(m);
      dataMap.low.push(l);
    });

    // Format display labels
    const formattedLabels = sortedTimes.map(t => {
      if (bucket === 'daily') {
        // e.g. "2026-10-04" -> "10/04"
        const parts = t.split('-');
        return parts.length === 3 ? `${parts[1]}/${parts[2]}` : t;
      } else {
        // e.g. "2026-10-04 15:00" -> "10/04 15:00" or just "15:00" if 1 day
        if (sortedTimes.length <= 24 && sortedTimes[0].slice(0, 10) === sortedTimes[sortedTimes.length - 1].slice(0, 10)) {
          return t.slice(11, 16);
        }
        return `${t.slice(5, 10)} ${t.slice(11, 16)}`;
      }
    });

    return {
      labels: formattedLabels,
      rawTimes: sortedTimes,
      sevData: dataMap,
      totalEventsInPeriod: totalSum,
      peakBucket: maxBucketCount > 0 ? { time: maxBucketTime, count: maxBucketCount } : null
    };
  }, [hourlyData, bucket]);

  const option = useMemo(() => {
    if (labels.length === 0) return {};

    const seriesConfig = [
      {
        name: 'Critical',
        key: 'critical',
        color: '#ef4444',
        gradientStart: 'rgba(239, 68, 68, 0.45)',
        gradientEnd: 'rgba(239, 68, 68, 0.02)',
        data: activeSeries.critical ? sevData.critical : [],
      },
      {
        name: 'High',
        key: 'high',
        color: '#f97316',
        gradientStart: 'rgba(249, 115, 22, 0.40)',
        gradientEnd: 'rgba(249, 115, 22, 0.02)',
        data: activeSeries.high ? sevData.high : [],
      },
      {
        name: 'Medium',
        key: 'medium',
        color: '#eab308',
        gradientStart: 'rgba(234, 179, 8, 0.35)',
        gradientEnd: 'rgba(234, 179, 8, 0.02)',
        data: activeSeries.medium ? sevData.medium : [],
      },
      {
        name: 'Low / Info',
        key: 'low',
        color: '#3b82f6',
        gradientStart: 'rgba(59, 130, 246, 0.30)',
        gradientEnd: 'rgba(59, 130, 246, 0.01)',
        data: activeSeries.low ? sevData.low : [],
      }
    ];

    return {
      animationDuration: 750,
      animationEasing: 'cubicOut',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          lineStyle: { color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)', type: 'dashed' },
          label: {
            backgroundColor: surfaceColor,
            color: textColor,
            borderColor: borderColor,
            borderWidth: 1,
            fontSize: 10
          }
        },
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.95)',
        borderColor: borderColor,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: textColor },
        formatter: (params) => {
          if (!params || params.length === 0) return '';
          let sumBucket = 0;
          let itemsHtml = '';
          params.forEach(p => {
            const val = Number(p.value || 0);
            sumBucket += val;
            itemsHtml += `
              <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; font-size:11px; margin-top:4px;">
                <span style="display:flex; align-items:center; gap:6px; color:${mutedTextColor};">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${p.color};"></span>
                  ${p.seriesName}
                </span>
                <span style="font-weight:700; font-family:monospace; color:${textColor};">${val.toLocaleString()}</span>
              </div>
            `;
          });

          return `
            <div style="font-family:inherit; min-width:180px;">
              <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid ${gridLineColor}; padding-bottom:6px; margin-bottom:6px;">
                <span style="font-weight:700; font-size:12px; color:${textColor};">${params[0].axisValue}</span>
                <span style="font-size:10px; font-weight:800; font-family:monospace; background:${isLight ? '#f1f5f9' : '#1e293b'}; color:${textColor}; padding:1px 6px; border-radius:4px;">
                  Total: ${sumBucket.toLocaleString()}
                </span>
              </div>
              ${itemsHtml}
            </div>
          `;
        }
      },
      legend: { show: false },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '8%',
        top: '12%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: gridLineColor } },
        axisTick: { show: false },
        axisLabel: {
          color: mutedTextColor,
          fontSize: 10,
          fontFamily: 'monospace',
          interval: labels.length > 24 ? Math.floor(labels.length / 10) : 'auto',
          hideOverlap: true
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: gridLineColor, type: 'dashed' } },
        axisLabel: { color: mutedTextColor, fontSize: 10, fontFamily: 'monospace' }
      },
      series: seriesConfig.map(s => ({
        name: s.name,
        type: 'line',
        stack: 'Total',
        smooth: 0.35,
        showSymbol: labels.length <= 25,
        symbolSize: 5,
        itemStyle: { color: s.color },
        lineStyle: { width: 2.2, color: s.color },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: s.gradientStart },
            { offset: 1, color: s.gradientEnd }
          ])
        },
        data: s.data
      }))
    };
  }, [labels, sevData, activeSeries, isLight, textColor, mutedTextColor, gridLineColor, surfaceColor, borderColor]);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.getEchartsInstance().setOption(option, true);
    }
  }, [option]);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      overflow: 'hidden',
      marginBottom: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
      {/* Chart Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'linear-gradient(90deg, rgba(37,99,235,0.05) 0%, transparent 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>show_chart</span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{
                margin: 0,
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontFamily: 'var(--mono)',
                color: 'var(--text)'
              }}>
                SECURITY ACTIVITY & THREAT TIMELINE
              </h3>
              <span style={{
                fontSize: '10px',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(37,99,235,0.12)',
                color: 'var(--accent)',
                border: '1px solid rgba(37,99,235,0.25)'
              }}>
                {periodLabel || 'Selected Period'}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Chronological security telemetry volume across the report window
              {peakBucket && (
                <> &bull; Peak: <b style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{peakBucket.count} events</b> at {peakBucket.time}</>
              )}
            </div>
          </div>
        </div>

        {/* Controls: Granularity toggle & Severity filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Severity filter chips */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {[
              { id: 'critical', label: 'Critical', color: '#ef4444' },
              { id: 'high', label: 'High', color: '#f97316' },
              { id: 'medium', label: 'Medium', color: '#eab308' },
              { id: 'low', label: 'Low / Info', color: '#3b82f6' }
            ].filter(s => {
              if (selectedSevs.length === 0) return true;
              if (s.id === 'low') return selectedSevs.includes('low') || selectedSevs.includes('info');
              return selectedSevs.includes(s.id);
            }).map(s => {
              const active = activeSeries[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSeries(s.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 8px',
                    borderRadius: '5px',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'var(--mono)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: `1px solid ${active ? s.color : 'var(--border)'}`,
                    background: active ? `${s.color}18` : 'transparent',
                    color: active ? s.color : 'var(--muted)',
                    opacity: active ? 1 : 0.5
                  }}
                  title={`Toggle ${s.label} series`}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.color }}></span>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Bucket Toggle Button */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--surface2)',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid var(--border)'
          }}>
            <button
              onClick={() => setBucket('hourly')}
              style={{
                border: 'none',
                background: bucket === 'hourly' ? 'var(--accent)' : 'transparent',
                color: bucket === 'hourly' ? '#fff' : 'var(--muted)',
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Hourly
            </button>
            <button
              onClick={() => setBucket('daily')}
              style={{
                border: 'none',
                background: bucket === 'daily' ? 'var(--accent)' : 'transparent',
                color: bucket === 'daily' ? '#fff' : 'var(--muted)',
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Daily
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div style={{ padding: '16px 20px', minHeight: '300px', height: '320px', width: '100%', position: 'relative', boxSizing: 'border-box' }}>
        {labels.length === 0 ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            gap: '8px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px', opacity: 0.5 }}>query_builder</span>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>No Timeline Events Found</div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>No security events occurred during {periodLabel || 'this period'}</div>
          </div>
        ) : (
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            lazyUpdate={true}
            notMerge={true}
          />
        )}
      </div>
    </div>
  );
}
