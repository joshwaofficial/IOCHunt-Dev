import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import AllEventsModal from './AllEventsModal';

const Heatmap24h = ({ data }) => {
  const chartRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilterHour, setModalFilterHour] = useState('');

  const handleChartClick = (e) => {
    if (e.name) {
      const hourStr = e.name.split(':')[0].padStart(2, '0');
      setModalFilterHour(hourStr);
      setModalOpen(true);
    }
  };

  const option = useMemo(() => {
    if (!data || !data.hourly) return {};

    const hourly = data.hourly || [];
    const allH = Array(24).fill(0);
    hourly.forEach(r => {
      const h = r.hour ? new Date(r.hour).getHours() : parseInt(r.hour.slice(11, 13), 10);
      allH[h] = (allH[h] || 0) + parseInt(r.n, 10);
    });
    
    const labels = [];
    for (let i = 0; i < 24; i++) labels.push(String(i).padStart(2, '0') + ':00');

    const maxVal = Math.max(1, ...allH);
    
    // Create an ECharts visualMap to color the bars based on their value
    // This perfectly mimics the 0.1, 0.4, 0.7 ratios we had in Chart.js
    const seriesData = allH.map((v, idx) => ({
      name: labels[idx],
      value: v
    }));

    return {
      animationDurationUpdate: 800,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,20,40,0.9)',
        textStyle: { color: '#cbd5e1' },
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      },
      visualMap: {
        show: false,
        min: 0,
        max: maxVal,
        inRange: {
          color: ['rgba(59,130,246,0.85)', 'rgba(234,179,8,0.85)', 'rgba(249,115,22,0.85)', 'rgba(239,68,68,0.85)']
        }
      },
      grid: {
        left: '2%',
        right: '2%',
        bottom: '3%',
        top: '5%',
        containLabel: true
      },
      xAxis: [
        {
          type: 'category',
          data: labels,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#64748b', fontSize: 10, interval: 1, maxRotation: 0 }
        }
      ],
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.2)', type: 'dashed' } },
          axisLabel: { color: '#64748b', fontSize: 10 }
        }
      ],
      series: [
        {
          name: 'Events',
          type: 'bar',
          barWidth: '70%',
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          data: seriesData
        }
      ]
    };
  }, [data]);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.getEchartsInstance().setOption(option, true);
    }
  }, [option]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--accent)', background: 'rgba(59,130,246,0.1)', padding: '4px', borderRadius: '6px', fontSize: '18px' }}>view_timeline</span>
        24h Heatmap
      </h3>
      <div style={{ height: '240px', width: '100%' }}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: '100%', width: '100%', cursor: 'pointer' }}
          lazyUpdate={true}
          onEvents={{ click: handleChartClick }}
        />
      </div>
      <AllEventsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} filterHour={modalFilterHour} />
    </div>
  );
};

export default React.memo(Heatmap24h);
