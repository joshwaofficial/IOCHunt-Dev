import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
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

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role;
  const queryClient = useQueryClient();
  
  const [newNote, setNewNote] = useState("");
  const [closingTargetStatus, setClosingTargetStatus] = useState(null);
  const [resReason, setResReason] = useState("");
  const [resNote, setResNote] = useState("");
  
  // Containment Playbook State
  const [showContainModal, setShowContainModal] = useState(false);
  const [containIsolateHost, setContainIsolateHost] = useState(true);
  const [containKilledProcesses, setContainKilledProcesses] = useState({});
  const [containLockedUsers, setContainLockedUsers] = useState({});
  const [containNote, setContainNote] = useState("");
  
  const notesContainerRef = useRef(null);

  const { data: incident, isLoading, error } = useQuery({
    queryKey: ['incidentDetail', id],
    queryFn: async () => {
      const res = await axios.get(`/api/incidents/${id}`);
      return res.data;
    }
  });

  const { data: assignableData } = useQuery({
    queryKey: ['assignableUsers'],
    queryFn: async () => {
      const res = await axios.get('/api/users/assignable');
      return res.data;
    }
  });
  const allowedAssignees = assignableData?.users || [];

  const updateAssigneeMutation = useMutation({
    mutationFn: (newAssignee) => axios.patch(`/api/incidents/${id}`, { assigned_to: newAssignee }),
    onSuccess: () => {
      queryClient.invalidateQueries(['incidentDetail', id]);
      toast.success('Assignee updated');
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({newStatus, reason, note, containment_actions, containment_note}) => 
      axios.patch(`/api/incidents/${id}`, { 
        status: newStatus, 
        resolution_reason: reason, 
        resolution_note: note,
        containment_actions,
        containment_note
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['incidentDetail', id]);
      toast.success('Status updated');
    }
  });

  const addNoteMutation = useMutation({
    mutationFn: (body) => axios.post(`/api/incidents/${id}/notes`, { body }),
    onSuccess: () => {
      setNewNote('');
      queryClient.invalidateQueries(['incidentDetail', id]);
      toast.success('Note added');
    }
  });

  // Extract entities (Blast Radius) from events
  const entities = useMemo(() => {
    if (!incident || !incident.events) return { users: [], machines: [], processes: [] };
    const users = new Set();
    const machines = new Set();
    const processes = new Set();
    
    incident.events.forEach(e => {
      if (e.machine) machines.add(e.machine);
      
      const msg = e.message || '';
      // Very basic extraction for Windows Event logs typically found in IOC Hunt
      const userMatch = msg.match(/User:([^\s|]+)/i);
      if (userMatch && userMatch[1] !== 'N/A') users.add(userMatch[1]);
      
      const parentMatch = msg.match(/Parent:([^\s|]+)/i);
      if (parentMatch) processes.add(parentMatch[1]);
    });
    
    return {
      users: Array.from(users),
      machines: Array.from(machines),
      processes: Array.from(processes)
    };
  }, [incident]);

  useEffect(() => {
    if (entities.processes?.length > 0) {
      const pMap = {};
      entities.processes.forEach(p => { pMap[p] = true; });
      setContainKilledProcesses(pMap);
    }
    if (entities.users?.length > 0) {
      const uMap = {};
      entities.users.forEach(u => { uMap[u] = true; });
      setContainLockedUsers(uMap);
    }
  }, [entities]);

  useEffect(() => {
    if (notesContainerRef.current) {
      notesContainerRef.current.scrollTop = notesContainerRef.current.scrollHeight;
    }
  }, [incident?.notes]);

  const handleConfirmContainment = () => {
    const actions = [];
    if (containIsolateHost) {
      actions.push(`Isolate Host (${incident?.machine || 'Affected Machine'})`);
    }
    Object.entries(containKilledProcesses).forEach(([proc, isSelected]) => {
      if (isSelected) actions.push(`Terminate Process (${proc})`);
    });
    Object.entries(containLockedUsers).forEach(([usr, isSelected]) => {
      if (isSelected) actions.push(`Lock User Account (${usr})`);
    });

    updateStatusMutation.mutate({
      newStatus: 'contained',
      containment_actions: actions,
      containment_note: containNote.trim() || undefined
    });
    setShowContainModal(false);
  };

  if (isLoading) return <div style={{ padding: '40px', color: 'var(--muted)' }}>Loading incident...</div>;
  if (error || !incident) return <div style={{ padding: '40px', color: '#ef4444' }}>Error loading incident details.</div>;

  const sm = INC_STATUS_META[incident.status?.toLowerCase()] || INC_STATUS_META.new;
  const pm = INC_PRIORITY_META[incident.priority] || INC_PRIORITY_META.P2;
  const isOpen = !['resolved','closed'].includes(incident.status?.toLowerCase());
  const isContained = ['contained', 'resolved', 'closed'].includes(incident.status?.toLowerCase());
  
  // Incident Action buttons logic (Restored to previous)
  const canTransition = (isOpen && (role === 'ADMIN' || incident.assigned_to === user?.username)) || (!isOpen && (role === 'ADMIN' || role === 'L3_ANALYST'));
  
  // Assignee Dropdown logic (Global for Admin and L3)
  const canReassign = role === 'ADMIN' || role === 'L3_ANALYST' || (isOpen && incident.assigned_to === user?.username);

  const age = Math.floor((Date.now()/1000) - incident.created_at);
  const ageStr = age < 3600 ? Math.floor(age/60)+'m'
             : age < 86400 ? Math.floor(age/3600)+'h'
             : Math.floor(age/86400)+'d';

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      <button 
        onClick={() => navigate('/incidents')}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '13px', cursor: 'pointer', marginBottom: '24px', fontWeight: 600, transition: 'color 0.2s' }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        Back to Incidents
      </button>

      {/* Two Column Layout Container */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        
        {/* ==============================================================
            LEFT COLUMN: INVESTIGATION HUB
        ============================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Active Containment Alert Banner */}
          {incident.status?.toLowerCase() === 'contained' && (
            <div style={{
              background: 'rgba(234, 179, 8, 0.08)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '10px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              boxShadow: '0 4px 16px rgba(234, 179, 8, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(234,179,8,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#eab308' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>shield</span>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#eab308', letterSpacing: '0.5px' }}>INCIDENT ACTIVELY CONTAINED</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>Threat propagation halted and endpoint quarantined. Ready for root-cause resolution.</div>
                </div>
              </div>
              <span style={{ background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#eab308', fontSize: '11px', fontWeight: 800, padding: '6px 12px', borderRadius: '6px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                SHIELD ACTIVE 🛡️
              </span>
            </div>
          )}

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '30px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            {/* Header meta */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <span style={{ background: `${pm.col}1a`, color: pm.col, border: `1px solid ${pm.col}33`, fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {pm.label}
              </span>
              <span style={{ background: `${sm.col}1a`, color: sm.col, border: `1px solid ${sm.col}33`, fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {sm.label}
              </span>
            </div>

            {/* Title */}
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginBottom: '16px', lineHeight: 1.3, letterSpacing: '-0.5px' }}>
              {incident.title}
            </div>

            {/* Description */}
            {incident.description && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, fontFamily: 'var(--sans)', whiteSpace: 'pre-wrap' }}>
                {incident.description}
              </div>
            )}
          </div>

          {/* Blast Radius / Entities */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: isContained ? '#eab308' : '#8b5cf6' }}>
                  {isContained ? 'shield' : 'radar'}
                </span> 
                Entities Involved (Blast Radius)
              </div>
              {isContained && (
                <span style={{ fontSize: '10px', color: '#eab308', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                  CONTAINMENT ACTIVE
                </span>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {/* Users */}
              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: '8px', border: isContained ? '1px solid rgba(234,179,8,0.25)' : '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: '12px', letterSpacing: '1px' }}>Compromised Users</div>
                {entities.users.length > 0 ? entities.users.map(u => (
                  <div key={u} style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    background: isContained ? 'rgba(234,179,8,0.1)' : 'rgba(59,130,246,0.1)', 
                    border: `1px solid ${isContained ? 'rgba(234,179,8,0.35)' : 'rgba(59,130,246,0.3)'}`, 
                    color: isContained ? '#facc15' : '#60a5fa', 
                    padding: '5px 10px', 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontFamily: 'var(--mono)', 
                    marginRight: '6px', 
                    marginBottom: '6px' 
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{isContained ? 'lock' : 'person'}</span>
                    {u}
                    {isContained && <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(234,179,8,0.25)', padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.5px' }}>LOCKED</span>}
                  </div>
                )) : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No users extracted.</div>}
              </div>

              {/* Machines */}
              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: '8px', border: isContained ? '1px solid rgba(234,179,8,0.25)' : '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: '12px', letterSpacing: '1px' }}>Affected Machines</div>
                {entities.machines.length > 0 ? entities.machines.map(m => (
                  <div key={m} style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    background: isContained ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.1)', 
                    border: `1px solid ${isContained ? 'rgba(234,179,8,0.4)' : 'rgba(34,197,94,0.3)'}`, 
                    color: isContained ? '#facc15' : '#4ade80', 
                    padding: '5px 10px', 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontFamily: 'var(--mono)', 
                    marginRight: '6px', 
                    marginBottom: '6px' 
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{isContained ? 'shield' : 'computer'}</span>
                    {m}
                    {isContained && <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(234,179,8,0.25)', padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.5px' }}>QUARANTINED</span>}
                  </div>
                )) : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No machines found.</div>}
              </div>

              {/* Processes */}
              <div style={{ background: 'var(--surface2)', padding: '16px', borderRadius: '8px', border: isContained ? '1px solid rgba(234,179,8,0.25)' : '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: '12px', letterSpacing: '1px' }}>Suspicious Processes</div>
                {entities.processes.length > 0 ? entities.processes.map(p => (
                  <div key={p} style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    background: isContained ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)', 
                    border: `1px solid ${isContained ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.3)'}`, 
                    color: isContained ? '#f87171' : '#fb923c', 
                    padding: '5px 10px', 
                    borderRadius: '6px', 
                    fontSize: '11px', 
                    fontFamily: 'var(--mono)', 
                    marginRight: '6px', 
                    marginBottom: '6px' 
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{isContained ? 'cancel' : 'memory'}</span>
                    {p}
                    {isContained && <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(239,68,68,0.25)', padding: '2px 5px', borderRadius: '3px', letterSpacing: '0.5px' }}>TERMINATED</span>}
                  </div>
                )) : <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No processes found.</div>}
              </div>
            </div>
          </div>

          {/* Linked events */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>list_alt</span> Linked Events <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>{incident.events?.length || 0}</span>
            </div>
            {incident.events?.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      <th style={{ width: '20%', padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                      <th style={{ width: '20%', padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                      <th style={{ width: '15%', padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Sev</th>
                      <th style={{ width: '45%', padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incident.events.map(e => {
                      const sev = (e.severity||'info').toLowerCase();
                      const col = sevColor[sev] || sevColor.info;
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                            {e.ts ? new Date(e.ts + (!e.ts.endsWith('Z') && !e.ts.includes('+') ? 'Z' : '')).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{e.machine}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', background: `${col}22`, color: col, border: `1px solid ${col}44`, textTransform: 'uppercase' }}>{e.severity}</span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--muted)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)' }}>{e.message}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--muted)', padding: '24px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>No events linked yet.</div>
            )}
          </div>
        </div>

        {/* ==============================================================
            RIGHT COLUMN: CASE MANAGEMENT (ACTIONS, METADATA, NOTES)
        ============================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'sticky', top: '24px' }}>
          
          {/* Action Hub - Moved to very top of right column as requested */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>bolt</span> Incident Actions
            </div>

            {/* Status transition buttons */}
            {canTransition && INC_TRANSITIONS[incident.status?.toLowerCase()] ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {INC_TRANSITIONS[incident.status?.toLowerCase()].map(ns => {
                  const tm = INC_STATUS_META[ns];
                  const isReopen = ['resolved', 'closed'].includes(incident.status?.toLowerCase()) && ns === 'investigating';
                  const label = isReopen ? 'Reopen Incident' : `Mark as ${tm.label}`;
                  
                  return (
                    <button 
                      key={ns}
                      onClick={() => {
                        if (ns === 'contained') {
                          setShowContainModal(true);
                        } else if (ns === 'closed' || ns === 'resolved') {
                          setClosingTargetStatus(ns);
                        } else {
                          updateStatusMutation.mutate({newStatus: ns});
                        }
                      }}
                      disabled={updateStatusMutation.isPending}
                      style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `${tm.col}1a`, border: `1px solid ${tm.col}44`, color: tm.col, padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                      onMouseOver={e => { e.currentTarget.style.background = `${tm.col}33`; e.currentTarget.style.boxShadow = `0 0 10px ${tm.col}33`; }}
                      onMouseOut={e => { e.currentTarget.style.background = `${tm.col}1a`; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <span>{label}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{isReopen ? 'replay' : 'arrow_forward'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--surface2)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                No actions available.
              </div>
            )}
          </div>

          {/* Containment Playbook Action Modal */}
          {showContainModal && (
            <div style={{ 
              background: 'var(--surface)', 
              border: '1px solid rgba(234, 179, 8, 0.4)',
              borderLeft: '4px solid #eab308', 
              borderRadius: '12px', 
              padding: '20px', 
              boxShadow: '0 12px 36px rgba(0,0,0,0.15)'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#eab308', marginBottom: '14px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--sans)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>shield</span>
                Execute Containment Playbook
              </div>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
                Select remediation measures to actively halt threat spread on the endpoint:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                {/* Host Isolation Checkbox */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: 'var(--surface2)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <input 
                    type="checkbox" 
                    checked={containIsolateHost} 
                    onChange={e => setContainIsolateHost(e.target.checked)} 
                    style={{ marginTop: '2px', accentColor: '#eab308', cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>🛡️ Isolate Endpoint Network</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Quarantine host <strong>{incident.machine || 'affected machine'}</strong> from corporate network.</div>
                  </div>
                </label>

                {/* Kill Processes Checkboxes */}
                {entities.processes.length > 0 && (
                  <div style={{ background: 'var(--surface2)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ Terminate Suspicious Processes</div>
                    {entities.processes.map(proc => (
                      <label key={proc} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        <input 
                          type="checkbox" 
                          checked={!!containKilledProcesses[proc]} 
                          onChange={e => setContainKilledProcesses({ ...containKilledProcesses, [proc]: e.target.checked })} 
                          style={{ accentColor: '#f97316', cursor: 'pointer' }}
                        />
                        <span>Kill <strong>{proc}</strong></span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Lock Accounts Checkboxes */}
                {entities.users.length > 0 && (
                  <div style={{ background: 'var(--surface2)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🔒 Lock Compromised Accounts</div>
                    {entities.users.map(usr => (
                      <label key={usr} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px', fontSize: '12px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                        <input 
                          type="checkbox" 
                          checked={!!containLockedUsers[usr]} 
                          onChange={e => setContainLockedUsers({ ...containLockedUsers, [usr]: e.target.checked })} 
                          style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                        />
                        <span>Disable User <strong>{usr}</strong></span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Containment Note */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>Containment Action Note</label>
                  <textarea 
                    className="input-field" 
                    value={containNote} 
                    onChange={e => setContainNote(e.target.value)} 
                    rows="2" 
                    style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 14px', borderRadius: '6px', resize: 'vertical', outline: 'none', fontSize: '12px', fontFamily: 'var(--sans)' }} 
                    placeholder="e.g., Host isolated from LAN, process terminated."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button onClick={() => setShowContainModal(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}>Cancel</button>
                <button 
                  onClick={handleConfirmContainment}
                  disabled={updateStatusMutation.isPending}
                  style={{ background: '#eab308', border: 'none', color: '#000', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s', boxShadow: '0 2px 10px rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>shield</span>
                  Execute Containment
                </button>
              </div>
            </div>
          )}

          {/* Confirmation panel for resolving/closing */}
          {closingTargetStatus && (
            <div style={{ 
              background: 'var(--surface)', 
              border: '1px solid var(--border)',
              borderLeft: closingTargetStatus === 'resolved' ? '4px solid #22c55e' : '4px solid #4a5578', 
              borderRadius: '12px', 
              padding: '20px', 
              boxShadow: '0 8px 30px rgba(0,0,0,0.05)'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: closingTargetStatus === 'resolved' ? '#22c55e' : 'var(--text)', marginBottom: '16px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    {closingTargetStatus === 'resolved' ? 'check_circle' : 'lock'}
                </span>
                Confirm {closingTargetStatus}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Resolution Reason</label>
                    <select className="input-field" value={resReason} onChange={e => setResReason(e.target.value)} style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 14px', borderRadius: '6px', outline: 'none', fontSize: '14px' }}>
                      <option value="">Select a reason...</option>
                      <option value="False Positive">False Positive</option>
                      <option value="True Positive - Remediated">True Positive - Remediated</option>
                      <option value="Duplicate">Duplicate</option>
                      <option value="Other">Other (Specify in note)</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Resolution Note (Optional)</label>
                    <textarea className="input-field" value={resNote} onChange={e => setResNote(e.target.value)} rows="2" style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 14px', borderRadius: '6px', resize: 'vertical', outline: 'none', fontSize: '14px' }} placeholder="Add context..."></textarea>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button onClick={() => setClosingTargetStatus(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}>Cancel</button>
                <button 
                  onClick={() => { updateStatusMutation.mutate({newStatus: closingTargetStatus, reason: resReason, note: resNote}); setClosingTargetStatus(null); }}
                  disabled={!resReason || updateStatusMutation.isPending}
                  style={{ background: closingTargetStatus === 'resolved' ? '#22c55e' : '#4a5578', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '6px', cursor: !resReason ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: !resReason ? 0.5 : 1, transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Key details & Metadata */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>info</span> Properties
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '12px', fontFamily: 'var(--mono)' }}>
              <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Machine</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{incident.machine || '—'}</span></div>
              
              <div>
                <span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Assigned</span>
                {canReassign ? (
                  <select
                    value={incident.assigned_to || ''}
                    onChange={(e) => updateAssigneeMutation.mutate(e.target.value)}
                    disabled={updateAssigneeMutation.isPending}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', fontSize: '11px', borderRadius: '4px', outline: 'none', width: '100%', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--sans)' }}
                  >
                    <option value="">Unassigned</option>
                    {allowedAssignees.map(u => (
                      <option key={u.username} value={u.username}>{u.username}</option>
                    ))}
                  </select>
                ) : (
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{incident.assigned_to || 'Unassigned'}</span>
                )}
              </div>

              <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Created</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(incident.created_at * 1000).toLocaleString()}</span></div>
              <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Created by</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{incident.created_by || 'system'}</span></div>
              <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Updated</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{new Date(incident.updated_at * 1000).toLocaleString()}</span></div>
              <div><span style={{ color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '10px', display: 'block', marginBottom: '4px' }}>Age</span> <span style={{ color: 'var(--text)', fontWeight: 600 }}>{ageStr}</span></div>
            </div>
          </div>

          {/* Timeline / notes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent)' }}>forum</span> Notes & Activity <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>{incident.notes?.length || 0}</span>
            </div>
            
            <div ref={notesContainerRef} style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '8px', marginBottom: '20px' }}>
              {incident.notes?.length > 0 ? (
                <div style={{ borderLeft: '2px solid var(--border)', marginLeft: '12px', paddingLeft: '24px' }}>
                  {incident.notes.map(n => {
                    const isSystem = n.note_type === 'system';
                    return (
                      <div key={n.id} style={{ position: 'relative', marginBottom: '24px' }}>
                        <div style={{ position: 'absolute', left: '-31px', top: '6px', width: '12px', height: '12px', borderRadius: '50%', background: isSystem ? 'var(--surface2)' : 'var(--accent)', border: '2px solid var(--surface)', boxShadow: `0 0 0 2px ${isSystem ? 'var(--border)' : 'rgba(37,99,235,0.3)'}` }}></div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          <span style={{ color: isSystem ? 'var(--text)' : 'var(--accent)', fontWeight: 700 }}>{n.author}</span> &nbsp;·&nbsp; {new Date(n.created_at * 1000).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ')}
                        </div>
                        <div style={{ background: isSystem ? 'var(--surface2)' : 'rgba(37,99,235,0.05)', border: `1px solid ${isSystem ? 'var(--border)' : 'rgba(37,99,235,0.2)'}`, padding: '12px 16px', borderRadius: '0 8px 8px 8px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, fontFamily: 'var(--sans)', fontStyle: isSystem ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>
                          {n.body}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>No notes yet.</div>
              )}
            </div>

            {/* Add note */}
            <div style={{ paddingTop: '20px', borderTop: '1px dashed var(--border)' }}>
              <textarea 
                rows="3" 
                className="input-field"
                placeholder="Add a new note..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '13px', padding: '12px 16px', borderRadius: '8px', resize: 'vertical', lineHeight: 1.6, marginBottom: '16px', outline: 'none', transition: 'border-color 0.2s' }}
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
      </div>
    </div>
  );
}
