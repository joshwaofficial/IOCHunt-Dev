import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import NewIncidentModal from "../components/incidents/NewIncidentModal";
import { useAuth } from "../context/AuthContext";
import AssignDropdown from "../components/AssignDropdown";
import { toast } from "react-hot-toast";

const INC_STATUS_META = {
  new:           { label:'New',           col:'#6b7280', bg:'rgba(107,114,128,.15)' },
  investigating: { label:'Investigating', col:'#f97316', bg:'rgba(249,115,22,.15)'  },
  contained:     { label:'Contained',     col:'#eab308', bg:'rgba(234,179,8,.15)'   },
  resolved:      { label:'Resolved',      col:'#22c55e', bg:'rgba(34,197,94,.15)'   },
  closed:        { label:'Closed',        col:'#4a5578', bg:'rgba(74,85,120,.15)'   },
};

const INC_PRIORITY_META = {
  P1: { label:'P1 Critical', col:'#ef4444', bg:'rgba(239,68,68,.15)'    },
  P2: { label:'P2 High',     col:'#f97316', bg:'rgba(249,115,22,.15)'   },
  P3: { label:'P3 Medium',   col:'#eab308', bg:'rgba(234,179,8,.15)'    },
  P4: { label:'P4 Low',      col:'#22c55e', bg:'rgba(34,197,94,.15)'    },
};

const INC_TRANSITIONS = {
  new:           ['investigating'],
  investigating: ['contained', 'resolved'],
  contained:     ['investigating', 'resolved'],
  resolved:      ['closed', 'investigating'],
  closed:        ['investigating'],
};

const sevColor = {
  critical: '#f04f5a',
  high: '#f97316',
  medium: '#f5c518',
  low: '#22d47a',
  info: '#4f8ef7'
};

