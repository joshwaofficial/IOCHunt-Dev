import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const formatLocalTime = (val) => {
  if (!val) return '—';
  const num = Number(val);
  const d = !isNaN(num) && num > 0
    ? new Date(num > 1e11 ? num : num * 1000)
    : new Date(val);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AgentKeys() {
  const { user } = useAuth();
  const isAdmin = user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('superadmin');

  // Keys & Stats
  const [keys, setKeys] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, revoked: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination (matching Clients.jsx)
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [generateLabel, setGenerateLabel] = useState('');
  const [generating, setGenerating] = useState(false);

  // One-time reveal modal
  const [newlyCreatedKeys, setNewlyCreatedKeys] = useState([]);
  const [showRevealModal, setShowRevealModal] = useState(false);

  // Confirm modal for Revoke / Reset / Delete
  const [actionTarget, setActionTarget] = useState(null); // { type: 'revoke'|'reset'|'delete', key: item }
  const [actionLoading, setActionLoading] = useState(false);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/agent-keys', {
        params: {
          status: statusFilter,
          search: search,
          limit: 500
        }
      });
      setKeys(res.data.keys || []);
      if (res.data.stats) {
        setStats(res.data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch agent keys:', err);
      toast.error(err.response?.data?.error || 'Failed to load agent keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
    setCurrentPage(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchKeys();
    setCurrentPage(1);
  };

  // Bulk Generation
  const handleGenerate = async () => {
    const count = parseInt(generateCount, 10);
    if (!count || count < 1 || count > 1000) {
      toast.error('Please enter a count between 1 and 1000');
      return;
    }

    try {
      setGenerating(true);
      const res = await axios.post('/api/agent-keys/generate', {
        count,
        label: generateLabel
      });

      setShowGenerateModal(false);
      setNewlyCreatedKeys(res.data.keys || []);
      setShowRevealModal(true);
      setGenerateLabel('');
      toast.success(`Generated ${res.data.count} keys in milliseconds!`);
      fetchKeys();
    } catch (err) {
      console.error('Key generation failed:', err);
      toast.error(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // Copy Plaintext Keys to Clipboard
  const handleCopyAll = () => {
    const text = newlyCreatedKeys.map(k => k.key).join('\n');
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${newlyCreatedKeys.length} keys to clipboard!`);
  };

  // Download CSV of Plaintext Keys - ONE single key column for zero confusion
  const handleDownloadCsv = () => {
    const headers = 'Agent_API_Key,Status,Label,CreatedAt\n';
    const rows = newlyCreatedKeys.map(k =>
      `"${k.key}","${k.status}","${k.label || ''}","${formatLocalTime(k.createdAt)}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `iochunt_agent_keys_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded Agent Keys CSV (Single Key Column)');
  };

  // Export Current Filtered Table (Key Identifiers)
  const handleExportTableCsv = () => {
    const headers = 'Key_Identifier,Status,Bound_Machine,Label,CreatedAt,ActivatedAt\n';
    const rows = keys.map(k =>
      `"${k.key_prefix}","${k.status}","${k.bound_machine || 'Unassigned'}","${k.label || ''}","${formatLocalTime(k.created_at)}","${formatLocalTime(k.activated_at)}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `iochunt_keys_fleet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Exported fleet key identifiers to CSV');
  };

  // Confirm Action
  const executeAction = async () => {
    if (!actionTarget) return;
    const { type, key } = actionTarget;

    try {
      setActionLoading(true);
      if (type === 'revoke') {
        await axios.post(`/api/agent-keys/${key.id}/revoke`);
        toast.success(`Key ${key.key_prefix} revoked immediately`);
      } else if (type === 'reset') {
        await axios.post(`/api/agent-keys/${key.id}/reset`);
        toast.success(`Key ${key.key_prefix} reset to pending (machine unbound)`);
      } else if (type === 'delete') {
        await axios.delete(`/api/agent-keys/${key.id}`);
        toast.success(`Key ${key.key_prefix} permanently deleted`);
      }
      setActionTarget(null);
      fetchKeys();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${type} key`);
    } finally {
      setActionLoading(false);
    }
  };

  const copyPrefix = (prefix) => {
    navigator.clipboard.writeText(prefix);
    toast.success(`Copied ${prefix} to clipboard`);
  };

  // Premium Metric Card Component (matching Clients.jsx)
  const MetricCard = ({ value, label, color, icon, subtitle }) => {
    return (
      <div 
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>
            Agent Key Management
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>
            Provision unique machine-bound credentials. Enforces Zero-Trust identity on agent endpoints.
          </p>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={handleExportTableCsv}
              disabled={keys.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
              Export Fleet CSV
            </button>

            <button
              onClick={() => setShowGenerateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '8px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_circle</span>
              Generate Keys
            </button>
          </div>
        )}
      </div>

      {/* ── Metric Cards (Exact match to Clients.jsx) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <MetricCard value={stats.total} label="Total Keys" color="#3b82f6" icon="vpn_key" subtitle="Allocated fleet quota" />
        <MetricCard value={stats.active} label="Active & Bound" color="#22c55e" icon="check_circle" subtitle="Locked to endpoint" />
        <MetricCard value={stats.pending} label="Pending Enrollment" color="#f59e0b" icon="pending" subtitle="Ready for installation" />
        <MetricCard value={stats.revoked} label="Revoked" color="#ef4444" icon="block" subtitle="Access deactivated" />
      </div>

      {/* ── Filter & Search Toolbar (Exact match to Clients.jsx) ── */}
      <div style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '8px', 
        padding: '14px 20px', 
        display: 'flex', 
        flexWrap: 'nowrap', 
        alignItems: 'center', 
        gap: '12px', 
        marginBottom: '20px', 
        justifyContent: 'space-between', 
        overflowX: 'auto' 
      }}>
        <div className="tb-search-wrap" style={{ flex: 1, minWidth: '160px' }}>
          <span className="material-symbols-outlined tb-search-icon">search</span>
          <input 
            type="text" 
            className="tb-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search key prefix, machine, label..." 
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Status:</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={() => setStatusFilter('active')} 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '4px', 
                background: 'rgba(34,197,94,0.1)', 
                color: '#22c55e', 
                border: '1px solid rgba(34,197,94,0.25)', 
                fontSize: '10px', 
                fontWeight: 700, 
                fontFamily: 'var(--mono)', 
                cursor: 'pointer', 
                transition: 'all .2s', 
                opacity: statusFilter === 'all' || statusFilter === 'active' ? 1 : 0.4 
              }}
            >
              ACTIVE
            </button>
            <button 
              onClick={() => setStatusFilter('pending')} 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '4px', 
                background: 'rgba(245,158,11,0.1)', 
                color: '#f59e0b', 
                border: '1px solid rgba(245,158,11,0.25)', 
                fontSize: '10px', 
                fontWeight: 700, 
                fontFamily: 'var(--mono)', 
                cursor: 'pointer', 
                transition: 'all .2s', 
                opacity: statusFilter === 'all' || statusFilter === 'pending' ? 1 : 0.4 
              }}
            >
              PENDING
            </button>
            <button 
              onClick={() => setStatusFilter('revoked')} 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '4px', 
                background: 'rgba(239,68,68,0.1)', 
                color: '#ef4444', 
                border: '1px solid rgba(239,68,68,0.25)', 
                fontSize: '10px', 
                fontWeight: 700, 
                fontFamily: 'var(--mono)', 
                cursor: 'pointer', 
                transition: 'all .2s', 
                opacity: statusFilter === 'all' || statusFilter === 'revoked' ? 1 : 0.4 
              }}
            >
              REVOKED
            </button>
            <button 
              onClick={() => setStatusFilter('all')} 
              style={{ 
                padding: '4px 10px', 
                borderRadius: '4px', 
                background: statusFilter === 'all' ? '#2563eb' : 'transparent', 
                color: statusFilter === 'all' ? '#fff' : 'var(--text)', 
                border: '1px solid ' + (statusFilter === 'all' ? '#2563eb' : 'var(--border)'), 
                fontSize: '10px', 
                fontWeight: 700, 
                fontFamily: 'var(--mono)', 
                cursor: 'pointer', 
                transition: 'all .2s' 
              }}
            >
              ALL
            </button>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>

        <button
          onClick={fetchKeys}
          title="Refresh"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '6px 10px',
            color: 'var(--text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
        </button>
      </div>

      {/* ── Security Architecture Banner ── */}
      <div style={{ 
        background: 'rgba(37, 99, 235, 0.05)', 
        border: '1px solid rgba(37, 99, 235, 0.15)', 
        borderRadius: '8px', 
        padding: '12px 18px', 
        marginBottom: '16px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px' 
      }}>
        <span className="material-symbols-outlined" style={{ color: '#2563eb', fontSize: '22px', flexShrink: 0 }}>
          verified_user
        </span>
        <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
          <strong>Zero-Trust Credential Security:</strong> Plaintext secret keys (e.g. <code>BmHyVFDWUO1tUkiOC5gvbw</code>) are displayed <em>only once</em> when generated and stored in your downloaded CSV. The central server never stores plaintext keys—only SHA-256 hashes. The table below displays public <strong>Key IDs (masked prefixes)</strong> for fleet administration and status tracking only.
        </div>
      </div>

      {/* ── Table Container (Exact match to Clients.jsx) ── */}
      {(() => {
        const filteredKeys = keys.filter(k => {
          if (!search) return true;
          const term = search.toLowerCase();
          return (
            (k.key_prefix && k.key_prefix.toLowerCase().includes(term)) ||
            (k.bound_machine && k.bound_machine.toLowerCase().includes(term)) ||
            (k.label && k.label.toLowerCase().includes(term))
          );
        });

        const total = filteredKeys.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const startIdx = (currentPage - 1) * perPage;
        const paginatedKeys = filteredKeys.slice(startIdx, startIdx + perPage);

        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>vpn_key</span>
                <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>
                  Agent Keys Directory
                </h2>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                Showing {total} keys
              </span>
            </div>

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                Loading agent keys...
              </div>
            ) : total === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '36px', color: 'var(--muted)', marginBottom: '8px' }}>
                  vpn_key_off
                </span>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)', fontSize: '13px' }}>No agent keys registered</p>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {search ? 'Try adjusting your search query or status filter.' : 'Click "Generate Keys" above to provision a batch for your endpoints.'}
                </p>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: 'rgba(37,99,235,0.03)' }}>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>KEY IDENTIFIER</th>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>STATUS</th>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>BOUND MACHINE</th>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>LABEL / NOTES</th>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>PROVISIONED</th>
                        <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>ACTIVATED</th>
                        {isAdmin && <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'right' }}>ACTIONS</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedKeys.map((k) => {
                        const isActive = k.status === 'active';
                        const isPending = k.status === 'pending';
                        const isRevoked = k.status === 'revoked';

                        const statusCol = isActive ? '#22c55e' : isPending ? '#f59e0b' : '#ef4444';

                        return (
                          <tr 
                            key={k.id} 
                            className="hover-row" 
                            style={{ borderBottom: '1px solid var(--border)' }}
                          >
                            {/* Key Identifier */}
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <code style={{ 
                                  background: 'var(--surface2)', 
                                  border: '1px solid var(--border)', 
                                  color: '#2563eb', 
                                  padding: '3px 8px', 
                                  borderRadius: '4px', 
                                  fontFamily: 'var(--mono)', 
                                  fontSize: '11px',
                                  fontWeight: 700
                                }}>
                                  {k.key_prefix}••••••••
                                </code>
                                <span style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: 'var(--muted)',
                                  background: 'var(--surface2)',
                                  border: '1px solid var(--border)',
                                  padding: '2px 5px',
                                  borderRadius: '3px',
                                  textTransform: 'uppercase',
                                  fontFamily: 'var(--mono)'
                                }}>
                                  ID ONLY
                                </span>
                              </div>
                            </td>

                            {/* Status */}
                            <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                              <span style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: statusCol, 
                                display: 'inline-block', 
                                marginRight: '8px', 
                                verticalAlign: 'middle', 
                                boxShadow: `0 0 6px ${statusCol}88` 
                              }}></span>
                              <span style={{ 
                                fontSize: '10px', 
                                fontWeight: 700, 
                                color: statusCol, 
                                fontFamily: 'var(--mono)', 
                                textTransform: 'uppercase' 
                              }}>
                                {k.status}
                              </span>
                            </td>

                            {/* Bound Machine */}
                            <td style={{ padding: '12px 16px' }}>
                              {k.bound_machine ? (
                                <div style={{ fontFamily: 'var(--sans)', fontWeight: 600, fontSize: '12px', color: 'var(--accent)' }}>
                                  {k.bound_machine}
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'var(--mono)' }}>
                                  Unassigned
                                </div>
                              )}
                            </td>

                            {/* Label / Notes */}
                            <td style={{ padding: '12px 16px', color: 'var(--text)', fontSize: '12px' }}>
                              {k.label || <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>

                            {/* Created At */}
                            <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                              {formatLocalTime(k.created_at)}
                            </td>

                            {/* Activated At */}
                            <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                              {formatLocalTime(k.activated_at)}
                            </td>

                            {/* Actions */}
                            {isAdmin && (
                              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  {isActive && (
                                    <button
                                      onClick={() => setActionTarget({ type: 'revoke', key: k })}
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.25)',
                                        color: '#ef4444',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        fontFamily: 'var(--mono)',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      REVOKE
                                    </button>
                                  )}

                                  {isActive && (
                                    <button
                                      onClick={() => setActionTarget({ type: 'reset', key: k })}
                                      style={{
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        border: '1px solid rgba(245, 158, 11, 0.25)',
                                        color: '#f59e0b',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        fontFamily: 'var(--mono)',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      RESET
                                    </button>
                                  )}

                                  {(isRevoked || isPending) && (
                                    <button
                                      onClick={() => setActionTarget({ type: 'delete', key: k })}
                                      style={{
                                        background: 'var(--surface2)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--muted)',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        fontFamily: 'var(--mono)',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      DELETE
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls matching Clients.jsx */}
                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Showing {startIdx + 1} to {Math.min(startIdx + perPage, total)} of {total} entries
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {[5, 10, 25, 50, 100].map(size => {
                        const isCurrent = perPage === size;
                        return (
                          <button 
                            key={size}
                            onClick={() => { setPerPage(size); setCurrentPage(1); }}
                            style={{ 
                              background: isCurrent ? '#2563eb' : 'transparent', 
                              border: isCurrent ? '1px solid #2563eb' : '1px solid var(--border)', 
                              color: isCurrent ? '#fff' : 'var(--muted)', 
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
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
        );
      })()}

      {/* ── Modal 1: Generate Keys ── */}
      {showGenerateModal && (
        <div onClick={() => setShowGenerateModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '90%', maxWidth: '480px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37,99,235,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: '20px' }}>vpn_key</span>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                  Generate Agent Keys
                </h3>
              </div>
              <button onClick={() => setShowGenerateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px', lineHeight: 1.5 }}>
                Provision unique cryptographic credentials for endpoint machines. When the agent first contacts the server, it will permanently bind to that machine name.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginBottom: '8px' }}>
                  Quick Preset Count:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {[10, 25, 50, 100, 200].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setGenerateCount(num)}
                      style={{
                        padding: '6px 0',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--mono)',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: generateCount === num ? '#2563eb' : 'var(--border)',
                        background: generateCount === num ? '#2563eb' : 'var(--surface2)',
                        color: generateCount === num ? '#fff' : 'var(--text)'
                      }}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginBottom: '6px' }}>
                  Custom Count (Max 1000):
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginBottom: '6px' }}>
                  Label / Department (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Finance Department, HQ Laptops"
                  value={generateLabel}
                  onChange={(e) => setGenerateLabel(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowGenerateModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: generating ? 'not-allowed' : 'pointer'
                  }}
                >
                  {generating ? 'Generating...' : `Generate ${generateCount} Keys`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: One-Time Key Reveal Modal ── */}
      {showRevealModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', width: '90%', maxWidth: '600px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: '#22c55e', fontSize: '26px' }}>
                check_circle
              </span>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                {newlyCreatedKeys.length} Agent API Keys Generated
              </h3>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', padding: '12px 16px', margin: '14px 0', display: 'flex', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ color: '#ef4444', fontSize: '20px', flexShrink: 0 }}>
                warning
              </span>
              <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
                <strong>One-Time Display:</strong> These are your secret API keys (e.g. <code>{newlyCreatedKeys[0]?.key || 'BmHyVFDWUO1tUkiOC5gvbw'}</code>). Enter this exact key in your agent's <code>central_server_key</code> config. The server only stores SHA-256 hashes—once this window is closed, these plaintext keys cannot be retrieved. Download the CSV now.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button
                onClick={handleCopyAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                Copy All
              </button>

              <button
                onClick={handleDownloadCsv}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                Download CSV Keyfile
              </button>
            </div>

            {/* Scrollable list */}
            <div style={{ maxHeight: '220px', overflowY: 'auto', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', marginBottom: '20px' }}>
              {newlyCreatedKeys.map((k, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: idx < newlyCreatedKeys.length - 1 ? '1px solid var(--border)' : 'none', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text)' }}>
                  <span>{k.key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(k.key);
                      toast.success('Copied API Key!');
                    }}
                    style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRevealModal(false);
                  setNewlyCreatedKeys([]);
                }}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                I Have Saved These Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 3: Action Confirm Modal (Revoke / Reset / Delete) ── */}
      {actionTarget && (
        <div onClick={() => setActionTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', width: '90%', maxWidth: '420px', padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', margin: '0 0 12px' }}>
              {actionTarget.type === 'revoke' && 'Revoke Agent Key?'}
              {actionTarget.type === 'reset' && 'Reset Machine Binding?'}
              {actionTarget.type === 'delete' && 'Delete Agent Key?'}
            </h3>

            <p style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '20px' }}>
              {actionTarget.type === 'revoke' && (
                <>
                  Are you sure you want to revoke key <code>{actionTarget.key.key_prefix}••••</code>? The machine <strong>{actionTarget.key.bound_machine || 'associated with this key'}</strong> will be blocked immediately from sending logs.
                </>
              )}
              {actionTarget.type === 'reset' && (
                <>
                  Resetting key <code>{actionTarget.key.key_prefix}••••</code> will unbind machine <strong>{actionTarget.key.bound_machine}</strong> and return the key to <code>pending</code>.
                </>
              )}
              {actionTarget.type === 'delete' && (
                <>
                  Are you sure you want to permanently delete key <code>{actionTarget.key.key_prefix}••••</code>? This action cannot be undone.
                </>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setActionTarget(null)}
                style={{ padding: '8px 14px', borderRadius: '6px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={executeAction}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: actionTarget.type === 'revoke' || actionTarget.type === 'delete' ? '#ef4444' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: actionLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {actionLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
