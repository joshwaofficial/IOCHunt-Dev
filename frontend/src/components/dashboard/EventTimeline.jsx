import React, { useRef, useMemo, useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import AllEventsModal from './AllEventsModal';

const EventTimeline = ({ data }) => {
  const chartRef = useRef(null);
  const [bucket, setBucket] = useState('hourly');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState('');
  const [activeSeries, setActiveSeries] = useState({ Critical: true, High: true, Medium: true, Low: true });

  const toggleSeries = (name) => {
    setActiveSeries(prev => ({ ...prev, [name]: !prev[name] }));
  };


  // Memoize options to prevent unnecessary recalculations
  const option = useMemo(() => {
    if (!data || !data.hourly) return {};
    
    // Dynamically build source data based on the bucket
    let sourceData = data.hourly;
    
    if (bucket === 'daily') {
      const dailyMap = {};
      data.hourly.forEach(d => {
        const day = d.hour.substring(0, 10);
        const key = `${day}_${d.severity}`;
        if (!dailyMap[key]) {
          dailyMap[key] = { day, severity: d.severity, n: 0 };
        }
        dailyMap[key].n += d.n;
      });
      sourceData = Object.values(dailyMap);
    }

    const labelsSet = new Set();
    sourceData.forEach(d => labelsSet.add(bucket === 'hourly' ? d.hour : d.day));
    const labels = Array.from(labelsSet).sort();

    const sevData = { critical: [], high: [], medium: [], low: [] };
    
    labels.forEach(l => {
      const hData = sourceData.filter(d => (bucket === 'hourly' ? d.hour : d.day) === l);
      const getSev = (sev) => { const x = hData.find(d => d.severity === sev); return x ? x.n : 0; };
      sevData.critical.push(getSev('critical'));
      sevData.high.push(getSev('high'));
      sevData.medium.push(getSev('medium'));
      sevData.low.push(getSev('low'));
    });

    return {
      animationDurationUpdate: 800,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#6a7985' } },
        backgroundColor: 'rgba(15,20,40,0.95)',
        textStyle: { color: '#f8fafc' },
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: [12, 16],
        formatter: function(params) {
          let html = `<div style="font-weight:800;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;font-size:13px;">${params[0].axisValue}</div>`;
          params.forEach(p => {
            html += `<div style="display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:6px;font-size:12px;">
              <span style="color:#cbd5e1">${p.marker} ${p.seriesName}</span>
              <span style="font-weight:700;color:#fff">${p.value}</span>
            </div>`;
          });
          html += `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed rgba(255,255,255,0.2);font-size:11px;color:#60a5fa;text-align:center;font-weight:600;">
            <span class="material-symbols-outlined" style="font-size:12px;vertical-align:middle;margin-right:4px;">ads_click</span>
            Click to view raw events
          </div>`;
          return html;
        }
      },
      legend: {
        show: false,
        selected: activeSeries,
        data: ['Critical', 'High', 'Medium', 'Low']
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: [
        {
          type: 'category',
          boundaryGap: false,
          data: labels,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#64748b', fontSize: 10 },
          splitLine: { show: false }
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
          name: 'Critical',
          type: 'line',
          stack: 'Total',
          areaStyle: {},
          emphasis: { focus: 'series' },
          itemStyle: { color: '#ef4444' },
          data: sevData.critical,
          smooth: 0.4,
          showSymbol: false,
          symbolSize: 5
        },
        {
          name: 'High',
          type: 'line',
          stack: 'Total',
          areaStyle: {},
          emphasis: { focus: 'series' },
          itemStyle: { color: '#f97316' },
          data: sevData.high,
          smooth: 0.4,
          showSymbol: false,
          symbolSize: 5
        },
        {
          name: 'Medium',
          type: 'line',
          stack: 'Total',
          areaStyle: {},
          emphasis: { focus: 'series' },
          itemStyle: { color: '#eab308' },
          data: sevData.medium,
          smooth: 0.4,
          showSymbol: false,
          symbolSize: 5
        },
        {
          name: 'Low',
          type: 'line',
          stack: 'Total',
          areaStyle: {},
          emphasis: { focus: 'series' },
          itemStyle: { color: '#10b981' },
          data: sevData.low,
          smooth: 0.4,
          showSymbol: false,
          symbolSize: 5
        }
      ]
    };
  }, [data, bucket, activeSeries]);

  const onChartReady = (chart) => {
    chart.getZr().on('click', (params) => {
      const pointInPixel = [params.offsetX, params.offsetY];
      if (chart.containPixel('grid', pointInPixel)) {
        const pointInData = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pointInPixel);
        if (!pointInData) return;

        const xIndex = Math.round(pointInData[0]);
        const yValue = pointInData[1];
        
        const currentOption = chart.getOption();
        if (!currentOption || !currentOption.series || currentOption.series.length < 4) return;
        
        if (xIndex >= 0 && xIndex < currentOption.series[0].data.length && yValue >= 0) {
          const cVal = currentOption.series[0].data[xIndex] || 0;
          const hVal = currentOption.series[1].data[xIndex] || 0;
          const mVal = currentOption.series[2].data[xIndex] || 0;
          const lVal = currentOption.series[3].data[xIndex] || 0;

          let currentTop = 0;
          const stackLevels = [];

          const selected = currentOption.legend && currentOption.legend.length > 0 && currentOption.legend[0].selected 
                           ? currentOption.legend[0].selected 
                           : { Critical: true, High: true, Medium: true, Low: true };

          if (selected['Critical'] !== false) { 
            stackLevels.push({ name: 'critical', bottom: currentTop, top: currentTop + cVal });
            currentTop += cVal;
          }
          if (selected['High'] !== false) { 
            stackLevels.push({ name: 'high', bottom: currentTop, top: currentTop + hVal });
            currentTop += hVal;
          }
          if (selected['Medium'] !== false) { 
            stackLevels.push({ name: 'medium', bottom: currentTop, top: currentTop + mVal });
            currentTop += mVal;
          }
          if (selected['Low'] !== false) { 
            stackLevels.push({ name: 'low', bottom: currentTop, top: currentTop + lVal });
            currentTop += lVal;
          }

          let clickedSeries = null;
          for (const level of stackLevels) {
            if (yValue >= level.bottom && yValue <= level.top && level.top > level.bottom) {
              clickedSeries = level.name;
              break;
            }
          }
          
          if (clickedSeries) {
            setModalFilter(clickedSeries);
            setModalOpen(true);
          }
        }
      }
    });
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', color: 'var(--accent)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>timeline</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Event Timeline
          </h3>
        </div>
        <select 
          value={bucket} 
          onChange={(e) => setBucket(e.target.value)}
          style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--sans)' }}
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
        </select>
      </div>
      
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Filter Visibility:
        </span>
        {[
          { name: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
          { name: 'High', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
          { name: 'Medium', color: '#eab308', bg: 'rgba(234,179,8,0.1)' },
          { name: 'Low', color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
        ].map(s => (
          <button
            key={s.name}
            onClick={() => toggleSeries(s.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 10px', borderRadius: '20px',
              background: activeSeries[s.name] ? s.bg : 'var(--surface2)',
              border: `1px solid ${activeSeries[s.name] ? s.color : 'var(--border)'}`,
              color: activeSeries[s.name] ? 'var(--text)' : 'var(--muted)',
              fontSize: '11px', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
              opacity: activeSeries[s.name] ? 1 : 0.6
            }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeSeries[s.name] ? s.color : 'var(--muted)' }} />
            {s.name}
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 20px 20px', height: '300px', width: '100%' }}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: '100%', width: '100%', cursor: 'pointer' }}
          lazyUpdate={true}
          onChartReady={onChartReady}
        />
      </div>
      <AllEventsModal isOpen={modalOpen} onClose={() => setModalOpen(false)} filterType={modalFilter} />
    </div>
  );
};

export default React.memo(EventTimeline);
