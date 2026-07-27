import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Network, Server, Key, Copy, Check, Clock, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Aggregators = () => {
  const [aggregators, setAggregators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPairModal, setShowPairModal] = useState(false);
  const [newAggName, setNewAggName] = useState('');
  const [pairingData, setPairingData] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchAggregators = async () => {
    try {
      setLoading(true);
      // We haven't created the GET /api/aggregators backend endpoint yet, 
      // but let's assume it will be implemented.
      const res = await axios.get('/api/aggregators');
      setAggregators(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load aggregators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAggregators();
    // In a real scenario, this could also listen to SSE for live updates.
  }, []);

  const handleGeneratePairingCode = async (e) => {
    e.preventDefault();
    if (!newAggName.trim()) return toast.error('Aggregator name required');
    try {
      const res = await axios.post('/api/aggregators/generate-code', {
        aggregator_name: newAggName
      });
      setPairingData(res.data);
      setNewAggName('');
      fetchAggregators();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate code');
    }
  };

  const copyToClipboard = () => {
    if (pairingData) {
      navigator.clipboard.writeText(pairingData.pairing_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Pairing code copied!');
    }
  };

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });

  const handleRevoke = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Disconnect Aggregator',
      message: 'Are you sure you want to disconnect this aggregator? It will stop sending logs immediately.',
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
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ color: 'var(--accent)', fontSize: '26px' }}>hub</span>
            Aggregators Management
          </h2>
          <p className="page-sub" style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            Manage branch aggregator nodes connected to the Central Server.
          </p>
        </div>
        <button 
          onClick={() => setShowPairModal(true)}
          className="rbtn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Add Aggregator
        </button>
      </div>

      {loading ? (
        <div className="empty">Loading aggregators...</div>
      ) : aggregators.length === 0 ? (
        <div className="empty" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border2)', marginTop: '24px' }}>
          <span className="material-symbols-outlined icon">dns</span>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>No Aggregators Connected</div>
          <div style={{ fontSize: '12px' }}>Generate a pairing code to connect your first branch aggregator.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginTop: '24px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>dns</span>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>Connected Aggregators</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Aggregator Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Agents Online</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Last Sync</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {aggregators.map((agg, i) => {
                  const col = agg.status === 'active' ? '#22d47a' : '#f5c518';
                  return (
                    <tr key={agg.id} className="hover-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="material-symbols-outlined" style={{ color: col, fontSize: '18px' }}>dns</span>
                          {agg.name}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
                          {agg.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--text)' }}>
                        {agg.agent_count || 0}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '10px', color: 'var(--muted2)' }}>
                        {agg.last_sync ? new Date(agg.last_sync).toLocaleString() : 'Never'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button 
                          onClick={() => handleRevoke(agg.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(240,79,90,0.1)', color: '#f04f5a', border: '1px solid rgba(240,79,90,0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}
                          title="Disconnect Aggregator"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                          Disconnect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showPairModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation: 'slideUp 0.3s ease-out' }}>
            
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Add New Aggregator</h3>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#3b82f6', lineHeight: 1.5 }}>
              {!pairingData ? 'Enter the branch or aggregator name:' : 'Pairing Code Generated!'}
            </p>

            {!pairingData ? (
              <form onSubmit={handleGeneratePairingCode}>
                <input 
                  type="text" 
                  className="input-field"
                  autoFocus
                  required
                  value={newAggName}
                  onChange={(e) => setNewAggName(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '14px', outline: 'none', marginBottom: '24px', fontFamily: 'var(--sans)' }}
                  placeholder="e.g. Mumbai-Branch"
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowPairModal(false)} 
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Generate Code
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>key</span>
                  <code style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 800, letterSpacing: '2px', textAlign: 'center', color: 'var(--text)' }}>
                    {pairingData.pairing_code}
                  </code>
                  <button onClick={copyToClipboard} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ color: copied ? '#22d47a' : 'var(--muted)', fontSize: '20px' }}>
                      {copied ? 'check' : 'content_copy'}
                    </span>
                  </button>
                </div>
                
                <ul style={{ fontSize: '11px', color: 'var(--muted2)', paddingLeft: '20px', margin: '0 0 24px 0', lineHeight: 1.6 }}>
                  <li>Enter this code in the settings of the <strong>{pairingData.aggregator_name}</strong> aggregator.</li>
                  <li>Code expires in 24 hours.</li>
                </ul>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => { setShowPairModal(false); setPairingData(null); setNewAggName(''); fetchAggregators(); }} 
                    style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
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

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', animation: 'slideUp 0.3s ease-out' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{confirmDialog.message}</p>
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
