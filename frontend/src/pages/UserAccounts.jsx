import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useFilter } from '../context/FilterContext';
import { useInstance } from '../context/InstanceContext';

const sevColor = {
  critical: '#f04f5a',
  high: '#f97316',
  medium: '#f5c518',
  low: '#22d47a',
  info: '#4f8ef7'
};

const adCol = (type) => {
  const t = (type || '').toUpperCase();
  if(t.includes('DCSYNC') || t.includes('DCSHADOW')) return '#f04f5a';
  if(t.includes('KERBEROAST') || t.includes('ASREPROAST')) return '#f97316';
  if(t.includes('BRUTE') || t.includes('SPRAY')) return '#eab308';
  if(t.includes('CERT') || t.includes('ESC')) return '#22d47a';
  if(t.includes('RBCD') || t.includes('SHADOWCRED') || t.includes('SHADOW')) return '#a855f7';
  if(t.includes('PASS')) return '#3b82f6';
  return '#f5c518';
};

const esc = (s) => (s || '').toString();

export default function UserAccounts() {
  const { aggregator } = useFilter();
  const { isCentral } = useInstance();

  let savedRange = (localStorage.getItem('iochunt_user_range') || '24').replace('h', '');
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function formatTime(isoStr) {
    if (!isoStr) return '';
    return isoStr.replace('T', ' ').slice(0, 19);
  }
  
  const [range, setRange] = useState(savedRange);
  const [branchFilter, setBranchFilter] = useState('');
  const [aggregators, setAggregators] = useState([]);
  const [machine, setMachine] = useState('');
  const [availableMachines, setAvailableMachines] = useState([]);
  const [serverStats, setServerStats] = useState({ total: 0, critical: 0, high: 0 });
  
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10); 
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('');
  const [privilegedFilter, setPrivilegedFilter] = useState('false');
        
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return formatTime(d.toISOString());
  });
  const [customTo, setCustomTo] = useState(() => formatTime(new Date().toISOString()));

  useEffect(() => {
    const fetchAggregators = async () => {
      if (!isCentral()) return;
      try {
        const aggRes = await axios.get('/api/aggregators');
        setAggregators(aggRes.data.data || aggRes.data || []);
      } catch (err) {
        console.error('Failed to load aggregators', err);
      }
    };
    fetchAggregators();
  }, [isCentral]);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const res = await axios.get('/api/machines');
        const machinesData = res.data.data || res.data;
        if (Array.isArray(machinesData)) {
          setAvailableMachines(machinesData.map(m => ({ name: m.name, label: m.name || m.label, aggregator: m.aggregator_name })));
        }
      } catch (err) {
        console.error('Failed to load machines', err);
      }
    };
    fetchMachines();
  }, []);

  const filteredMachines = availableMachines.filter(m => !branchFilter || m.aggregator === branchFilter);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { machine, aggregator: branchFilter || aggregator || undefined };
        if (range === 'custom') {
          params.from = customFrom;
          params.to = customTo;
        } else {
          params.hours = range;
        }
        const res = await axios.get('/api/events/user-events', { params });
        const dataArr = res.data.events || res.data || [];
        setData(dataArr);
      } catch (e) {
        console.error(e);
        setError(e.response?.data?.error || e.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [range, machine, customFrom, customTo, branchFilter, aggregator]);

  const filteredData = data;

  const total = filteredData.length;
  const usersCreated = filteredData.filter(a => a.action === 'User Created').length;
  const passwordsReset = filteredData.filter(a => (a.action || '').includes('Password')).length;
  const uniqueActors = new Set(filteredData.map(a => a.actor)).size;
  const uniqueMachines = new Set(filteredData.map(a => a.machine)).size;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, totalPages);
  
  const startIdx = (currentPage - 1) * perPage;
  const paginatedData = filteredData.slice(startIdx, startIdx + perPage);

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
                    <div style={{ flex: '0 0 160px', fontSize: '11px', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>
                      {key}
                    </div>
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
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>User & Group Events</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Track AD user account modifications, creations, deletions, and group membership changes.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: '11px', padding: '6px 14px', borderRadius: '6px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
            {total} {total === 1 ? 'event' : 'events'}
          </span>
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
            placeholder="Search machine, type, process..." 
            style={{ width: '100%' }}
          />
        </div>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Severity:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={() => { setSeverityFilter('critical'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(240,79,90,0.1)', color: '#f04f5a', border: '1px solid rgba(240,79,90,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: severityFilter === 'all' || severityFilter === 'critical' ? 1 : 0.4 }}
            >CRITICAL</button>
            <button 
              onClick={() => { setSeverityFilter('high'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: severityFilter === 'all' || severityFilter === 'high' ? 1 : 0.4 }}
            >HIGH</button>
            <button 
              onClick={() => { setSeverityFilter('medium'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: severityFilter === 'all' || severityFilter === 'medium' ? 1 : 0.4 }}
            >MEDIUM</button>
            <button 
              onClick={() => { setSeverityFilter('all'); setPage(1); }} 
              style={{ padding: '4px 10px', borderRadius: '4px', background: severityFilter === 'all' ? '#2563eb' : 'transparent', color: severityFilter === 'all' ? '#fff' : 'var(--text)', border: '1px solid ' + (severityFilter === 'all' ? '#2563eb' : 'var(--border)'), fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s' }}
            >ALL</button>
          </div>
        </div>
        
        
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
        
        <select 
          value={range} 
          onChange={(e) => { 
            const val = e.target.value;
            setRange(val); 
            savedRange = val;
            setPage(1); 
          }}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
        >
          <option value="24">Last 24h</option>
          <option value="168">Last 7d</option>
          <option value="720">Last 30d</option>
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
        
        <select 
          value={branchFilter} 
          onChange={(e) => { setBranchFilter(e.target.value); setPage(1); setMachine(''); }}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Branches</option>
          {aggregators.map(a => (
            <option key={a.name} value={a.name}>{a.name}</option>
          ))}
        </select>
        
        <select 
          value={machine} 
          onChange={(e) => { setMachine(e.target.value); setPage(1); }}
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">All Machines</option>
          {filteredMachines.map(m => (
            <option key={m.name} value={m.name}>{m.label}</option>
          ))}
        </select>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
              </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard value={total} label="Total Events" color="#3b82f6" icon="group" subtitle="Active tracking" />
        <PremiumCard value={usersCreated} label="New Users" color="#22c55e" icon="person_add" subtitle="Users created" />
        <PremiumCard value={passwordsReset} label="PW Resets" color="#eab308" icon="password" subtitle="Password changes" />
        <PremiumCard value={uniqueActors} label="Actors" color="#f97316" icon="person_search" subtitle="Unique actors" />
        <PremiumCard value={uniqueMachines} label="Machines" color="#a855f7" icon="computer" subtitle="Affected hosts" />
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>badge</span>
          <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>Account Modifications</h2>
        </div>
        
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
        ) : total === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No user events in this window</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Branch</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Group</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Actor</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((a, i) => {
                    const sev = (a.severity || 'info').toLowerCase();
                    const col = sevColor[sev] || '#4f8ef7';
                    const typCol = adCol(a.action);

                    return (
                      <tr key={i} className="hover-row" onClick={() => setSelectedEvent(a)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
                            {esc(a.severity || 'info').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: typCol, display: 'inline-block', marginRight: '5px' }}></span>
                          {esc(a.action)}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: 'rgba(37,99,235,0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                            {a.aggregator_name || 'Unknown'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '11px', color: 'var(--text)' }}>{esc(a.username || '-')}</td>
                        <td style={{ padding: '14px 16px', fontSize: '11px', color: 'var(--muted)' }}>{esc(a.group || '-')}</td>
                        <td style={{ padding: '14px 16px', fontSize: '11px', color: '#f97316' }}>{esc(a.actor || '-')}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <span className="mn" style={{ fontSize: '11px', color: '#3b82f6' }}>{esc(a.machine || '?')}</span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '10px', color: 'var(--muted2)' }}>{a.ts ? new Date(a.ts).toLocaleString('sv-SE').slice(0, 16) : ''}</td>
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
