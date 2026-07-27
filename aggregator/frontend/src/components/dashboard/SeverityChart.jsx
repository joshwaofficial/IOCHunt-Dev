import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import AllEventsModal from './AllEventsModal';

const SeverityChart = ({ data }) => {
  const chartRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState('');

  const handleChartClick = (e) => {
    if (e.name) {
      setModalFilter(e.name.toLowerCase());
      setModalOpen(true);
    }
  };

  const option = useMemo(() => {
    if (!data || !data.bySev) return {};

    const labels = data.bySev.map(s => s.severity.toUpperCase()) || [];
    const values = data.bySev.map(s => s.n) || [];

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,20,40,0.9)',
        textStyle: { color: '#cbd5e1' },
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)', type: 'dashed' } },
        axisLabel: { color: '#64748b', fontSize: 10 }
      },
      series: [
        {
          name: 'Severity',
          type: 'line',
          data: values,
          smooth: true,
          itemStyle: { color: '#3b82f6' },
          lineStyle: { width: 3 },
          symbolSize: 8,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.0)' }
            ])
          }
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
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--critical)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>warning</span>
        </div>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
          Severity Breakdown
        </h3>
      </div>
      <div style={{ padding: '20px', height: '380px', width: '100%', display: 'flex', flexDirection: 'column' }}>
        <ReactECharts
          ref={chartRef}
          option={{ ...option, animationDurationUpdate: 800 }}
          style={{ height: '100%', width: '100%', cursor: 'pointer', flex: 1 }}
          lazyUpdate={true}
          onEvents={{ click: handleChartClick }}
        />
      </div>
      <AllEventsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} filterType={modalFilter} />
    </div>
  );
};

export default React.memo(SeverityChart);
