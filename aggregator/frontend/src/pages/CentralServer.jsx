import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const CentralServer = () => {
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'primary' });

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data);
      setStats(res.data.stats);
      if (res.data.central_server_url) setUrl(res.data.central_server_url);
    } catch (err) { toast.error('Failed to load settings'); }
    finally { setLoading(false); }
  };

  const handlePair = async (e) => {
    e.preventDefault();
    setIsPairing(true);
    try {
      await axios.post('/api/settings/pair', { url, pairing_code: pairingCode });
      toast.success('Successfully paired to Central Server!');
      setPairingCode('');
      fetchSettings();
    } catch (err) { toast.error(err.response?.data?.error || 'Pairing failed.'); }
    finally { setIsPairing(false); }
  };

  const handleDisconnect = async () => {
    setConfirmDialog({
      isOpen: true, title: 'Disconnect Node',
      message: 'Are you sure? Events will no longer be forwarded.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post('/api/settings/disconnect');
          toast.success('Disconnected from Central Server');
          fetchSettings();
        } catch (err) { toast.error('Failed to disconnect'); }
        finally { setConfirmDialog(prev => ({ ...prev, isOpen: false })); }
      }
    });
  };

  const handleRetentionChange = async (e) => {
    const days = e.target.value;
    try {
      await axios.put('/api/settings/retention', { local_retention_days: days });
      toast.success('Local data retention policy updated');
      fetchSettings();
    } catch (err) {
      toast.error('Failed to update retention policy');
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;

  const isPaired = !!settings?.central_server_url;
  
  const formatTime = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="tab-panel active animate-fade-in" style={{ width: '100%', paddingBottom: '40px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Global Command Integration</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Manage the connection to the central logging and command server.</p>
        </div>
      </div>

      <div>
        <div style={{ 
          background: 'var(--surface)', 
          width: '100%', 
          maxWidth: '600px', 
          borderRadius: '8px', 
          border: '1px solid var(--border)', 
          padding: '24px', 
          margin: '0 auto'
        }}>
          
          {!isPaired ? (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>Pairing Setup</div>
                <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>Enter the details provided by your Central Administrator.</div>
              </div>

              <form onSubmit={handlePair}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>Central Server URL</label>
                  <input 
                    type="url" 
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                    placeholder="https://central.example.com"
                  />
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>Pairing Code</label>
                  <input 
                    type="text" 
                    required
                    value={pairingCode}
                    onChange={(e) => setPairingCode(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '14px', outline: 'none' }}
                    placeholder="PAIR-XXXX-XXXX"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    type="submit" 
                    disabled={isPairing}
                    style={{ padding: '8px 16px', background: '#3b82f6', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: isPairing ? 'not-allowed' : 'pointer', opacity: isPairing ? 0.7 : 1 }}
                  >
                    {isPairing ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>Connection Active</div>
                </div>
                <button 
                  onClick={handleDisconnect}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: '#ef4444', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                >
                  Disconnect
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Endpoint URL</span>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--text)' }}>{settings.central_server_url}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Sync Status</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: stats?.status === 'Active' ? '#22c55e' : 'var(--text)' }}>{stats?.status || 'Unknown'}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Last Synchronization</span>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{formatTime(stats?.last_sync)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Total Events Forwarded</span>
                  <span style={{ fontSize: '13px', fontFamily: 'var(--mono)', color: 'var(--text)' }}>{stats?.events_forwarded?.toLocaleString() || 0}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Local Data Retention</span>
                  <select 
                    value={settings?.local_retention_days || 30} 
                    onChange={handleRetentionChange}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' }}
                  >
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days</option>
                    <option value="0">Keep Forever</option>
                  </select>
                </div>

              </div>

            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid, #fff)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation: 'slideUp 0.3s ease-out', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#3b82f6', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
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
                style={{ background: confirmDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: confirmDialog.type === 'danger' ? '0 4px 12px rgba(239,68,68,0.2)' : '0 4px 12px rgba(37,99,235,0.2)' }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default CentralServer;
