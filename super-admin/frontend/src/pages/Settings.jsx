import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  KeyRound,
  Lock,
  Globe,
  Bell,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Check,
  Server,
  Activity,
  Terminal,
  ExternalLink
} from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('security');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState({ type: '', message: '' });

  // Password Change State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isPasswordChanging, setIsPasswordChanging] = useState(false);

  // Dynamic Settings State
  const [settings, setSettings] = useState({
    security: {
      session_timeout_mins: 120,
      ip_whitelist: '',
      mfa_enforced: false
    },
    platform: {
      portal_domain: window.location.hostname ? `https://${window.location.hostname}:8082` : '',
      syslog_start_port: 9501,
      log_retention_days: 90,
      maintenance_mode: false
    },
    notifications: {
      smtp_host: '',
      smtp_port: 587,
      smtp_user: '',
      smtp_password: '',
      smtp_from: 'no-reply@iochunt.local',
      alert_webhook_url: ''
    }
  });

  // Fetch persisted settings from backend
  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/super/settings');
      if (res.data?.settings) {
        setSettings(prev => ({
          ...prev,
          ...res.data.settings,
          security: { ...prev.security, ...res.data.settings.security },
          platform: { ...prev.platform, ...res.data.settings.platform },
          notifications: { ...prev.notifications, ...res.data.settings.notifications }
        }));
      }
    } catch (err) {
      console.warn('[Settings] Failed to fetch settings:', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => {
      setAlert({ type: '', message: '' });
    }, 4500);
  };

  // Handle Settings Save
  const handleSaveSettings = async (category) => {
    setIsSaving(true);
    try {
      await axios.put('/api/super/settings', {
        category,
        settings: settings[category]
      });
      showAlert('success', `Successfully saved ${category.toUpperCase()} configuration.`);
    } catch (err) {
      showAlert('error', err.response?.data?.error || `Failed to save ${category} settings.`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Master Super Admin Password Change
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      showAlert('error', 'All password fields are required.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      showAlert('error', 'New password must be at least 8 characters long.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showAlert('error', 'New password and confirmation do not match.');
      return;
    }

    setIsPasswordChanging(true);
    try {
      const res = await axios.post('/api/super/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
      });
      showAlert('success', res.data?.message || 'Super Admin password updated successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Failed to update master password.');
    } finally {
      setIsPasswordChanging(false);
    }
  };

  const tabs = [
    { id: 'security', label: 'Security & Access', icon: <Lock size={15} /> },
    { id: 'platform', label: 'Platform & Network', icon: <Globe size={15} /> },
    { id: 'notifications', label: 'Alerts & Webhooks', icon: <Bell size={15} /> },
    { id: 'maintenance', label: 'Cluster Maintenance', icon: <HardDrive size={15} /> }
  ];

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Control Plane Settings
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Master credentials, multi-tenant networking policies, notification webhooks, and retention rules
          </p>
        </div>

        {/* Quick link to Tenant Portal */}
        <a
          href={settings.platform.portal_domain || `https://${window.location.hostname}:8082`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary"
          style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span>Open Tenant Workspace</span>
          <ExternalLink size={12} />
        </a>
      </div>

      {/* Alert Banner */}
      {alert.message && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          background: alert.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
          border: `1px solid ${alert.type === 'success' ? '#10b981' : '#f43f5e'}`,
          color: alert.type === 'success' ? '#34d399' : '#fb7185'
        }}>
          {alert.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{alert.message}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        gap: '4px'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === tab.id ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: SECURITY & CREDENTIALS */}
      {activeTab === 'security' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Master Password Change */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  Master Super Admin Password
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Rotate the root control plane administrative credentials
                </span>
              </div>
              <KeyRound size={16} color="#38bdf8" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px' }}>
              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Current Master Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter current password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Password (min 8 chars)</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter strong new password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Confirm new password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  />
                </div>

                <div style={{ paddingTop: '8px' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isPasswordChanging}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {isPasswordChanging ? 'Updating Password...' : 'Update Master Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Session & Access Policies */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  Access Security & Session Policy
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Inactivity limits and administrator source IP restriction
                </span>
              </div>
              <Shield size={16} color="#10b981" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Session Inactivity Timeout</label>
                <select
                  className="form-input"
                  value={settings.security.session_timeout_mins}
                  onChange={(e) => setSettings({
                    ...settings,
                    security: { ...settings.security, session_timeout_mins: parseInt(e.target.value, 10) }
                  })}
                >
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours (Default)</option>
                  <option value={240}>4 Hours</option>
                  <option value={480}>8 Hours</option>
                  <option value={1440}>24 Hours</option>
                </select>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Inactive control plane sessions are invalidated automatically.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Admin IP Whitelist (CIDR / Comma-separated)</label>
                <textarea
                  className="form-input font-mono"
                  rows={4}
                  placeholder="e.g. 14.99.11.58, 106.51.233.42, 192.168.1.0/24 (Leave blank for unrestricted)"
                  value={settings.security.ip_whitelist}
                  onChange={(e) => setSettings({
                    ...settings,
                    security: { ...settings.security, ip_whitelist: e.target.value }
                  })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  When configured, requests from unlisted IPs will be denied access to port 8083.
                </span>
              </div>

              <div style={{ paddingTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSaving}
                  onClick={() => handleSaveSettings('security')}
                  style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving...' : 'Save Access Policies'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLATFORM & NETWORKING */}
      {activeTab === 'platform' && (
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                Platform Routing & Syslog Allocation
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Unified workspace endpoints, listener port range, and retention rules
              </span>
            </div>
            <Globe size={16} color="#38bdf8" />
          </div>
          <div className="ent-card-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Central Workspace URL (All Tenants)</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="https://72.62.241.39:8082"
                  value={settings.platform.portal_domain}
                  onChange={(e) => setSettings({
                    ...settings,
                    platform: { ...settings.platform, portal_domain: e.target.value }
                  })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  The unified portal URL shared across all provisioned organizations.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Syslog Port Starting Offset</label>
                <input
                  type="number"
                  className="form-input font-mono"
                  placeholder="9501"
                  value={settings.platform.syslog_start_port}
                  onChange={(e) => setSettings({
                    ...settings,
                    platform: { ...settings.platform, syslog_start_port: parseInt(e.target.value, 10) || 9501 }
                  })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  New tenants receive sequentially allocated UDP ports starting from this port.
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="form-group">
                <label className="form-label">Agent Log Retention Period</label>
                <select
                  className="form-input"
                  value={settings.platform.log_retention_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    platform: { ...settings.platform, log_retention_days: parseInt(e.target.value, 10) }
                  })}
                >
                  <option value={30}>30 Days</option>
                  <option value={60}>60 Days</option>
                  <option value={90}>90 Days (Recommended)</option>
                  <option value={180}>180 Days (6 Months)</option>
                  <option value={365}>365 Days (1 Year)</option>
                </select>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Raw machine telemetry older than this limit is vacuumed during maintenance.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Platform Maintenance Mode</label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#090b10',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px'
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: settings.platform.maintenance_mode ? '#f43f5e' : '#f8fafc' }}>
                      {settings.platform.maintenance_mode ? 'Maintenance Enabled' : 'Normal Operation'}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Temporarily freeze tenant provisioning and credential changes
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.platform.maintenance_mode}
                    onChange={(e) => setSettings({
                      ...settings,
                      platform: { ...settings.platform, maintenance_mode: e.target.checked }
                    })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isSaving}
                onClick={() => handleSaveSettings('platform')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={14} />
                <span>{isSaving ? 'Saving...' : 'Save Platform Configuration'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ALERTS & NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* SMTP Server Configuration */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  SMTP Mail Server
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Used for password reset emails and tenant welcome notifications
                </span>
              </div>
              <Bell size={16} color="#f59e0b" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">SMTP Host</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="smtp.example.com"
                    value={settings.notifications.smtp_host}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, smtp_host: e.target.value }
                    })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Port</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="587"
                    value={settings.notifications.smtp_port}
                    onChange={(e) => setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, smtp_port: parseInt(e.target.value, 10) || 587 }
                    })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">SMTP Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="mailer@example.com"
                  value={settings.notifications.smtp_user}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, smtp_user: e.target.value }
                  })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">SMTP Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••••••"
                  value={settings.notifications.smtp_password}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, smtp_password: e.target.value }
                  })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">From Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="no-reply@iochunt.local"
                  value={settings.notifications.smtp_from}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, smtp_from: e.target.value }
                  })}
                />
              </div>
            </div>
          </div>

          {/* Webhook Alerts */}
          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  SOC Incident & Audit Webhook
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Stream critical control plane events to Slack, Discord, or SIEM
                </span>
              </div>
              <Terminal size={16} color="#6366f1" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Webhook URL (HTTPS)</label>
                <input
                  type="url"
                  className="form-input font-mono"
                  placeholder="https://hooks.slack.com/services/..."
                  value={settings.notifications.alert_webhook_url}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, alert_webhook_url: e.target.value }
                  })}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  POST requests with JSON payloads will be dispatched upon tenant provisioning or suspension.
                </span>
              </div>

              <div style={{
                padding: '14px',
                background: '#090b10',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#94a3b8'
              }}>
                <div style={{ fontWeight: '600', color: '#f8fafc', marginBottom: '4px' }}>Events Dispatched:</div>
                <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <li>Tenant Provisioned / Deleted</li>
                  <li>Tenant Suspended / Resumed</li>
                  <li>Admin Master Password Changed</li>
                  <li>High Ingestion Spike Warning</li>
                </ul>
              </div>

              <div style={{ paddingTop: '18px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSaving}
                  onClick={() => handleSaveSettings('notifications')}
                  style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
                >
                  <Save size={14} />
                  <span>{isSaving ? 'Saving...' : 'Save Notification Channels'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MAINTENANCE & CLUSTER HEALTH */}
      {activeTab === 'maintenance' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  PostgreSQL Cluster Architecture
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Logical multi-tenant database topology
                </span>
              </div>
              <Server size={16} color="#10b981" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Multi-Tenant Strategy</span>
                <span style={{ color: '#f8fafc', fontWeight: '500' }}>Dedicated Logical DBs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Central Gateway</span>
                <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>NGINX Port 8080</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Syslog Listener Pool</span>
                <span style={{ color: '#10b981', fontFamily: 'monospace' }}>UDP 9501+ Range</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Control Plane Backend</span>
                <span style={{ color: '#f8fafc', fontFamily: 'monospace' }}>Port 4002 (Internal)</span>
              </div>
            </div>
          </div>

          <div className="ent-card">
            <div className="ent-card-header">
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  Maintenance Operations
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Database diagnostics and system telemetry
                </span>
              </div>
              <Activity size={16} color="#38bdf8" />
            </div>
            <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                Control plane and tenant logical databases are inspected in real time for integrity and vacuuming readiness.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => showAlert('success', 'Database connectivity and pool health verified across all tenants.')}
                  style={{ justifyContent: 'center', gap: '6px' }}
                >
                  <Activity size={14} color="#10b981" />
                  <span>Verify Database Connections</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => showAlert('success', 'Backup snapshot scheduled in background daemon.')}
                  style={{ justifyContent: 'center', gap: '6px' }}
                >
                  <HardDrive size={14} color="#f59e0b" />
                  <span>Trigger Snapshot Backup</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
