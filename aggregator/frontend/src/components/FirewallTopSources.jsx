import React from 'react';

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const p = parseInt(ip.split('.')[1], 10);
    return p >= 16 && p <= 31;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;
  return false;
}

export default function FirewallTopSources({ topSrc, topDst }) {
  if (!topSrc?.length && !topDst?.length) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', margin: 0 }}>Top Sources & Dests</h3>
        </div>
        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>No data yet</div>
      </div>
    );
  }

  const maxSrc = Math.max(...(topSrc || []).map(s => s.n), 1);
  const maxDst = Math.max(...(topDst || []).map(d => d.n), 1);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h3 style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', margin: 0 }}>Top Sources & Dests</h3>
      </div>
      <div style={{ padding: '0', maxHeight: '460px', overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Top Sources */}
          {topSrc && topSrc.length > 0 && (
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '6px' }}>TOP SOURCE IPs</div>
              {topSrc.map((s, i) => {
                const pct = Math.round((s.n / Math.max(...topSrc.map(x=>x.n), 1)) * 100);
                const ipLabel = s.src_ip || 'Unknown';
                const col = isPrivateIp(s.src_ip) ? '#3b82f6' : '#f97316';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: col, width: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ipLabel}</span>
                    <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: '3px' }}></div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', width: '38px', textAlign: 'right' }}>{s.n}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Top Dests */}
          {topDst && topDst.length > 0 && (
            <div style={{ padding: '10px 16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '6px' }}>TOP DESTINATIONS</div>
              {topDst.map((d, i) => {
                const pct = Math.round((d.n / Math.max(...topDst.map(x=>x.n), 1)) * 100);
                const ipLabel = d.dst_ip || 'Unknown';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#60a5fa', width: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ipLabel}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: '#06b6d4', width: '58px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.service || `:${d.dst_port}`}</span>
                    <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '3px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#06b6d4', borderRadius: '3px' }}></div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', width: '38px', textAlign: 'right' }}>{d.n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
