import React, { useMemo, useState } from 'react';
import EventDetailModal from './EventDetailModal';

const AD_COL = { DCSync: '#ef4444', DCShadow: '#ef4444', Kerberoasting: '#f97316', RBCD: '#ef4444', PasswordSpray: '#f97316', 'NTLM-Brute': '#f97316', ShadowCred: '#a855f7', ESC1: '#a855f7', ESC2: '#a855f7', ESC3: '#a855f7', ESC6: '#a855f7', CertipyEnum: '#8b5cf6', GoldenCert: '#ef4444', PassCert: '#a855f7', ExplicitCred: '#f97316', NewComputer: '#eab308', ASREPRoast: '#f97316', OverpassHash: '#ef4444', PassTheHash: '#ef4444', ForgedPAC: '#ef4444', SkeletonKey: '#ef4444' };

function adCol(t) { return AD_COL[t] || '#a855f7'; }

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const ADAttackSummary = ({ topoData, range }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const byType = useMemo(() => {
    if (!topoData || !topoData.ad_attacks) return {};
    const grouped = {};
    topoData.ad_attacks.forEach(a => {
      let title = a.attack_type || a.description || a.tag || a.message || 'Unknown Attack';
      if (title.includes('Kerberoasting')) title = 'Kerberoasting';
      if (title.includes('NTLM-Brute')) title = 'NTLM-Brute';
      if (title.includes('PasswordSpray')) title = 'PasswordSpray';
      if (title.includes('DCSync')) title = 'DCSync';
      if (title.includes('ESC')) {
        const m = title.match(/(ESC[1-8])/);
        title = m ? m[1] : 'ADCS Attack';
      }
      
      if (!grouped[title]) grouped[title] = [];
      grouped[title].push(a);
    });
    return grouped;
  }, [topoData]);

  const types = Object.keys(byType).sort((a,b) => byType[b].length - byType[a].length);
  const totalAttacks = topoData?.ad_attacks?.length || 0;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>shield_lock</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            AD / Certificate Attack Summary
          </h3>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', background: 'var(--surface2)', padding: '4px 8px', borderRadius: '12px' }}>{totalAttacks} pattern{totalAttacks !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: '20px', overflowY: 'auto' }}>
        {types.map(type => {
          const col = adCol(type);
          const rows = byType[type];
          
          // Group rows by description and target to get the 'xN' count
          const grouped = {};
          rows.forEach(r => {
            const key = `${r.description || r.message}_${r.target_machine || r.machine}`;
            if (!grouped[key]) grouped[key] = { ...r, count: 0 };
            grouped[key].count += 1;
          });
          const uniqueRows = Object.values(grouped).sort((a,b) => b.count - a.count);

          return (
            <div key={type} style={{ padding: '0 0 24px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: col }}></div>
                <span style={{ fontSize: '11px', color: col, fontWeight: 800, letterSpacing: '1px' }}>{type.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {uniqueRows.map((r, i) => {
                  const target = r.target_machine || r.machine || 'Unknown';
                  let source = r.source_user || r.from_machine || r.from_ip;
                  if (!source) {
                    const byMatch = (r.description || r.message)?.match(/by '([^']+)'/);
                    if (byMatch) source = byMatch[1];
                    else {
                      const fromMatch = (r.description || r.message)?.match(/from '?([0-9\.]+)'?/);
                      if (fromMatch) source = fromMatch[1];
                    }
                  }

                  let rgb = '168,85,247';
                  if (col.startsWith('#')) {
                    const h = col.replace('#', '');
                    if (h.length === 6) {
                      rgb = `${parseInt(h.substring(0,2), 16)},${parseInt(h.substring(2,4), 16)},${parseInt(h.substring(4,6), 16)}`;
                    }
                  }

                  return (
                    <div key={i} onClick={() => setSelectedEvent(r)} className="hover-row" style={{ display: 'flex', flexDirection: 'column', padding: '14px 16px', borderRadius: '8px', cursor: 'pointer', borderBottom: i !== uniqueRows.length - 1 ? '1px solid var(--border)' : 'none', gap: '10px' }}>
                      
                      {/* Top Row: Tags and Count */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ background: `rgba(${rgb}, 0.1)`, color: col, padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {type.toUpperCase()}
                          </span>
                          <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.5px' }}>
                            CRITICAL
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, background: 'var(--surface2)', padding: '2px 8px', borderRadius: '12px' }}>
                          x{r.count}
                        </span>
                      </div>

                      {/* Middle Row: Full Description (No truncation) */}
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5', wordBreak: 'break-word' }}>
                        {r.description || r.message}
                      </div>

                      {/* Bottom Row: Source/Target Info */}
                      <div style={{ fontSize: '11px', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface2)', padding: '6px 10px', borderRadius: '6px', alignSelf: 'flex-start' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--muted)' }}>route</span>
                        {source ? (
                          <><span style={{ color: '#f97316' }}>{source}</span> <span style={{ color: 'var(--muted)' }}>→</span> <span style={{ color: '#3b82f6' }}>{target}</span></>
                        ) : (
                          <span style={{ color: '#3b82f6' }}>{target}</span>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {types.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>No Active Directory or ADCS threats detected.</div>
        )}
        </div>
      </div>

      <EventDetailModal 
        event={selectedEvent} 
        onClose={() => setSelectedEvent(null)} 
      />
    </div>
  );
};

export default React.memo(ADAttackSummary);
