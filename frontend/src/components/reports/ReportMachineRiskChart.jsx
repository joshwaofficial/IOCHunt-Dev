import React, { useRef, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

export default function ReportMachineRiskChart({ machines = [], theme = 'dark' }) {
  const chartRef = useRef(null);

  const isLight = theme === 'light';
  const textColor = isLight ? '#334155' : '#cbd5e1';
  const mutedTextColor = isLight ? '#64748b' : '#94a3b8';
  const gridLineColor = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(148, 163, 184, 0.1)';
  const surfaceColor = isLight ? '#ffffff' : '#0f172a';
  const borderColor = isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)';

  // Sort machines by risk score or event count, take top 8
  const topMachines = useMemo(() => {
    return [...(machines || [])]
      .sort((a, b) => {
        const countA = Number(a.event_count || a.n || 0);
        const countB = Number(b.event_count || b.n || 0);
        const scoreA = (Number(a.critical || 0) * 10) + (Number(a.high || 0) * 3) + countA;
        const scoreB = (Number(b.critical || 0) * 10) + (Number(b.high || 0) * 3) + countB;
        return scoreB - scoreA;
      })
      .slice(0, 8);
  }, [machines]);

  const hasSevBreakdown = useMemo(() => {
    return topMachines.some(m => (Number(m.critical || 0) + Number(m.high || 0) + Number(m.medium || 0)) > 0);
  }, [topMachines]);

  const option = useMemo(() => {
    if (topMachines.length === 0) return {};

    // ECharts Y-axis renders from bottom to top, so reverse for descending order visually
    const reversed = [...topMachines].reverse();
    const labels = reversed.map(m => m.label || m.machine || m.id || 'Unknown');
    const critData = reversed.map(m => Number(m.critical || 0));
    const highData = reversed.map(m => Number(m.high || 0));
    const medData = reversed.map(m => Number(m.medium || 0));
    const totalData = reversed.map(m => Number(m.event_count || m.n || 0));

    return {
      animationDuration: 700,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.96)',
        borderColor: borderColor,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: textColor },
        formatter: (params) => {
          if (!params || params.length === 0) return '';
          const machName = params[0].axisValue;
          const machObj = topMachines.find(m => (m.label || m.id) === machName);

          let totalAlerts = 0;
          let lines = '';
          params.forEach(p => {
            const val = Number(p.value || 0);
            totalAlerts += val;
            lines += `
              <div style="display:flex; justify-content:space-between; gap:16px; font-size:11px; margin-top:2px;">
                <span style="display:flex; align-items:center; gap:5px; color:${mutedTextColor};">
                  <span style="width:7px; height:7px; border-radius:50%; background:${p.color};"></span>
                  ${p.seriesName}
                </span>
                <span style="font-weight:700; font-family:monospace; color:${textColor};">${val.toLocaleString()}</span>
              </div>
            `;
          });

          return `
            <div style="font-family:inherit; min-width:160px;">
              <div style="border-bottom:1px solid ${gridLineColor}; padding-bottom:4px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <b style="color:${textColor}; font-size:12px;">${machName}</b>
                ${machObj?.ip ? `<span style="font-size:10px; color:${mutedTextColor}; font-family:monospace;">${machObj.ip}</span>` : ''}
              </div>
              ${lines}
              ${machObj ? `
                <div style="margin-top:6px; padding-top:4px; border-top:1px dashed ${gridLineColor}; display:flex; justify-content:space-between; font-size:10px; color:${mutedTextColor};">
                  <span>Total Period Events:</span>
                  <b style="color:${textColor}; font-family:monospace;">${Number(machObj.event_count || 0).toLocaleString()}</b>
                </div>
              ` : ''}
            </div>
          `;
        }
      },
      legend: {
        top: '2%',
        right: '2%',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: mutedTextColor, fontSize: 10, fontFamily: 'monospace' },
        data: hasSevBreakdown ? ['Critical', 'High', 'Medium'] : ['Events']
      },
      grid: {
        left: '2%',
        right: '4%',
        bottom: '4%',
        top: '16%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: gridLineColor, type: 'dashed' } },
        axisLabel: { color: mutedTextColor, fontSize: 10, fontFamily: 'monospace' }
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: gridLineColor } },
        axisTick: { show: false },
        axisLabel: {
          color: textColor,
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 600,
          formatter: (value) => value.length > 12 ? `${value.slice(0, 10)}...` : value
        }
      },
      series: hasSevBreakdown ? [
        {
          name: 'Critical',
          type: 'bar',
          stack: 'total',
          data: critData,
          itemStyle: { color: '#ef4444' },
          barWidth: 14
        },
        {
          name: 'High',
          type: 'bar',
          stack: 'total',
          data: highData,
          itemStyle: { color: '#f97316' },
          barWidth: 14
        },
        {
          name: 'Medium',
          type: 'bar',
          stack: 'total',
          data: medData,
          itemStyle: { color: '#eab308', borderRadius: [0, 4, 4, 0] },
          barWidth: 14
        }
      ] : [
        {
          name: 'Events',
          type: 'bar',
          data: totalData,
          itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] },
          barWidth: 14
        }
      ]
    };
  }, [topMachines, hasSevBreakdown, isLight, surfaceColor, borderColor, textColor, mutedTextColor, gridLineColor]);

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
        background: 'linear-gradient(90deg, rgba(239,68,68,0.05) 0%, transparent 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(239,68,68,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ef4444'
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
              Endpoint Threat Distribution
            </h3>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Top targeted endpoints by severity in this report period
            </div>
          </div>
        </div>
        <span style={{
          fontSize: '11px',
          fontWeight: 800,
          fontFamily: 'var(--mono)',
          color: 'var(--muted)',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          padding: '2px 8px',
          borderRadius: '10px'
        }}>
          {machines.length} endpoints
        </span>
      </div>

      {/* Chart Body */}
      <div style={{ padding: '16px 20px', height: '240px', width: '100%', boxSizing: 'border-box' }}>
        {topMachines.length > 0 ? (
          <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '100%', width: '100%' }}
            lazyUpdate={true}
            notMerge={true}
          />
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted)',
            gap: '6px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', opacity: 0.5 }}>devices</span>
            <div style={{ fontSize: '12px' }}>No endpoint data available</div>
          </div>
        )}
      </div>
    </div>
  );
}
