import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Network, Server, Key, Copy, Check, Clock, Plus, Trash2, Database, Shield, Eye, RefreshCw, X, Flame, ShieldAlert, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const Aggregators = () => {
  const { user } = useAuth();
  const isBranchAdmin = Boolean(user?.aggregator_name);
  const isCentralAdmin = (user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('superadmin')) && !user?.aggregator_name;
  const [aggregators, setAggregators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pairingData, setPairingData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form state for creating an aggregator
  const [formData, setFormData] = useState({ name: '', display_name: '' });

  // Log viewer state
  const [selectedAggForLogs, setSelectedAggForLogs] = useState(null);
  const [aggLogs, setAggLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchAggregators = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/aggregators', { params: { _t: Date.now() } });
      if (Array.isArray(res.data)) {
        setAggregators(res.data);
      } else {
        console.warn('Expected array for aggregators but got:', res.data);
        setAggregators(res.data?.aggregators || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load aggregators');
    } finally {
      setLoading(false);
    }
  };

  // Retention & Expiration State
  const [retentionStatus, setRetentionStatus] = useState(null);
  const [eventsRetentionDays, setEventsRetentionDays] = useState(30);
  const [fwRetentionDays, setFwRetentionDays] = useState(30);
  const [selectedTargetDb, setSelectedTargetDb] = useState('');
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [isPurgingEvents, setIsPurgingEvents] = useState(false);
  const [isPurgingFw, setIsPurgingFw] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const fetchRetentionStatus = async (evDays = eventsRetentionDays, fDays = fwRetentionDays, target = selectedTargetDb) => {
    try {
      setLoadingRetention(true);
      const res = await axios.get('/api/retention/status', {
        params: {
          events_days: evDays,
          fw_days: fDays,
          target: target || undefined,
          _t: Date.now()
        }
      });
      setRetentionStatus(res.data);
      if (res.data?.target && (!target || target === 'all')) {
        setSelectedTargetDb(res.data.target);
      }
      if (res.data?.configured_events_days && eventsRetentionDays === 30 && !evDays) {
        setEventsRetentionDays(res.data.configured_events_days);
      }
      if (res.data?.configured_fw_days && fwRetentionDays === 30 && !fDays) {
        setFwRetentionDays(res.data.configured_fw_days);
      }
    } catch (err) {
      console.warn('[Retention] Failed to fetch status:', err.message);
    } finally {
      setLoadingRetention(false);
    }
  };

  const handleSavePolicy = async (type = 'all') => {
    const evD = parseInt(eventsRetentionDays, 10);
    const fwD = parseInt(fwRetentionDays, 10);
    if ((type === 'events' || type === 'all') && (!evD || evD < 1 || evD > 3650)) {
      return toast.error('Endpoint Events retention must be between 1 and 3650 days');
    }
    if ((type === 'firewall' || type === 'all') && (!fwD || fwD < 1 || fwD > 3650)) {
      return toast.error('Firewall logs retention must be between 1 and 3650 days');
    }

    try {
      setIsSavingPolicy(true);
      const payload = {};
      if (type === 'events') {
        payload.retention_events_days = evD;
      } else if (type === 'firewall') {
        payload.retention_fw_days = fwD;
      } else {
        payload.retention_events_days = evD;
        payload.retention_fw_days = fwD;
        payload.local_retention_days = evD;
      }

      const res = await axios.put('/api/retention/policy', payload);
      toast.success(res.data.message || 'Retention policy saved successfully');
      setRetentionStatus(prev => ({
        ...prev,
        configured_events_days: res.data.retention_events_days !== undefined ? res.data.retention_events_days : prev?.configured_events_days,
        configured_fw_days: res.data.retention_fw_days !== undefined ? res.data.retention_fw_days : prev?.configured_fw_days
      }));
      fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update retention policy');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  const handlePurgeClick = (logType) => {
    const isEvents = logType === 'events';
    const days = isEvents ? parseInt(eventsRetentionDays, 10) : parseInt(fwRetentionDays, 10);
    const count = isEvents ? (retentionStatus?.expired_counts?.events || 0) : (retentionStatus?.expired_counts?.fw_events || 0);
    const cutoffStr = isEvents ? (retentionStatus?.events_cutoff_utc || `${days} days ago`) : (retentionStatus?.fw_cutoff_utc || `${days} days ago`);
    const targetName = retentionStatus?.available_databases?.find(d => d.id === selectedTargetDb)?.name || selectedTargetDb || 'this database';
    const label = isEvents ? 'Endpoint Security Events' : 'Firewall Connection Logs';
    const tableName = isEvents ? 'events' : 'fw_events';
    const oppositeType = isEvents ? 'Firewall logs (fw_events)' : 'Endpoint events (events)';

    setConfirmDialog({
      isOpen: true,
      title: `Purge ${label} Older Than ${days} Days`,
      message: `Permanently delete ${count.toLocaleString()} expired ${label} recorded before ${cutoffStr} from ${targetName}?\n\nSAFETY NOTICE: This deletion operates STRICTLY on the '${tableName}' table. ${oppositeType}, machine policies, agent keys, user accounts, and incidents are strictly preserved and will NOT be touched.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          if (isEvents) setIsPurgingEvents(true);
          else setIsPurgingFw(true);

          const res = await axios.post('/api/retention/purge', {
            target: selectedTargetDb,
            log_type: logType,
            days
          });
          toast.success(res.data.message || `Purged ${res.data.total_deleted.toLocaleString()} records!`);
          fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
        } catch (err) {
          toast.error(err.response?.data?.error || `Failed to purge ${label}`);
        } finally {
          if (isEvents) setIsPurgingEvents(false);
          else setIsPurgingFw(false);
        }
      }
    });
  };

  useEffect(() => {
    fetchAggregators();
    fetchRetentionStatus();
  }, []);

  const handleCreateAggregator = async (e) => {
    e.preventDefault();
    if (!isCentralAdmin) return;
    if (!formData.name.trim()) return toast.error('Aggregator system identifier required');

    try {
      const res = await axios.post('/api/aggregators', {
        name: formData.name,
        display_name: formData.display_name || formData.name
      });

      setPairingData(res.data);
      setFormData({ name: '', display_name: '' });
      fetchAggregators();
      toast.success('Aggregator and separate database provisioned successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create aggregator');
    }
  };

  const copyToClipboard = () => {
    if (pairingData) {
      navigator.clipboard.writeText(pairingData.pairing_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Pairing code copied to clipboard!');
    }
  };

  const handleOpenLogs = async (agg) => {
    setSelectedAggForLogs(agg);
    setLoadingLogs(true);
    try {
      const res = await axios.get(`/api/aggregators/${agg.id}/logs?limit=50`);
      setAggLogs(res.data.events || []);
    } catch (err) {
      toast.error('Failed to fetch aggregator logs');
      setAggLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });

  const handleRevoke = (id, name) => {
    if (!isCentralAdmin) return;
    setConfirmDialog({
      isOpen: true,
      title: `Disconnect Aggregator '${name}'`,
      message: 'Are you sure you want to disconnect this aggregator node? It will stop forwarding logs to the Central Server.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/aggregators/${id}`);
          toast.success('Aggregator disconnected');
          fetchAggregators();
        } catch (err) {
          toast.error('Failed to disconnect');
        }
      }
    });
  };

  return (
    <div className="tab-panel active animate-fade-in" style={{ padding: '0 0 24px 0' }}>
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Network style={{ color: 'var(--accent)', fontSize: '24px' }} />
            {isBranchAdmin ? `Branch Aggregator Node (${user?.display_name || user?.aggregator_name})` : 'Branch Aggregators Management'}
          </h2>
          <p className="page-sub" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            {isBranchAdmin 
              ? `Connected to branch database: iochunt_agg_${user?.aggregator_name}`
              : 'Manage regional branch aggregator nodes (each isolated in a dedicated PostgreSQL database).'}
          </p>
        </div>
        {isCentralAdmin && (
          <button 
            onClick={() => { setPairingData(null); setShowCreateModal(true); }}
            className="rbtn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={16} />
            Create Aggregator
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          Loading branch aggregators...
        </div>
      ) : aggregators.length === 0 ? (
        <div className="empty" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border2)', padding: '40px 20px', textAlign: 'center', marginTop: '24px' }}>
          <Server size={32} style={{ color: '#64748b', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>No Branch Aggregators Registered</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Create an aggregator (e.g. Branch-1, Branch-2, Branch-3) to provision its database and generate a pairing key.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginTop: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={18} style={{ color: 'var(--muted)' }} />
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>
              Active Branch Aggregator Nodes ({aggregators.length})
            </h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Branch / Node Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Dedicated Database</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Agents</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Last Sync</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {aggregators.map((agg) => {
                  const getStatusBadge = (status) => {
                    const s = (status || '').toLowerCase();
                    if (s === 'active') {
                      return { label: 'ACTIVE', color: '#22d47a', bg: 'rgba(34, 212, 122, 0.12)', border: 'rgba(34, 212, 122, 0.3)' };
                    }
                    if (s === 'pending_pairing') {
                      return { label: 'AWAITING PAIRING KEY', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
                    }
                    if (s === 'pending_provisioning' || s === 'pending') {
                      return { label: 'AWAITING LOGIN', color: '#f5c518', bg: 'rgba(245, 197, 24, 0.12)', border: 'rgba(245, 197, 24, 0.3)' };
                    }
                    if (s === 'disconnected') {
                      return { label: 'DISCONNECTED', color: '#f04f5a', bg: 'rgba(240, 79, 90, 0.12)', border: 'rgba(240, 79, 90, 0.3)' };
                    }
                    return { label: (status || 'UNKNOWN').toUpperCase(), color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
                  };

                  const badge = getStatusBadge(agg.status);

                  return (
                    <tr key={agg.id} className="hover-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Server size={18} style={{ color: badge.color }} />
                          <div>
                            <div>{agg.display_name || agg.name}</div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>ID: {agg.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '11px', color: '#818cf8', fontFamily: 'monospace' }}>
                        {agg.database_name || `iochunt_agg_${agg.name}`}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 10px', 
                          borderRadius: '4px', 
                          fontSize: '10px', 
                          fontWeight: 700, 
                          letterSpacing: '0.5px', 
                          background: badge.bg, 
                          color: badge.color, 
                          border: `1px solid ${badge.border}` 
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: badge.color }} />
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text)' }}>
                        {agg.agent_count || 0}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '10px', color: 'var(--muted2)' }}>
                        {agg.last_sync ? new Date(agg.last_sync).toLocaleString() : 'Pending connection'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button 
                          onClick={() => handleOpenLogs(agg)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          title="View Aggregator Logs"
                        >
                          <Eye size={13} />
                          Logs
                        </button>
                        {isCentralAdmin && (
                          <button 
                            onClick={() => handleRevoke(agg.id, agg.name)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(240,79,90,0.1)', color: '#f04f5a', border: '1px solid rgba(240,79,90,0.2)', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                            title="Disconnect Aggregator"
                          >
                            <Trash2 size={13} />
                            Disconnect
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DATABASE DATA RETENTION & EXPIRATION POLICY PANEL ── */}
      <div style={{
        marginTop: '28px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.15))',
              border: '1px solid rgba(168,85,247,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a855f7'
            }}>
              <Database size={20} />
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                fontFamily: 'var(--mono)',
                color: 'var(--text)'
              }}>
                Database Data Retention & Expiration
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                Configure automated lifecycle retention or manually purge historical events and firewall logs older than a specified period.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {retentionStatus?.server_time_utc && (
              <span style={{
                fontSize: '10.5px',
                fontFamily: 'monospace',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                padding: '4px 10px',
                borderRadius: '6px'
              }}>
                Server Time: <b style={{ color: 'var(--text)' }}>{retentionStatus.server_time_utc}</b>
              </span>
            )}
            <button
              onClick={() => fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb)}
              disabled={loadingRetention}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              title="Refresh retention status"
            >
              <RefreshCw size={13} className={loadingRetention ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* 1. Target Database Scope (Strictly Isolated Tenant Database) */}
        <div style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>
              <Database size={15} style={{ color: '#818cf8' }} />
              1. Target Database Scope (Central Server & Branch Databases)
            </label>
            <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontFamily: 'monospace' }}>
              Tenant: <b style={{ color: 'var(--accent)' }}>{user?.tenant_id || user?.company_name || 'Current Workspace'}</b>
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' }}>
            Select which database to inspect and expire historical telemetry from. By default targets your Central Server database where endpoint agents connect directly or forward logs:
          </p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedTargetDb}
              onChange={(e) => {
                const target = e.target.value;
                setSelectedTargetDb(target);
                fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, target);
              }}
              style={{
                flex: '1',
                minWidth: '260px',
                padding: '9px 12px',
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--mono)'
              }}
            >
              {(retentionStatus?.available_databases || []).length === 0 ? (
                <option value="">No branch databases found for this tenant</option>
              ) : (
                (retentionStatus?.available_databases || []).map(db => (
                  <option key={db.id} value={db.id}>
                    {db.name} {db.db_name && db.db_name !== db.name ? `[${db.db_name}]` : ''}
                  </option>
                ))
              )}
            </select>
            <div style={{ fontSize: '11px', color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Active Database: <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
                {retentionStatus?.available_databases?.find(d => d.id === selectedTargetDb)?.db_name || selectedTargetDb || 'None'}
              </b>
            </div>
          </div>
        </div>

        {/* 2 & 3. Separate Expiration & Purge Cards for Events and Firewall Logs */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '20px',
          marginBottom: '20px'
        }}>
          
          {/* ── CARD A: ENDPOINT SECURITY EVENTS (`events`) ── */}
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
          }}>
            <div>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8'
                  }}>
                    <Shield size={17} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                      Endpoint Security Events
                    </h3>
                    <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                      Host detections, processes, & agent telemetry (<code>events</code> table)
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: '#818cf8',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  Policy: {retentionStatus?.configured_events_days || 30}d
                </span>
              </div>

              {/* Expiration Input & Policy Save */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                  Events Expiration Period (Days):
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={eventsRetentionDays}
                      onChange={(e) => setEventsRetentionDays(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
                        }
                      }}
                      onBlur={() => fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb)}
                      placeholder="30"
                      style={{
                        width: '100%',
                        padding: '8px 45px 8px 12px',
                        background: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        fontSize: '13px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '8px', fontSize: '11px', color: 'var(--muted)', pointerEvents: 'none' }}>
                      Days
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePolicy('events')}
                    disabled={isSavingPolicy}
                    style={{
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: '#818cf8',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: isSavingPolicy ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Save automated retention policy for events"
                  >
                    {isSavingPolicy ? 'Saving...' : 'Save Policy'}
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {[7, 14, 30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setEventsRetentionDays(d);
                      fetchRetentionStatus(d, fwRetentionDays, selectedTargetDb);
                    }}
                    style={{
                      border: Number(eventsRetentionDays) === d ? '1px solid #818cf8' : '1px solid var(--border)',
                      background: Number(eventsRetentionDays) === d ? 'rgba(99, 102, 241, 0.15)' : 'var(--background)',
                      color: Number(eventsRetentionDays) === d ? '#818cf8' : 'var(--muted)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>

              {/* Cutoff Date */}
              <div style={{
                background: 'var(--background)',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '10.5px',
                marginBottom: '14px'
              }}>
                <div style={{ color: 'var(--muted)' }}>
                  Cutoff: <b style={{ color: '#ef4444', fontFamily: 'monospace' }}>{retentionStatus?.events_cutoff_utc || 'Calculating...'}</b>
                </div>
                <div style={{ color: 'var(--muted2)', fontSize: '9.5px', marginTop: '2px' }}>
                  Endpoint events older than {eventsRetentionDays} days are eligible for deletion.
                </div>
              </div>

              {/* Counts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <div style={{ background: 'var(--background)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>Expired Events</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'monospace', color: (retentionStatus?.expired_counts?.events || 0) > 0 ? '#ef4444' : 'var(--text)' }}>
                    {(retentionStatus?.expired_counts?.events || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ background: 'var(--background)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>Total In Scope</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)' }}>
                    {(retentionStatus?.total_records?.events || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Purge Events Button */}
            <div>
              <button
                type="button"
                onClick={() => handlePurgeClick('events')}
                disabled={isPurgingEvents || (retentionStatus?.expired_counts?.events || 0) === 0}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: (retentionStatus?.expired_counts?.events || 0) > 0 ? '#ef4444' : 'var(--border)',
                  color: (retentionStatus?.expired_counts?.events || 0) > 0 ? '#ffffff' : 'var(--muted)',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: (retentionStatus?.expired_counts?.events || 0) > 0 && !isPurgingEvents ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s'
                }}
              >
                <Trash2 size={14} />
                {isPurgingEvents ? 'Purging Endpoint Events...' : `Purge Endpoint Events (Older than ${eventsRetentionDays}d)`}
              </button>
              <div style={{ textAlign: 'center', fontSize: '9.5px', color: 'var(--muted2)', marginTop: '5px' }}>
                Deletes ONLY from <code>events</code> table. Firewall logs & all system data remain safe.
              </div>
            </div>
          </div>

          {/* ── CARD B: FIREWALL CONNECTION LOGS (`fw_events`) ── */}
          <div style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
          }}>
            <div>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f59e0b'
                  }}>
                    <Flame size={17} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                      Firewall Connection Logs
                    </h3>
                    <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginTop: '2px' }}>
                      Network traffic, blocked IPs, & firewall telemetry (<code>fw_events</code> table)
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: '#f59e0b',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  Policy: {retentionStatus?.configured_fw_days || 30}d
                </span>
              </div>

              {/* Expiration Input & Policy Save */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                  Firewall Logs Expiration Period (Days):
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={fwRetentionDays}
                      onChange={(e) => setFwRetentionDays(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
                        }
                      }}
                      onBlur={() => fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb)}
                      placeholder="30"
                      style={{
                        width: '100%',
                        padding: '8px 45px 8px 12px',
                        background: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        color: 'var(--text)',
                        fontSize: '13px',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ position: 'absolute', right: '10px', top: '8px', fontSize: '11px', color: 'var(--muted)', pointerEvents: 'none' }}>
                      Days
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePolicy('firewall')}
                    disabled={isSavingPolicy}
                    style={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: isSavingPolicy ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Save automated retention policy for firewall logs"
                  >
                    {isSavingPolicy ? 'Saving...' : 'Save Policy'}
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {[7, 14, 30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setFwRetentionDays(d);
                      fetchRetentionStatus(eventsRetentionDays, d, selectedTargetDb);
                    }}
                    style={{
                      border: Number(fwRetentionDays) === d ? '1px solid #f59e0b' : '1px solid var(--border)',
                      background: Number(fwRetentionDays) === d ? 'rgba(245, 158, 11, 0.15)' : 'var(--background)',
                      color: Number(fwRetentionDays) === d ? '#f59e0b' : 'var(--muted)',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>

              {/* Cutoff Date */}
              <div style={{
                background: 'var(--background)',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '10.5px',
                marginBottom: '14px'
              }}>
                <div style={{ color: 'var(--muted)' }}>
                  Cutoff: <b style={{ color: '#ef4444', fontFamily: 'monospace' }}>{retentionStatus?.fw_cutoff_utc || 'Calculating...'}</b>
                </div>
                <div style={{ color: 'var(--muted2)', fontSize: '9.5px', marginTop: '2px' }}>
                  Firewall logs older than {fwRetentionDays} days are eligible for deletion.
                </div>
              </div>

              {/* Counts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <div style={{ background: 'var(--background)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>Expired FW Logs</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'monospace', color: (retentionStatus?.expired_counts?.fw_events || 0) > 0 ? '#ef4444' : 'var(--text)' }}>
                    {(retentionStatus?.expired_counts?.fw_events || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ background: 'var(--background)', borderRadius: '6px', padding: '8px 10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '9.5px', color: 'var(--muted)', textTransform: 'uppercase' }}>Total In Scope</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)' }}>
                    {(retentionStatus?.total_records?.fw_events || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Purge Firewall Button */}
            <div>
              <button
                type="button"
                onClick={() => handlePurgeClick('firewall')}
                disabled={isPurgingFw || (retentionStatus?.expired_counts?.fw_events || 0) === 0}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: (retentionStatus?.expired_counts?.fw_events || 0) > 0 ? '#ef4444' : 'var(--border)',
                  color: (retentionStatus?.expired_counts?.fw_events || 0) > 0 ? '#ffffff' : 'var(--muted)',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: (retentionStatus?.expired_counts?.fw_events || 0) > 0 && !isPurgingFw ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s'
                }}
              >
                <Trash2 size={14} />
                {isPurgingFw ? 'Purging Firewall Logs...' : `Purge Firewall Logs (Older than ${fwRetentionDays}d)`}
              </button>
              <div style={{ textAlign: 'center', fontSize: '9.5px', color: 'var(--muted2)', marginTop: '5px' }}>
                Deletes ONLY from <code>fw_events</code> table. Endpoint events & all system data remain safe.
              </div>
            </div>
          </div>

        </div>

        {/* Safety Guarantee Notice */}
        <div style={{
          background: 'rgba(34, 197, 94, 0.05)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '11px',
          color: 'var(--text)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Shield size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          <span>
            <b>Zero Collateral Deletion Guarantee:</b> Retention lifecycle operations target strictly telemetry tables (<code>events</code> and <code>fw_events</code>). Agent keys, machine policies, user accounts, and incidents are strictly preserved and never deleted.
          </span>
        </div>

        {/* Footer info */}
        <div style={{
          paddingTop: '12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          color: 'var(--muted)',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div>
            Last Purge Execution: <b style={{ color: 'var(--text)', fontFamily: 'monospace' }}>
              {retentionStatus?.last_cleanup?.timestamp ? new Date(retentionStatus.last_cleanup.timestamp).toLocaleString() : 'Never'}
            </b>
            {retentionStatus?.last_cleanup?.deleted_count > 0 && (
              <span> &bull; Purged: <b style={{ color: '#10b981', fontFamily: 'monospace' }}>{retentionStatus.last_cleanup.deleted_count.toLocaleString()} records</b></span>
            )}
          </div>
          <div style={{ color: 'var(--muted2)', fontSize: '10px' }}>
            Daily background cron executes automatically every 24 hours based on saved policy.
          </div>
        </div>
      </div>

      {/* Modal: Create Aggregator / Pairing Code */}
      {showCreateModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>
              {!pairingData ? 'Provision New Branch Aggregator' : 'Aggregator Pairing Code'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
              {!pairingData 
                ? 'Creates a separate PostgreSQL database and generates a secure handshake pairing code.' 
                : 'Enter this code in your branch aggregator setup wizard or settings to establish TLS sync.'}
            </p>

            {!pairingData ? (
              <form onSubmit={handleCreateAggregator} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                    Aggregator ID (System Name) *
                  </label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    placeholder="e.g. branch_1 or branch_mumbai"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#090d16', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', outline: 'none', fontFamily: 'monospace' }}
                  />
                  <span style={{ fontSize: '10px', color: '#64748b' }}>PostgreSQL database will be named <code>iochunt_agg_{formData.name || '...'}</code></span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#cbd5e1' }}>
                    Display Name
                  </label>
                  <input 
                    type="text" 
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g. Red Company Branch 1"
                    style={{ width: '100%', boxSizing: 'border-box', background: '#090d16', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', outline: 'none' }}
                  />
                </div>



                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowCreateModal(false)} 
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Provision Aggregator
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Central Server URL (Network IP)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#090d16', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '8px' }}>
                    <Server style={{ color: '#38bdf8' }} size={18} />
                    <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', color: '#38bdf8', fontWeight: 600 }}>
                      {pairingData.central_server_url || `${window.location.protocol}//${window.location.hostname}:4001`}
                    </code>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(pairingData.central_server_url || `${window.location.protocol}//${window.location.hostname}:4001`);
                        toast.success('Central Server URL copied!');
                      }} 
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}
                      title="Copy URL"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                    Branch Pairing Code
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#090d16', border: '1px solid var(--border)', padding: '12px 14px', borderRadius: '8px' }}>
                    <Key style={{ color: 'var(--accent)' }} size={20} />
                    <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '16px', fontWeight: 800, letterSpacing: '2px', textAlign: 'center', color: '#818cf8' }}>
                      {pairingData.pairing_code}
                    </code>
                    <button onClick={copyToClipboard} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: copied ? '#22d47a' : 'var(--muted)' }}>
                      {copied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>
                
                <div style={{ fontSize: '12px', color: 'var(--muted)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', padding: '12px', borderRadius: '6px', marginBottom: '20px', lineHeight: 1.5 }}>
                  <strong style={{ color: '#fff' }}>Connection Instructions:</strong>
                  <div style={{ marginTop: '4px' }}>
                    Open the Branch Aggregator interface, enter the <strong>Central Server URL</strong> above along with the branch credentials (or pairing code) to establish real-time sync.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => { setShowCreateModal(false); setPairingData(null); }} 
                    style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Modal: View Aggregator Live Logs */}
      {selectedAggForLogs && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '24px' }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '900px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={20} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  Branch Logs: {selectedAggForLogs.display_name || selectedAggForLogs.name}
                </h3>
                <span style={{ fontSize: '11px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                  {selectedAggForLogs.database_name}
                </span>
              </div>
              <button 
                onClick={() => setSelectedAggForLogs(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#090d16', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '12px' }}>
              {loadingLogs ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
                  Loading logs from aggregator...
                </div>
              ) : aggLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No security events currently recorded for this branch aggregator.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Timestamp</th>
                      <th style={{ padding: '6px 8px' }}>Machine</th>
                      <th style={{ padding: '6px 8px' }}>Severity</th>
                      <th style={{ padding: '6px 8px' }}>Category</th>
                      <th style={{ padding: '6px 8px' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggLogs.map((log, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#cbd5e1' }}>
                        <td style={{ padding: '6px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(log.ts).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '6px 8px', color: '#60a5fa' }}>{log.machine}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: log.severity === 'critical' ? 'rgba(239,68,68,0.2)' : log.severity === 'high' ? 'rgba(249,115,22,0.2)' : 'rgba(59,130,246,0.2)',
                            color: log.severity === 'critical' ? '#ef4444' : log.severity === 'high' ? '#f97316' : '#3b82f6'
                          }}>
                            {log.severity?.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', color: '#a855f7' }}>{log.category || log.tag}</td>
                        <td style={{ padding: '6px 8px', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={() => setSelectedAggForLogs(null)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setConfirmDialog({ isOpen: false })}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                  setConfirmDialog({ isOpen: false });
                }}
                style={{ background: confirmDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Aggregators;
