import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

import DatabaseRetentionPanel from '../components/DatabaseRetentionPanel';

export default function AggregatorSettings() {
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [sources, setSources] = useState([]);
  const [newSource, setNewSource] = useState({ name: '', type: 'syslog', path: '', port: 5514 });
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchSources();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data);
      setStats(res.data.stats);
      if (res.data.central_server_url) setUrl(res.data.central_server_url);
    } catch (err) {
      if (!err.response?.data?.force_password_change) {
        toast.error('Failed to load aggregator settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSources = async () => {
    try {
      const res = await axios.get('/api/fw-sources');
      setSources(res.data.sources || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePair = async (e) => {
    e.preventDefault();
    setIsPairing(true);
    try {
      await axios.post('/api/settings/pair', { url, pairing_code: pairingCode });
      toast.success('Successfully paired to Central Server!');
      setPairingCode('');
      fetchSettings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Pairing failed.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleDisconnect = () => {
    setShowConfirmModal(true);
  };

  const confirmDisconnect = async () => {
    setShowConfirmModal(false);
    try {
      await axios.post('/api/settings/disconnect');
      toast.success('Disconnected from Central Server');
      fetchSettings();
    } catch (err) {
      toast.error('Failed to disconnect');
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/api/fw-sources', newSource);
      toast.success('Source added');
      setNewSource({ name: '', type: 'syslog', path: '', port: 5514 });
      fetchSources();
    } catch (err) {
      toast.error('Failed to add source');
    }
  };

  const handleDeleteSource = async (id) => {
    try {
      await axios.delete(`/api/fw-sources/${id}`);
      toast.success('Source removed');
      fetchSources();
    } catch (err) {
      toast.error('Failed to remove source');
    }
  };

  if (loading) return <div className="p-6 text-foreground">Loading aggregator configurations...</div>;

  const isPaired = !!settings?.central_server_url;

  return (
    <div className="tab-panel active animate-fade-in" style={{ width: '100%', paddingBottom: '40px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>
            Branch Aggregator Settings
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>
            Manage Central Server pairing, event forwarding queue, and local log collectors.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        
        {/* Pairing & Forwarding Card */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '24px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
            Central Server Connection
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '20px' }}>
            Forwarding pipeline status to Central Server
          </p>

          {!isPaired ? (
            <form onSubmit={handlePair}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                  Central Server URL & Port (IP Address)
                </label>
                <input 
                  type="url" 
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://192.168.1.100:4001 (or Central Server IP)"
                  style={{
                    width: '100%', padding: '10px 14px', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px'
                  }}
                />
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                  Specify the Central Server IP and port (e.g. <code>https://192.168.1.100:4001</code>). Do not use 0.0.0.0.
                </span>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
                  Pairing Code
                </label>
                <input 
                  type="text" 
                  required
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="e.g. 6-character code from Central Aggregators page"
                  style={{
                    width: '100%', padding: '10px 14px', background: 'var(--background)',
                    border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isPairing}
                style={{
                  background: 'var(--primary, #3b82f6)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                {isPairing ? 'Pairing...' : 'Connect to Central Server'}
              </button>
            </form>
          ) : (
            <div>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '16px',
                borderRadius: '6px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, fontSize: '14px' }}>
                  <span className="material-symbols-outlined">check_circle</span>
                  Connected to Central Server
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '8px', wordBreak: 'break-all' }}>
                  <strong>URL:</strong> {settings.central_server_url}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  <strong>Last Sync:</strong> {settings.last_sync_at ? new Date(settings.last_sync_at).toLocaleString() : 'Pending'}
                </div>
                {stats && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    <strong>Queued Events:</strong> {stats.unsynced_events || 0}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleDisconnect}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Disconnect Node
              </button>
            </div>
          )}
        </div>

        {/* Zero-Trust Agent Authentication Card */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#2563eb' }}>
                verified_user
              </span>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Agent Authentication
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', lineHeight: 1.5 }}>
              Endpoint agents connecting to this Aggregator authenticate using individual, machine-bound cryptographic keys.
            </p>

            <div style={{
              background: 'rgba(37, 99, 235, 0.06)',
              border: '1px solid rgba(37, 99, 235, 0.2)',
              borderRadius: '6px',
              padding: '12px 14px',
              marginBottom: '18px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontFamily: 'var(--mono)' }}>
                Zero-Trust Machine Binding
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.4 }}>
                Shared static keys are deprecated. Provision unique keys that permanently lock to each endpoint's machine name upon first connection.
              </div>
            </div>
          </div>

          <Link
            to="/agent-keys"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 16px',
              fontWeight: 700,
              fontSize: '12px',
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(37,99,235,0.3)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>vpn_key</span>
            Manage Unique Agent Keys →
          </Link>
        </div>
      </div>

      {/* Full Database Data Retention & Expiration Panel for Aggregator */}
      <DatabaseRetentionPanel
        title="Branch Database Data Retention & Expiration"
        subtitle="Configure automated local retention policies or manually purge historical events and firewall logs from this aggregator node."
      />

      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>Disconnect Aggregator Node</h3>
            <p style={{ margin: '0 0 24px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
              Are you sure you want to disconnect? Events will no longer be forwarded to the Central Server.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDisconnect}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
