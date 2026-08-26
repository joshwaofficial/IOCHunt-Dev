import React, { useState, useEffect } from 'react';
import axios from 'axios';

const esc = (s) => (s || '').toString().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");

export default function Clients() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function formatTime(isoStr) {
    if (!isoStr) return '';
    return isoStr.replace('T', ' ').slice(0, 19);
  }
  
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10); 
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [range, setRange] = useState('168');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [aggregatorFilter, setAggregatorFilter] = useState('all');
  const [aggregators, setAggregators] = useState([]);
  const [groups, setGroups] = useState([]);

  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return formatTime(d.toISOString());
  });
  const [customTo, setCustomTo] = useState(() => formatTime(new Date().toISOString()));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = {};
        if (range === 'custom') {
          params.from = customFrom;
          params.to = customTo;
        } else {
          params.hours = range;
        }
        const [res, groupsRes, aggRes] = await Promise.all([
          axios.get('/api/machines/clients', { params }),
          axios.get('/api/groups').catch(() => ({ data: [] })),
          axios.get('/api/aggregators').catch(() => ({ data: { data: [] } }))
        ]);
        setData(res.data.clients || []);
        setGroups(groupsRes.data || []);
        setAggregators(aggRes.data.data || aggRes.data || []);
      } catch (e) {
        console.error(e);
        setError(e.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [range, customFrom, customTo]);

  const handleGroupChange = async (machineId, groupId) => {
    try {
      for (const g of groups) {
        if (g.machines?.includes(machineId)) {
          await axios.delete(`/api/groups/${g.id}/machines/${encodeURIComponent(machineId)}`);
        }
      }
      if (groupId) {
        await axios.post(`/api/groups/${groupId}/machines`, { machines: [machineId] });
      }
      
      const newGroupsRes = await axios.get('/api/groups');
      setGroups(newGroupsRes.data || []);
    } catch (err) {
      console.error('Failed to change group:', err);
    }
  };

  const filteredData = data.filter(c => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!c.label.toLowerCase().includes(term) && !(c.ip || '').toLowerCase().includes(term)) return false;
    }
    if (statusFilter !== 'all' && (c.status || '').toLowerCase() !== statusFilter) return false;
    if (riskFilter !== 'all' && (c.riskLabel || '').toLowerCase() !== riskFilter) return false;
    if (aggregatorFilter !== 'all' && c.aggregator !== aggregatorFilter) return false;
    return true;
  });

  const total = filteredData.length;
  const online = filteredData.filter(c => c.status === 'Online').length;
  const offline = filteredData.filter(c => c.status === 'Offline').length;
  const critClients = filteredData.filter(c => c.riskLabel === 'Critical').length;
  const highClients = filteredData.filter(c => c.riskLabel === 'High').length;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  
  const startIdx = (currentPage - 1) * perPage;
  const paginatedData = filteredData.slice(startIdx, startIdx + perPage);

  const machineGroupMap = {};
  groups.forEach(g => {
    (g.machines || []).forEach(m => { machineGroupMap[m] = g; });
  });

  const PremiumCard = ({ value, label, color, icon, subtitle }) => {
    return (
      <div 
        style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border)', 
          borderRadius: '12px', 
          padding: '16px 20px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px', 
          boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
          position: 'relative',
          overflow: 'hidden',
          cursor: 'default'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ 
            width: '32px', height: '32px', 
            borderRadius: '8px', 
            background: `${color}1A`, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: color
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginTop: '4px' }}>{label}</span>
        </div>
        
        <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
          <span style={{ 
            width: '6px', height: '6px', 
            borderRadius: '50%', 
            background: color
          }}></span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.2px' }}>{subtitle}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {/* Event Details Modal */}
      {selectedEvent && (
        <div onClick={() => setSelectedEvent(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37,99,235,0.03)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, letterSpacing: '1px', color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Client Details</h3>
              <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gap: '20px' }}>
                {Object.entries(selectedEvent).map(([key, val]) => {
                  if(typeof val === 'object' && val !== null) return null;
                  return (
                    <div key={key} style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                      <div style={{ flex: '0 0 160px', fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>
                        {key}
                      </div>
                      <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--sans)', wordBreak: 'break-word', fontWeight: 500 }}>
                        {val !== null && val !== undefined ? esc(val) : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Client Inventory</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Monitor and review all endpoints across your infrastructure.</p>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '12px', marginBottom: '20px', justifyContent: 'space-between', overflowX: 'auto' }}>
        <div className="tb-search-wrap" style={{ flex: 1, minWidth: '160px' }}>
          <span className="material-symbols-outlined tb-search-icon">search</span>
          <input 
            type="text" 
            className="tb-search"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Search machine, IP..." 
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Status:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={() => { setStatusFilter('online'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: statusFilter === 'all' || statusFilter === 'online' ? 1 : 0.4 }}
            >ONLINE</button>
            <button 
              onClick={() => { setStatusFilter('offline'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: statusFilter === 'all' || statusFilter === 'offline' ? 1 : 0.4 }}
            >OFFLINE</button>
            <button 
              onClick={() => { setStatusFilter('all'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: statusFilter === 'all' ? '#2563eb' : 'transparent', color: statusFilter === 'all' ? '#fff' : 'var(--text)', border: '1px solid ' + (statusFilter === 'all' ? '#2563eb' : 'var(--border)'), fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s' }}
            >ALL</button>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Risk:</span>
          <select 
            value={riskFilter} 
            onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            <option value="all">All Risks</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Branch:</span>
          <select 
            value={aggregatorFilter} 
            onChange={(e) => { setAggregatorFilter(e.target.value); setPage(1); }}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', color: 'var(--text)', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            <option value="all">All Branches</option>
            {aggregators.map(a => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
        </div>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <select 
          value={range} 
          onChange={(e) => { setRange(e.target.value); setPage(1); }}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
        >
          <option value="24">Last 24h</option>
          <option value="168">Last 7 Days</option>
          <option value="720">Last 30 Days</option>
          <option value="custom">Custom Range</option>
        </select>
          
        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>RANGE:</span>
            <input type="datetime-local" value={customFrom.replace(' ', 'T')} onChange={e => { setCustomFrom(formatTime(e.target.value)); setPage(1); }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '6px 10px', borderRadius: '6px' }} />
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>to</span>
            <input type="datetime-local" value={customTo.replace(' ', 'T')} onChange={e => { setCustomTo(formatTime(e.target.value)); setPage(1); }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '6px 10px', borderRadius: '6px' }} />
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard value={total} label="Total Clients" color="#3b82f6" icon="devices" subtitle="All endpoints" />
        <PremiumCard value={online} label="Online" color="#22c55e" icon="check_circle" subtitle="Active now" />
        <PremiumCard value={offline} label="Offline" color="#64748b" icon="cancel" subtitle="Disconnected" />
        <PremiumCard value={critClients} label="Critical Risk" color="#ef4444" icon="warning" subtitle="Requires action" />
        <PremiumCard value={highClients} label="High Risk" color="#f97316" icon="error" subtitle="Elevated threat" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>devices</span>
          <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>Client Status & Risk</h2>
        </div>
        
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
        ) : total === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No clients registered yet</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Branch</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>IP</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Last Seen</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Total Events</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Critical</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>High</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>AD Events</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Risk Score</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Risk</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Group</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((c, i) => {
                    const riskCol = c.riskLabel === 'Critical' ? '#ef4444' : c.riskLabel === 'High' ? '#f97316' : c.riskLabel === 'Medium' ? '#f5c518' : '#22d47a';
                    const barPct = `${c.risk}%`;

                    return (
                      <tr key={i} className="hover-row" onClick={() => setSelectedEvent(c)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: c.statusCol, display: 'inline-block', marginRight: '8px', verticalAlign: 'middle', boxShadow: `0 0 8px ${c.statusCol}88` }}></span>
                          <span style={{ fontSize: '11px' }}>{esc(c.status)}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{esc(c.aggregator || 'Unknown')}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: '12px', color: 'var(--accent)' }}>{esc(c.label)}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px' }}>{esc(c.ip || '-')}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px' }}>{c.last_seen_str ? new Date(c.last_seen_str).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : 'Never'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '11px' }}>{c.total_recent}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: 'rgba(240,79,90,0.15)', color: '#f04f5a', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{c.critical}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{c.high}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {c.ad_events > 0 ? (
                            <span style={{ background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{c.ad_events}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '70px', height: '6px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: barPct, background: riskCol, borderRadius: '3px' }}></div>
                            </div>
                            <span style={{ fontSize: '11px', color: riskCol, fontWeight: 600 }}>{c.risk}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: `${riskCol}22`, color: riskCol, border: `1px solid ${riskCol}55`, padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>
                            {esc(c.riskLabel)}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <select 
                            value={machineGroupMap[c.id]?.id || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleGroupChange(c.id, e.target.value)}
                            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', outline: 'none' }}
                          >
                            <option value="">No group</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Showing {startIdx + 1} to {Math.min(startIdx + perPage, total)} of {total} entries
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {[5, 10, 20, 30, 50].map(size => {
                    const isActive = perPage === size;
                    return (
                      <button 
                        key={size}
                        onClick={() => { setPerPage(size); setPage(1); }}
                        style={{ 
                          background: isActive ? '#2563eb' : 'transparent', 
                          border: isActive ? '1px solid #2563eb' : '1px solid var(--border)', 
                          color: isActive ? '#fff' : 'var(--muted)', 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', cursor: 'pointer', fontWeight: 600
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    style={{ 
                      background: 'transparent', 
                      border: '1px solid var(--border)', 
                      color: currentPage === 1 ? 'var(--border)' : 'var(--muted)', 
                      padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', 
                      cursor: currentPage === 1 ? 'default' : 'pointer', fontWeight: 600 
                    }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 700 }}>
                    {currentPage} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    style={{ 
                      background: 'transparent', 
                      border: '1px solid var(--border)', 
                      color: currentPage === totalPages ? 'var(--border)' : 'var(--muted)', 
                      padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', 
                      cursor: currentPage === totalPages ? 'default' : 'pointer', fontWeight: 600 
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
