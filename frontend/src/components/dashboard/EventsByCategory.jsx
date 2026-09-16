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

  // Accurately parse numbers to prevent string concatenation bugs
  const totalEvents = useMemo(() => {
    if (!data || !data.byCat) return 0;
    return data.byCat.reduce((acc, curr) => acc + Number(curr.n || curr.count || curr.value || 0), 0);
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

    // Sort descending by numeric event count
    const sorted = [...data.byCat].sort(
      (a, b) => Number(b.n || b.count || b.value || 0) - Number(a.n || a.count || a.value || 0)
    );

    const seriesData = sorted.map((c, idx) => ({
      name: c.category || 'Other',
      value: Number(c.n || c.count || c.value || 0),
      itemStyle: {
        color: colorPalette[idx % colorPalette.length],
        borderRadius: 8,
        borderColor: surfaceColor,
        borderWidth: 2
      }
    }));

    return {
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
              <span style="display:inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${params.color};"></span>
              ${params.name}
            </div>
            <div style="font-size: 11px; color: ${subTextColor};">
              Count: <b style="color: ${textColor}">${Number(params.value).toLocaleString()}</b> (${params.percent}%)
            </div>
          `;
        }
      },
      legend: {
        top: '2%',
        left: 'center',
        width: '95%',
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
        formatter: (name) => {
          const item = seriesData.find(d => d.name === name);
          return item ? `${name} (${item.value.toLocaleString()})` : name;
        },
        textStyle: {
          color: textColor,
          fontSize: 12,
          fontWeight: 600
        }
      },
      series: [
        {
          name: 'Events by Category',
          type: 'pie',
          radius: ['40%', '64%'],
          center: ['50%', '55%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 8,
            borderColor: surfaceColor,
            borderWidth: 2
          },
          // Small pointer line mentioning Category Name ONLY
          label: {
            show: true,
            position: 'outside',
            formatter: '{b}',
            fontSize: 11,
            fontWeight: 600,
            color: textColor
          },
          labelLine: {
            show: true,
            length: 12,
            length2: 12,
            smooth: 0.2,
            lineStyle: {
              color: isLight ? '#94a3b8' : '#64748b',
              width: 1.2
            }
          },
          emphasis: {
            scale: true,
            scaleSize: 6,
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              color: textColor
            },
            labelLine: {
              show: true,
              lineStyle: {
                width: 2
              }
            }
          },
          data: seriesData
        }
      ]
    };
  }, [data, theme]);

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
        <div style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--border)', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
          {totalEvents.toLocaleString()} total events
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
