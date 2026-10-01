import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getTodayStartAndEnd } from '../utils/dateUtils';

const chipDefs = [
  { key: 'bruteForce',   label: 'Brute Force',    col: '#ef4444' },
  { key: 'loginFailed',  label: 'Login Failed',   col: '#f97316' },
  { key: 'configChange', label: 'Config Changes', col: '#3b82f6' },
  { key: 'mfa',          label: 'MFA Events',     col: '#a855f7' },
  { key: 'adminLogin',   label: 'Admin Logins',   col: '#6b7280' },
];

export default function FirewallAlerts({ range: parentRange, from, to, device, severity, aggregator }) {
  const [data, setData] = useState({ events: [], counts: {}, loginCount: 0 });
  const [loading, setLoading] = useState(false);
  const [showLogins, setShowLogins] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [copied, setCopied] = useState(false);
  const [range, setRange] = useState(() => {
    return parentRange || localStorage.getItem('iochunt_firewall_alerts_range') || 'today';
  });

  useEffect(() => {
    if (parentRange) {
      setRange(parentRange);
    }
  }, [parentRange]);

  useEffect(() => {
    localStorage.setItem('iochunt_firewall_alerts_range', range);
  }, [range]);

  useEffect(() => {
    fetchAlerts();
  }, [from, to, device, severity, aggregator, showLogins, range]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedAlert) {
        setSelectedAlert(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAlert]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      let f = from;
      let t = to;
      if (range === 'today') {
        const { from: todayFrom, to: todayTo } = getTodayStartAndEnd();
        f = todayFrom;
        t = todayTo;
      } else if (range !== 'all') {
        f = new Date(Date.now() - Number(range) * 3600000).toISOString().slice(0, 19).replace('T', ' ');
      }
      const res = await axios.get('/api/firewall/alerts', {
        params: { from: f, to: t, device, severity, aggregator, show_logins: showLogins ? '1' : '0', limit: 500 }
      });
      setData(res.data);
      setPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyRaw = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalItems = data.events?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const pagedEvents = (data.events || []).slice((page - 1) * perPage, page * perPage);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(249,115,22,.4)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── SECURITY ALERT DETAILS POPUP MODAL ── */}
      {selectedAlert && (
        <div 
          onClick={() => setSelectedAlert(null)} 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.65)', 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backdropFilter: 'blur(5px)',
            padding: '20px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              background: 'var(--surface)', 
              border: '1px solid var(--border)', 
              borderRadius: '12px', 
              width: '100%', 
              maxWidth: '820px', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ 
              padding: '18px 24px', 
              borderBottom: '1px solid var(--border)', 
              background: 'linear-gradient(90deg, rgba(249,115,22,0.08) 0%, transparent 100%)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '22px', color: '#f97316' }}>gpp_maybe</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px' }}>
                    Security Alert Details
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'var(--mono)' }}>
                    ID: #{selectedAlert.id || '-'} &nbsp;|&nbsp; Log ID: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{selectedAlert.logid || '-'}</span> &nbsp;|&nbsp; {selectedAlert.machine}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ 
                  background: 'rgba(249,115,22,0.15)', 
                  border: '1px solid rgba(249,115,22,0.3)', 
                  color: '#f97316', 
                  padding: '3px 10px', 
                  borderRadius: '5px', 
                  fontSize: '11px', 
                  fontWeight: 700 
                }}>
                  {selectedAlert.alertType}
                </span>
                <span className={`badge sev-${(selectedAlert.severity || 'info').toLowerCase()}`}>
                  {(selectedAlert.severity || 'info').toUpperCase()}
                </span>
                <button 
                  onClick={() => setSelectedAlert(null)} 
                  style={{ 
                    background: 'var(--surface2)', 
                    border: '1px solid var(--border)', 
                    color: 'var(--muted)', 
                    borderRadius: '6px', 
                    cursor: 'pointer', 
                    width: '30px', 
                    height: '30px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginLeft: '4px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Structured Key-Value Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                gap: '14px',
                background: 'var(--surface2)',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Timestamp</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginTop: '4px', fontFamily: 'var(--mono)' }}>{selectedAlert.ts || '-'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Log ID (FortiGate)</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                    {selectedAlert.logid && selectedAlert.logid !== '-' ? selectedAlert.logid : '-'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Firewall Device</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>{selectedAlert.machine || '-'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Administrator / User</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#a855f7', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>person</span>
                    {selectedAlert.user && selectedAlert.user !== '-' ? selectedAlert.user : 'System / Unknown'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Interface & Source IP</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f97316', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                    {selectedAlert.ui && selectedAlert.ui !== '-' ? selectedAlert.ui : selectedAlert.src_ip}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Action</div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: selectedAlert.action === 'Add' ? '#16a34a' : selectedAlert.action === 'Delete' ? '#dc2626' : '#d97706',
                      background: selectedAlert.action === 'Add' ? 'rgba(34,197,94,0.1)' : selectedAlert.action === 'Delete' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                      border: `1px solid ${selectedAlert.action === 'Add' ? 'rgba(34,197,94,0.3)' : selectedAlert.action === 'Delete' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`
                    }}>
                      {selectedAlert.action || '-'}
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px' }}>Configuration Target</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#06b6d4', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                    {selectedAlert.cfgpath && selectedAlert.cfgpath !== '-' ? `${selectedAlert.cfgpath} ${selectedAlert.cfgobj && selectedAlert.cfgobj !== '-' ? `[#${selectedAlert.cfgobj}]` : ''}` : '-'}
                  </div>
                </div>
              </div>

              {/* Changed Attributes & Diff Section */}
              {selectedAlert.cfgattr && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', background: 'var(--surface)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>tune</span>
                    Configuration Diff / Attributes Changed
                  </div>
                  <div style={{ 
                    background: 'var(--surface2)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '6px', 
                    padding: '10px 14px', 
                    fontFamily: 'var(--mono)', 
                    fontSize: '11px', 
                    lineHeight: '1.6', 
                    color: '#38bdf8', 
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedAlert.cfgattr}
                  </div>
                </div>
              )}

              {/* Message / Description */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', background: 'var(--surface)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '6px' }}>
                  Log Description & Summary
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>
                  {selectedAlert.msg || selectedAlert.logdesc || 'No additional summary text.'}
                </div>
              </div>

              {/* Raw Syslog Payload */}
              {selectedAlert.raw && (
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)' }}>
                      Raw Syslog Message
                    </span>
                    <button 
                      onClick={() => handleCopyRaw(selectedAlert.raw)} 
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: copied ? '#22c55e' : 'var(--accent)', 
                        fontSize: '11px', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        fontWeight: 600
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      {copied ? 'Copied!' : 'Copy Raw Log'}
                    </button>
                  </div>
                  <div style={{ 
                    padding: '12px 14px', 
                    background: '#090d16', 
                    fontFamily: 'var(--mono)', 
                    fontSize: '11px', 
                    color: '#94a3b8', 
                    lineHeight: '1.5', 
                    wordBreak: 'break-all', 
                    maxHeight: '140px', 
                    overflowY: 'auto' 
                  }}>
                    {selectedAlert.raw}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button 
                onClick={() => setSelectedAlert(null)} 
                style={{ 
                  background: 'var(--surface)', 
                  border: '1px solid var(--border)', 
                  color: 'var(--text)', 
                  padding: '6px 16px', 
                  borderRadius: '6px', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(249,115,22,.2)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(249,115,22,.06)', gap: '8px' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
           <h3 style={{ fontWeight: 800, fontSize: '14px', color: '#f97316', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.2px' }}>
             <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>gpp_maybe</span> Security Alerts
           </h3>
           <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(249,115,22,0.2)' }}>
             Click any row to inspect details
           </span>
         </div>

         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select value={range} onChange={e => setRange(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '3px 8px', borderRadius: '5px' }}>
              <option value="today">Today</option>
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
              <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1200px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ width: '125px', whiteSpace: 'nowrap' }}>TIME</th>
                    <th style={{ width: '110px', whiteSpace: 'nowrap' }}>LOG ID</th>
                    <th style={{ width: '135px', whiteSpace: 'nowrap' }}>DEVICE</th>
                    <th style={{ width: '100px', whiteSpace: 'nowrap' }}>USER</th>
                    <th style={{ width: '135px', whiteSpace: 'nowrap' }}>INTERFACE / IP</th>
                    <th style={{ width: '115px', whiteSpace: 'nowrap' }}>ALERT TYPE</th>
                    <th style={{ width: '75px', whiteSpace: 'nowrap' }}>ACTION</th>
                    <th style={{ width: '140px', whiteSpace: 'nowrap' }}>TARGET / PATH</th>
                    <th style={{ width: '200px', whiteSpace: 'nowrap' }}>CHANGES / DIFF</th>
                    <th style={{ width: '80px', whiteSpace: 'nowrap' }}>SEVERITY</th>
                    <th style={{ minWidth: '180px' }}>DETAIL</th>
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

                    const isAdd = e.action === 'Add' || (e.alertType && e.alertType.includes('Added'));
                    const isDel = e.action === 'Delete' || (e.alertType && e.alertType.includes('Deleted'));
                    const isEdit = e.action === 'Edit' || (e.alertType && (e.alertType.includes('Modified') || e.alertType.includes('Changed')));
                    const isLogin = e.action === 'Login' || (e.alertType && e.alertType.includes('Login'));

                    const actionColor = isAdd ? '#16a34a' : isDel ? '#ef4444' : isEdit ? '#f59e0b' : isLogin ? '#3b82f6' : 'var(--muted)';
                    const actionBg = isAdd ? 'rgba(34,197,94,0.1)' : isDel ? 'rgba(239,68,68,0.1)' : isEdit ? 'rgba(245,158,11,0.1)' : isLogin ? 'rgba(59,130,246,0.1)' : 'rgba(107,130,160,0.1)';

                    return (
                      <tr 
                        key={i} 
                        onClick={() => setSelectedAlert(e)}
                        style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(37,99,235,0.04)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = ''}
                        title="Click to view full alert details"
                      >
                        {/* TIME */}
                        <td style={{ fontFamily: 'var(--mono)', color: 'var(--muted2)', whiteSpace: 'nowrap', fontSize: '11px' }}>
                          {e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}
                        </td>

                        {/* LOG ID */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {e.logid && e.logid !== '-' ? (
                            <span style={{ 
                              fontFamily: 'var(--mono)', 
                              fontSize: '11px', 
                              color: '#f59e0b', 
                              background: 'rgba(245,158,11,0.08)', 
                              border: '1px solid rgba(245,158,11,0.25)', 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              letterSpacing: '0.3px',
                              fontWeight: 600
                            }}>
                              {e.logid}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '11px' }}>-</span>
                          )}
                        </td>

                        {/* DEVICE */}
                        <td style={{ color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap', maxWidth: '135px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.machine || '-'}>
                          {e.machine || '-'}
                        </td>

                        {/* USER */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {e.user && e.user !== '-' ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#a855f7', fontWeight: 600 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>person</span>
                              {e.user}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>

                        {/* INTERFACE / IP */}
                        <td style={{ color: '#f97316', fontWeight: 600, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', fontSize: '11px' }}>
                          {e.ui && e.ui !== '-' ? e.ui : e.src_ip || '-'}
                        </td>

                        {/* ALERT TYPE */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ background: `${alertColor}18`, border: `1px solid ${alertColor}44`, color: alertColor, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                            {e.alertType}
                          </span>
                        </td>

                        {/* ACTION */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: actionColor,
                            background: actionBg,
                            border: `1px solid ${actionColor}30`,
                            letterSpacing: '0.5px'
                          }}>
                            {e.action || '-'}
                          </span>
                        </td>

                        {/* TARGET / PATH */}
                        <td style={{ color: '#06b6d4', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                          {e.cfgpath && e.cfgpath !== '-' ? (
                            <span>{e.cfgpath} {e.cfgobj && e.cfgobj !== '-' ? <b style={{ color: '#38bdf8' }}>#{e.cfgobj}</b> : ''}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>

                        {/* CHANGES / DIFF */}
                        <td style={{ fontSize: '11px', color: 'var(--muted2)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.cfgattr || '-'}>
                          {e.cfgattr ? (
                            <span style={{ color: '#38bdf8', fontFamily: 'var(--mono)' }}>{e.cfgattr}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>-</span>
                          )}
                        </td>

                        {/* SEVERITY */}
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className={`badge ${sevClass}`}>{e.severity || 'info'}</span>
                        </td>

                        {/* DETAIL */}
                        <td className="msg-cell" style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.4', color: 'var(--text)' }} title={e.displayMsg || e.msg || ''}>
                          {e.msg || e.displayMsg || '-'}
                        </td>
                      </tr>
                    );
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
