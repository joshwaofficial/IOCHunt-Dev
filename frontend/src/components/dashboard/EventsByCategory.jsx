import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import AllEventsModal from './AllEventsModal';
import { useTheme } from '../../context/ThemeContext';

// Meaningful cybersecurity icons per category
const getCategoryIcon = (cat = '') => {
  const c = String(cat).toLowerCase();
  if (c.includes('logon') || c.includes('auth') || c.includes('login')) return 'vpn_key';
  if (c.includes('startup') || c.includes('system') || c.includes('boot')) return 'power_settings_new';
  if (c.includes('network') || c.includes('traffic') || c.includes('flow')) return 'hub';
  if (c.includes('file') || c.includes('storage') || c.includes('disk')) return 'folder';
  if (c.includes('process') || c.includes('execution') || c.includes('cmd')) return 'terminal';
  if (c.includes('malware') || c.includes('threat') || c.includes('attack') || c.includes('virus')) return 'pest_control';
  if (c.includes('ad') || c.includes('ldap') || c.includes('domain') || c.includes('kerberos')) return 'security';
  if (c.includes('firewall') || c.includes('rule') || c.includes('drop')) return 'shield';
  return 'shield';
};

const EventsByCategory = ({ data }) => {
  const chartRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState('');
  const { theme } = useTheme();

  const handleChartClick = (e) => {
    if (e.name) {
      setModalFilter(e.name.toLowerCase());
      setModalOpen(true);
    }
  };

  // Accurately parse numbers to prevent string concatenation
  const totalEvents = useMemo(() => {
    if (!data || !data.byCat) return 0;
    return data.byCat.reduce((acc, curr) => acc + Number(curr.n || curr.count || curr.value || 0), 0);
  }, [data]);

  const isLight = theme === 'light';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subTextColor = isLight ? '#64748b' : '#94a3b8';
  const surfaceColor = isLight ? '#ffffff' : '#111827';

  // Curated high-contrast palette
  const solidColors = [
    '#3b82f6', // Electric Blue
    '#10b981', // Emerald Green
    '#f59e0b', // Amber Gold
    '#ef4444', // Crimson Red
    '#8b5cf6', // Royal Violet
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#f97316'  // Orange
  ];

  // Sort descending by event count
  const sorted = useMemo(() => {
    if (!data || !data.byCat) return [];
    return [...data.byCat].sort(
      (a, b) => Number(b.n || b.count || b.value || 0) - Number(a.n || a.count || a.value || 0)
    );
  }, [data]);

  const option = useMemo(() => {
    if (!sorted.length) return {};

    const colorGradients = [
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#60a5fa' },
        { offset: 1, color: '#2563eb' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#34d399' },
        { offset: 1, color: '#059669' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#fbbf24' },
        { offset: 1, color: '#d97706' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#f87171' },
        { offset: 1, color: '#dc2626' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#a78bfa' },
        { offset: 1, color: '#7c3aed' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#38bdf8' },
        { offset: 1, color: '#0284c7' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#f472b6' },
        { offset: 1, color: '#db2777' }
      ]),
      new echarts.graphic.LinearGradient(0, 0, 1, 1, [
        { offset: 0, color: '#fb923c' },
        { offset: 1, color: '#ea580c' }
      ])
    ];

    const seriesData = sorted.map((c, idx) => ({
      name: c.category || 'Other',
      value: Number(c.n || c.count || c.value || 0),
      itemStyle: {
        color: colorGradients[idx % colorGradients.length],
        borderRadius: 8,
        borderColor: surfaceColor,
        borderWidth: 2.5
      }
    }));

    return {
      title: {
        text: totalEvents.toLocaleString(),
        subtext: 'TOTAL EVENTS',
        left: 'center',
        top: '38%',
        textStyle: {
          fontSize: 22,
          fontWeight: 800,
          color: textColor,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        },
        subtextStyle: {
          fontSize: 10,
          fontWeight: 700,
          color: subTextColor,
          letterSpacing: 1.2
        }
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.96)',
        borderColor: isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: [8, 14],
        textStyle: {
          color: textColor,
          fontSize: 12
        },
        formatter: (params) => {
          return `
            <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; color: ${textColor}">
              <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${solidColors[params.dataIndex % solidColors.length]};"></span>
              ${params.name}
            </div>
            <div style="font-size: 11px; color: ${subTextColor};">
              Events: <b style="color: ${textColor}">${Number(params.value).toLocaleString()}</b> (${params.percent}%)
            </div>
          `;
        }
      },
      series: [
        {
          name: 'Events by Category',
          type: 'pie',
          radius: ['52%', '78%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          padAngle: 3,
          itemStyle: {
            borderRadius: 8,
            borderColor: surfaceColor,
            borderWidth: 2.5
          },
          label: {
            show: false
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: false
            }
          },
          labelLine: {
            show: false
          },
          data: seriesData
        }
      ]
    };
  }, [sorted, theme, totalEvents, surfaceColor, textColor, subTextColor]);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.getEchartsInstance().setOption(option, true);
    }
  }, [option]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', color: 'var(--primary, #3b82f6)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>donut_large</span>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
              Events by Category
            </h3>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
            {totalEvents.toLocaleString()} total events
          </div>
        </div>
      </div>

      {/* Body: Split Layout (Donut Visual on Left + Interactive Distribution Cards on Right) */}
      <div style={{ padding: '16px 20px', minHeight: '340px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
        {/* Left: Modern Donut with Gradient Fill & Center Metric */}
        <div style={{ flex: '1 1 240px', height: '300px', position: 'relative' }}>
          <ReactECharts
            ref={chartRef}
            option={{ ...option, animationDurationUpdate: 600 }}
            style={{ height: '100%', width: '100%', cursor: 'pointer' }}
            lazyUpdate={true}
            onEvents={{ click: handleChartClick }}
          />
        </div>

        {/* Right: Interactive Category Breakdown with Progress Bars */}
        <div style={{ flex: '1.2 1 260px', display: 'flex', flexDirection: 'column', gap: '9px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px', marginBottom: '2px' }}>
            <span>Category ({sorted.length})</span>
            <span>Count / Share</span>
          </div>

          {sorted.map((item, idx) => {
            const val = Number(item.n || item.count || item.value || 0);
            const pct = totalEvents > 0 ? ((val / totalEvents) * 100).toFixed(1) : '0';
            const color = solidColors[idx % solidColors.length];
            const icon = getCategoryIcon(item.category);

            return (
              <div
                key={item.category || idx}
                onClick={() => {
                  setModalFilter((item.category || '').toLowerCase());
                  setModalOpen(true);
                }}
                onMouseEnter={() => {
                  if (chartRef.current) {
                    chartRef.current.getEchartsInstance().dispatchAction({
                      type: 'highlight',
                      seriesIndex: 0,
                      dataIndex: idx
                    });
                  }
                }}
                onMouseLeave={() => {
                  if (chartRef.current) {
                    chartRef.current.getEchartsInstance().dispatchAction({
                      type: 'downplay',
                      seriesIndex: 0,
                      dataIndex: idx
                    });
                  }
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = isLight ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.12)';
                  e.currentTarget.style.borderColor = color;
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color }}>
                      {icon}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                      {item.category || 'Other'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                      {val.toLocaleString()}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: `${color}20`,
                        color,
                        fontFamily: 'var(--mono)'
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Gradient Progress Bar */}
                <div style={{ height: '4px', width: '100%', background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(2, Math.min(100, pct))}%`,
                      background: color,
                      borderRadius: '2px',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AllEventsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} filterType={modalFilter} />
    </div>
  );
};

export default React.memo(EventsByCategory);
