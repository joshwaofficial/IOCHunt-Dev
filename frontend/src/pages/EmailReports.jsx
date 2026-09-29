import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, Router, Lock, Save, CalendarDays, Plus, Play, Edit, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInstance } from '../context/InstanceContext';
import { Navigate } from 'react-router-dom';

const FREQUENCY_PRESETS = [
  {
    id: 'daily',
    label: 'Daily',
    description: 'Triggers every day at the selected dispatch time • Covers preceding 24 hours of threat intelligence'
  },
  {
    id: 'weekly',
    label: 'Weekly (Every Monday)',
    description: 'Triggers every Monday at the selected dispatch time • Covers preceding 7 days of threat intelligence'
  },
  {
    id: 'monthly',
    label: 'Monthly (1st of Every Month)',
    description: 'Triggers on 1st of month at the selected dispatch time • Covers preceding 30 days of threat intelligence'
  },
  {
    id: 'custom',
    label: '⚙ Custom Cron Expression...',
    description: 'User-specified cron syntax (reports threat intelligence since last execution)'
  }
];

const getCronHumanReadable = (cronExpr) => {
  if (!cronExpr) return 'Custom';
  const trimmed = cronExpr.trim();
  const mDaily = trimmed.match(/^0\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (mDaily) {
    const h = parseInt(mDaily[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Daily at ${h12 < 10 ? '0' + h12 : h12}:00 ${ampm}`;
  }
  const mWeekly = trimmed.match(/^0\s+(\d+)\s+\*\s+\*\s+1$/);
  if (mWeekly) {
    const h = parseInt(mWeekly[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Weekly (Mon ${h12 < 10 ? '0' + h12 : h12}:00 ${ampm})`;
  }
  const mMonthly = trimmed.match(/^0\s+(\d+)\s+1\s+\*\s+\*$/);
  if (mMonthly) {
    const h = parseInt(mMonthly[1], 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Monthly (1st at ${h12 < 10 ? '0' + h12 : h12}:00 ${ampm})`;
  }
  if (trimmed === '* * * * *') return 'Every Minute (* * * * *)';
  if (trimmed === '0 9 * * 1-5') return 'Weekdays (Mon-Fri 09:00 AM)';
  return trimmed;
};

export default function EmailReports() {
  const { user } = useAuth();
  const { isCentral, isAggregator, loading: instanceLoading } = useInstance();
  const isAgg = !isCentral() || isAggregator() || Boolean(user?.aggregator_name) || user?.role?.toUpperCase() === 'AGGREGATOR_ADMIN';

  if (!instanceLoading && isAgg) {
    return <Navigate to="/dashboard" replace />;
  }

  const isAdmin = (user?.role?.toUpperCase() === 'ADMIN' || user?.role?.toUpperCase() === 'SUPERADMIN') && !user?.aggregator_name;

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
  const [downloadingPeriod, setDownloadingPeriod] = useState(null);
  const [formData, setFormData] = useState({
    name: '', recipients: '', frequency_preset: 'daily_8am', cron_expr: '0 8 * * *', duration: 24, aggregator: [], machine: '', severity: '', category: '', include_fw: true, enabled: true
  });

  useEffect(() => {
    if (isAgg) return;
    if (isAdmin) {
      fetchConfig();
    }
    fetchSchedules();
    fetchMachines();
    fetchAggregators();
  }, [isAdmin, isAgg]);

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
    if (!isAdmin) return;
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
    if (!isAdmin || !testEmail) return;
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

  const handleDownloadPreview = async (period) => {
    try {
      setDownloadingPeriod(period);
      const res = await axios.get(`/api/smtp/preview-pdf?period=${period}`, {
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IOCHunt_${period.toUpperCase()}_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download preview PDF:', err);
      setAlertDialog({
        isOpen: true,
        title: 'Preview Generation Error',
        message: 'Failed to generate PDF preview. ' + (err.response?.data?.error || err.message),
        type: 'danger'
      });
    } finally {
      setDownloadingPeriod(null);
    }
  };

  const handleConfigChange = (e) => {
    if (!isAdmin) return;
    const { id, value, type, checked } = e.target;
    const key = id.replace('smtp-', '');
    if (key === 'secure') {
      const nextPort = checked
        ? (Number(smtpConfig.port) === 587 ? 465 : smtpConfig.port)
        : (Number(smtpConfig.port) === 465 ? 587 : smtpConfig.port);
      setSmtpConfig({ ...smtpConfig, secure: checked, port: nextPort });
      return;
    }
    setSmtpConfig({ ...smtpConfig, [key]: type === 'checkbox' ? checked : value });
  };

  const handleFormChange = (e) => {
    if (!isAdmin) return;
    const { id, value, type, checked } = e.target;
    const key = id.replace('sched-', '');
    setFormData({ ...formData, [key]: type === 'checkbox' ? checked : value });
  };

  const computeCron = (preset, hour) => {
    const h = parseInt(hour, 10);
    const validH = isNaN(h) ? 8 : h;
    if (preset === 'daily' || preset === 'daily_8am') return `0 ${validH} * * *`;
    if (preset === 'weekly' || preset === 'weekly_mon_8am') return `0 ${validH} * * 1`;
    if (preset === 'monthly' || preset === 'monthly_1st_8am') return `0 ${validH} 1 * *`;
    return null;
  };

  const handleFrequencyChange = (e) => {
    if (!isAdmin) return;
    const selectedPresetId = e.target.value;
    if (selectedPresetId === 'custom') {
      setFormData(prev => ({
        ...prev,
        frequency_preset: 'custom'
      }));
    } else {
      const hour = formData.dispatch_hour || '8';
      const cron = computeCron(selectedPresetId, hour);
      const duration = selectedPresetId === 'daily' ? 24 : selectedPresetId === 'weekly' ? 168 : 720;
      setFormData(prev => ({
        ...prev,
        frequency_preset: selectedPresetId,
        cron_expr: cron || prev.cron_expr,
        duration
      }));
    }
  };

  const handleDispatchHourChange = (e) => {
    if (!isAdmin) return;
    const hour = e.target.value;
    const cron = computeCron(formData.frequency_preset, hour);
    setFormData(prev => ({
      ...prev,
      dispatch_hour: hour,
      cron_expr: cron || prev.cron_expr
    }));
  };

  const openNewForm = () => {
    if (!isAdmin) return;
    setEditId(null);
    setFormData({
      name: '',
      recipients: '',
      frequency_preset: 'daily',
      dispatch_hour: '8',
      cron_expr: '0 8 * * *',
      duration: 24,
      aggregator: [],
      machine: '',
      severity: '',
      category: '',
      include_fw: true,
      enabled: true
    });
    setShowForm(true);
    setSchedMsg({ text: '', type: '' });
  };

  const editSchedule = (s) => {
    if (!isAdmin) return;
    setEditId(s.id);
    const cron = (s.cron_expr || '').trim();
    let preset = 'custom';
    let hour = '8';

    const mDaily = cron.match(/^0\s+(\d+)\s+\*\s+\*\s+\*$/);
    const mWeekly = cron.match(/^0\s+(\d+)\s+\*\s+\*\s+1$/);
    const mMonthly = cron.match(/^0\s+(\d+)\s+1\s+\*\s+\*$/);

    if (mDaily) {
      preset = 'daily';
      hour = mDaily[1];
    } else if (mWeekly) {
      preset = 'weekly';
      hour = mWeekly[1];
    } else if (mMonthly) {
      preset = 'monthly';
      hour = mMonthly[1];
    }

    setFormData({
      name: s.name,
      recipients: s.recipients,
      frequency_preset: preset,
      dispatch_hour: hour,
      cron_expr: s.cron_expr,
      duration: s.duration,
      aggregator: s.aggregator ? s.aggregator.split(',') : [],
      machine: s.machine || '',
      severity: s.severity || '',
      category: s.category || '',
      include_fw: s.include_fw === 1,
      enabled: s.enabled === 1
    });
    setShowForm(true);
    setSchedMsg({ text: '', type: '' });
  };

  const saveSchedule = async () => {
    if (!isAdmin) return;
    setLoadingSchedules(true);
    try {
      const payload = { ...formData, duration: formData.duration === 'today' ? 'today' : Number(formData.duration), aggregator: formData.aggregator.join(',') };
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
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    try {
      await axios.post(`/api/smtp/schedules/${id}/run`);
      setAlertDialog({ isOpen: true, title: 'Success', message: 'Report generated and sent successfully!', type: 'info' });
      fetchSchedules();
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to send report: ' + (e.response?.data?.error || e.message), type: 'danger' });
    }
  };

  const toggleSchedule = async (s) => {
    if (!isAdmin) return;
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
                  <input id="smtp-host" className="input-field" type="text" placeholder="smtp.gmail.com" value={smtpConfig.host || ''} onChange={handleConfigChange} disabled={!isAdmin}
                    style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Port</label>
                  <input id="smtp-port" className="input-field" type="number" value={smtpConfig.port || ''} onChange={handleConfigChange} disabled={!isAdmin}
                    style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: isAdmin ? 'pointer' : 'not-allowed', marginTop: '4px', opacity: isAdmin ? 1 : 0.6 }}>
                  <div className="tog-switch">
                    <input type="checkbox" id="smtp-secure" checked={smtpConfig.secure || false} onChange={handleConfigChange} disabled={!isAdmin} />
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
                    <input id="smtp-username" className="input-field" type="text" placeholder="alerts@yourorg.com" value={smtpConfig.username || ''} onChange={handleConfigChange} disabled={!isAdmin}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>Password</label>
                    <input id="smtp-password" className="input-field" type="password" placeholder="leave blank to keep" value={smtpConfig.password || ''} onChange={handleConfigChange} disabled={!isAdmin}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>From Address</label>
                    <input id="smtp-from_addr" className="input-field" type="text" placeholder="iochunt@yourorg.com" value={smtpConfig.from_addr || ''} onChange={handleConfigChange} disabled={!isAdmin}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: '6px' }}>From Name</label>
                    <input id="smtp-from_name" className="input-field" type="text" placeholder="IOC Hunt" value={smtpConfig.from_name || ''} onChange={handleConfigChange} disabled={!isAdmin}
                      style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none', opacity: isAdmin ? 1 : 0.6, cursor: isAdmin ? 'text' : 'not-allowed' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: isAdmin ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 700, color: 'var(--text)', opacity: isAdmin ? 1 : 0.6 }}>
              <div className="tog-switch">
                <input type="checkbox" id="smtp-enabled" checked={smtpConfig.enabled || false} onChange={handleConfigChange} disabled={!isAdmin} />
                <span className="tog-slider"></span>
              </div>
              Enable Scheduled Emails Engine
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: smtpMsg.type === 'error' ? 'var(--critical)' : 'var(--low)' }}>{smtpMsg.text}</span>

              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', height: '36px', opacity: isAdmin ? 1 : 0.6 }}>
                <input type="text" className="input-field no-focus-outline" autoComplete="new-password" placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} disabled={!isAdmin}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', padding: '0 12px', width: '200px', outline: 'none', boxShadow: 'none', cursor: isAdmin ? 'text' : 'not-allowed' }} />
                <button onClick={sendTestEmail} disabled={loadingConfig || !isAdmin} title={isAdmin ? "Send test email" : "Admin privileges required"}
                  style={{ background: 'var(--surface2)', borderLeft: '1px solid var(--border)', borderTop: 'none', borderRight: 'none', borderBottom: 'none', color: 'var(--text)', padding: '0 16px', fontSize: '11px', fontWeight: 700, cursor: (!isAdmin || loadingConfig) ? 'not-allowed' : 'pointer', height: '100%', outline: 'none', opacity: (loadingConfig || !isAdmin) ? 0.5 : 1 }}>
                  Send Test
                </button>
              </div>

              <button onClick={saveConfig} disabled={loadingConfig || !isAdmin} className="rbtn" title={isAdmin ? "Save Configuration" : "Admin privileges required"}
                style={{ background: isAdmin ? '#2563eb' : 'var(--surface2)', color: isAdmin ? '#fff' : 'var(--muted)', border: isAdmin ? 'none' : '1px solid var(--border)', padding: '0 20px', height: '36px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', opacity: (loadingConfig || !isAdmin) ? 0.5 : 1, cursor: (!isAdmin || loadingConfig) ? 'not-allowed' : 'pointer' }}>
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
          <button onClick={openNewForm} disabled={!isAdmin} title={isAdmin ? "Create new email schedule" : "Admin privileges required"}
            style={{ background: isAdmin ? '#2563eb' : 'var(--surface2)', color: isAdmin ? '#fff' : 'var(--muted)', border: isAdmin ? 'none' : '1px solid var(--border)', padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.5 }}>
            + New Schedule
          </button>
        </div>

        {/* Instant Live Report Simulation & Test Download Bar */}
        <div style={{ padding: '14px 20px', background: 'rgba(37,99,235,0.03)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Simulate & Test Download Live Executive PDF
                <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(56,189,248,0.15)', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Instant Test</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Download and inspect the exact continuous vector PDF that is dispatched via email:
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => handleDownloadPreview('daily')}
              disabled={Boolean(downloadingPeriod)}
              title="Download live continuous report for preceding 24 hours"
              style={{
                background: downloadingPeriod === 'daily' ? 'rgba(56,189,248,0.2)' : 'var(--surface)',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: downloadingPeriod ? 'wait' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {downloadingPeriod === 'daily' ? 'sync' : 'picture_as_pdf'}
              </span>
              {downloadingPeriod === 'daily' ? 'Generating 24h...' : 'Daily (24h) PDF'}
            </button>

            <button
              onClick={() => handleDownloadPreview('weekly')}
              disabled={Boolean(downloadingPeriod)}
              title="Download live continuous report for preceding 7 days"
              style={{
                background: downloadingPeriod === 'weekly' ? 'rgba(139,92,246,0.2)' : 'var(--surface)',
                border: '1px solid #8b5cf6',
                color: '#8b5cf6',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: downloadingPeriod ? 'wait' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {downloadingPeriod === 'weekly' ? 'sync' : 'picture_as_pdf'}
              </span>
              {downloadingPeriod === 'weekly' ? 'Generating 7d...' : 'Weekly (7d) PDF'}
            </button>

            <button
              onClick={() => handleDownloadPreview('monthly')}
              disabled={Boolean(downloadingPeriod)}
              title="Download live continuous report for preceding 30 days"
              style={{
                background: downloadingPeriod === 'monthly' ? 'rgba(16,185,129,0.2)' : 'var(--surface)',
                border: '1px solid #10b981',
                color: '#10b981',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: downloadingPeriod ? 'wait' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {downloadingPeriod === 'monthly' ? 'sync' : 'picture_as_pdf'}
              </span>
              {downloadingPeriod === 'monthly' ? 'Generating 30d...' : 'Monthly (30d) PDF'}
            </button>
          </div>
        </div>

        {showForm && isAdmin && (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>
                    Schedule Frequency
                  </label>
                  <span style={{ fontSize: '10px', color: '#22c55e', fontFamily: 'var(--mono)', fontWeight: 600 }}>Automated Dispatch</span>
                </div>
                <select
                  id="sched-frequency_preset"
                  className="input-field"
                  value={formData.frequency_preset || 'daily'}
                  onChange={handleFrequencyChange}
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="daily">Daily (Every Day)</option>
                  <option value="weekly">Weekly (Every Monday)</option>
                  <option value="monthly">Monthly (1st of Every Month)</option>
                  <option value="custom">Custom Cron Expression...</option>
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>
                    Dispatch Time
                  </label>
                  <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--mono)', fontWeight: 600 }}>Fixed Run Time</span>
                </div>
                <select
                  id="sched-dispatch_hour"
                  className="input-field"
                  value={formData.dispatch_hour || '8'}
                  onChange={handleDispatchHourChange}
                  disabled={formData.frequency_preset === 'custom'}
                  style={{ width: '100%', height: '36px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: '12px', borderRadius: '6px', outline: 'none', cursor: formData.frequency_preset === 'custom' ? 'not-allowed' : 'pointer', opacity: formData.frequency_preset === 'custom' ? 0.5 : 1 }}
                >
                  <option value="0">12:00 AM (Midnight)</option>
                  <option value="6">06:00 AM</option>
                  <option value="7">07:00 AM</option>
                  <option value="8">08:00 AM (Recommended Default)</option>
                  <option value="9">09:00 AM</option>
                  <option value="10">10:00 AM</option>
                  <option value="11">11:00 AM</option>
                  <option value="12">12:00 PM (Noon)</option>
                  <option value="13">01:00 PM</option>
                  <option value="14">02:00 PM</option>
                  <option value="17">05:00 PM</option>
                  <option value="18">06:00 PM</option>
                  <option value="20">08:00 PM</option>
                </select>
              </div>

              <div style={{ gridColumn: 'span 2', fontSize: '11px', color: 'var(--muted)', marginTop: '-8px', marginBottom: '4px', fontFamily: 'var(--sans)' }}>
                {formData.frequency_preset === 'daily' && `Automatically triggers daily at ${formData.dispatch_hour ? (formData.dispatch_hour % 12 || 12) + ':00 ' + (formData.dispatch_hour >= 12 ? 'PM' : 'AM') : '08:00 AM'} sharp and sends 24 hours of executive threat analytics.`}
                {formData.frequency_preset === 'weekly' && `Automatically triggers every Monday at ${formData.dispatch_hour ? (formData.dispatch_hour % 12 || 12) + ':00 ' + (formData.dispatch_hour >= 12 ? 'PM' : 'AM') : '08:00 AM'} sharp and sends 7 days of executive threat analytics.`}
                {formData.frequency_preset === 'monthly' && `Automatically triggers on the 1st of every month at ${formData.dispatch_hour ? (formData.dispatch_hour % 12 || 12) + ':00 ' + (formData.dispatch_hour >= 12 ? 'PM' : 'AM') : '08:00 AM'} sharp and sends 30 days of executive threat analytics.`}
                {formData.frequency_preset === 'custom' && 'Automatically sends executive threat analytics accumulated since the last email run.'}
              </div>

              {formData.frequency_preset === 'custom' && (
                <div style={{ gridColumn: 'span 2', background: 'var(--surface)', border: '1px dashed #3b82f6', borderRadius: '6px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase', fontWeight: 700 }}>
                      Custom Cron Expression
                    </label>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Format: minute hour day month day-of-week</span>
                  </div>
                  <input
                    id="sched-cron_expr"
                    className="input-field"
                    type="text"
                    placeholder="e.g. 0 9 * * 1-5"
                    value={formData.cron_expr}
                    onChange={handleFormChange}
                    style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '12px', borderRadius: '6px', outline: 'none' }}
                  />
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '6px', fontFamily: 'var(--mono)' }}>
                    Examples: <code style={{ color: '#38bdf8' }}>0 9 * * 1-5</code> (Mon-Fri 9:00 AM) &nbsp;|&nbsp; <code style={{ color: '#38bdf8' }}>*/15 * * * *</code> (Every 15 mins) &nbsp;|&nbsp; <code style={{ color: '#38bdf8' }}>0 0,12 * * *</code> (Twice daily)
                  </div>
                </div>
              )}

              <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Frequency</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Branch</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Last Sent & Delivery</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map(s => (
                    <tr key={s.id} className="hover-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>{s.name}</td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.recipients.length > 20 ? s.recipients.substring(0, 20) + '...' : s.recipients}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px' }}>
                        <div style={{ color: '#38bdf8', fontWeight: 600, fontFamily: 'var(--sans)' }}>{getCronHumanReadable(s.cron_expr)}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--mono)', marginTop: '2px' }}>{s.cron_expr}</div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.aggregator ? (s.aggregator.split(',').length > 1 ? `${s.aggregator.split(',').length} selected` : s.aggregator) : 'All'}</td>
                      <td style={{ padding: '14px 16px', color: '#728bb2', fontSize: '11px' }}>{s.machine || 'All'}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--sans)' }}>
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.enabled ? '#22c55e' : 'var(--muted)' }}></div>
                          {s.enabled ? 'Active' : 'Paused'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {s.last_run ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: s.last_status === 'OK' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: s.last_status === 'OK' ? '#22c55e' : '#ef4444'
                              }}>
                                {s.last_status === 'OK' ? 'Delivered' : 'Failed'}
                              </span>
                            </div>
                            <div style={{ fontSize: '10px', color: '#728bb2', fontFamily: 'var(--mono)' }}>
                              {new Date(s.last_run * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                            </div>
                            {s.last_status && s.last_status !== 'OK' && (
                              <div style={{ fontSize: '9px', color: '#ef4444', marginTop: '2px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.last_status}>
                                {s.last_status.replace(/^ERROR:\s*/, '')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: 'var(--surface2)', color: 'var(--muted)' }}>
                              Pending
                            </span>
                            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Never sent</div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', fontFamily: 'var(--sans)' }}>
                          <button
                            onClick={() => isAdmin && runSchedule(s.id)}
                            disabled={!isAdmin}
                            title={isAdmin ? "Run schedule now" : "Admin privileges required"}
                            style={{
                              background: isAdmin ? 'rgba(34,212,122,0.1)' : 'var(--surface2)',
                              color: isAdmin ? '#22c55e' : 'var(--muted)',
                              border: `1px solid ${isAdmin ? 'rgba(34,212,122,0.2)' : 'var(--border)'}`,
                              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.4
                            }}>
                            Run
                          </button>
                          <button
                            onClick={() => isAdmin && editSchedule(s)}
                            disabled={!isAdmin}
                            title={isAdmin ? "Edit schedule" : "Admin privileges required"}
                            style={{
                              background: 'var(--surface2)',
                              color: isAdmin ? 'var(--text)' : 'var(--muted)',
                              border: '1px solid var(--border)',
                              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.4
                            }}>
                            Edit
                          </button>
                          <button
                            onClick={() => isAdmin && toggleSchedule(s)}
                            disabled={!isAdmin}
                            title={isAdmin ? (s.enabled ? 'Pause schedule' : 'Resume schedule') : "Admin privileges required"}
                            style={{
                              background: 'var(--surface2)',
                              color: isAdmin ? 'var(--text)' : 'var(--muted)',
                              border: '1px solid var(--border)',
                              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.4
                            }}>
                            {s.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => isAdmin && deleteSchedule(s.id)}
                            disabled={!isAdmin}
                            title={isAdmin ? "Delete schedule" : "Admin privileges required"}
                            style={{
                              background: isAdmin ? 'rgba(239,68,68,0.1)' : 'var(--surface2)',
                              color: isAdmin ? '#ef4444' : 'var(--muted)',
                              border: `1px solid ${isAdmin ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                              padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                              cursor: isAdmin ? 'pointer' : 'not-allowed',
                              opacity: isAdmin ? 1 : 0.4
                            }}>
                            X
                          </button>
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
