import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import FirewallTopology from '../components/FirewallTopology';
import FirewallAlerts from '../components/FirewallAlerts';
import FirewallTopSources from '../components/FirewallTopSources';
import FirewallSourcesModal from '../components/FirewallSourcesModal';
import { useFilter } from '../context/FilterContext';

const sevColor = {
  critical: '#f04f5a',
  high: '#f97316',
  medium: '#f5c518',
  low: '#22d47a',
  info: '#4f8ef7'
};

const esc = (s) => (s || '').toString();

function formatTime(isoStr) {
  if (!isoStr) return '';
  return isoStr.replace('T', ' ').slice(0, 19);
}

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

export default function Firewall() {
  const { aggregator, machine } = useFilter();
  const [data, setData] = useState({ total: 0, byAction: [], byService: [], bySev: [], topSrc: [], topDst: [], events: [], has_more: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [liveMode, setLiveMode] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [lastLiveId, setLastLiveId] = useState(0);

  const [sourcesModalOpen, setSourcesModalOpen] = useState(false);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatTime(d.toISOString());
  });
  const [to, setTo] = useState(() => formatTime(new Date().toISOString()));
  const [action, setAction] = useState('');
  const [service, setService] = useState('');
  const [ip, setIp] = useState('');
  const [severity, setSeverity] = useState('');
  const [device, setDevice] = useState('');
  const [devices, setDevices] = useState([]);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20); 
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [flowFilter, setFlowFilter] = useState(null);
  const liveIntervalRef = useRef(null);

  useEffect(() => {
    fetchDevices();
  }, [aggregator]);

  useEffect(() => {
    if (!liveMode) {
      fetchData();
    }
  }, [from, to, action, service, ip, severity, device, machine, aggregator, page, perPage, liveMode, flowFilter]);

  useEffect(() => {
    if (liveMode) {
      fetchLive();
      liveIntervalRef.current = setInterval(fetchLive, 2000);
    } else {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    }
    return () => {
      if (liveIntervalRef.current) clearInterval(liveIntervalRef.current);
    };
  }, [liveMode]);

  const fetchDevices = async () => {
    try {
      const res = await axios.get('/api/firewall/devices', { params: { aggregator } });
      setDevices(res.data || []);
    } catch (e) {
      console.error('Failed to load devices', e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * perPage;
      const params = { 
        from, to, 
        action: flowFilter && flowFilter.action ? flowFilter.action : action, 
        service: flowFilter && flowFilter.svc ? flowFilter.svc : service, 
        ip: flowFilter && flowFilter.ip ? flowFilter.ip : ip, 
        src_ip: flowFilter ? flowFilter.src : undefined,
        dst_ip: flowFilter ? flowFilter.dst : undefined,
        severity, device: machine || device, aggregator, limit: perPage, offset 
      };
      const res = await axios.get('/api/firewall/stats', { params });
      setData(res.data);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchLive = async () => {
    try {
      const res = await axios.get('/api/firewall/live', {
        params: { last_id: lastLiveId, limit: 50, aggregator, device: machine }
      });
      if (res.data && res.data.events && res.data.events.length > 0) {
        setLastLiveId(res.data.last_id);
        setLiveEvents(prev => {
          const newArr = [...res.data.events.reverse(), ...prev];
          return newArr.slice(0, 200); 
        });
      }
    } catch (e) {
      console.error('Live fetch error:', e);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / perPage));

  const PremiumCard = ({ value, label, color, icon, subtitle }) => (
    <div style={{ background: 'var(--surface)', border: `1px solid ${color}44`, borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginTop: '4px' }}>{label}</span>
      </div>
      <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }}></span>
        <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.2px' }}>{subtitle}</span>
      </div>
    </div>
  );

  const getActionCount = (keys) => {
    return data.byAction.filter(a => keys.some(k => (a.action||'').toLowerCase().includes(k))).reduce((sum, a) => sum + a.n, 0);
  };

  const getSevCount = (sev) => {
    return (data.bySev.find(s => (s.severity||'').toLowerCase() === sev) || {}).n || 0;
  };

  const allowedCount = getActionCount(['accept', 'allow', 'permit', 'close']);
  const blockedCount = getActionCount(['block', 'deny', 'drop']);
  const rstCount = getActionCount(['client-rst', 'server-rst', 'timeout']);
  
  const extSourcesCount = data.topSrc?.length || 0; 
  const critCount = getSevCount('critical');
  const highCount = getSevCount('high');

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {selectedEvent && (
        <div onClick={() => setSelectedEvent(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37,99,235,0.03)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, letterSpacing: '1px', color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Event Details</h3>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gap: '20px' }}>
                {Object.entries(selectedEvent).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                    <div style={{ flex: '0 0 160px', fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>{key}</div>
                    <div style={{ flex: 1, fontSize: '13px', color: key === 'severity' ? (sevColor[(val||'').toLowerCase()] || 'var(--text)') : 'var(--text)', fontFamily: 'var(--sans)', wordBreak: 'break-word', fontWeight: key === 'severity' ? 700 : 500, textTransform: key === 'severity' ? 'uppercase' : 'none' }}>
                      {val !== null && val !== undefined ? String(val) : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Firewall Traffic Monitor</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Global network telemetry, security alerts, and connection audits.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={() => setSourcesModalOpen(true)}
            style={{ background: 'var(--surface2)', border: '1px solid #06b6d4', color: '#06b6d4', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseOver={e => { e.target.style.background = 'rgba(6, 182, 212, 0.1)'; e.target.style.transform = 'translateY(-1px)'; }}
            onMouseOut={e => { e.target.style.background = 'var(--surface2)'; e.target.style.transform = 'none'; }}
          >
            Sources
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: liveMode ? 'rgba(34,197,94,0.1)' : 'var(--surface2)', padding: '6px 14px', borderRadius: '6px', border: `1px solid ${liveMode ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: liveMode ? '#22c55e' : 'var(--muted)', fontFamily: 'var(--mono)' }}>Live</span>
            <input type="checkbox" checked={liveMode} onChange={e => setLiveMode(e.target.checked)} style={{ display: 'none' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: liveMode ? '#22c55e' : 'var(--muted)', boxShadow: liveMode ? '0 0 8px #22c55e' : 'none' }}></div>
          </label>
        </div>
      </div>

      <FirewallSourcesModal isOpen={sourcesModalOpen} onClose={() => setSourcesModalOpen(false)} />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: '12px', flex: 1, minWidth: '100%' }}>
          <div className="tb-search-wrap" style={{ flex: 1 }}>
            <span className="material-symbols-outlined tb-search-icon">search</span>
            <input 
              type="text" 
              className="tb-search"
              value={ip}
              onChange={(e) => { setIp(e.target.value); setPage(1); }}
              placeholder="Filter IP..." 
              style={{ width: '100%' }}
              disabled={liveMode}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>RANGE:</span>
            <input type="datetime-local" value={from.replace(' ', 'T')} onChange={e => { setFrom(formatTime(e.target.value)); setPage(1); }} disabled={liveMode} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '6px 10px', borderRadius: '6px' }} />
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>to</span>
            <input type="datetime-local" value={to.replace(' ', 'T')} onChange={e => { setTo(formatTime(e.target.value)); setPage(1); }} disabled={liveMode} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '6px 10px', borderRadius: '6px' }} />
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px', width: '100%' }}>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} disabled={liveMode} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All Actions</option>
            <option value="accept">Accept / Allow</option>
            <option value="block">Block / Deny</option>
          </select>

          <select value={service} onChange={(e) => { setService(e.target.value); setPage(1); }} disabled={liveMode} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All Services</option>
            {data.byService.map(s => (
              <option key={s.service} value={s.service}>{s.service} ({s.n})</option>
            ))}
          </select>
          
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} disabled={liveMode} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          
          <select value={device} onChange={(e) => { setDevice(e.target.value); setPage(1); }} disabled={liveMode} style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
            <option value="">All Firewalls</option>
            {devices.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {!liveMode && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <PremiumCard value={data.total} label="Total Events" color="#3b82f6" icon="public" subtitle="Monitoring" />
          <PremiumCard value={allowedCount} label="Accepted / Closed" color="#22c55e" icon="check_circle" subtitle="Normal" />
          <PremiumCard value={blockedCount} label="Denied / Dropped" color="#ef4444" icon="block" subtitle="Action Required" />
          <PremiumCard value={rstCount} label="RST / Timeout" color="#f97316" icon="timer" subtitle="Elevated Risk" />
          <PremiumCard value={critCount} label="Critical" color="#ef4444" icon="warning" subtitle="Action Required" />
          <PremiumCard value={highCount} label="High" color="#f97316" icon="error" subtitle="Elevated Risk" />
          <PremiumCard value={extSourcesCount} label="Ext Sources" color="#a855f7" icon="dns" subtitle="Tracked" />
        </div>
      )}

      {!liveMode && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '24px' }}>
          <FirewallAlerts from={from} to={to} device={machine || device} severity={severity} aggregator={aggregator} />
          <FirewallTopology 
            from={from} to={to} action={action} service={service} ip={ip} device={machine || device} severity={severity} aggregator={aggregator} 
            onFlowSelect={setFlowFilter} 
          />
        </div>
      )}

      {/* Middle Section equivalent for Live mode -> just the Logs */}
      {liveMode && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.02)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>stream</span>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>Live Feed</h3>
            <button onClick={() => setLiveEvents([])} style={{ marginLeft: 'auto', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Clear</button>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {liveEvents.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Waiting for events...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)' }}>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Branch</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Src IP</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Dst IP</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Service</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {liveEvents.map((a, i) => {
                    const actName = (a.action||'').toLowerCase();
                    const blocked = actName === 'block' || actName === 'deny' || actName === 'drop' || actName === 'close';
                    const col = blocked ? '#ef4444' : '#22c55e';
                    return (
                      <tr key={a.id} className="hover-row" onClick={() => setSelectedEvent(a)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '14px 16px', fontSize: '10px', color: 'var(--muted2)' }}>{a.ts ? new Date(a.ts).toLocaleString('sv-SE').slice(0, 19).replace('T', ' ') : ''}</td>
                        <td style={{ padding: '14px 16px', fontSize: '11px', color: 'var(--text)' }}>{(a.aggregator_name || '').toUpperCase()}</td>
                        <td style={{ padding: '14px 16px' }}><span className="mn" style={{ fontSize: '11px', color: isPrivateIp(a.src_ip) ? '#60a5fa' : '#f97316' }}>{esc(a.src_ip)}</span></td>
                        <td style={{ padding: '14px 16px' }}><span className="mn" style={{ fontSize: '11px', color: '#3b82f6' }}>{esc(a.dst_ip)}</span></td>
                        <td style={{ padding: '14px 16px', fontSize: '11px', color: '#a855f7' }}>{esc(a.service)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
                            {esc(a.action || '?').toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Bottom Section: Connection Log and Top Sources */}
      {!liveMode && (
        <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: '16px', marginBottom: '24px' }}>
          
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>Connection Log</h3>
              <span style={{ fontSize: '10px', color: '#9aa5c0', fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Showing {data.events.length} of {data.total}</span>
            </div>
            {(ip || service || action || flowFilter) && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(59,130,246,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--text)' }}>filter_alt</span>
                  <span style={{ color: 'var(--text)' }}>Flow:</span>
                  {flowFilter && flowFilter.src && flowFilter.dst ? (
                    <>
                      <span style={{ color: '#f97316' }}>{flowFilter.src}</span>
                      <span style={{ color: 'var(--muted)' }}>→</span>
                      <span style={{ color: '#06b6d4' }}>{flowFilter.dst}</span>
                    </>
                  ) : flowFilter && flowFilter.ip ? (
                    <span style={{ color: '#f97316' }}>{flowFilter.ip}</span>
                  ) : (
                    ip && <span style={{ color: '#f97316' }}>{ip}</span>
                  )}
                  {(!flowFilter && ip) && <span style={{ color: 'var(--muted)' }}>→</span>}
                  
                  {(flowFilter && flowFilter.svc) ? (
                    <>
                      <span style={{ color: 'var(--muted)' }}>|</span>
                      <span style={{ color: '#3b82f6' }}>{flowFilter.svc.toUpperCase()}</span>
                    </>
                  ) : (!flowFilter && service) ? (
                    <>
                      <span style={{ color: 'var(--muted)' }}>|</span>
                      <span style={{ color: '#3b82f6' }}>{service.toUpperCase()}</span>
                    </>
                  ) : null}

                  {(flowFilter && flowFilter.action) ? (
                    <>
                      <span style={{ color: 'var(--muted)' }}>|</span>
                      <span style={{ color: flowFilter.action === 'accept' ? '#22c55e' : '#ef4444', background: flowFilter.action === 'accept' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontSize: '10px' }}>{flowFilter.action}</span>
                    </>
                  ) : (!flowFilter && action) ? (
                    <>
                      <span style={{ color: 'var(--muted)' }}>|</span>
                      <span style={{ color: action === 'accept' ? '#22c55e' : '#f97316', background: action === 'accept' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontSize: '10px' }}>{action}</span>
                    </>
                  ) : null}
                  
                  <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: '8px', fontWeight: 500 }}>{data.total} connections</span>
                </div>
                <button onClick={() => { setIp(''); setService(''); setAction(''); setFlowFilter(null); setPage(1); }} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span> Show All
                </button>
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '460px' }}>
              {loading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
              ) : error ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
              ) : data.events.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>No logs matched filter</div>
              ) : (
                <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>BRANCH</th>
                      <th>MACHINE</th>
                      <th>SRC IP</th>
                      <th>SRC PORT</th>
                      <th style={{ textAlign: 'center' }}>&#8594;</th>
                      <th>DST IP</th>
                      <th>DST PORT</th>
                      <th>SERVICE</th>
                      <th>ACTION</th>
                      <th>PROTO</th>
                      <th>SENT</th>
                      <th>RCV</th>
                      <th>DUR</th>
                      <th>COUNTRY</th>
                      <th>POLICY</th>
                      <th>SEV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((a, i) => {
                      const actName = (a.action||'').toLowerCase();
                      
                      let actBg, actColor, actBorder;
                      if (!actName || actName === 'accept' || actName === 'allow') {
                        actBg = 'rgba(34,212,122,.10)'; actColor = 'var(--low, #22c55e)'; actBorder = '1px solid rgba(34,212,122,.2)';
                      } else if (actName === 'deny' || actName === 'drop') {
                        actBg = 'rgba(240,79,90,.10)'; actColor = 'var(--critical, #ef4444)'; actBorder = '1px solid rgba(240,79,90,.2)';
                      } else {
                        actBg = 'rgba(249,115,22,.10)'; actColor = 'var(--high, #f97316)'; actBorder = '1px solid rgba(249,115,22,.2)';
                      }

                      const fmtBytes = (b) => {
                        if (!b) return '-';
                        if (b > 1073741824) return (b/1073741824).toFixed(1)+'GB';
                        if (b > 1048576)    return (b/1048576).toFixed(1)+'MB';
                        if (b > 1024)       return (b/1024).toFixed(0)+'KB';
                        return b+'B';
                      };

                      return (
                        <tr key={i} onClick={() => setSelectedEvent(a)} style={{ cursor: 'pointer' }}>
                          <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{a.ts ? new Date(a.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                          <td style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>{(a.aggregator_name || '').toUpperCase()}</td>
                          <td style={{ fontSize: '11px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>{a.devname || '-'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: a.src_ip && isPrivateIp(a.src_ip) ? '#60a5fa' : '#f97316' }}>{esc(a.src_ip)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{esc(a.src_port)}</td>
                          <td style={{ color: 'var(--muted)', textAlign: 'center', fontSize: '10px' }}>&#8594;</td>
                          <td style={{ fontFamily: 'var(--mono)', color: '#06b6d4', fontWeight: 600 }}>{esc(a.dst_ip)}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#22d3ee' }}>{esc(a.dst_port)}</td>
                          <td>
                            <span className="badge" style={{ background: 'rgba(6,182,212,.12)', color: '#06b6d4', border: '1px solid rgba(6,182,212,.3)' }}>
                              {esc(a.service)}
                            </span>
                          </td>
                          <td>
                            <span className="badge" style={{ background: actBg, color: actColor, border: actBorder }}>
                              {esc(a.action || '?')}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{esc(a.proto)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{fmtBytes(a.sent_bytes)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{fmtBytes(a.rcv_bytes)}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{a.duration ? `${a.duration}s` : '-'}</td>
                          <td style={{ color: 'var(--muted)' }}>{esc(a.dst_country || a.src_country || '-')}</td>
                          <td style={{ color: 'var(--muted)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.policy}>{esc(a.policy || '-')}</td>
                          <td>
                            <span className={`badge sev-${(a.severity||'info').toLowerCase()}`}>
                              {esc(a.severity)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                SHOWING {data.total === 0 ? 0 : (page - 1) * perPage + 1} TO {Math.min(page * perPage, data.total)} OF {data.total} ENTRIES
              </span>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {[5, 10, 20, 30].map(size => {
                    const isActive = perPage === size;
                    return (
                      <button 
                        key={size}
                        onClick={() => { setPerPage(size); setPage(1); }}
                        style={{ 
                          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                          border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                          background: isActive ? 'var(--accent)' : 'var(--surface)',
                          color: isActive ? '#fff' : 'var(--muted)',
                          boxShadow: isActive ? '0 4px 12px rgba(37,99,235,0.2)' : 'none'
                        }}
                      >
                        {size}
                      </button>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))} 
                    disabled={page <= 1}
                    style={{ 
                      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, transition: 'background 0.2s',
                      background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1 
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                    {page} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                    disabled={page >= totalPages || !data.has_more}
                    style={{ 
                      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, transition: 'background 0.2s',
                      background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff',
                      boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                      cursor: (page >= totalPages || !data.has_more) ? 'not-allowed' : 'pointer', opacity: (page >= totalPages || !data.has_more) ? 0.4 : 1 
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          <FirewallTopSources topSrc={data.topSrc} topDst={data.topDst} />
          
        </div>
      )}

    </div>
  );
}