function IncidentDetailPanel({ incidentId, onClose, onUpdated, initialClosingTarget }) {
  React.useEffect(() => { if (initialClosingTarget) setClosingTargetStatus(initialClosingTarget); }, [initialClosingTarget]);
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [closingTargetStatus, setClosingTargetStatus] = useState(null);
  const [resReason, setResReason] = useState("");
  const [resNote, setResNote] = useState("");

  const { data: incident, isLoading, error } = useQuery({
    queryKey: ['incidentDetail', incidentId],
    queryFn: async () => {
      const res = await axios.get(`/api/incidents/${incidentId}`);
      return res.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({newStatus, reason, note}) => axios.patch(`/api/incidents/${incidentId}`, { status: newStatus, resolution_reason: reason, resolution_note: note }),
    onSuccess: () => {
      queryClient.invalidateQueries(['incidentDetail', incidentId]);
      onUpdated();
    }
  });

  const addNoteMutation = useMutation({
    mutationFn: (body) => axios.post(`/api/incidents/${incidentId}/notes`, { body }),
    onSuccess: () => {
      setNewNote('');
      queryClient.invalidateQueries(['incidentDetail', incidentId]);
      onUpdated();
    }
  });

  if (isLoading) return <div className="empty" style={{ padding: '24px' }}>Loading...</div>;
  if (error || !incident) return <div className="empty" style={{ padding: '24px' }}>Error loading incident details.</div>;

  const sm = INC_STATUS_META[incident.status?.toLowerCase()] || INC_STATUS_META.new;
  const pm = INC_PRIORITY_META[incident.priority] || INC_PRIORITY_META.P2;
  const isOpen = !['resolved','closed'].includes(incident.status?.toLowerCase());
  const canTransition = (isOpen && (role === 'ADMIN' || incident.assigned_to === user?.username)) || (!isOpen && (role === 'ADMIN' || role === 'L3_ANALYST'));

  const age = Math.floor((Date.now()/1000) - incident.created_at);
  const ageStr = age < 3600 ? Math.floor(age/60)+'m'
             : age < 86400 ? Math.floor(age/3600)+'h'
             : Math.floor(age/86400)+'d';

  return (
    <div style={{ padding: '24px 30px', position: 'relative' }}>
      <button 
        onClick={onClose} 
        style={{ position: 'absolute', top: '24px', right: '30px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 700, fontFamily: 'var(--mono)', transition: 'all 0.2s' }}
        onMouseOver={e => e.target.style.borderColor = 'var(--muted)'}
        onMouseOut={e => e.target.style.borderColor = 'var(--border)'}
      >
        MINIMIZE
      </button>

      {/* Header meta */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <span style={{ background: `${pm.col}1a`, color: pm.col, border: `1px solid ${pm.col}33`, fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {pm.label}
        </span>
        <span style={{ background: `${sm.col}1a`, color: sm.col, border: `1px solid ${sm.col}33`, fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {sm.label}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)', marginBottom: '12px', lineHeight: 1.3, letterSpacing: '-0.5px' }}>
        {incident.title}
      </div>

      {/* Description */}
      {incident.description && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, fontFamily: 'var(--sans)', whiteSpace: 'pre-wrap' }}>
          {incident.description}
        </div>
      )}

      {/* Key details row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Machine:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{incident.machine || '—'}</span></div>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Assigned:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{incident.assigned_to || 'Unassigned'}</span></div>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Created:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{new Date(incident.created_at * 1000).toLocaleString()}</span></div>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Created by:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{incident.created_by || 'system'}</span></div>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Updated:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{new Date(incident.updated_at * 1000).toLocaleString()}</span></div>
        <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px' }}>Age:</span> <span style={{ color: 'var(--text)', fontWeight: 600, marginLeft: '6px' }}>{ageStr}</span></div>
      </div>

      {/* Status transition buttons */}
      {canTransition && INC_TRANSITIONS[incident.status?.toLowerCase()] && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px', padding: '12px 16px', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', fontWeight: 700, marginRight: '4px' }}>Change Status:</span>
          {INC_TRANSITIONS[incident.status?.toLowerCase()].map(ns => {
            const tm = INC_STATUS_META[ns];
            return (
              <button 
                key={ns}
                onClick={() => {
                  if (ns === 'closed' || ns === 'resolved') {
                    setClosingTargetStatus(ns);
                  } else {
                    updateStatusMutation.mutate({newStatus: ns});
                  }
                }}
                disabled={updateStatusMutation.isPending}
                style={{ background: `${tm.col}1a`, border: `1px solid ${tm.col}44`, color: tm.col, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                onMouseOver={e => { e.target.style.background = `${tm.col}33`; e.target.style.boxShadow = `0 0 10px ${tm.col}33`; }}
                onMouseOut={e => { e.target.style.background = `${tm.col}1a`; e.target.style.boxShadow = 'none'; }}
              >
                → {tm.label}
              </button>
            );
          })}
        </div>
      )}
      {closingTargetStatus && (
        <div style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--border)',
          borderLeft: closingTargetStatus === 'resolved' ? '4px solid #22c55e' : '4px solid #4a5578', 
          borderRadius: '8px', 
          padding: '20px 24px', 
          marginBottom: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: closingTargetStatus === 'resolved' ? '#22c55e' : 'var(--text)', marginBottom: '20px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {closingTargetStatus === 'resolved' ? 'check_circle' : 'lock'}
             </span>
             Confirm {closingTargetStatus}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '20px' }}>
             <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Resolution Reason</label>
                <select className="input-field" value={resReason} onChange={e => setResReason(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 14px', borderRadius: '6px', outline: 'none', fontSize: '13px' }}>
                  <option value="">Select a reason...</option>
                  <option value="False Positive">False Positive</option>
                  <option value="True Positive - Remediated">True Positive - Remediated</option>
                  <option value="Duplicate">Duplicate</option>
                  <option value="Other">Other (Specify in note)</option>
                </select>
             </div>
             <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Resolution Note (Optional)</label>
                <textarea className="input-field" value={resNote} onChange={e => setResNote(e.target.value)} rows="2" style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 14px', borderRadius: '6px', resize: 'vertical', outline: 'none', fontSize: '13px' }} placeholder="Add context..."></textarea>
             </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button onClick={() => setClosingTargetStatus(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}>Cancel</button>
            <button 
              onClick={() => { updateStatusMutation.mutate({newStatus: closingTargetStatus, reason: resReason, note: resNote}); setClosingTargetStatus(null); }}
              disabled={!resReason || updateStatusMutation.isPending}
              style={{ background: closingTargetStatus === 'resolved' ? '#22c55e' : '#4a5578', border: 'none', color: '#fff', padding: '8px 24px', borderRadius: '6px', cursor: !resReason ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: !resReason ? 0.5 : 1, transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
            >
              Confirm {closingTargetStatus}
            </button>
          </div>
        </div>
      )}

      {/* Linked events */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent)' }}>link</span> Linked Events <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>{incident.events?.length || 0}</span>
        </div>
        {incident.events?.length > 0 ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  <th style={{ width: '20%', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                  <th style={{ width: '20%', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                  <th style={{ width: '15%', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Sev</th>
                  <th style={{ width: '45%', padding: '10px 14px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {incident.events.map(e => {
                  const sev = (e.severity||'info').toLowerCase();
                  const col = sevColor[sev] || sevColor.info;
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                      <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>{e.machine}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', background: `${col}22`, color: col, border: `1px solid ${col}44`, textTransform: 'uppercase' }}>{e.severity}</span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--muted)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)' }}>{e.message}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '16px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>No events linked yet.</div>
        )}
      </div>

      {/* Timeline / notes */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--accent)' }}>forum</span> Timeline & Notes <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px' }}>{incident.notes?.length || 0}</span>
        </div>
        
        {incident.notes?.length > 0 && (
          <div style={{ borderLeft: '2px solid var(--border)', marginLeft: '14px', paddingLeft: '24px' }}>
            {incident.notes.map(n => {
              const isSystem = n.note_type === 'system';
              return (
                <div key={n.id} style={{ position: 'relative', marginBottom: '20px' }}>
                  <div style={{ position: 'absolute', left: '-31px', top: '6px', width: '12px', height: '12px', borderRadius: '50%', background: isSystem ? 'var(--surface2)' : 'var(--accent)', border: '2px solid var(--surface)', boxShadow: `0 0 0 2px ${isSystem ? 'var(--border)' : 'rgba(37,99,235,0.3)'}` }}></div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    <span style={{ color: isSystem ? 'var(--text)' : 'var(--accent)', fontWeight: 700 }}>{n.author}</span> &nbsp;·&nbsp; {new Date(n.created_at * 1000).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ')}
                  </div>
                  <div style={{ background: isSystem ? 'var(--surface2)' : 'rgba(37,99,235,0.05)', border: `1px solid ${isSystem ? 'var(--border)' : 'rgba(37,99,235,0.2)'}`, padding: '12px 16px', borderRadius: '0 8px 8px 8px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.6, fontFamily: 'var(--sans)', fontStyle: isSystem ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>
                    {n.body}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add note */}
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed var(--border)' }}>
          <textarea 
            rows="3" 
            className="input-field"
            placeholder="Add a new note or update..."
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '13px', padding: '12px 16px', borderRadius: '8px', resize: 'vertical', lineHeight: 1.6, marginBottom: '12px', outline: 'none', transition: 'border-color 0.2s' }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => addNoteMutation.mutate(newNote)}
              disabled={addNoteMutation.isPending || !newNote.trim()}
              style={{ background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', padding: '8px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '1px', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', transition: 'background 0.2s', opacity: (addNoteMutation.isPending || !newNote.trim()) ? 0.5 : 1 }}
              onMouseOver={e => e.target.style.background = '#1d4ed8'}
              onMouseOut={e => e.target.style.background = 'var(--accent)'}
            >
              Add Note
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

import { useLocation, useNavigate } from "react-router-dom";

export default function Incidents() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [prefillChain, setPrefillChain] = useState(null);
  
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [closingTargetFromRow, setClosingTargetFromRow] = useState(null);
  
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await axios.get('/api/users/assignable');
      return res.data;
    }
  });
  const usersList = usersData?.users || [];
  
  const role = user?.role;
  const allowedAssignees = usersList.filter(u => {
    if (role === 'ADMIN' || role === 'AGGREGATOR_ADMIN') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
    if (role === 'L3_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
    if (role === 'L2_ANALYST') return ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST'].includes(u.role);
    if (role === 'L1_ANALYST') return u.role === 'L2_ANALYST';
    return false;
  });

  // Check for navigation state indicating we should open the modal
  React.useEffect(() => {
    if (location.state?.action === 'openNewModal') {
      setShowNewModal(true);
      if (location.state?.prefillChain) {
        setPrefillChain(location.state.prefillChain);
      }
      // Clear the state so a refresh doesn't pop the modal again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['incidents', filterStatus, filterPriority],
    queryFn: async () => {
      const res = await axios.get('/api/incidents', {
        params: { status: filterStatus, priority: filterPriority }
      });
      return res.data;
    }
  });

  const { data: summary } = useQuery({
    queryKey: ['incidentsSummary'],
    queryFn: async () => {
      const res = await axios.get('/api/incidents/summary');
      return res.data;
    }
  });

  const quickUpdateMutation = useMutation({
    mutationFn: ({ id, status, reason, note }) => axios.patch(`/api/incidents/${id}`, { status, resolution_reason: reason, resolution_note: note }),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries(['incidentsSummary']);
    }
  });

  const smCounts = {};
  (summary?.byStatus || []).forEach(r => smCounts[r.status] = r.n);

  const stats = [
    { k:'open',          n: summary?.open||0,          l:'Open',          col:'#f97316', i:'warning', colorClass: 'high' },
    { k:'p1',            n: summary?.p1Open||0,        l:'P1 Open',       col:'#ef4444', i:'error', colorClass: 'critical' },
    { k:'new',           n: smCounts.new||0,           l:'New',           col:'#6b7280', i:'new_releases', colorClass: 'info' },
    { k:'investigating', n: smCounts.investigating||0, l:'Investigating', col:'#f97316', i:'search', colorClass: 'high' },
    { k:'contained',     n: smCounts.contained||0,     l:'Contained',     col:'#eab308', i:'security', colorClass: 'medium' },
    { k:'resolved',      n: smCounts.resolved||0,      l:'Resolved',      col:'#22c55e', i:'check_circle', colorClass: 'low' }
  ];

  const handleRowClick = (id) => {
    setExpandedId(expandedId === id ? null : id);
    setClosingTargetFromRow(null);
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Incident Management</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Track, assign, and resolve security incidents and ongoing investigations.</p>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {stats.map(s => (
          <div key={s.k} className={`sc ${s.colorClass}`} style={{ cursor: 'default', margin: 0 }}>
            <div className="sc-top">
              <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{s.i}</span></div>
              <div className="sc-title">{s.l}</div>
            </div>
            <div>
              <div className="sn">{s.n}</div>
              <div className="sc-sub"><div className="sc-pulse"></div> Active</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter + actions bar */}
      <div className="tf-bar" style={{ justifyContent: 'flex-end', marginBottom: '24px' }}>
        <button onClick={() => setShowNewModal(true)} style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', transition: 'all 0.2s', marginRight: 'auto' }}>
          + New Incident
        </button>
        
        <label style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Status:</label>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none' }}>
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="contained">Contained</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        
        <label style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginLeft: '8px' }}>Priority:</label>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none' }}>
          <option value="">All Priorities</option>
          <option value="P1">P1 — Critical</option>
          <option value="P2">P2 — High</option>
          <option value="P3">P3 — Medium</option>
          <option value="P4">P4 — Low</option>
        </select>
      </div>

      {/* Incident list */}
      <div>
        {isLoading ? (
          <div className="empty">Loading...</div>
        ) : !data?.incidents?.length ? (
          <div className="empty">
            {filterStatus || filterPriority ? 'No incidents match this filter' : 'No incidents yet'}
          </div>
        ) : (
          data.incidents.map(inc => {
            const sm2 = INC_STATUS_META[inc.status?.toLowerCase()] || INC_STATUS_META.new;
            const pm  = INC_PRIORITY_META[inc.priority] || INC_PRIORITY_META.P2;
            const isOpen = !['resolved','closed'].includes(inc.status?.toLowerCase());
            
            const age = Math.floor((Date.now()/1000) - inc.created_at);
            const ageStr = age < 3600  ? Math.floor(age/60)+'m ago'
                         : age < 86400 ? Math.floor(age/3600)+'h ago'
                         : Math.floor(age/86400)+'d ago';

            const isExpanded = expandedId === inc.id;
            const assigneeUser = usersList.find(u => u.username === inc.assigned_to);
            const assigneeRole = assigneeUser?.role;

            return (
              <div key={inc.id} style={{ marginBottom: '12px' }}>
                <div 
                  onClick={() => handleRowClick(inc.id)}
                  style={{ 
                    cursor: 'pointer', 
                    background: 'var(--surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: isExpanded ? '8px 8px 0 0' : '8px', 
                    borderBottom: isExpanded ? '1px dashed var(--border)' : '1px solid var(--border)',
                    position: 'relative', 
                    overflow: 'hidden', 
                    padding: '16px 20px', 
                    transition: 'all 0.2s',
                    borderColor: isExpanded ? 'var(--border)' : undefined
                  }}
                  onMouseOver={e => { if(!isExpanded) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                  onMouseOut={e => { if(!isExpanded) e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: pm.col }}></div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>#{inc.id}</span>
                        <span style={{ background: pm.bg, color: pm.col, border: `1px solid ${pm.col}44`, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                          {pm.label}
                        </span>
                        <span style={{ background: sm2.bg, color: sm2.col, fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                          {sm2.label}
                        </span>
                        {inc.machine && (
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }}>{inc.machine}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{inc.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                        <span>Created {ageStr}</span>
                        <div style={{display:'flex', alignItems:'center'}}>
                          <span>Assigned: {inc.assigned_to || 'Unassigned'}</span>
                        </div>
                        <span>{inc.note_count || 0} note{inc.note_count !== 1 ? 's' : ''}</span>
                        <span>{inc.event_count || 0} event{inc.event_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', flexShrink: 0 }}>
                      {allowedAssignees.length > 0 && 
                       (role === 'ADMIN' || role === 'L3_ANALYST' || !inc.assigned_to || inc.assigned_to === user?.username) && 
                       inc.status?.toLowerCase() !== 'closed' && inc.status?.toLowerCase() !== 'resolved' && (
                        <div onClick={e => e.stopPropagation()}>
                          <AssignDropdown
                            incidentId={inc.id}
                            currentAssignee={inc.assigned_to}
                            allowedAssignees={allowedAssignees}
                            onSuccess={() => { refetch(); queryClient.invalidateQueries(['incidentsSummary']); }}
                            showDisplayName={true}
                          />
                        </div>
                      )}
                      {(() => {
                        const canRowTransition = (isOpen && (role === 'ADMIN' || inc.assigned_to === user?.username)) || (!isOpen && (role === 'ADMIN' || role === 'L3_ANALYST'));
                        if (canRowTransition && INC_TRANSITIONS[inc.status?.toLowerCase()]) {
                          return INC_TRANSITIONS[inc.status?.toLowerCase()].map(ns => {
                            const tm = INC_STATUS_META[ns];
                            return (
                              <button 
                                key={ns}
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  if (ns === 'closed' || ns === 'resolved') {
                                    setClosingTargetFromRow(ns);
                                    setExpandedId(inc.id);
                                  } else {
                                    quickUpdateMutation.mutate({ id: inc.id, status: ns }); 
                                  }
                                }}
                                disabled={quickUpdateMutation.isPending}
                                style={{ background: tm.bg, border: `1px solid ${tm.col}44`, color: tm.col, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)', transition: 'all 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.background = `${tm.col}22`}
                                onMouseOut={e => e.currentTarget.style.background = tm.bg}
                              >
                                → {(ns === 'investigating' && (inc.status?.toLowerCase() === 'closed' || inc.status?.toLowerCase() === 'resolved')) ? 'Reopen' : tm.label}
                              </button>
                            );
                          });
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden', position: 'relative' }}>
                    <IncidentDetailPanel 
                      incidentId={inc.id} 
                      initialClosingTarget={isExpanded && closingTargetFromRow ? closingTargetFromRow : null}
                      onClose={() => { setExpandedId(null); setClosingTargetFromRow(null); }}
                      onUpdated={() => {
                        refetch();
                        queryClient.invalidateQueries(['incidentsSummary']);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showNewModal && (
        <NewIncidentModal 
          prefillChain={prefillChain}
          onClose={() => {
            setShowNewModal(false);
            setPrefillChain(null);
          }}
          onCreated={(id) => {
            setShowNewModal(false);
            setPrefillChain(null);
            refetch();
            queryClient.invalidateQueries(['incidentsSummary']);
            setExpandedId(id);
          }}
        />
      )}
    </div>
  );
}
