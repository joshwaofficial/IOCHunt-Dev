import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import NewIncidentModal from "../components/incidents/NewIncidentModal";
import { useAuth } from "../context/AuthContext";

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

export default function Incidents() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [showNewModal, setShowNewModal] = useState(false);
  const [prefillChain, setPrefillChain] = useState(null);
  
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  
  const queryClient = useQueryClient();
  const { user } = useAuth();

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

  const { data: summaryData } = useQuery({
    queryKey: ['incidentsSummary'],
    queryFn: async () => {
      const res = await axios.get('/api/incidents/summary');
      return res.data;
    },
    refetchInterval: 15000
  });

  const handleRowClick = (id) => {
    navigate(`/incidents/${id}`);
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Incident Management</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Track, assign, and resolve security incidents and ongoing investigations.</p>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Open', val: summaryData.open || 0, icon: 'warning', col: '#eab308' },
            { label: 'P1 Open', val: summaryData.p1Open || 0, icon: 'error', col: '#ef4444' },
            { label: 'New', val: summaryData.byStatus?.find(s => s.status === 'new')?.n || 0, icon: 'fiber_new', col: '#6b7280' },
            { label: 'Investigating', val: summaryData.byStatus?.find(s => s.status === 'investigating')?.n || 0, icon: 'search', col: '#f97316' },
            { label: 'Contained', val: summaryData.byStatus?.find(s => s.status === 'contained')?.n || 0, icon: 'shield', col: '#eab308' },
            { label: 'Resolved', val: (parseInt(summaryData.byStatus?.find(s => s.status === 'resolved')?.n || 0, 10)) + (parseInt(summaryData.byStatus?.find(s => s.status === 'closed')?.n || 0, 10)), icon: 'check_circle', col: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', position: 'relative', overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
              <div style={{ position: 'absolute', top: '-10px', right: '-10px', opacity: 0.05, transform: 'scale(3)' }}>
                <span className="material-symbols-outlined" style={{ color: s.col }}>{s.icon}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <span className="material-symbols-outlined" style={{ color: s.col, fontSize: '20px', background: `${s.col}1a`, padding: '6px', borderRadius: '8px' }}>{s.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ color: s.col }}>●</span> Active
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <button 
          style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px', boxShadow: '0 4px 12px rgba(37,99,235,0.2)' }} 
          onClick={() => setShowNewModal(true)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          New Incident
        </button>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>Status:</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', fontSize: '12px', borderRadius: '6px', outline: 'none' }}>
              <option value="">All Statuses</option>
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="contained">Contained</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>Priority:</span>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', fontSize: '12px', borderRadius: '6px', outline: 'none' }}>
              <option value="">All Priorities</option>
              <option value="P1">P1 Critical</option>
              <option value="P2">P2 High</option>
              <option value="P3">P3 Medium</option>
              <option value="P4">P4 Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflowX: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
        {isLoading ? (
          <div style={{ padding: '40px', color: 'var(--muted)', textAlign: 'center' }}>Loading incidents...</div>
        ) : data?.incidents?.length === 0 ? (
          <div style={{ padding: '40px', color: 'var(--muted)', textAlign: 'center' }}>No incidents match your criteria.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>ID</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Priority</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Machine</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', width: '30%' }}>Title / Description</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Assigned To</th>
                <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.incidents.map(inc => {
                const sm2 = INC_STATUS_META[inc.status?.toLowerCase()] || INC_STATUS_META.new;
                const pm  = INC_PRIORITY_META[inc.priority] || INC_PRIORITY_META.P2;
                
                return (
                  <tr 
                    key={inc.id}
                    onClick={() => handleRowClick(inc.id)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text)' }}>
                      #{inc.id}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ background: pm.bg, color: pm.col, border: `1px solid ${pm.col}44`, fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {pm.label}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ background: sm2.bg, color: sm2.col, fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '4px', textTransform: 'uppercase' }}>
                        {sm2.label}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                      {inc.machine || '—'}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)', marginBottom: '4px' }}>
                        {inc.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                        {inc.description || 'No description provided.'}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '12px', color: inc.assigned_to ? 'var(--text)' : 'var(--muted)' }}>
                      {inc.assigned_to || 'Unassigned'}
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--muted)' }}>
                      {new Date(inc.created_at * 1000).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            navigate(`/incidents/${id}`);
          }}
        />
      )}
    </div>
  );
}
