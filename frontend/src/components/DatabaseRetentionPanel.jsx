import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Database, Shield, Flame, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function DatabaseRetentionPanel({
  initialTarget,
  readOnlyTarget = false,
  title = 'Database Data Retention & Expiration',
  subtitle = 'Configure automated lifecycle retention or manually purge historical events and firewall logs older than a specified period.'
}) {
  const { user } = useAuth();
  const [retentionStatus, setRetentionStatus] = useState(null);
  const [eventsRetentionDays, setEventsRetentionDays] = useState(null);
  const [fwRetentionDays, setFwRetentionDays] = useState(null);
  const [selectedTargetDb, setSelectedTargetDb] = useState(initialTarget || '');
  const [loadingRetention, setLoadingRetention] = useState(false);
  const [isPurgingEvents, setIsPurgingEvents] = useState(false);
  const [isPurgingFw, setIsPurgingFw] = useState(false);
  const [isSavingEventsPolicy, setIsSavingEventsPolicy] = useState(false);
  const [isSavingFwPolicy, setIsSavingFwPolicy] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    type: 'danger'
  });

  const fetchRetentionStatus = async (evDays = eventsRetentionDays, fDays = fwRetentionDays, target = selectedTargetDb) => {
    try {
      setLoadingRetention(true);
      const params = {
        _t: Date.now()
      };
      if (evDays !== null && evDays !== undefined && evDays !== '') {
        params.events_days = evDays;
      }
      if (fDays !== null && fDays !== undefined && fDays !== '') {
        params.fw_days = fDays;
      }
      if (target && target !== 'all') {
        params.target = target;
      }

      const res = await axios.get('/api/retention/status', { params });
      setRetentionStatus(res.data);

      if (res.data?.target && (!target || target === 'all')) {
        setSelectedTargetDb(res.data.target);
      }

      // Populate input states with configured saved policies when state was uninitialized
      if (evDays === null || evDays === undefined) {
        setEventsRetentionDays(res.data?.configured_events_days ?? 30);
      }
      if (fDays === null || fDays === undefined) {
        setFwRetentionDays(res.data?.configured_fw_days ?? 30);
      }
    } catch (err) {
      console.warn('[Retention] Failed to fetch status:', err.message);
    } finally {
      setLoadingRetention(false);
    }
  };

  useEffect(() => {
    fetchRetentionStatus(null, null, initialTarget || selectedTargetDb);
  }, [initialTarget]);

  const handleTargetChange = (newTarget) => {
    setSelectedTargetDb(newTarget);
    // Reset local input states so the target's saved policy fills the input boxes!
    setEventsRetentionDays(null);
    setFwRetentionDays(null);
    fetchRetentionStatus(null, null, newTarget);
  };

  const handleSavePolicy = async (type = 'all') => {
    const evD = parseInt(eventsRetentionDays ?? retentionStatus?.configured_events_days ?? 30, 10);
    const fwD = parseInt(fwRetentionDays ?? retentionStatus?.configured_fw_days ?? 30, 10);

    if ((type === 'events' || type === 'all') && (!evD || evD < 1 || evD > 3650)) {
      return toast.error('Endpoint Events retention must be between 1 and 3650 days');
    }
    if ((type === 'firewall' || type === 'all') && (!fwD || fwD < 1 || fwD > 3650)) {
      return toast.error('Firewall logs retention must be between 1 and 3650 days');
    }

    try {
      if (type === 'events') setIsSavingEventsPolicy(true);
      else if (type === 'firewall') setIsSavingFwPolicy(true);
      else {
        setIsSavingEventsPolicy(true);
        setIsSavingFwPolicy(true);
      }

      const payload = {
        target: selectedTargetDb || retentionStatus?.target || 'central_tenant'
      };

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

      const savedEv = res.data.retention_events_days !== undefined ? res.data.retention_events_days : evD;
      const savedFw = res.data.retention_fw_days !== undefined ? res.data.retention_fw_days : fwD;

      setRetentionStatus(prev => ({
        ...prev,
        configured_events_days: savedEv,
        configured_fw_days: savedFw
      }));

      if (type === 'events') {
        setEventsRetentionDays(savedEv);
        fetchRetentionStatus(savedEv, fwRetentionDays, selectedTargetDb);
      } else if (type === 'firewall') {
        setFwRetentionDays(savedFw);
        fetchRetentionStatus(eventsRetentionDays, savedFw, selectedTargetDb);
      } else {
        setEventsRetentionDays(savedEv);
        setFwRetentionDays(savedFw);
        fetchRetentionStatus(savedEv, savedFw, selectedTargetDb);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update retention policy');
    } finally {
      setIsSavingEventsPolicy(false);
      setIsSavingFwPolicy(false);
    }
  };

  const handlePurgeClick = (logType) => {
    const isEvents = logType === 'events';
    const days = isEvents
      ? parseInt(eventsRetentionDays ?? retentionStatus?.configured_events_days ?? 30, 10)
      : parseInt(fwRetentionDays ?? retentionStatus?.configured_fw_days ?? 30, 10);
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
            target: selectedTargetDb || retentionStatus?.target || 'central_tenant',
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

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '24px',
      marginTop: '28px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '16px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#818cf8'
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
              {title}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
              {subtitle}
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

      {/* Target Database Scope Selector */}
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
            Target Database Scope (Central Server & Branch Aggregators)
          </label>
          <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontFamily: 'monospace' }}>
            Tenant: <b style={{ color: 'var(--accent)' }}>{user?.tenant_id || user?.company_name || 'Current Workspace'}</b>
          </span>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '0 0 10px' }}>
          Select which database to inspect and expire historical telemetry from. Each database maintains an independent retention policy:
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!readOnlyTarget ? (
            <select
              value={selectedTargetDb}
              onChange={(e) => handleTargetChange(e.target.value)}
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
                <option value="">No databases found for this workspace</option>
              ) : (
                (retentionStatus?.available_databases || []).map(db => (
                  <option key={db.id} value={db.id}>
                    {db.name} {db.db_name && db.db_name !== db.name ? `[${db.db_name}]` : ''}
                  </option>
                ))
              )}
            </select>
          ) : (
            <div style={{
              flex: '1',
              padding: '9px 12px',
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '12px',
              fontFamily: 'var(--mono)',
              fontWeight: 700
            }}>
              {retentionStatus?.available_databases?.find(d => d.id === selectedTargetDb)?.name || selectedTargetDb || 'Aggregator Local Database'}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            Active Database: <b style={{ color: '#818cf8', fontFamily: 'monospace' }}>
              {retentionStatus?.available_databases?.find(d => d.id === selectedTargetDb)?.db_name || selectedTargetDb || 'None'}
            </b>
          </div>
        </div>
      </div>

      {/* Expiration & Purge Cards: Events and Firewall Logs */}
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
            {/* Header */}
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

            {/* Input & Policy Save */}
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
                    value={eventsRetentionDays ?? (retentionStatus?.configured_events_days ?? '')}
                    onChange={(e) => setEventsRetentionDays(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
                      }
                    }}
                    onBlur={() => fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb)}
                    placeholder={String(retentionStatus?.configured_events_days || 30)}
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
                  disabled={isSavingEventsPolicy}
                  style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: isSavingEventsPolicy ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Save automated retention policy for events"
                >
                  {isSavingEventsPolicy ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {[7, 14, 30, 60, 90, 180, 365].map(d => {
                const currentVal = Number(eventsRetentionDays ?? retentionStatus?.configured_events_days ?? 30);
                const isSelected = currentVal === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setEventsRetentionDays(d);
                      fetchRetentionStatus(d, fwRetentionDays, selectedTargetDb);
                    }}
                    style={{
                      border: isSelected ? '1px solid #818cf8' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'var(--background)',
                      color: isSelected ? '#818cf8' : 'var(--muted)',
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
                );
              })}
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
                Endpoint events older than {eventsRetentionDays ?? retentionStatus?.configured_events_days ?? 30} days are eligible for deletion.
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
              {isPurgingEvents ? 'Purging Endpoint Events...' : `Purge Endpoint Events (Older than ${eventsRetentionDays ?? retentionStatus?.configured_events_days ?? 30}d)`}
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
            {/* Header */}
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

            {/* Input & Policy Save */}
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
                    value={fwRetentionDays ?? (retentionStatus?.configured_fw_days ?? '')}
                    onChange={(e) => setFwRetentionDays(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb);
                      }
                    }}
                    onBlur={() => fetchRetentionStatus(eventsRetentionDays, fwRetentionDays, selectedTargetDb)}
                    placeholder={String(retentionStatus?.configured_fw_days || 30)}
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
                  disabled={isSavingFwPolicy}
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: isSavingFwPolicy ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Save automated retention policy for firewall logs"
                >
                  {isSavingFwPolicy ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
              {[7, 14, 30, 60, 90, 180, 365].map(d => {
                const currentVal = Number(fwRetentionDays ?? retentionStatus?.configured_fw_days ?? 30);
                const isSelected = currentVal === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setFwRetentionDays(d);
                      fetchRetentionStatus(eventsRetentionDays, d, selectedTargetDb);
                    }}
                    style={{
                      border: isSelected ? '1px solid #f59e0b' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'var(--background)',
                      color: isSelected ? '#f59e0b' : 'var(--muted)',
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
                );
              })}
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
                Firewall logs older than {fwRetentionDays ?? retentionStatus?.configured_fw_days ?? 30} days are eligible for deletion.
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
              {isPurgingFw ? 'Purging Firewall Logs...' : `Purge Firewall Logs (Older than ${fwRetentionDays ?? retentionStatus?.configured_fw_days ?? 30}d)`}
            </button>
            <div style={{ textAlign: 'center', fontSize: '9.5px', color: 'var(--muted2)', marginTop: '5px' }}>
              Deletes ONLY from <code>fw_events</code> table. Endpoint events & all system data remain safe.
            </div>
          </div>
        </div>
      </div>

      {/* Safety Notice */}
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

      {/* Footer Info */}
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

      {/* Confirmation Dialog Modal */}
      {confirmDialog.isOpen && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(3px)',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface-solid)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}>
                <AlertTriangle size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                {confirmDialog.title}
              </h3>
            </div>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmDialog({ isOpen: false })}
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                  setConfirmDialog({ isOpen: false });
                }}
                style={{
                  background: confirmDialog.type === 'danger' ? '#ef4444' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Confirm Purge
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
