import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function MfaChallenge() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  
  const tempToken = location.state?.tempToken;
  const workspaceId = location.state?.workspace_id;
  
  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  React.useEffect(() => {
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
        setError(`Too many MFA verification attempts. Please try again in ${timeStr}.`);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfterSeconds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      setRetryAfterSeconds(null);
      const response = await axios.post('/api/auth/mfa/verify', {
        tempToken,
        totpToken: code,
        workspace_id: workspaceId
      });

      const { user } = response.data;
      if (user) localStorage.setItem('iochunt_user', JSON.stringify(user));
      setUser(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.response?.status === 429 && err.response?.data?.retryAfter) {
        setRetryAfterSeconds(err.response.data.retryAfter);
      } else {
        setRetryAfterSeconds(null);
      }
      setError(err.response?.data?.error || err.response?.data?.message || 'Invalid MFA code. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    if (val.length <= 6) {
      setCode(val);
    }
  };

  return (
    <div className="mfa-page-wrapper">
      <style>{`
        .mfa-page-wrapper {
          --bg: #07091a;
          --surface: rgba(11, 17, 35, 0.88);
          --border: rgba(255, 255, 255, 0.08);
          --text: #e2e8f8;
          --muted: #64748b;
          --accent: #2563eb;
          --critical: #ef4444;
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
          box-sizing: border-box;
        }

        .mfa-page-wrapper * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .mfa-page-wrapper .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          z-index: 0;
        }
        .mfa-page-wrapper .orb1 {
          width: 450px;
          height: 450px;
          background: rgba(37, 99, 235, 0.15);
          top: -120px;
          right: -100px;
        }
        .mfa-page-wrapper .orb2 {
          width: 350px;
          height: 350px;
          background: rgba(139, 92, 246, 0.1);
          bottom: -100px;
          left: -80px;
        }

        .mfa-page-wrapper .card {
          position: relative;
          z-index: 1;
          background: rgba(11, 17, 35, 0.88);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 36px 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .mfa-page-wrapper .logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }
        .mfa-page-wrapper .logo-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
        }
        .mfa-page-wrapper .logo-icon .material-symbols-outlined {
          font-size: 24px;
          color: #fff;
        }
        .mfa-page-wrapper .logo-name {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #fff;
        }
        .mfa-page-wrapper .logo-sub {
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 1px;
        }

        .mfa-page-wrapper .shield-badge {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(37, 99, 235, 0.05));
          border: 1px solid rgba(37, 99, 235, 0.4);
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #60a5fa;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
        }
        .mfa-page-wrapper .shield-badge .material-symbols-outlined {
          font-size: 28px;
        }

        .mfa-page-wrapper h1 {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text);
          margin-bottom: 4px;
          text-align: center;
        }
        .mfa-page-wrapper .subtitle {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 24px;
          text-align: center;
          line-height: 1.4;
        }

        .mfa-page-wrapper .workspace-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(37, 99, 235, 0.12);
          border: 1px solid rgba(37, 99, 235, 0.25);
          color: #93c5fd;
          font-size: 11px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 20px;
          margin: 0 auto 16px;
        }

        .mfa-page-wrapper .field {
          margin-bottom: 20px;
        }
        .mfa-page-wrapper .field label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 8px;
          text-align: center;
        }

        .mfa-page-wrapper .totp-input-box {
          width: 100%;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 12px;
          color: #ffffff !important;
          font-family: 'Space Mono', monospace;
          font-size: 26px;
          font-weight: 700;
          letter-spacing: 12px;
          text-align: center;
          outline: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .mfa-page-wrapper .totp-input-box:focus {
          border-color: rgba(37, 99, 235, 0.9);
          background: rgba(37, 99, 235, 0.08);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .mfa-page-wrapper .totp-input-box::placeholder {
          color: rgba(255, 255, 255, 0.2);
          letter-spacing: 8px;
        }

        .mfa-page-wrapper .err-box {
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
        .mfa-page-wrapper .err-box .material-symbols-outlined {
          font-size: 18px;
          flex-shrink: 0;
          color: #ef4444;
        }

        .mfa-page-wrapper .btn-submit {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-family: var(--sans);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.3px;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .mfa-page-wrapper .btn-submit:hover:not(:disabled) {
          background: linear-gradient(135deg, #2563eb, #3b82f6);
          box-shadow: 0 8px 25px rgba(37, 99, 235, 0.5);
          transform: translateY(-1px);
        }
        .mfa-page-wrapper .btn-submit:active:not(:disabled) {
          transform: translateY(0);
        }
        .mfa-page-wrapper .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .mfa-page-wrapper .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        .mfa-page-wrapper .btn-back {
          background: transparent;
          border: none;
          color: var(--muted);
          font-size: 12px;
          cursor: pointer;
          transition: color 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin: 22px auto 0;
          outline: none;
        }
        .mfa-page-wrapper .btn-back:hover {
          color: #f8fafc;
        }
      `}</style>

      <div className="orb orb1" />
      <div className="orb orb2" />

      <div className="card">
        {/* Brand Logo Header */}
        <div className="logo-area">
          <div className="logo-icon">
            <span className="material-symbols-outlined">security</span>
          </div>
          <div>
            <div className="logo-name">IOC HUNT</div>
            <div className="logo-sub">ENTERPRISE SOC PLATFORM</div>
          </div>
        </div>

        {/* 2FA Shield Icon */}
        <div className="shield-badge">
          <span className="material-symbols-outlined">verified_user</span>
        </div>

        <h1>Two-Factor Auth</h1>
        
        {workspaceId ? (
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <span className="workspace-chip">
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>domain</span>
              Workspace: {workspaceId}
            </span>
          </div>
        ) : null}

        <p className="subtitle">
          Enter the 6-digit verification code generated by your authenticator app.
        </p>

        {error && (
          <div className="err-box">
            <span className="material-symbols-outlined">error</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Security Code</label>
            <input 
              type="text" 
              value={code}
              onChange={handleCodeChange}
              placeholder="••••••" 
              maxLength={6} 
              autoComplete="one-time-code" 
              inputMode="numeric" 
              pattern="[0-9]{6}" 
              required 
              autoFocus
              className="totp-input-box"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading || code.length !== 6}
            className="btn-submit"
          >
            {loading ? (
              <div className="spinner" />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
            )}
            Verify &amp; Continue
          </button>
        </form>

        <button 
          type="button"
          onClick={() => navigate('/login')}
          className="btn-back"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
          Return to Login
        </button>
      </div>
    </div>
  );
}
