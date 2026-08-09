import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function ForcePasswordReset() {
  const [newUsername, setNewUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match');
      setLoading(false);
      return;
    }

    try {
      await axios.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
        new_username: newUsername || undefined
      });
      
      // Update local state
      const updatedUser = { 
        ...user, 
        force_password_change: false, 
        username: newUsername || user.username 
      };
      setUser(updatedUser);
      localStorage.setItem('iochunt_user', JSON.stringify(updatedUser));
      
      toast.success('Credentials updated successfully!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[Reset Error]', err);
      setError(err.response?.data?.error || 'Failed to update credentials.');
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
          z-index: 9999;
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

        /* Mode Switcher Segmented Tabs */
        .login-page-wrapper .mode-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 24px;
        }
        .login-page-wrapper .mode-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 12px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 600;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .login-page-wrapper .mode-btn.active {
          background: #2563eb;
          color: #fff;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
        }
        .login-page-wrapper .mode-btn:hover:not(.active) {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
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
        .login-page-wrapper .toggle-icon {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          color: var(--muted);
          cursor: pointer;
          user-select: none;
        }

        .login-page-wrapper .err-box {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: #f87171;
          animation: shake 0.3s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
        @keyframes shake {
          10%, 90% { transform: translateX(-1px); }
          20%, 80% { transform: translateX(2px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }
        .login-page-wrapper .err-box .material-symbols-outlined {
          font-size: 18px;
          flex-shrink: 0;
          color: #ef4444;
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

        .login-page-wrapper .hint-box {
          margin-top: 14px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          font-size: 11px;
          color: var(--muted);
          text-align: center;
          line-height: 1.4;
        }

        .login-page-wrapper .footer {
          margin-top: 24px;
          text-align: center;
          font-size: 11px;
          color: var(--muted);
        }
        .login-page-wrapper .status-strip {
          display: flex;
          align-items: center;
          gap: 6px;
          justify-content: center;
          margin-top: 10px;
          font-size: 10px;
          color: var(--muted);
          font-family: var(--mono);
        }
        .login-page-wrapper .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--low);
          animation: pulse-dot 2s infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
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
        <h1>Security Check</h1>
        <div className="subtitle" style={{ color: '#f87171' }}>
          You are using default credentials. Please set a new username and strong password to continue.
        </div>

        {error && (
          <div className="err-box">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>


          <div className="field">
            <label>NEW USERNAME</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">person_add</span>
              <input
                type="text"
                placeholder="Choose a new username"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>CURRENT PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock_open</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Current default password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>NEW PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New strong password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>CONFIRM NEW PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <span 
                className="toggle-icon material-symbols-outlined"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </div>
          </div>

          <button className="btn-login" type="submit" disabled={loading}>
            {loading ? 'Updating Credentials...' : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                Update & Continue
              </>
            )}
          </button>

        </form>
      </div>
    </div>
  );
}
