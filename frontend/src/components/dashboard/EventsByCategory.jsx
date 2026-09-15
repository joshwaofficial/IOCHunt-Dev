import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import AllEventsModal from './AllEventsModal';
import { useTheme } from '../../context/ThemeContext';

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

  const totalEvents = useMemo(() => {
    if (!data || !data.byCat) return 0;
    return data.byCat.reduce((acc, curr) => acc + (curr.n || 0), 0);
  }, [data]);

  const option = useMemo(() => {
    if (!data || !data.byCat) return {};

    const isLight = theme === 'light';
    const textColor = isLight ? '#0f172a' : '#f8fafc';
    const subTextColor = isLight ? '#64748b' : '#94a3b8';
    const surfaceColor = isLight ? '#ffffff' : '#111827';

    // Curated high-contrast SOC cybersecurity palette
    const colorPalette = [
      '#3b82f6', // Electric Blue
      '#10b981', // Emerald Green
      '#f59e0b', // Amber Gold
      '#ef4444', // Crimson Red
      '#8b5cf6', // Royal Violet
      '#06b6d4', // Cyan
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#14b8a6', // Teal
      '#f97316'  // Orange
    ];

    // Sort descending by event count
    const sorted = [...data.byCat].sort((a, b) => b.n - a.n);

    const seriesData = sorted.map((c, idx) => ({
      name: c.category,
      value: c.n,
      itemStyle: {
        color: colorPalette[idx % colorPalette.length],
        borderRadius: 8,
        borderColor: surfaceColor,
        borderWidth: 3
      }
    }));

    return {
      // Center KPI Stat (Total Events count & subtitle)
      title: {
        text: totalEvents.toLocaleString(),
        subtext: 'TOTAL EVENTS',
        left: 'center',
        top: '32%',
        textStyle: {
          fontSize: 24,
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
        padding: [8, 12],
        textStyle: {
          color: textColor,
          fontSize: 12
        },
        formatter: (params) => {
          return `
            <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; color: ${textColor}">
              <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${params.color};"></span>
              ${params.name}
            </div>
            <div style="font-size: 11px; color: ${subTextColor};">
              Count: <b style="color: ${textColor}">${params.value.toLocaleString()}</b> (${params.percent}%)
            </div>
          `;
        }
      },
      // Rich Multi-Column Legend (Name, Value, Percentage)
      legend: {
        bottom: 8,
        left: 'center',
        width: '96%',
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 12,
        formatter: function (name) {
          const item = seriesData.find(d => d.name === name);
          const val = item ? item.value : 0;
          const pct = totalEvents > 0 ? ((val / totalEvents) * 100).toFixed(1) : '0';
          return `{name|${name}} {val|${val.toLocaleString()}} {pct|(${pct}%)}`;
        },
        textStyle: {
          color: textColor,
          fontSize: 11,
          rich: {
            name: {
              width: 90,
              fontSize: 11,
              fontWeight: 600,
              color: textColor
            },
            val: {
              width: 45,
              fontSize: 11,
              fontWeight: 700,
              color: textColor,
              align: 'right'
            },
            pct: {
              width: 48,
              fontSize: 10,
              color: subTextColor,
              align: 'right'
            }
          }
        }
      },
      series: [
        {
          name: 'Events by Category',
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '38%'],
          avoidLabelOverlap: false,
          padAngle: 3,
          itemStyle: {
            borderRadius: 8,
            borderColor: surfaceColor,
            borderWidth: 3
          },
          label: {
            show: false,
            position: 'center'
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
  }, [data, theme, totalEvents]);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.getEchartsInstance().setOption(option, true);
    }
  }, [option]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', color: 'var(--accent)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>donut_large</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Events by Category
          </h3>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--border)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
          {totalEvents.toLocaleString()} events
        </div>
      </div>
      <div style={{ padding: '16px 20px', height: '380px', width: '100%' }}>
        <ReactECharts
          ref={chartRef}
          option={{ ...option, animationDurationUpdate: 800 }}
          style={{ height: '100%', width: '100%', cursor: 'pointer' }}
          lazyUpdate={true}
          onEvents={{ click: handleChartClick }}
        />
      </div>
      <AllEventsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} filterType={modalFilter} />
    </div>
  );
};

export default React.memo(EventsByCategory);
