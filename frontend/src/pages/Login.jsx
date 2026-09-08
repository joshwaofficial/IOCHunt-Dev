import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstance } from '../context/InstanceContext';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [takeoverData, setTakeoverData] = useState(null);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [terminatedNotice, setTerminatedNotice] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { instanceInfo, refreshInstanceInfo } = useInstance();

  const serverMode = instanceInfo?.mode || 'central_server';

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reason') === 'session_terminated' || params.get('reason') === 'concurrent_takeover') {
      setTerminatedNotice('You were logged out because this account was accessed from another device.');
    }
  }, [location.search]);

  useEffect(() => {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return;
    const interval = setInterval(() => {
      setRetryAfterSeconds((prev) => {
        if (!prev || prev <= 1) {
          setError('');
          return null;
        }
        const next = prev - 1;
        const mins = Math.floor(next / 60);
        const secs = next % 60;
        let timeStr = '';
        if (mins > 0 && secs > 0) {
          timeStr = `${mins} minute${mins !== 1 ? 's' : ''} and ${secs} second${secs !== 1 ? 's' : ''}`;
        } else if (mins > 0) {
          timeStr = `${mins} minute${mins !== 1 ? 's' : ''}`;
        } else {
          timeStr = `${secs} second${secs !== 1 ? 's' : ''}`;
        }
        setError(`Too many login attempts. Please try again in ${timeStr}.`);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfterSeconds]);

  const handleSubmit = async (e, confirmTakeover = false) => {
    if (e) e.preventDefault();
    setError('');
    setTerminatedNotice('');
    if (confirmTakeover) {
      setIsTakingOver(true);
    } else {
      setLoading(true);
    }

    try {
      const result = await login(username, password, workspaceId?.trim() || undefined, confirmTakeover);
      setTakeoverData(null);

      if (result.mfaRequired) {
        navigate('/mfa-challenge', {
          state: {
            tempToken: result.tempToken,
            workspace_id: result.workspace_id || workspaceId?.trim() || undefined,
            next: location.state?.from?.pathname || '/dashboard'
          }
        });
      } else {
        await refreshInstanceInfo();
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error('[Login Error]', err);
      if (err.response?.status === 409 && err.response?.data?.session_already_active) {
        setTakeoverData(err.response.data.active_session || {});
        setRetryAfterSeconds(null);
      } else {
        if ((err.response?.status === 429 || err.response?.status === 423) && err.response?.data?.retryAfter) {
          setRetryAfterSeconds(err.response.data.retryAfter);
        } else {
          setRetryAfterSeconds(null);
        }
        setError(err.response?.data?.error || err.response?.data?.message || 'Authentication failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
      setIsTakingOver(false);
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
        <h1>Sign In</h1>

        {terminatedNotice && (
          <div style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '12px',
            color: '#facc15',
            lineHeight: 1.4
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0, marginTop: '2px' }}>warning</span>
            <div>
              <strong>Session Terminated:</strong> {terminatedNotice}
            </div>
          </div>
        )}

        {error && (
          <div className="err-box">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {serverMode !== 'aggregator' && (
            <div className="field">
              <label>TENANT ID</label>
              <div className="input-wrap">
                <span className="input-icon material-symbols-outlined">domain</span>
                <input
                  id="login-workspace"
                  type="text"
                  placeholder="Tenant ID (e.g., mycompany)"
                  required
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="field">
            <label>USERNAME</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">person</span>
              <input
                id="login-user"
                type="text"
                placeholder="Username"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label>PASSWORD</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined">lock</span>
              <input
                id="login-pass"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Authenticating...' : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>login</span>
                Sign In
              </>
            )}
          </button>

        </form>
      </div>

      {/* Concurrent Login Takeover Modal */}
      {takeoverData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '460px',
            background: '#0d1326',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '14px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.95)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'linear-gradient(180deg, rgba(30, 58, 138, 0.2) 0%, rgba(13, 19, 38, 0.8) 100%)'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>warning</span>
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                  Active Session Detected
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  Account currently active on another device
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px' }}>
                An active session was found for <strong style={{ color: '#38bdf8' }}>{username}</strong>. Concurrent logins are restricted to protect account integrity.
              </p>

              {/* Active Session Info Card */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#38bdf8' }}>public</span>
                  <span>IP Address:</span>
                  <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>
                    {takeoverData.ip_address || 'Unknown'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>schedule</span>
                  <span>Logged In:</span>
                  <strong style={{ color: '#f8fafc' }}>
                    {takeoverData.created_at ? new Date(takeoverData.created_at * 1000).toLocaleString() : 'Just now'}
                  </strong>
                </div>

                {takeoverData.user_agent && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#94a3b8' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#a855f7', flexShrink: 0, marginTop: '2px' }}>devices</span>
                    <span style={{ wordBreak: 'break-all', fontSize: '11px', color: '#64748b' }}>
                      {takeoverData.user_agent.slice(0, 100)}...
                    </span>
                  </div>
                )}
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#f87171',
                lineHeight: 1.4,
                marginBottom: '22px'
              }}>
                <strong>Warning:</strong> Logging in here will terminate that active session immediately and notify the account owner.
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setTakeoverData(null)}
                  disabled={isTakingOver}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit(null, true)}
                  disabled={isTakingOver}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    border: 'none',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)'
                  }}
                >
                  {isTakingOver ? (
                    'Disconnecting & Signing In...'
                  ) : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
                      Log Out Other Device & Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
