import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Save,
  Clock
} from 'lucide-react';

export default function Settings() {
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

  // Security Settings State
  const [securitySettings, setSecuritySettings] = useState({
    session_timeout_mins: 120
  });

  // Fetch persisted settings from backend
  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/super/settings');
      if (res.data?.settings?.security) {
        setSecuritySettings(prev => ({
          ...prev,
          ...res.data.settings.security
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

  // Handle Session Timeout Save
  const handleSaveSecurity = async () => {
    setIsSaving(true);
    try {
      await axios.put('/api/super/settings', {
        category: 'security',
        settings: securitySettings
      });
      showAlert('success', 'Security session policy updated successfully.');
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Failed to save security settings.');
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
      showAlert('success', res.data?.message || 'Super Admin master password updated successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showAlert('error', err.response?.data?.error || 'Failed to update master password.');
    } finally {
      setIsPasswordChanging(false);
    }
  };

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          Security & Access Settings
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          Manage root control plane administrative credentials and session timeout policies
        </p>
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

      {/* Grid: Password Change & Session Policy */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
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
                  placeholder="Enter current master password"
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

        {/* Session Inactivity Policy */}
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                Session Inactivity Policy
              </h3>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Automatic idle timeout for Super Admin dashboard sessions
              </span>
            </div>
            <Clock size={16} color="#10b981" />
          </div>
          <div className="ent-card-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Session Idle Timeout</label>
              <select
                className="form-input"
                value={securitySettings.session_timeout_mins}
                onChange={(e) => setSecuritySettings({
                  session_timeout_mins: parseInt(e.target.value, 10)
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
                Active sessions exceeding this inactivity window will be invalidated automatically.
              </span>
            </div>

            <div style={{
              padding: '14px',
              background: '#090b10',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#94a3b8',
              lineHeight: 1.5
            }}>
              <div style={{ fontWeight: '600', color: '#f8fafc', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={14} color="#38bdf8" />
                <span>Security Recommendations:</span>
              </div>
              Rotate master credentials every 90 days and keep session timeout under 2 hours on shared administrative machines.
            </div>

            <div style={{ paddingTop: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isSaving || isLoading}
                onClick={handleSaveSecurity}
                style={{ width: '100%', justifyContent: 'center', gap: '6px' }}
              >
                <Save size={14} />
                <span>{isSaving ? 'Saving Policy...' : 'Save Session Policy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
