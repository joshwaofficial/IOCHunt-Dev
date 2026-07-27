import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, Router, Lock, Save, CalendarDays, Plus, Play, Edit, Trash2, X } from 'lucide-react';

export default function EmailReports() {
  const [smtpConfig, setSmtpConfig] = useState({
    host: '', port: 587, secure: false, username: '', password: '', from_addr: '', from_name: 'IOC Hunt', enabled: false
  });
  const [schedules, setSchedules] = useState([]);
  const [machines, setMachines] = useState([]);
  const [aggregators, setAggregators] = useState([]);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  
  const [testEmail, setTestEmail] = useState('');
  const [smtpMsg, setSmtpMsg] = useState({ text: '', type: '' });
  const [schedMsg, setSchedMsg] = useState({ text: '', type: '' });

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'primary' });
  const [alertDialog, setAlertDialog] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formData, setFormData] = useState({
    name: '', recipients: '', cron_expr: '0 8 * * 1', duration: 24, aggregator: [], machine: '', severity: '', category: '', include_fw: true, enabled: true
  });

  useEffect(() => {
    fetchConfig();
    fetchSchedules();
    fetchMachines();
    fetchAggregators();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/smtp/config');
      setSmtpConfig(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await axios.get('/api/smtp/schedules');
      setSchedules(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMachines = async () => {
    try {
      const res = await axios.get('/api/machines');
      setMachines(res.data.data || res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAggregators = async () => {
    try {
      const res = await axios.get('/api/aggregators');
      setAggregators(res.data.data || res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async () => {
    setLoadingConfig(true);
    try {
      await axios.post('/api/smtp/config', smtpConfig);
      setSmtpMsg({ text: 'Configuration saved!', type: 'success' });
      setTimeout(() => setSmtpMsg({ text: '', type: '' }), 3000);
    } catch (e) {
      setSmtpMsg({ text: e.response?.data?.error || 'Failed to save', type: 'error' });
    } finally {
      setLoadingConfig(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail) return;
    setLoadingConfig(true);
    setSmtpMsg({ text: 'Sending...', type: 'info' });
    try {
      await axios.post('/api/smtp/test', { to: testEmail });
      setSmtpMsg({ text: 'Test email sent!', type: 'success' });
    } catch (e) {
      setSmtpMsg({ text: e.response?.data?.error || 'Failed to send', type: 'error' });
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleConfigChange = (e) => {
    const { id, value, type, checked } = e.target;
    const key = id.replace('smtp-', '');
    setSmtpConfig({ ...smtpConfig, [key]: type === 'checkbox' ? checked : value });
  };

  const handleFormChange = (e) => {
    const { id, value, type, checked } = e.target;
    const key = id.replace('sched-', '');
    setFormData({ ...formData, [key]: type === 'checkbox' ? checked : value });
  };

  const openNewForm = () => {
    setEditId(null);
    setFormData({ name: '', recipients: '', cron_expr: '0 8 * * 1', duration: 24, aggregator: [], machine: '', severity: '', category: '', include_fw: true, enabled: true });
    setShowForm(true);
    setSchedMsg({ text: '', type: '' });
  };

  const editSchedule = (s) => {
    setEditId(s.id);
    setFormData({
      name: s.name, recipients: s.recipients, cron_expr: s.cron_expr, duration: s.duration, aggregator: s.aggregator ? s.aggregator.split(',') : [], machine: s.machine || '', severity: s.severity || '', category: s.category || '', include_fw: s.include_fw === 1, enabled: s.enabled === 1
    });
    setShowForm(true);
    setSchedMsg({ text: '', type: '' });
  };

  const saveSchedule = async () => {
    setLoadingSchedules(true);
    try {
      const payload = { ...formData, duration: Number(formData.duration), aggregator: formData.aggregator.join(',') };
      if (editId) {
        await axios.patch(`/api/smtp/schedules/${editId}`, payload);
      } else {
        await axios.post('/api/smtp/schedules', payload);
      }
      setShowForm(false);
      fetchSchedules();
    } catch (e) {
      setSchedMsg({ text: e.response?.data?.error || 'Failed to save', type: 'error' });
    } finally {
      setLoadingSchedules(false);
    }
  };

  const deleteSchedule = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Schedule',
      message: 'Are you sure you want to delete this schedule? This cannot be undone.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/smtp/schedules/${id}`);
          fetchSchedules();
        } catch (e) {
          console.error(e);
          setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to delete schedule', type: 'danger' });
        }
      }
    });
  };

  const runSchedule = async (id) => {
    try {
      await axios.post(`/api/smtp/schedules/${id}/run`);
      setAlertDialog({ isOpen: true, title: 'Success', message: 'Report generated and sent successfully!', type: 'info' });
      fetchSchedules();
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to send report: ' + (e.response?.data?.error || e.message), type: 'danger' });
    }
  };

  const toggleSchedule = async (s) => {
    try {
      await axios.patch(`/api/smtp/schedules/${s.id}`, { enabled: s.enabled ? 0 : 1 });
      fetchSchedules();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredMachines = machines.filter(m => formData.aggregator.length === 0 || formData.aggregator.includes(m.aggregator_name));

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Email Reports</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Configure SMTP settings and schedule automated security reports.</p>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>mail</span>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>SMTP Configuration</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', color: smtpConfig.enabled ? '#16a34a' : 'var(--muted)' }}>
              {smtpConfig.enabled ? 'Enabled' : 'Not configured'}
            </span>
          </div>
        </div>
        
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            
            {/* Connection Settings */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)' }}>router</span> Server Connection
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>SMTP Host</label>
                  <input id="smtp-host" className="input-field" type="text" placeholder="smtp.gmail.com" value={smtpConfig.host || ''} onChange={handleConfigChange}
                    style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Port</label>
                  <input id="smtp-port" className="input-field" type="number" value={smtpConfig.port || ''} onChange={handleConfigChange}
                    style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '4px' }}>
                  <div className="tog-switch">
                    <input type="checkbox" id="smtp-secure" checked={smtpConfig.secure || false} onChange={handleConfigChange} />
                    <span className="tog-slider"></span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Use TLS/SSL (port 465)</span>
                </label>
              </div>
            </div>

            {/* Authentication Settings */}
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)' }}>lock</span> Authentication
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Username</label>
                    <input id="smtp-username" className="input-field" type="text" placeholder="alerts@yourorg.com" value={smtpConfig.username || ''} onChange={handleConfigChange}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Password</label>
                    <input id="smtp-password" className="input-field" type="password" placeholder="leave blank to keep" value={smtpConfig.password || ''} onChange={handleConfigChange}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>From Address</label>
                    <input id="smtp-from_addr" className="input-field" type="text" placeholder="iochunt@yourorg.com" value={smtpConfig.from_addr || ''} onChange={handleConfigChange}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>From Name</label>
                    <input id="smtp-from_name" className="input-field" type="text" placeholder="IOC Hunt" value={smtpConfig.from_name || ''} onChange={handleConfigChange}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              <div className="tog-switch">
                <input type="checkbox" id="smtp-enabled" checked={smtpConfig.enabled || false} onChange={handleConfigChange} />
                <span className="tog-slider"></span>
              </div>
              Enable Scheduled Emails Engine
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: smtpMsg.type === 'error' ? 'var(--critical)' : 'var(--low)' }}>{smtpMsg.text}</span>
              
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', height: '36px' }}>
                <input type="text" className="input-field no-focus-outline" autoComplete="new-password" placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', padding: '0 12px', width: '200px', outline: 'none', boxShadow: 'none' }} />
                <button onClick={sendTestEmail} disabled={loadingConfig}
                  style={{ background: 'var(--surface2)', borderLeft: '1px solid var(--border)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', color: 'var(--text)', padding: '0 16px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', height: '100%', outline: 'none', opacity: loadingConfig ? 0.5 : 1 }}>
                  Send Test
                </button>
              </div>

              <button onClick={saveConfig} disabled={loadingConfig} className="rbtn"
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0 20px', height: '36px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', opacity: loadingConfig ? 0.5 : 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span> Save Configuration
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Schedules Panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>calendar_month</span>
            <h2 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Email Schedules</h2>
          </div>
          <button onClick={openNewForm} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
             + New Schedule
          </button>
        </div>

        {showForm && (
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: '#2563eb', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>{editId ? 'EDIT SCHEDULE' : 'NEW SCHEDULE'}</div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Schedule Name</label>
                <input id="sched-name" className="input-field" type="text" placeholder="Weekly Security Report" value={formData.name} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Recipients (comma-separated)</label>
                <input id="sched-recipients" className="input-field" type="text" placeholder="admin@org.com, soc@org.com" value={formData.recipients} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Cron Expression</label>
                <input id="sched-cron_expr" className="input-field" type="text" placeholder="0 8 * * 1" value={formData.cron_expr} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Report Duration</label>
                <select id="sched-duration" className="input-field" value={formData.duration} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none' }}>
                  <option value="1">Last 1 hour</option>
                  <option value="4">Last 4 hours</option>
                  <option value="24">Last 24 hours</option>
                  <option value="72">Last 3 days</option>
                  <option value="168">Last 7 days</option>
                  <option value="720">Last 30 days</option>
                </select>
              </div>
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Branch (optional)</label>
                <div 
                  onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formData.aggregator.length === 0 ? 'All Branches' : `${formData.aggregator.length} selected`}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)' }}>expand_more</span>
                </div>
                
                {showBranchDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 10, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {aggregators.map(a => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
                        <input 
                          type="checkbox"
                          checked={formData.aggregator.includes(a.name)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            let newAggrs = [...formData.aggregator];
                            if (isChecked) {
                              newAggrs.push(a.name);
                            } else {
                              newAggrs = newAggrs.filter(name => name !== a.name);
                            }
                            setFormData({ ...formData, aggregator: newAggrs });
                          }}
                        />
                        {a.name}
                      </label>
                    ))}
                    {aggregators.length === 0 && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No branches available</div>}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Machine (optional)</label>
                <select id="sched-machine" className="input-field" value={formData.machine} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none' }}>
                  <option value="">All Machines</option>
                  {filteredMachines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Severity Filter</label>
                <select id="sched-severity" className="input-field" value={formData.severity} onChange={handleFormChange}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none' }}>
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>
                <div className="tog-switch">
                  <input type="checkbox" id="sched-include_fw" checked={formData.include_fw} onChange={handleFormChange} />
                  <span className="tog-slider"></span>
                </div>
                Include Firewall data
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', cursor: 'pointer', color: 'var(--text)', fontWeight: 600 }}>
                <div className="tog-switch">
                  <input type="checkbox" id="sched-enabled" checked={formData.enabled} onChange={handleFormChange} />
                  <span className="tog-slider"></span>
                </div>
                Enabled
              </label>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '8px' }}>Quick Presets</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['0 8 * * 1', '0 8 * * *', '0 8 1 * *', '0 */6 * * *', '0 * * * *'].map(cron => {
                  const isSelected = formData.cron_expr === cron;
                  return (
                    <button key={cron} onClick={() => setFormData({ ...formData, cron_expr: cron })}
                      style={{ 
                        background: 'var(--surface)', 
                        border: isSelected ? '2px solid #2563eb' : '1px solid var(--border)', 
                        color: isSelected ? 'var(--text)' : 'var(--muted)', 
                        padding: isSelected ? '5px 9px' : '6px 10px', 
                        borderRadius: '4px', 
                        cursor: 'pointer', 
                        fontSize: '11px',
                        fontWeight: isSelected ? 600 : 400
                      }}>
                      {cron === '0 8 * * 1' ? 'Every Monday 8am' : cron === '0 8 * * *' ? 'Daily 8am' : cron === '0 8 1 * *' ? '1st of Month' : cron === '0 */6 * * *' ? 'Every 6 Hours' : 'Hourly'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button onClick={saveSchedule} disabled={loadingSchedules} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', opacity: loadingSchedules ? 0.5 : 1 }}>
                Save Schedule
              </button>
              <button onClick={() => setShowForm(false)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                Cancel
              </button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--critical)' }}>{schedMsg.text}</span>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          {schedules.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>No schedules configured yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Name</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Recipients</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Schedule</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Duration</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Branch</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Last Run</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <tr key={s.id} className="hover-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>{s.name}</td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.recipients.length > 20 ? s.recipients.substring(0, 20) + '...' : s.recipients}</td>
                      <td style={{ padding: '14px 16px', color: '#38bdf8', fontSize: '11px' }}>{s.cron_expr}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--text)', fontSize: '11px' }}>
                        {s.duration === 1 ? '1h' : s.duration === 4 ? '4h' : s.duration === 24 ? '24h' : s.duration === 72 ? '3d' : s.duration === 168 ? '7d' : s.duration === 720 ? '30d' : `${s.duration}h`}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.aggregator ? (s.aggregator.split(',').length > 1 ? `${s.aggregator.split(',').length} selected` : s.aggregator) : 'All'}</td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.machine || 'All'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.enabled ? '#22c55e' : 'var(--muted)' }}></div>
                          {s.enabled ? 'On' : 'Off'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--muted2)' }}>
                        {s.last_status && <div style={{ fontSize: '10px', color: s.last_status === 'OK' ? '#22c55e' : '#ef4444' }}>{s.last_status}</div>}
                        <div style={{ fontSize: '10px', color: '#728bb2' }}>{s.last_run ? new Date(s.last_run * 1000).toLocaleString() : 'Never'}</div>
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', fontFamily: 'var(--sans)' }}>
                          <button onClick={() => runSchedule(s.id)} style={{ background: 'rgba(34,212,122,0.1)', color: '#22c55e', border: '1px solid rgba(34,212,122,0.2)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Run</button>
                          <button onClick={() => editSchedule(s)} style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => toggleSchedule(s)} style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>{s.enabled ? 'Pause' : 'Resume'}</button>
                          <button onClick={() => deleteSchedule(s.id)} style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer' }}>X</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div onClick={() => setConfirmDialog({ isOpen: false, title: '', message: '', type: 'primary' })} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
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
        </div>
      )}

      {/* Alert Dialog */}
      {alertDialog.isOpen && (
        <div onClick={() => setAlertDialog({ isOpen: false, title: '', message: '', type: 'info' })} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{alertDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{alertDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setAlertDialog({ isOpen: false })} 
                style={{ background: alertDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
