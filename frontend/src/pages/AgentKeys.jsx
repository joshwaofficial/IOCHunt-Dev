import React, { useState, useEffect, useMemo } from 'react';
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
          limit: 100
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
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchKeys();
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

  // Download CSV of Plaintext Keys
  const handleDownloadCsv = () => {
    const headers = 'Key,Prefix,Status,Label,CreatedAt\n';
    const rows = newlyCreatedKeys.map(k =>
      `"${k.key}","${k.keyPrefix}","${k.status}","${k.label || ''}","${formatLocalTime(k.createdAt)}"`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `iochunt_agent_keys_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded CSV export!');
  };

  // Export Current Filtered Table
  const handleExportTableCsv = () => {
    const headers = 'Prefix,Status,BoundMachine,Label,CreatedAt,ActivatedAt\n';
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
    toast.success('Exported fleet keys to CSV');
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

  return (
    <div className="agent-keys-page" style={{ padding: '0 8px 32px' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#38bdf8' }}>
              vpn_key
            </span>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
              Agent Key Management
            </h1>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Provision unique machine-bound keys. Keys automatically bind to endpoints on first contact with zero agent modification.
          </p>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleExportTableCsv}
              disabled={keys.length === 0}
              className="tb-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.05)',
                color: '#cbd5e1',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
              Export Fleet CSV
            </button>

            <button
              onClick={() => setShowGenerateModal(true)}
              className="tb-btn tb-btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add_circle</span>
              Generate Keys
            </button>
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#38bdf8' }}>key</span>
            Total Provisioned Keys
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#f8fafc', marginTop: '8px' }}>
            {stats.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Fleet allocation quota</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>check_circle</span>
            Active & Bound
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e', marginTop: '8px' }}>
            {stats.active.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Locked to specific machines</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#f59e0b' }}>pending</span>
            Pending Enrollment
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#f59e0b', marginTop: '8px' }}>
            {stats.pending.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Ready for new computer setup</div>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', padding: '16px 20px' }}>
          <div style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ef4444' }}>block</span>
            Revoked / Deactivated
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444', marginTop: '8px' }}>
            {stats.revoked.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Blocked from communication</div>
        </div>
      </div>

      {/* ── Filters & Search ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, maxWidth: '480px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '10px', color: '#64748b', fontSize: '18px' }}>
              search
            </span>
            <input
              type="text"
              placeholder="Search by prefix, machine name, or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 38px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Filter Status:</span>
          {['all', 'active', 'pending', 'revoked'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                textTransform: 'capitalize',
                cursor: 'pointer',
                border: '1px solid',
                borderColor: statusFilter === st ? '#38bdf8' : 'rgba(255,255,255,0.08)',
                background: statusFilter === st ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                color: statusFilter === st ? '#38bdf8' : '#94a3b8'
              }}
            >
              {st}
            </button>
          ))}
          <button
            onClick={fetchKeys}
            title="Refresh"
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle' }}>refresh</span>
          </button>
        </div>
      </div>

      {/* ── Main Keys Table ── */}
      <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'rgba(30, 41, 59, 0.5)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
              <th style={{ padding: '12px 16px' }}>KEY PREFIX</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px' }}>BOUND MACHINE</th>
              <th style={{ padding: '12px 16px' }}>LABEL / NOTES</th>
              <th style={{ padding: '12px 16px' }}>PROVISIONED</th>
              <th style={{ padding: '12px 16px' }}>ACTIVATED</th>
              {isAdmin && <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading agent keys...</p>
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '40px', color: '#475569', marginBottom: '8px' }}>
                    vpn_key_off
                  </span>
                  <p style={{ margin: 0, fontWeight: '500', color: '#94a3b8' }}>No agent keys found</p>
                  <p style={{ margin: '4px 0 16px', fontSize: '12px' }}>Click "Generate Keys" above to create a batch for your endpoints.</p>
                </td>
              </tr>
            ) : (
              keys.map((k) => {
                const isActive = k.status === 'active';
                const isPending = k.status === 'pending';
                const isRevoked = k.status === 'revoked';

                return (
                  <tr
                    key={k.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: '4px', color: '#38bdf8', fontFamily: 'monospace', fontSize: '12px' }}>
                          {k.key_prefix}••••••••
                        </code>
                        <button
                          onClick={() => copyPrefix(k.key_prefix)}
                          title="Copy Prefix"
                          style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
                        </button>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          background: isActive
                            ? 'rgba(34, 197, 94, 0.15)'
                            : isPending
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isActive ? '#4ade80' : isPending ? '#fbbf24' : '#f87171',
                          border: `1px solid ${isActive ? 'rgba(34, 197, 94, 0.3)' : isPending ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}
                      >
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'currentColor'
                          }}
                        />
                        {k.status}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {k.bound_machine ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f8fafc', fontWeight: '500' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#38bdf8' }}>desktop_windows</span>
                          {k.bound_machine}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '12px' }}>
                          Unassigned (Waiting for agent)
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
                      {k.label || <span style={{ color: '#475569' }}>—</span>}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                      {formatLocalTime(k.created_at)}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontSize: '12px' }}>
                      {formatLocalTime(k.activated_at)}
                    </td>

                    {isAdmin && (
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {isActive && (
                            <button
                              onClick={() => setActionTarget({ type: 'revoke', key: k })}
                              title="Revoke Key"
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#f87171',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '600'
                              }}
                            >
                              Revoke
                            </button>
                          )}

                          {isActive && (
                            <button
                              onClick={() => setActionTarget({ type: 'reset', key: k })}
                              title="Reset Machine Binding"
                              style={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#fbbf24',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '600'
                              }}
                            >
                              Reset
                            </button>
                          )}

                          {(isRevoked || isPending) && (
                            <button
                              onClick={() => setActionTarget({ type: 'delete', key: k })}
                              title="Delete Key"
                              style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: '#94a3b8',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal 1: Generate Keys ── */}
      {showGenerateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ color: '#38bdf8', fontSize: '24px' }}>key</span>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                  Generate Agent Keys
                </h2>
              </div>
              <button onClick={() => setShowGenerateModal(false)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '20px' }}>
              Pre-provision unique cryptographic keys for your endpoints. When an agent boots up and reports its hostname, the key binds permanently to that machine.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px' }}>
                Quick Selection (Key Count):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                {[10, 25, 50, 100, 200].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setGenerateCount(num)}
                    style={{
                      padding: '8px 0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: generateCount === num ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                      background: generateCount === num ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                      color: generateCount === num ? '#38bdf8' : '#cbd5e1'
                    }}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
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
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' }}>
                Label / Department (Optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Finance Workstations, IT Laptops"
                value={generateLabel}
                onChange={(e) => setGenerateLabel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#f8fafc',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer'
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
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '600',
                  cursor: generating ? 'not-allowed' : 'pointer'
                }}
              >
                {generating ? 'Generating...' : `Generate ${generateCount} Keys`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: One-Time Key Reveal Modal ── */}
      {showRevealModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '16px', width: '100%', maxWidth: '640px', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: '#22c55e', fontSize: '28px' }}>
                verified
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                {newlyCreatedKeys.length} Agent Keys Generated Successfully
              </h2>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px 16px', margin: '16px 0', display: 'flex', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ color: '#ef4444', fontSize: '20px', flexShrink: 0 }}>
                warning
              </span>
              <div style={{ fontSize: '13px', color: '#fca5a5' }}>
                <strong>Important Security Notice:</strong> These full plaintext keys are displayed <strong>ONLY ONCE</strong> right now. They are never stored in plaintext on the server. Download the CSV or copy them before closing.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button
                onClick={handleCopyAll}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>content_copy</span>
                Copy All to Clipboard
              </button>

              <button
                onClick={handleDownloadCsv}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
                Download CSV Keyfile
              </button>
            </div>

            {/* Scrollable list of newly generated keys */}
            <div style={{ maxHeight: '240px', overflowY: 'auto', background: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
              {newlyCreatedKeys.map((k, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: idx < newlyCreatedKeys.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1' }}>
                  <span>{k.key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(k.key);
                      toast.success('Key copied!');
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', padding: 0 }}
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
                  padding: '10px 24px',
                  borderRadius: '8px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '600',
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', width: '100%', maxWidth: '440px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#f8fafc', margin: '0 0 12px' }}>
              {actionTarget.type === 'revoke' && 'Revoke Agent Key?'}
              {actionTarget.type === 'reset' && 'Reset Machine Binding?'}
              {actionTarget.type === 'delete' && 'Delete Agent Key?'}
            </h3>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '20px' }}>
              {actionTarget.type === 'revoke' && (
                <>
                  Are you sure you want to revoke key <code>{actionTarget.key.key_prefix}••••</code>? The machine <strong>{actionTarget.key.bound_machine || 'associated with this key'}</strong> will be blocked immediately and rejected from sending logs.
                </>
              )}
              {actionTarget.type === 'reset' && (
                <>
                  Resetting key <code>{actionTarget.key.key_prefix}••••</code> will unbind machine <strong>{actionTarget.key.bound_machine}</strong> and return the key to <code>pending</code>. Use this if the computer was formatted and needs to enroll again.
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
                style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={executeAction}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: actionTarget.type === 'revoke' || actionTarget.type === 'delete' ? '#ef4444' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  fontWeight: '600',
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
