import React, { useState, useEffect } from 'react';
import axios from 'axios';

const chipDefs = [
  { key: 'bruteForce',   label: 'Brute Force',    col: '#ef4444' },
  { key: 'loginFailed',  label: 'Login Failed',   col: '#f97316' },
  { key: 'configChange', label: 'Config Changes', col: '#3b82f6' },
  { key: 'mfa',          label: 'MFA Events',     col: '#a855f7' },
  { key: 'adminLogin',   label: 'Admin Logins',   col: '#6b7280' },
];

export default function FirewallAlerts({ from, to, device, severity, aggregator }) {
  const [data, setData] = useState({ events: [], counts: {}, loginCount: 0 });
  const [loading, setLoading] = useState(false);
  const [showLogins, setShowLogins] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [range, setRange] = useState('all');

  useEffect(() => {
    fetchAlerts();
  }, [from, to, device, severity, aggregator, showLogins, range]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/firewall/alerts', {
        params: { from, to, device, severity, aggregator, show_logins: showLogins ? '1' : '0', limit: 500 }
      });
      setData(res.data);
      setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalItems = data.events?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const pagedEvents = (data.events || []).slice((page - 1) * perPage, page * perPage);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(249,115,22,.4)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(249,115,22,.2)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(249,115,22,.06)', gap: '8px' }}>
         <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#f97316', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
           <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>gpp_maybe</span> Security Alerts
         </h3>
         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select value={range} onChange={e => setRange(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '3px 8px', borderRadius: '5px' }}>
              <option value="1">Last 1h</option>
              <option value="24">Last 24h</option>
              <option value="168">Last 7d</option>
              <option value="all">All Time</option>
            </select>
            
            <button onClick={() => setShowLogins(!showLogins)} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: 'pointer', color: 'var(--muted)', userSelect: 'none', background: 'var(--surface2)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '5px' }}>
              {showLogins ? 'Hide Admin Logins' : `Show Admin Logins (${data.loginCount || 0})`}
            </button>
            
            <button onClick={fetchAlerts} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '3px 10px', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>↻</button>
            
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{totalItems} alert{totalItems !== 1 ? 's' : ''}</span>
         </div>
      </div>
      
      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="empty" style={{ padding: '20px' }}>Loading...</div>
        ) : totalItems === 0 ? (
          <div className="empty" style={{ padding: '24px' }}>No security alerts in this window</div>
        ) : (
          <>
            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              {chipDefs.map(chip => {
                const n = data.counts[chip.key] || 0;
                if (!n) return null;
                return (
                  <div key={chip.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${chip.col}18`, border: `1px solid ${chip.col}44`, borderRadius: '6px', padding: '5px 12px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: 700, color: chip.col }}>{n}</span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{chip.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="mt">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Machine</th>
                    <th>Alert Type</th>
                    <th>Source IP</th>
                    <th>Severity</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedEvents.map((e, i) => {
                    const alertColor = e.alertType.includes('Failed') || e.alertType.includes('Deleted') || e.alertType.includes('Suspicious') ? '#ef4444' : 
                                       e.alertType.includes('Added') || e.alertType.includes('Enabled') ? '#3b82f6' : '#f97316';
                    const sevClass  = e.severity === 'critical' ? 'sev-critical'
                                    : e.severity === 'high'     ? 'sev-high'
                                    : e.severity === 'medium'   ? 'sev-medium'
                                    : 'sev-info';
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted2)' }}>{e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                        <td style={{ color: '#2563eb', fontWeight: 600 }}>{e.machine || '-'}</td>
                        <td>
                          <span style={{ background: `${alertColor}18`, border: `1px solid ${alertColor}44`, color: alertColor, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {e.alertType}
                          </span>
                        </td>
                        <td style={{ color: '#f97316', fontWeight: 600, fontFamily: 'var(--mono)' }}>{e.src_ip || 'GUI(192.168.1.x)'}</td>
                        <td><span className={`badge ${sevClass}`}>{e.severity || 'info'}</span></td>
                        <td className="msg-cell" style={{ maxWidth: '260px', wordBreak: 'break-all' }} title={e.displayMsg || e.message || e.msg || ''}>
                          {e.displayMsg || e.message || e.msg || ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginTop: 'auto' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                SHOWING {totalItems === 0 ? 0 : (page - 1) * perPage + 1} TO {Math.min(page * perPage, totalItems)} OF {totalItems} ENTRIES
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
                    disabled={page >= totalPages}
                    style={{ 
                      padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, transition: 'background 0.2s',
                      background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff',
                      boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1 
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
