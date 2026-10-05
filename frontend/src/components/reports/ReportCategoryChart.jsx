import React, { useRef, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';

const DEFAULT_CAT_COLORS = {
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

export default function ReportCategoryChart({ byCategory = [], totalEvents = 0, catColors = DEFAULT_CAT_COLORS, theme = 'dark' }) {
  const chartRef = useRef(null);
  const [viewMode, setViewMode] = useState('bars'); // 'bars' | 'donut'

  const isLight = theme === 'light';
  const textColor = isLight ? '#334155' : '#cbd5e1';
  const mutedTextColor = isLight ? '#64748b' : '#94a3b8';
  const surfaceColor = isLight ? '#ffffff' : '#0f172a';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';

  const sortedCategories = useMemo(() => {
    const map = {};
    (byCategory || []).forEach(c => {
      const raw = typeof c.category === 'string' ? c.category.trim() : '';
      const cat = raw ? raw.toUpperCase() : 'UNCATEGORIZED';
      map[cat] = (map[cat] || 0) + Number(c.n || c.count || 0);
    });
    return Object.entries(map)
      .map(([category, n]) => ({ category, n }))
      .filter(c => c.n > 0)
      .sort((a, b) => b.n - a.n);
  }, [byCategory]);

  const effectiveTotal = useMemo(() => {
    if (totalEvents > 0) return totalEvents;
    return sortedCategories.reduce((sum, c) => sum + c.n, 0);
  }, [totalEvents, sortedCategories]);

  const maxCatCount = sortedCategories.length > 0 ? sortedCategories[0].n : 1;

  const option = useMemo(() => {
    if (sortedCategories.length === 0) return {};

    const seriesData = sortedCategories.map(c => {
      const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#64748b';
      return {
        name: c.category,
        value: c.n,
        itemStyle: {
          color: col,
          borderColor: surfaceColor,
          borderWidth: 2,
          borderRadius: 4
        }
      };
    });

    return {
      animationDuration: 700,
      tooltip: {
        trigger: 'item',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.96)',
        borderColor: borderColor,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: textColor },
        formatter: (params) => {
          const pct = effectiveTotal > 0 ? ((params.value / effectiveTotal) * 100).toFixed(1) : 0;
          return `
            <div style="display:flex; align-items:center; gap:6px; font-weight:700; margin-bottom:4px; font-size:12px; color:${textColor}">
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${params.color};"></span>
              ${params.name}
            </div>
            <div style="font-size:11px; color:${mutedTextColor}; display:flex; justify-content:space-between; gap:16px;">
              <span>Count: <b style="color:${textColor}; font-family:monospace;">${Number(params.value).toLocaleString()}</b></span>
              <span>Share: <b style="color:${textColor}; font-family:monospace;">${pct}%</b></span>
            </div>
          `;
        }
      },
      legend: {
        show: false
      },
      series: [
        {
          name: 'Category',
          type: 'pie',
          radius: ['52%', '76%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 3,
            borderColor: surfaceColor,
            borderWidth: 1.5
          },
          label: {
            show: false
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              color: textColor,
              formatter: '{b}\n{d}%'
            }
          },
          data: seriesData
        }
      ]
    };
  }, [sortedCategories, catColors, surfaceColor, isLight, borderColor, textColor, mutedTextColor, effectiveTotal]);

  const half = Math.ceil(sortedCategories.length / 2);
  const col1 = sortedCategories.slice(0, half);
  const col2 = sortedCategories.slice(half);

  const renderCategoryRow = (c, i) => {
    const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#6b7280';
    const pct = effectiveTotal > 0 ? ((c.n / effectiveTotal) * 100).toFixed(1) : 0;
    const barW = Math.max(2, Math.round((c.n / effectiveTotal) * 100));

    return (
      <div key={i} style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col, flexShrink: 0 }}></span>
            <b style={{ color: 'var(--text)', letterSpacing: '0.2px' }}>{c.category}</b>
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
            <b style={{ color: 'var(--text)' }}>{c.n.toLocaleString()}</b>
            <span style={{ color: 'var(--muted)', fontSize: '10px', marginLeft: '4px' }}>({pct}%)</span>
          </span>
        </div>
        <div style={{ height: '6px', background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barW}%`, background: col, borderRadius: '3px', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(90deg, rgba(6,182,212,0.05) 0%, transparent 100%)',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(6,182,212,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#06b6d4'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>bar_chart</span>
          </div>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: '13px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              fontFamily: 'var(--mono)',
              color: 'var(--text)'
            }}>
              Events by Category
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Ranked telemetry classification across {sortedCategories.length} categories
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* View switcher */}
          <div style={{
            display: 'flex',
            background: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
            padding: '2px',
            borderRadius: '6px',
            fontSize: '10px',
            fontFamily: 'var(--mono)'
          }}>
            <button
              onClick={() => setViewMode('bars')}
              style={{
                border: 'none',
                background: viewMode === 'bars' ? 'var(--primary, #2563eb)' : 'transparent',
                color: viewMode === 'bars' ? '#fff' : 'var(--muted)',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              📊 Ranked Bars
            </button>
            <button
              onClick={() => setViewMode('donut')}
              style={{
                border: 'none',
                background: viewMode === 'donut' ? 'var(--primary, #2563eb)' : 'transparent',
                color: viewMode === 'donut' ? '#fff' : 'var(--muted)',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🍩 Donut
            </button>
          </div>

          <span style={{
            fontSize: '11px',
            fontWeight: 800,
            fontFamily: 'var(--mono)',
            color: '#06b6d4',
            background: 'rgba(6,182,212,0.1)',
            border: '1px solid rgba(6,182,212,0.25)',
            padding: '2px 8px',
            borderRadius: '10px'
          }}>
            {effectiveTotal.toLocaleString()} total
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 20px', flex: 1 }}>
        {sortedCategories.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '24px' }}>No categories recorded</div>
        ) : viewMode === 'bars' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: sortedCategories.length > 5 ? '1fr 1fr' : '1fr',
            gap: '12px 24px'
          }}>
            <div>{col1.map((c, i) => renderCategoryRow(c, i))}</div>
            {col2.length > 0 && <div>{col2.map((c, i) => renderCategoryRow(c, i + half))}</div>}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1fr) minmax(240px, 1.3fr)',
            gap: '20px',
            alignItems: 'center'
          }}>
            <div style={{ height: '220px', position: 'relative' }}>
              <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: '100%', width: '100%' }}
                lazyUpdate={true}
                notMerge={true}
              />
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {sortedCategories.slice(0, 8).map((c, i) => renderCategoryRow(c, i))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
