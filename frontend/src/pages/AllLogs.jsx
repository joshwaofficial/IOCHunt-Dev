import React, { useState, useEffect } from 'react';
import axios from 'axios';

const sevColor = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#64748b'
};

const esc = (s) => (s || '').toString();

export default function AllLogs() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function formatTime(isoStr) {
    if (!isoStr) return '';
    return isoStr.replace('T', ' ').slice(0, 19);
  }
  
  const [range, setRange] = useState(localStorage.getItem('iochunt-logs-range') || '168');
  const [machine, setMachine] = useState(localStorage.getItem('iochunt-logs-machine') || '');
  const [severityFilter, setSeverityFilter] = useState(localStorage.getItem('iochunt-logs-severity') || '');
  const [categoryFilter, setCategoryFilter] = useState(localStorage.getItem('iochunt-logs-category') || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNoise, setShowNoise] = useState(false);

  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return formatTime(d.toISOString());
  });
  const [customTo, setCustomTo] = useState(() => formatTime(new Date().toISOString()));
  
  const [branchFilter, setBranchFilter] = useState(localStorage.getItem('iochunt-logs-branch') || '');
  const [aggregators, setAggregators] = useState([]);
  const [availableMachines, setAvailableMachines] = useState([]);
  
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10); 
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const fetchAggregators = async () => {
      try {
        const aggRes = await axios.get('/api/aggregators');
        setAggregators(aggRes.data.data || aggRes.data || []);
      } catch (err) {
        console.error('Failed to load aggregators', err);
      }
    };
    fetchAggregators();
  }, []);

  // Fetch machines for dropdown
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

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem('iochunt-logs-range', range);
      localStorage.setItem('iochunt-logs-machine', machine);
      localStorage.setItem('iochunt-logs-severity', severityFilter);
      localStorage.setItem('iochunt-logs-category', categoryFilter);
      localStorage.setItem('iochunt-logs-branch', branchFilter);

      const offset = (page - 1) * perPage;
      const params = {
        machine: machine || undefined,
        aggregator: branchFilter || undefined,
        severity: severityFilter || undefined,
        category: categoryFilter || undefined,
        search: searchTerm || undefined,
        show_noise: showNoise ? '1' : '0',
        limit: perPage,
        offset: offset,
        include_total: 'true'
      };
      
      if (range === 'custom') {
        params.from = customFrom;
        params.to = customTo;
      } else {
        params.hours = range;
      }

      const res = await axios.get('/api/events', { params });
      setData(res.data.events || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [range, machine, severityFilter, categoryFilter, searchTerm, showNoise, page, perPage, customFrom, customTo, branchFilter]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const startIdx = (page - 1) * perPage;

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      {/* Event Details Modal */}
      {selectedEvent && (
        <div onClick={() => setSelectedEvent(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '12px', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37,99,235,0.03)', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, letterSpacing: '1px', color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>Event Details</h3>
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
                        {val !== null && val !== undefined ? String(val) : '-'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>All Logs</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Search, filter, and analyze all raw system logs and security events.</p>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
        
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>list_alt</span>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: 0 }}>All Logs Explorer</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
             <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)', background: 'rgba(37,99,235,0.1)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(37,99,235,0.2)' }}>
               {total.toLocaleString()} events
             </span>
          </div>
        </div>

        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            
            <select value={range} onChange={(e) => { setRange(e.target.value); setPage(1); }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--sans)', cursor: 'pointer', outline: 'none', transition: 'border 0.2s' }}>
               <option value="1">Last 1h</option>
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
            
            <select value={branchFilter} onChange={(e) => { setBranchFilter(e.target.value); setPage(1); setMachine(''); }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--sans)', cursor: 'pointer', outline: 'none', transition: 'border 0.2s' }}>
               <option value="">All Branches</option>
               {aggregators.map(a => (
                 <option key={a.name} value={a.name}>{a.name}</option>
               ))}
            </select>
            
            <select value={machine} onChange={(e) => { setMachine(e.target.value); setPage(1); }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--sans)', cursor: 'pointer', outline: 'none', transition: 'border 0.2s' }}>
               <option value="">All Machines</option>
               {filteredMachines.map(m => (
                 <option key={m.name} value={m.name}>{m.label}</option>
               ))}
            </select>

            <select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--sans)', cursor: 'pointer', outline: 'none', transition: 'border 0.2s' }}>
               <option value="">All Severities</option>
               <option value="critical">Critical</option>
               <option value="high">High</option>
               <option value="medium">Medium</option>
               <option value="low">Low</option>
               <option value="info">Info</option>
            </select>

            <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--sans)', cursor: 'pointer', outline: 'none', transition: 'border 0.2s' }}>
               <option value="">All Categories</option>
               <option value="PROCESSES">Processes</option>
               <option value="CHILD-PROCESS">Child Process</option>
               <option value="NETWORK">Network</option>
               <option value="DOMAIN">Domain</option>
               <option value="ADCS">ADCS</option>
               <option value="LOGON">Logon</option>
               <option value="CONFIG">Config</option>
               <option value="SENSITIVE">Sensitive</option>
               <option value="USB">USB</option>
               <option value="SERVICES">Services</option>
               <option value="TASKS">Tasks</option>
               <option value="REGISTRY">Registry</option>
               <option value="DEFENDER">Defender</option>
            </select>
            
            <div className="tb-search-wrap" style={{ flex: 1, minWidth: '160px', position: 'relative' }}>
                <span className="material-symbols-outlined tb-search-icon">search</span>
                <input 
                  type="text" 
                  value={searchTerm}
                  className="tb-search" 
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} 
                  placeholder="Search logs..." 
                  style={{ width: '100%' }}
                />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Noise</span>
                <label className="tog-switch" style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px' }}>
                  <input type="checkbox" checked={showNoise} onChange={(e) => { setShowNoise(e.target.checked); setPage(1); }} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span className="tog-slider" style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: showNoise ? '#2563eb' : 'var(--surface2)', transition: '.4s', borderRadius: '34px', border: '1px solid var(--border)' }}>
                    <span style={{ position: 'absolute', content: '""', height: '14px', width: '14px', left: showNoise ? '18px' : '2px', bottom: '2px', backgroundColor: '#fff', transition: '.4s', borderRadius: '50%' }}></span>
                  </span>
                </label>
            </div>
            
            <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', borderRadius: '8px', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', border: 'none', cursor: 'pointer', marginLeft: 'auto', boxShadow: '0 4px 12px rgba(37,99,235,0.3)', transition: 'background 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span> Refresh
            </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', width: '110px' }}>Time</th>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', width: '140px' }}>Machine</th>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', width: '100px' }}>Severity</th>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', width: '120px' }}>Category</th>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', width: '180px' }}>Tag</th>
                <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)', fontSize: '14px' }}>Loading...</td></tr>
              ) : error ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: '#ef4444', fontSize: '14px' }}>{error}</td></tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)', fontSize: '14px' }}>
                    <div style={{ marginBottom: '8px' }}><span className="material-symbols-outlined" style={{ fontSize: '32px', opacity: 0.5 }}>search_off</span></div>
                    No logs match filters
                  </td>
                </tr>
              ) : (
                data.map((e, idx) => {
                  const sev = (e.severity || 'info').toLowerCase();
                  const col = sevColor[sev] || sevColor['info'];
                  const opac = e.is_noise ? { opacity: 0.5 } : {};
                  let tsDate = '';
                  let tsTime = '';
                  if (e.ts) {
                    const utc = e.ts.endsWith('Z') ? e.ts : e.ts;
                    const d = new Date(utc);
                    if (!isNaN(d)) {
                      const pad = n => n.toString().padStart(2, '0');
                      tsDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                      tsTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    } else {
                      tsDate = e.ts.slice(0, 10);
                      tsTime = e.ts.slice(11, 16);
                    }
                  }

                  return (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedEvent(e)}
                      className="hover:bg-[rgba(37,99,235,0.06)] transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)', ...opac }}
                    >
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '11px', color: 'var(--text)' }}>{esc(tsDate)}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{esc(tsTime)}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '11px', color: '#60a5fa' }}>{esc(e.machine)}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)', background: `${col}1a`, color: col, border: `1px solid ${col}33` }}>
                          {esc(e.severity || 'info')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{esc(e.category || '')}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '10px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={esc(e.tag)}>
                        {esc(e.tag || '')}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }} title={esc(e.message)}>
                        {esc(e.message || '')}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Showing {data.length > 0 ? startIdx + 1 : 0} to {Math.min(startIdx + perPage, total)} of {total} entries
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {[10, 20, 50, 100].map(size => (
                <button 
                  key={size}
                  onClick={() => { setPerPage(size); setPage(1); }}
                  style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontFamily: 'var(--mono)', border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                    ...(perPage === size 
                      ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' } 
                      : { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border)' }
                    )
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                onClick={() => { if(page > 1) setPage(page - 1); }}
                disabled={page <= 1}
                style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, transition: 'background 0.2s' }}
              >Prev</button>
              <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {page} / {totalPages}
              </span>
              <button 
                onClick={() => { if(page < totalPages) setPage(page + 1); }}
                disabled={page >= totalPages}
                style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, transition: 'background 0.2s' }}
              >Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
