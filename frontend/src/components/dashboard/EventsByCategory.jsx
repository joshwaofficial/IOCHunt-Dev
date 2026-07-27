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

  const option = useMemo(() => {
    if (!data || !data.byCat) return {};

    const textColor = theme === 'light' ? '#1a2540' : '#dae2fd';
    const surfaceColor = theme === 'light' ? '#ffffff' : '#111827';

    const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

    // Sort descending for a smooth spiral effect
    const sorted = [...data.byCat].sort((a, b) => b.n - a.n);

    const seriesData = sorted.map((c, idx) => ({
      name: c.category,
      value: c.n,
      itemStyle: { color: colorPalette[idx % colorPalette.length], borderRadius: 4 }
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: 'rgba(15,20,40,0.9)',
        textStyle: { color: '#cbd5e1' },
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      },
      legend: {
        bottom: 0,
        left: 'center',
        width: '95%', // Allow dynamic wrapping
        icon: 'circle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        padding: [0, 5, 5, 5],
        formatter: function (name) {
          return '{a|' + name + '}';
        },
        textStyle: {
          color: textColor,
          fontSize: 11,
          rich: {
            a: {
              width: 80, // Fixed width ensures they align in a straight column line
              align: 'left',
              backgroundColor: 'transparent'
            }
          }
        }
      },
      series: [
        {
          name: 'Events by Category',
          type: 'pie',
          radius: ['20%', '45%'],
          center: ['50%', '35%'],
          roseType: 'area',
          itemStyle: {
            borderRadius: 6,
            borderWidth: 2,
            borderColor: surfaceColor
          },
          label: {
            fontSize: 10,
            formatter: '{b}',
            color: textColor,
            textBorderWidth: 0,
            textShadowBlur: 0
          },
          labelLine: {
            length: 8,
            length2: 8
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
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', color: 'var(--accent)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>pie_chart</span>
        </div>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
          Events by Category
        </h3>
      </div>
      <div style={{ padding: '20px', height: '380px', width: '100%' }}>
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
