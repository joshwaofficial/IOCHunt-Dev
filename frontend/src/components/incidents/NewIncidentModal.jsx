import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { useFilter } from '../../context/FilterContext';
import { useAuth } from '../../context/AuthContext';

export default function NewIncidentModal({ onClose, onCreated, prefillChain }) {
  const { range, machine } = useFilter();
  const [activeTab, setActiveTab] = useState(prefillChain ? 'manual' : 'manual');
  const [title, setTitle] = useState(prefillChain ? `Incident on ${prefillChain.machine}` : '');
  const [priority, setPriority] = useState(prefillChain ? (prefillChain.severity === 'critical' ? 'P1' : 'P2') : 'P2');
  const [assignee, setAssignee] = useState('');
  const [affectedMachine, setAffectedMachine] = useState(prefillChain ? prefillChain.machine : '');
  const [description, setDescription] = useState(prefillChain ? `${prefillChain.events?.length} correlated events.\nFirst event: ${prefillChain.events?.[0]?.message}` : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [expandedChainId, setExpandedChainId] = useState(null);
  const [showMachineSuggestions, setShowMachineSuggestions] = useState(false);
  const [incidentType, setIncidentType] = useState('Custom');

  const TEMPLATES = {
    'Phishing Attack': 'Sender Email: \nTargeted User: \nMalicious URL/Attachment Name: \nWas link clicked? (Y/N): \nMitigation taken: ',
    'Malware / Ransomware': 'Infected Machine: \nMalware Family (if known): \nInitial Vector: \nHas host been isolated? (Y/N): \nMitigation taken: ',
    'Unauthorized Access': 'Compromised Account: \nSource IP: \nTarget System: \nPrivilege Escalation? (Y/N): \nMitigation taken: ',
    'Lateral Movement': 'Source Machine: \nTarget Machine: \nMethod (e.g. RDP, SMB): \nCompromised Account: \nMitigation taken: '
  };

  const handleTypeChange = (e) => {
    const type = e.target.value;
    setIncidentType(type);
    if (type !== 'Custom') {
      setDescription(TEMPLATES[type] || '');
    }
  };

  // For promoting a chain
  const [selectedChainId, setSelectedChainId] = useState(prefillChain ? prefillChain.id : null);
  const [eventIds, setEventIds] = useState(prefillChain ? prefillChain.events?.map(e => e.id) || [] : []);

  const { user } = useAuth();
  
  // Fetch users for assignee dropdown
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axios.get('/api/users');
      return res.data;
    }
  });

  const usersList = usersData?.users || [];
  const role = user?.role;
  const allowedAssignees = usersList.filter(u => {
    if (role === 'ADMIN') return true;
    if (role === 'L3_ANALYST') return u.role === 'L3_ANALYST' || u.role === 'L2_ANALYST';
    if (role === 'L2_ANALYST') return u.role === 'L2_ANALYST' || u.role === 'L3_ANALYST';
    if (role === 'L1_ANALYST') return u.role === 'L2_ANALYST';
    return false;
  });

  // Fetch clients for autocomplete
  const { data: clientsData } = useQuery({
    queryKey: ['clients_autocomplete'],
    queryFn: async () => {
      const res = await axios.get('/api/events/clients', { params: { hours: 720 } });
      return res.data.clients || [];
    }
  });


  // Fetch chains from stats for global filter context
  const { data: stats } = useQuery({
    queryKey: ['stats_for_chains', range, machine],
    queryFn: async () => {
      const res = await axios.get(`/api/events/stats?range=${range}&machine=${machine}`);
      return res.data;
    }
  });

  const chains = stats?.chains || [];
  const handlePromoteClick = (chain, e) => {
    e.stopPropagation(); // Prevent expanding the row if clicking promote directly
    setActiveTab('manual');
    setSelectedChainId(chain.id);
    setEventIds(chain.events.map(ev => ev.id));
    setTitle(`Incident on ${chain.machine}`);
    setPriority(chain.severity === 'critical' ? 'P1' : 'P2');
    setAffectedMachine(chain.machine);
    setDescription(`${chain.events.length} correlated events.\nFirst event: ${chain.events[0]?.message}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title) {
      setError('Title is required.');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await axios.post('/api/incidents', {
        title,
        priority,
        assigned_to: assignee || null,
        machine: affectedMachine,
        description,
        source_chain_id: selectedChainId,
        event_ids: eventIds
      });
      if (res.data.ok) {
        onCreated(res.data.id);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div className="modal-dialog" style={{ width: '100%', maxWidth: '900px', background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)', overflow: 'hidden' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_alert</span>
            </div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '0.5px' }}>NEW INCIDENT</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '6px', transition: 'all 0.2s' }} onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text)'; }} onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)'; }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button
            style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700, border: 'none', borderBottom: activeTab === 'manual' ? '2px solid #3b82f6' : '2px solid transparent', background: activeTab === 'manual' ? 'rgba(59,130,246,0.1)' : 'transparent', color: activeTab === 'manual' ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setActiveTab('manual')}
          >
            Manual Creation
          </button>
          <button
            style={{ flex: 1, padding: '12px', fontSize: '13px', fontWeight: 700, border: 'none', borderBottom: activeTab === 'chains' ? '2px solid #3b82f6' : '2px solid transparent', background: activeTab === 'chains' ? 'rgba(59,130,246,0.1)' : 'transparent', color: activeTab === 'chains' ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setActiveTab('chains')}
          >
            Promote from Chain ({chains.length})
          </button>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '60vh' }}>
          {activeTab === 'manual' && (
            <form id="newIncForm" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>


              {selectedChainId && (
                <div style={{ background: 'rgba(167,139,250,.08)', border: '1px solid rgba(167,139,250,.3)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--purple)', fontSize: '18px' }}>auto_awesome</span>
                  <div style={{ color: 'var(--purple)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--mono)' }}>
                    Promoted from correlated chain ({eventIds.length} events linked automatically)
                  </div>
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(240,79,90,.08)', border: '1px solid rgba(240,79,90,.3)', borderRadius: '8px', padding: '12px 16px', color: 'var(--critical)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Title *</label>
                <input
                  autoFocus
                  type="text"
                  className="input-field"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Suspected DCSync on DC01"
                  style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', outline: 'none', transition: 'all 0.2s', fontFamily: 'var(--sans)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>Priority</label>
                    <div className="tooltip-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'help' }} onMouseEnter={e => e.currentTarget.lastChild.style.display = 'block'} onMouseLeave={e => e.currentTarget.lastChild.style.display = 'none'}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--muted)' }}>info</span>
                      <div style={{ display: 'none', position: 'absolute', top: '100%', left: '0', transform: 'none', marginTop: '8px', background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', width: '280px', boxShadow: 'var(--shadow-md)', zIndex: 50 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '8px' }}><strong style={{ color: '#ef4444' }}>P1 - Critical:</strong> Active breach, data exfil, ransomware.</div>
                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '8px' }}><strong style={{ color: '#f97316' }}>P2 - High:</strong> Malware contained, credential theft suspected.</div>
                        <div style={{ fontSize: '11px', color: 'var(--text)', marginBottom: '8px' }}><strong style={{ color: '#f5c518' }}>P3 - Medium:</strong> Suspicious login, unauthorized USB.</div>
                        <div style={{ fontSize: '11px', color: 'var(--text)' }}><strong style={{ color: '#64748b' }}>P4 - Low:</strong> Policy violation, adware.</div>
                      </div>
                    </div>
                  </div>
                  <select
                    className="input-field"
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', outline: 'none', transition: 'all 0.2s', fontFamily: 'var(--sans)', appearance: 'none', cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <option value="P1" style={{ background: 'var(--surface)', color: 'var(--text)' }}>P1 — Critical</option>
                    <option value="P2" style={{ background: 'var(--surface)', color: 'var(--text)' }}>P2 — High</option>
                    <option value="P3" style={{ background: 'var(--surface)', color: 'var(--text)' }}>P3 — Medium</option>
                    <option value="P4" style={{ background: 'var(--surface)', color: 'var(--text)' }}>P4 — Low</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Assigned To</label>
                  <select
                    className="input-field"
                    value={assignee}
                    onChange={e => setAssignee(e.target.value)}
                    style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', outline: 'none', transition: 'all 0.2s', fontFamily: 'var(--sans)', appearance: 'none', cursor: 'pointer' }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <option value="" style={{ background: 'var(--surface)', color: 'var(--text)' }}>Unassigned</option>
                    {allowedAssignees.map(u => (
                      <option key={u.id} value={u.username} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                        {`${u.username} (${u.role})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>Affected Machine</label>
                  {(() => {
                    const matchedClient = clientsData?.find(c => (c.label || '').toLowerCase() === (affectedMachine || '').toLowerCase());
                    if (matchedClient) {
                      const isOffline = matchedClient.status === 'Offline';
                      const badgeColor = isOffline ? '#ef4444' : '#22c55e';
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface2)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--text)' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: badgeColor, display: 'inline-block' }}></span>
                          {matchedClient.status}
                          <span style={{ color: 'var(--muted)' }}>|</span>
                          {matchedClient.riskLabel} Risk
                          {matchedClient.total_recent > 0 && (
                            <>
                              <span style={{ color: 'var(--muted)' }}>|</span>
                              <span style={{ color: '#f5c518' }}>⚠️ {matchedClient.total_recent} Active Alerts</span>
                            </>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <input
                  type="text"
                  className="input-field"
                  value={affectedMachine}
                  onChange={e => {
                    setAffectedMachine(e.target.value);
                    setShowMachineSuggestions(true);
                  }}
                  placeholder="e.g. DC01"
                  style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', outline: 'none', transition: 'all 0.2s', fontFamily: 'var(--sans)' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)'; setShowMachineSuggestions(true); }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; setTimeout(() => setShowMachineSuggestions(false), 200); }}
                />
                
                {showMachineSuggestions && clientsData && clientsData.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                    {clientsData
                      .filter(c => (c.label || '').toLowerCase().includes((affectedMachine || '').toLowerCase()))
                      .map(c => (
                        <div 
                          key={c.id}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => {
                            setAffectedMachine(c.label);
                            setShowMachineSuggestions(false);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.label}</span>
                            {c.ip && <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>{c.ip}</span>}
                          </div>
                        </div>
                      ))}
                    {clientsData.filter(c => (c.label || '').toLowerCase().includes((affectedMachine || '').toLowerCase())).length === 0 && (
                      <div style={{ padding: '12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>No matching machines found.</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '0.8px', textTransform: 'uppercase', fontWeight: 700 }}>Description</label>
                  <select
                    value={incidentType}
                    onChange={handleTypeChange}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '2px 8px', fontSize: '10px', outline: 'none', cursor: 'pointer', fontFamily: 'var(--sans)' }}
                  >
                    <option value="Custom" style={{ background: 'var(--surface-solid)' }}>Custom Template</option>
                    <option value="Phishing Attack" style={{ background: 'var(--surface-solid)' }}>Phishing Attack</option>
                    <option value="Malware / Ransomware" style={{ background: 'var(--surface-solid)' }}>Malware / Ransomware</option>
                    <option value="Unauthorized Access" style={{ background: 'var(--surface-solid)' }}>Unauthorized Access</option>
                    <option value="Lateral Movement" style={{ background: 'var(--surface-solid)' }}>Lateral Movement</option>
                  </select>
                </div>
                <textarea
                  rows={5}
                  className="input-field"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? Initial indicators, scope, context..."
                  style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', outline: 'none', transition: 'all 0.2s', fontFamily: 'var(--sans)', resize: 'vertical', lineHeight: 1.6 }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </form>
          )}

          {activeTab === 'chains' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {chains.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                  <div style={{ marginBottom: '8px' }}><span className="material-symbols-outlined" style={{ fontSize: '24px' }}>check_circle</span></div>
                  <div>No correlated chains detected in the selected time range.</div>
                </div>
              ) : (
                chains.map(chain => {
                  const isExpanded = expandedChainId === chain.id;
                  return (
                    <div key={chain.id} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>

                      {/* Chain Header - Click to expand */}
                      <div
                        onClick={() => setExpandedChainId(isExpanded ? null : chain.id)}
                        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '16px', cursor: 'pointer', transition: 'background 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', background: chain.severity === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)', color: chain.severity === 'critical' ? '#ef4444' : '#f97316', border: `1px solid ${chain.severity === 'critical' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'}` }}>
                              {chain.severity}
                            </span>
                            <span style={{ fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--mono)', fontSize: '13px' }}>{chain.machine}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                            {new Date(chain.start).toLocaleString()} • {chain.events.length} events
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px' }}>
                            {chain.events[0]?.message}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button
                            onClick={(e) => handlePromoteClick(chain, e)}
                            style={{ padding: '8px 16px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseOver={e => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.1)'; e.currentTarget.style.color = '#60a5fa'; }}
                          >
                            Promote
                          </button>
                          <span className="material-symbols-outlined" style={{ color: 'var(--muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            expand_more
                          </span>
                        </div>
                      </div>

                      {/* Expanded Events List */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface2)', padding: '0', maxHeight: '300px', overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 1 }}>
                              <tr>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Time</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Severity</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Message</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chain.events.map((ev, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                  <td style={{ padding: '8px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                    {ev.ts ? new Date(ev.ts + (!ev.ts.endsWith('Z') && !ev.ts.includes('+') ? 'Z' : '')).toISOString().slice(11, 19) : ''}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <span style={{ color: ev.severity === 'critical' ? '#ef4444' : ev.severity === 'high' ? '#f97316' : ev.severity === 'medium' ? '#f5c518' : '#22d47a', textTransform: 'uppercase', fontSize: '9px', fontWeight: 700 }}>
                                      {ev.severity || 'info'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 12px', color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                                    {ev.message}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--text)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--muted)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}
          >
            Cancel
          </button>
          {activeTab === 'manual' && (
            <button
              type="submit"
              form="newIncForm"
              disabled={isSubmitting}
              style={{ padding: '10px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: '#fff', background: 'var(--accent)', border: '1px solid var(--accent)', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.7 : 1, transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
              onMouseOver={e => { if (!isSubmitting) e.currentTarget.style.background = '#1d4ed8'; }}
              onMouseOut={e => { if (!isSubmitting) e.currentTarget.style.background = 'var(--accent)'; }}
            >
              {isSubmitting ? 'Creating...' : 'Create Incident'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
