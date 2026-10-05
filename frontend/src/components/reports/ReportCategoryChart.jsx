import React, { useRef, useMemo, useEffect } from 'react';
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
  OTHER: '#6b7280'
};

export default function ReportCategoryChart({ byCategory = [], totalEvents = 0, catColors = DEFAULT_CAT_COLORS, theme = 'dark' }) {
  const chartRef = useRef(null);

  const isLight = theme === 'light';
  const textColor = isLight ? '#334155' : '#cbd5e1';
  const mutedTextColor = isLight ? '#64748b' : '#94a3b8';
  const surfaceColor = isLight ? '#ffffff' : '#0f172a';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';

  const sortedCategories = useMemo(() => {
    return [...(byCategory || [])]
      .map(c => ({
        category: c.category || 'OTHER',
        n: Number(c.n || c.count || 0)
      }))
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
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 5,
            borderColor: surfaceColor,
            borderWidth: 2
          },
          label: {
            show: false,
            position: 'center'
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: true,
              formatter: '{b}\n{c}',
              fontSize: 12,
              fontWeight: 800,
              fontFamily: 'monospace',
              color: textColor
            }
          },
          data: seriesData
        }
      ]
    };
  }, [sortedCategories, effectiveTotal, catColors, isLight, surfaceColor, borderColor, textColor, mutedTextColor]);

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
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(90deg, rgba(6,182,212,0.05) 0%, transparent 100%)'
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
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>pie_chart</span>
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
              {sortedCategories.length} active event categories in this period
            </div>
          </div>
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

      {/* Body: Donut chart + Ranked List */}
      <div style={{
        padding: '18px 20px',
        display: 'grid',
        gridTemplateColumns: 'minmax(200px, 1fr) minmax(260px, 1.4fr)',
        gap: '20px',
        alignItems: 'center'
      }}>
        {/* Donut Chart with Center Total */}
        <div style={{ position: 'relative', width: '100%', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {sortedCategories.length > 0 ? (
            <>
              <ReactECharts
                ref={chartRef}
                option={option}
                style={{ height: '100%', width: '100%' }}
                lazyUpdate={true}
                notMerge={true}
              />
              {/* Static Center Label */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)', lineHeight: 1.1 }}>
                  {effectiveTotal.toLocaleString()}
                </div>
                <div style={{ fontSize: '9px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '2px' }}>
                  EVENTS
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '12px' }}>No categories recorded</div>
          )}
        </div>

        {/* Ranked Category Breakdown Table/List */}
        <div style={{ maxHeight: '240px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sortedCategories.map((c, i) => {
            const col = catColors[c.category] || catColors[c.category.toUpperCase()] || '#6b7280';
            const pct = effectiveTotal > 0 ? Math.round((c.n / effectiveTotal) * 100) : 0;
            const barW = Math.round((c.n / maxCatCount) * 100);

            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '105px', flexShrink: 0 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col, flexShrink: 0 }}></span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.category}>
                    {c.category}
                  </span>
                </div>
                <div style={{ flex: 1, height: '6px', background: 'var(--surface2)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barW}%`, background: col, borderRadius: '3px', transition: 'width 0.4s ease' }}></div>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text)', width: '42px', textAlign: 'right', flexShrink: 0 }}>
                  {c.n.toLocaleString()}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', width: '32px', textAlign: 'right', flexShrink: 0 }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
