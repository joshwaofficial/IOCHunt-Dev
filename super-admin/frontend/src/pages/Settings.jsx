import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings as SettingsIcon,
  Shield,
  KeyRound,
  Globe,
  Bell,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Save,
  Download,
  Lock,
  Server,
  RefreshCw,
  Mail
} from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('security');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [saveError, setSaveError] = useState('');

  // Platform & General Settings
  const [settings, setSettings] = useState({
    portal_url: 'https://72.62.241.39:8082',
    syslog_base_port: 9501,
    log_retention_days: 30,
    session_timeout_hours: 8,
    alerts_enabled: false,
    alerts_webhook_url: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_from: 'alerts@iochunt.local',
    maintenance_mode: false,
    maintenance_message: 'The control plane is currently undergoing routine maintenance.'
  });

  // Password Change Form State
  const [pwdForm, setPwdForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    setSaveError('');
    try {
      const res = await axios.get('/api/super/settings');
      if (res.data) {
        setSettings(prev => ({ ...prev, ...res.data }));
      }
    } catch (err) {
      console.error('[Settings Fetch Error]', err);
      setSaveError('Failed to load current settings from server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveSuccess('');
    setSaveError('');
    try {
      const res = await axios.put('/api/super/settings', settings);
      if (res.data?.success) {
        setSaveSuccess('Platform settings saved and applied successfully.');
        setTimeout(() => setSaveSuccess(''), 4000);
      }
    } catch (err) {
      console.error('[Settings Save Error]', err);
      setSaveError(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdSuccess('');
    setPwdError('');

    if (!pwdForm.current_password || !pwdForm.new_password) {
      setPwdError('Please enter both current and new passwords.');
      return;
    }
    if (pwdForm.new_password.length < 8) {
      setPwdError('New password must be at least 8 characters long.');
      return;
    }
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      setPwdError('New password and confirmation do not match.');
      return;
    }

    setPwdLoading(true);
    try {
      const res = await axios.post('/api/super/change-password', {
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password
      });

      if (res.data?.success) {
        setPwdSuccess('Master password changed successfully. Use the new password for future logins.');
        setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
        setTimeout(() => setPwdSuccess(''), 6000);
      }
    } catch (err) {
      console.error('[Password Change Error]', err);
      setPwdError(err.response?.data?.error || 'Failed to change password. Please verify current password.');
    } finally {
      setPwdLoading(false);
    }
  };

  const tabs = [
    { id: 'security', label: 'Security & Access', icon: <Shield size={15} /> },
    { id: 'platform', label: 'Platform & Network', icon: <Globe size={15} /> },
    { id: 'notifications', label: 'Alerts & Delivery', icon: <Bell size={15} /> },
    { id: 'maintenance', label: 'Maintenance & Tools', icon: <HardDrive size={15} /> }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Control Plane Settings
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Manage master credentials, platform defaults, alert channels, and maintenance controls
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={fetchSettings} disabled={isLoading || isSaving}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Reload
          </button>
          {activeTab !== 'security' && (
            <button className="btn btn-primary" onClick={handleSaveSettings} disabled={isSaving || isLoading}>
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>

      {/* Global Toast / Feedback Alerts */}
      {saveSuccess && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '6px',
          color: '#10b981',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} /> {saveSuccess}
        </div>
      )}
      {saveError && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '6px',
          color: '#f43f5e',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} /> {saveError}
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="tab-group" style={{ width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* TAB CONTENT: SECURITY & ACCESS */}
      {activeTab === 'security' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
          {/* Master Password Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <KeyRound size={16} color="#38bdf8" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    Change Master Super Admin Password
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Update credentials for master cluster access</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body">
              {pwdSuccess && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '6px',
                  color: '#10b981',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={15} /> {pwdSuccess}
                </div>
              )}
              {pwdError && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  borderRadius: '6px',
                  color: '#f43f5e',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={15} /> {pwdError}
                </div>
              )}

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Current Master Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter current password"
                    value={pwdForm.current_password}
                    onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Password (min 8 characters)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter strong new password"
                    value={pwdForm.new_password}
                    onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Re-type new password"
                    value={pwdForm.confirm_password}
                    onChange={(e) => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pwdLoading}
                  style={{ marginTop: '8px', alignSelf: 'flex-start' }}
                >
                  <Lock size={14} /> {pwdLoading ? 'Updating Password...' : 'Update Master Password'}
                </button>
              </form>
            </div>
          </div>

          {/* Session Expiry & Access Policies Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={16} color="#10b981" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    Control Plane Security Policies
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Configure session TTL and authentication constraints</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div className="form-group">
                <label className="form-label">Super Admin Session Timeout</label>
                <select
                  className="form-input"
                  value={settings.session_timeout_hours}
                  onChange={(e) => setSettings({ ...settings, session_timeout_hours: parseInt(e.target.value, 10) })}
                >
                  <option value={1}>1 Hour (High Security)</option>
                  <option value={4}>4 Hours</option>
                  <option value={8}>8 Hours (Standard)</option>
                  <option value={24}>24 Hours</option>
                  <option value={168}>7 Days</option>
                </select>
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Administrators will be asked to re-authenticate after this period of inactivity.
                </span>
              </div>

              <div style={{
                padding: '14px',
                background: '#0b0d14',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#94a3b8'
              }}>
                <div style={{ fontWeight: '500', color: '#f8fafc', marginBottom: '4px' }}>
                  Audit Trail Logging
                </div>
                All administrative actions (tenant suspension, deletion, password resets, and settings changes) are permanently immutably logged with the operator's source IP address in the Control Audit Logs.
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSaveSettings}
                disabled={isSaving}
                style={{ alignSelf: 'flex-start' }}
              >
                <Save size={14} /> Save Security Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PLATFORM & NETWORK */}
      {activeTab === 'platform' && (
        <div className="ent-card">
          <div className="ent-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={16} color="#38bdf8" />
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  Platform Telemetry & Ingestion Defaults
                </h3>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Configure central hostnames, port allocation, and retention rules</span>
              </div>
            </div>
          </div>

          <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group">
              <label className="form-label">Central Workspace Portal URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://72.62.241.39:8082"
                value={settings.portal_url}
                onChange={(e) => setSettings({ ...settings, portal_url: e.target.value })}
              />
              <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                The public URL or domain where tenant users log into their security dashboards.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Syslog Starting Base Port</label>
                <input
                  type="number"
                  className="form-input font-mono"
                  placeholder="9501"
                  value={settings.syslog_base_port}
                  onChange={(e) => setSettings({ ...settings, syslog_base_port: parseInt(e.target.value, 10) || 9501 })}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Newly provisioned tenants will be assigned incremental UDP syslog listener ports starting here.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Agent Log Retention (Days)</label>
                <input
                  type="number"
                  className="form-input font-mono"
                  placeholder="30"
                  value={settings.log_retention_days}
                  onChange={(e) => setSettings({ ...settings, log_retention_days: parseInt(e.target.value, 10) || 30 })}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Raw endpoint agent telemetry and heartbeat logs older than this threshold will be purged.
                </span>
              </div>
            </div>

            <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={isSaving}>
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Platform Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: NOTIFICATIONS & DELIVERY */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
          {/* Webhook Notifications Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Bell size={16} color="#f59e0b" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    Security Webhook Dispatcher
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Forward critical cluster events to Slack or SIEM</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="alerts_enabled"
                  checked={settings.alerts_enabled}
                  onChange={(e) => setSettings({ ...settings, alerts_enabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                <label htmlFor="alerts_enabled" style={{ fontSize: '13px', fontWeight: '500', color: '#f8fafc', cursor: 'pointer' }}>
                  Enable Webhook Alerts for Control Plane Events
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Incoming Webhook URL</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.alerts_webhook_url || ''}
                  onChange={(e) => setSettings({ ...settings, alerts_webhook_url: e.target.value })}
                  disabled={!settings.alerts_enabled}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  JSON payloads will be POSTed on tenant creation, status changes, and database threshold warnings.
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveSettings}
                disabled={isSaving}
                style={{ alignSelf: 'flex-start', marginTop: '8px' }}
              >
                <Save size={14} /> Save Webhook Configuration
              </button>
            </div>
          </div>

          {/* SMTP Email Settings Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Mail size={16} color="#38bdf8" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    SMTP Mail Delivery (Tenant Notifications)
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Configure relay for automated tenant communications</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">SMTP Host</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="smtp.mailgun.org"
                    value={settings.smtp_host || ''}
                    onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Port</label>
                  <input
                    type="number"
                    className="form-input font-mono"
                    placeholder="587"
                    value={settings.smtp_port || 587}
                    onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value, 10) || 587 })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Sender Email Address (From)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="alerts@iochunt.local"
                  value={settings.smtp_from || ''}
                  onChange={(e) => setSettings({ ...settings, smtp_from: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">SMTP Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="postmaster@iochunt.domain"
                  value={settings.smtp_user || ''}
                  onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                />
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSaveSettings}
                disabled={isSaving}
                style={{ alignSelf: 'flex-start', marginTop: '8px' }}
              >
                <Save size={14} /> Save SMTP Relay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: MAINTENANCE & TOOLS */}
      {activeTab === 'maintenance' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
          {/* Maintenance Mode Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={16} color="#ec4899" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    Cluster Maintenance Window
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Restrict administrative operations during upgrades</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="maintenance_mode"
                  checked={settings.maintenance_mode}
                  onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#f43f5e', cursor: 'pointer' }}
                />
                <label htmlFor="maintenance_mode" style={{ fontSize: '13px', fontWeight: '500', color: '#f8fafc', cursor: 'pointer' }}>
                  Enable Cluster Maintenance Mode
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Maintenance Notice Banner Message</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={settings.maintenance_message || ''}
                  onChange={(e) => setSettings({ ...settings, maintenance_message: e.target.value })}
                  placeholder="System undergoing scheduled maintenance..."
                />
              </div>

              <button
                type="button"
                className="btn btn-danger"
                onClick={handleSaveSettings}
                disabled={isSaving}
                style={{ alignSelf: 'flex-start' }}
              >
                <Save size={14} /> Update Maintenance State
              </button>
            </div>
          </div>

          {/* Audit Data Export Card */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Download size={16} color="#10b981" />
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                    Audit Trail Compliance Export
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Download comprehensive audit logs for SOC2 / ISO compliance</span>
                </div>
              </div>
            </div>

            <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                Download the complete recorded history of Super Admin interventions, credentials resets, tenant additions, and status changes.
              </p>

              <div style={{
                padding: '12px',
                background: '#0b0d14',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#64748b'
              }}>
                Format: <span style={{ color: '#f8fafc' }}>JSON File</span> • Limit: <span style={{ color: '#f8fafc' }}>Latest 5,000 Entries</span>
              </div>

              <a
                href="/api/super/audit-logs/export"
                download="control-plane-audit-logs.json"
                className="btn btn-secondary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start' }}
              >
                <Download size={14} /> Download Full Audit Archive (JSON)
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
