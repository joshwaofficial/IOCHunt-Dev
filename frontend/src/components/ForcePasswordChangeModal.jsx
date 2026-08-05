import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Shield, Lock, CheckCircle, AlertTriangle, KeyRound, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ForcePasswordChangeModal() {
  const { user, setUser, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Complexity rules
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const passwordsMatch = newPassword && newPassword === confirmPassword;
  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial && passwordsMatch && currentPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      toast.error('Please meet all password requirements before proceeding.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      });

      toast.success(res.data.message || 'Password successfully updated!');
      
      // Update user state so force_password_change becomes false
      setUser(prev => ({
        ...prev,
        force_password_change: false
      }));
    } catch (err) {
      console.error('Password change error:', err);
      toast.error(err.response?.data?.error || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <style>{`
        .login-page-wrapper {
          --bg: #07091a;
          --surface: rgba(15, 20, 40, 0.85);
          --border: rgba(255, 255, 255, 0.08);
          --text: #e2e8f8;
          --muted: #64748b;
          --accent: #2563eb;
          --critical: #ef4444;
          --low: #22c55e;
          --mono: 'Space Mono', monospace;
          --sans: 'Inter', -apple-system, sans-serif;
          
          font-family: var(--sans);
          background: radial-gradient(ellipse at 50% 15%, #172554 0%, #07091a 80%);
          color: var(--text);
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          position: fixed;
          top: 0;
          left: 0;
          overflow-y: auto;
          padding: 24px 16px;
          z-index: 99999;
        }

        .login-page-wrapper * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .login-page-wrapper .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          z-index: 0;
        }
        .login-page-wrapper .orb1 {
          width: 450px;
          height: 450px;
          background: rgba(37, 99, 235, 0.15);
          top: -120px;
          right: -100px;
        }
        .login-page-wrapper .orb2 {
          width: 350px;
          height: 350px;
          background: rgba(139, 92, 246, 0.1);
          bottom: -100px;
          left: -80px;
        }

        .login-page-wrapper .card {
          position: relative;
          z-index: 1;
          background: rgba(11, 17, 35, 0.88);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 36px 40px;
          width: 100%;
          max-width: 460px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-page-wrapper .logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .login-page-wrapper .logo-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
        }
        .login-page-wrapper .logo-icon .material-symbols-outlined {
          font-size: 24px;
          color: #fff;
        }
        .login-page-wrapper .logo-name {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #fff;
        }
        .login-page-wrapper .logo-sub {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 1px;
        }

        .login-page-wrapper h1 {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
          margin-bottom: 4px;
        }
        .login-page-wrapper .subtitle {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 22px;
          line-height: 1.4;
        }

        .login-page-wrapper .field {
          margin-bottom: 16px;
        }
        .login-page-wrapper .field label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 6px;
        }
        .login-page-wrapper .input-wrap {
          position: relative;
        }
        .login-page-wrapper .input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          color: var(--muted);
          pointer-events: none;
        }
        .login-page-wrapper .field input {
          width: 100%;
          padding: 11px 14px;
          padding-left: 44px !important;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text);
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .login-page-wrapper .field input:focus {
          border-color: rgba(37, 99, 235, 0.8);
          background: rgba(37, 99, 235, 0.06);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }
        .login-page-wrapper .field input::placeholder {
          color: rgba(255, 255, 255, 0.25);
        }

        .login-page-wrapper .btn-login {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
        }
        .login-page-wrapper .btn-login:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(37, 99, 235, 0.5);
        }
        .login-page-wrapper .btn-login:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
      `}</style>
      
      <div className="orb orb1"></div>
      <div className="orb orb2"></div>

      <div className="card">
        {/* Logo Branding */}
        <div className="logo-area">
          <div className="logo-icon">
            <span className="material-symbols-outlined">security</span>
          </div>
          <div>
            <div className="logo-name">IOC HUNT</div>
            <div className="logo-sub">Unified Security Platform</div>
          </div>
        </div>

        {/* Title */}
        <h1>Mandatory Password Change</h1>
        <p className="subtitle" style={{ marginBottom: '16px' }}>
          Initial login security requirement for <span style={{ color: '#60a5fa', fontWeight: 500 }}>{user?.username}</span>
        </p>

        {/* Security Warning Notice */}
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          borderLeft: '3px solid #ef4444',
          borderRadius: '6px',
          padding: '12px 14px',
          marginBottom: '22px',
          fontSize: '12px',
          color: '#fca5a5',
          display: 'flex',
          gap: '10px',
          lineHeight: '1.4'
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Security Notice:</strong> You must create a personalized, high-entropy password before you can access the platform.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Current Password */}
          <div className="field">
            <label>CURRENT PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock_open</span>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password..."
              />
            </div>
          </div>

          {/* New Password */}
          <div className="field">
            <label>NEW SECURE PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock</span>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter strong new password..."
              />
            </div>
          </div>

          {/* Confirm Password */}
          <div className="field">
            <label>CONFIRM NEW PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password..."
              />
            </div>
          </div>

          {/* Password Complexity Checklist */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '8px',
            padding: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            fontSize: '11px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasMinLength ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Min 8 Characters
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasUppercase ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Uppercase (A-Z)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLowercase ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Lowercase (a-z)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasNumber ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Number (0-9)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasSpecial ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Special (!@#$%)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: passwordsMatch ? '#22c55e' : '#64748b' }}>
              <CheckCircle size={13} /> Match
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94a3b8',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '13px',
                borderRadius: '10px',
                width: '30%'
              }}
            >
              Sign out
            </button>

            <button
              className="btn-login"
              type="submit"
              disabled={!isFormValid || loading}
              style={{ margin: 0, width: '70%' }}
            >
              {loading ? 'Updating...' : 'Set Secure Password'}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
