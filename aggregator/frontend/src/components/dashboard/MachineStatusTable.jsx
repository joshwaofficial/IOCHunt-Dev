import React, { useMemo } from 'react';

const getHoursAgo = (ts) => {
  if (!ts) return '-';
  let t = Number(ts);
  if (isNaN(t)) return '-';
  if (t < 100000000000) t *= 1000;
  const ms = Date.now() - t;
  if (isNaN(ms) || ms < 0) return '0h ago';
  const hrs = Math.floor(ms / 3600000);
  return `${hrs}h ago`;
};

const MachineStatusTable = ({ stats, topoData, range }) => {
  const maxEvents = useMemo(() => {
    if (!stats?.byMachine) return 1;
    return Math.max(...stats.byMachine.map(m => m.n), 1);
  }, [stats]);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>desktop_windows</span>
          </div>
          Machine Status
        </h3>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', maxHeight: '400px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>MACHINE</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>EVENTS</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>CRITICAL</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>HIGH</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>AD ATTACKS</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>LAST SEEN</th>
              <th style={{ padding: '16px 24px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#94a3b8', borderBottom: '1px solid var(--border)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--surface)' }}>ACTIVITY</th>
            </tr>
          </thead>
          <tbody>
            {(!stats?.machines || stats.machines.length === 0) ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No machines yet</td></tr>
            ) : (() => {
              const byM = stats.byMachine || [];
              const bySev = stats.byMachineSev || [];

              return stats.machines.map(m => {
                const mId = m.id;
                const mStats = byM.find(x => x.machine === mId) || { n: 0 };
                
                const criticalCount = bySev.find(x => x.machine === mId && x.severity === 'critical')?.n || 0;
                const highCount = bySev.find(x => x.machine === mId && x.severity === 'high')?.n || 0;

                let adN = 0;
                if (topoData && topoData.ad_attacks) {
                  adN = topoData.ad_attacks.filter(a => a.target_machine === mId || a.from_machine === mId || a.remote_ip === m.ip).length;
                }
                
                const actPct = Math.min(100, Math.max(1, (mStats.n / maxEvents) * 100));

                return (
                  <tr key={mId} className="hover-row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#3b82f6' }}>{mId}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{mStats.n}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '24px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '11px', fontWeight: 700, padding: '0 6px' }}>{criticalCount}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '24px', background: 'rgba(249,115,22,0.1)', color: '#f97316', borderRadius: '6px', fontSize: '11px', fontWeight: 700, padding: '0 6px' }}>{highCount}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      {adN > 0 ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '24px', height: '24px', background: 'rgba(168,85,247,0.1)', color: '#a855f7', borderRadius: '6px', fontSize: '11px', fontWeight: 700, padding: '0 6px' }}>{adN}</div>
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: '13px', paddingLeft: '8px', fontWeight: 600 }}>-</div>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '12px', color: '#64748b' }}>
                      {getHoursAgo(m.last_seen)}
                    </td>
                    <td style={{ padding: '16px 24px', width: '120px' }}>
                      <div style={{ height: '4px', width: '100%', background: 'var(--surface2)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${actPct}%`, background: '#3b82f6', borderRadius: '2px', transition: 'width 0.5s ease-out' }}></div>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(MachineStatusTable);
