import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import { useFilter } from '../../context/FilterContext';

const formatTime = (ts) => {
  if (!ts) return '';
  let rawTs = ts;
  if (typeof rawTs === 'string' && !rawTs.endsWith('Z') && !rawTs.includes('+')) {
    rawTs = rawTs.trim().replace(' ', 'T') + 'Z';
  }
  const d = new Date(rawTs);
  if (isNaN(d)) return ts.slice(0, 16);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AllEventsModal({ isOpen, onClose, filterType, filterHour }) {
  const { range, machine } = useFilter();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const scrollRef = React.useRef(null);

  const scrollToTop = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 50);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [isOpen, filterType, filterHour, range, machine]);

  useEffect(() => {
    if (!isOpen) return;
    
    const fetchEvents = async () => {
      setLoading(true);
      
      try {
        const d = new Date(Date.now() - Number(range) * 3600000);
        const fromStr = d.getUTCFullYear() + '-' +
          String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
          String(d.getUTCDate()).padStart(2, '0') + ' ' +
          String(d.getUTCHours()).padStart(2, '0') + ':' +
          String(d.getUTCMinutes()).padStart(2, '0') + ':' +
          String(d.getUTCSeconds()).padStart(2, '0');

        let url = `/api/events?include_total=true&limit=${perPage}&offset=${(currentPage - 1) * perPage}&from=${encodeURIComponent(fromStr)}&machine=${encodeURIComponent(machine || '')}`;
        if (filterHour) {
          url += `&hourOfDay=${filterHour}`;
        }
        let isStats = false;
        
        const fType = filterType ? filterType.toLowerCase() : '';
        if (fType === 'critical') url += '&severity=critical';
        else if (fType === 'high') url += '&severity=high';
        else if (fType === 'medium') url += '&severity=medium';
        else if (fType === 'low') url += '&severity=low';
        else if (fType === 'info') url += '&severity=info';
        else if (fType === 'blocked') url += '&category=NETWORK';
        else if (fType === 'ad') url = `/api/events/ad-attacks?page=${currentPage}&limit=${perPage}&machine=${encodeURIComponent(machine || '')}&from=${encodeURIComponent(fromStr)}`;
        else if (fType === 'machines' || fType === 'incidents') {
          url = `/api/events/stats?range=${range}&machine=${encodeURIComponent(machine || '')}`;
          isStats = true;
        } else if (fType) {
          url += `&category=${encodeURIComponent(filterType.toUpperCase())}`;
        }

        const res = await axios.get(url);
        
        if (isStats) {
          const arr = filterType === 'machines' ? (res.data.machines || []) : (res.data.chains || []);
          setTotalItems(arr.length);
          setEvents(arr.slice((currentPage - 1) * perPage, currentPage * perPage));
        }
        // Handle server-side paginated response
        else if (res.data && res.data.events && (res.data.total !== undefined || res.data.stats?.total !== undefined)) {
          setEvents(res.data.events);
          setTotalItems(res.data.total !== undefined ? res.data.total : res.data.stats.total);
        } 
        // Handle flat array response (e.g. AD attacks fallback)
        else if (Array.isArray(res.data)) {
          setTotalItems(res.data.length);
          setEvents(res.data.slice((currentPage - 1) * perPage, currentPage * perPage));
        } 
        else if (res.data && Array.isArray(res.data.ad_attacks)) {
          const formattedAd = res.data.ad_attacks.map(a => ({
             ts: a.first_seen,
             machine: a.target_machine,
             severity: a.severity || 'high',
             category: 'AD_ATTACK',
             tag: a.attack_type,
             message: a.description
          }));
          setTotalItems(formattedAd.length);
          setEvents(formattedAd.slice((currentPage - 1) * perPage, currentPage * perPage));
        } else {
          setEvents([]);
          setTotalItems(0);
        }
      } catch (err) {
        console.error('Failed to load events:', err);
      } finally {
        setLoading(false);
        scrollToTop();
      }
    };

    fetchEvents();
  }, [isOpen, filterType, filterHour, range, machine, currentPage, perPage]);

  if (!isOpen) return null;

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const startIdx = (currentPage - 1) * perPage;
  const fromEntry = totalItems === 0 ? 0 : startIdx + 1;
  const toEntry = Math.min(startIdx + perPage, totalItems);

  const sizes = [50, 75, 100];

  const modalContent = (
    <div className="modal-overlay" onClick={onClose} style={{ alignItems: 'flex-start', paddingTop: '5vh' }}>
      <div className="modal-dialog" onClick={e => e.stopPropagation()} style={{
        width: '92vw', maxWidth: '1100px', maxHeight: '88vh', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '12px', zIndex: 3001,
        overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--accent, #2563eb)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            ALL EVENTS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
              {totalItems.toLocaleString()} events
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>
              &#x2715;
            </button>
          </div>
        </div>
        
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', flex: 1 }}>
              <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite', fontSize: '24px' }}>autorenew</span>
            </div>
          ) : (
            <>
              <div className="tbl-wrap" style={{ flex: 1 }}>
                <table className="mt">
                  <thead>
                    {filterType === 'machines' ? (
                      <tr>
                        <th style={{ width: '200px' }}>MACHINE ID</th>
                        <th>STATUS</th>
                      </tr>
                    ) : filterType === 'incidents' ? (
                      <tr>
                        <th style={{ width: '160px' }}>TIME</th>
                        <th style={{ width: '140px' }}>MACHINE</th>
                        <th style={{ width: '100px' }}>SEVERITY</th>
                        <th style={{ width: '120px' }}>EVENTS IN CHAIN</th>
                      </tr>
                    ) : (
                      <tr>
                        <th style={{ width: '120px' }}>TIME</th>
                        <th style={{ width: '140px' }}>MACHINE</th>
                        <th style={{ width: '100px' }}>SEVERITY</th>
                        <th style={{ width: '100px' }}>CATEGORY</th>
                        <th style={{ width: '140px' }}>TAG</th>
                        <th>MESSAGE</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {filterType === 'machines' ? (
                      events.map((machine, i) => (
                        <tr key={i}>
                          <td className="mn" style={{ color: 'var(--accent)' }}>{machine.id || machine.label || machine}</td>
                          <td>
                            <span className="badge sev-info">ACTIVE</span>
                          </td>
                        </tr>
                      ))
                    ) : filterType === 'incidents' ? (
                      <tr style={{ background: 'transparent' }}>
                        <td colSpan="6" style={{ padding: 0, border: 'none' }}>
                          {events.map((chain, i) => {
                          const col = chain.severity === 'critical' ? 'var(--critical)'
                                    : chain.severity === 'high'     ? 'var(--high)'
                                    : chain.severity === 'medium'   ? 'var(--medium)'
                                    : 'var(--low)';
                          let dur = '';
                          if (chain.start && chain.end) {
                            const ms = new Date(chain.end).getTime() - new Date(chain.start).getTime();
                            dur = ms < 60000 ? Math.round(ms/1000)+'s' : Math.round(ms/60000)+'m';
                          }
                          return (
                            <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '14px 18px', textAlign: 'left' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: col, background: `${col}22`, border: `1px solid ${col}44`, padding: '2px 10px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                  {chain.severity || 'INFO'}
                                </span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>{chain.machine}</span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                                  {formatTime(chain.start)}
                                </span>
                                {dur && (
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>&#9679; {dur}</span>
                                )}
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                                  {chain.events ? chain.events.length : 0} events
                                </span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.handlePromoteChainFromModal) {
                                      window.handlePromoteChainFromModal(chain);
                                      onClose();
                                    }
                                  }}
                                  style={{ marginLeft: 'auto', background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)', color: '#fb923c', padding: '3px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                                >
                                  Promote
                                </button>
                              </div>
                              <table className="mt" style={{ width: '100%', marginBottom: 0 }}>
                                <thead>
                                  <tr>
                                    <th>Time</th>
                                    <th>Severity</th>
                                    <th>Category</th>
                                    <th>Message</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {chain.events?.map((ev, evIdx) => (
                                    <tr key={evIdx} style={{ background: 'transparent' }}>
                                      <td className="et">{ev.ts ? formatTime(ev.ts).slice(11, 16) : ''}</td>
                                      <td>
                                        <span className={`badge sev-${ev.severity || 'info'}`}>{ev.severity || 'info'}</span>
                                      </td>
                                      <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{ev.category}</td>
                                      <td className="msg-cell" title={ev.message}>{ev.message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  ) : (
                      events.map((ev, i) => (
                        <tr key={i}>
                          <td className="et">{formatTime(ev.ts)}</td>
                          <td className="mn">{ev.machine}</td>
                          <td>
                            <span className={`badge sev-${ev.severity || 'info'}`}>
                              {(ev.severity || 'info').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase' }}>{ev.category}</td>
                          <td className="et">{ev.tag}</td>
                          <td className="msg-cell" title={ev.message}>{ev.message}</td>
                        </tr>
                      ))
                    )}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                          No {filterType === 'machines' ? 'machines' : filterType === 'incidents' ? 'incidents' : 'events'} found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              {events.length > 0 && (
                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Showing {fromEntry} to {toEntry} of {totalItems} entries
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {sizes.map(size => {
                        const btnStyle = (perPage === size) 
                          ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }
                          : { background: 'var(--surface)', color: 'var(--muted)', borderColor: 'var(--border)' };
                          
                        return (
                          <button 
                            key={size}
                            onClick={() => { setPerPage(size); setCurrentPage(1); }}
                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.2s', ...btnStyle }}
                          >
                            {size}
                          </button>
                        );
                      })}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        onClick={() => { if (currentPage > 1) { setCurrentPage(p => p - 1); } }}
                        style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1, transition: 'background 0.2s' }}
                      >
                        Prev
                      </button>
                      
                      <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                        {currentPage} / {totalPages}
                      </span>
                      
                      <button 
                        onClick={() => { if (currentPage < totalPages) { setCurrentPage(p => p + 1); } }}
                        style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1, transition: 'background 0.2s' }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
