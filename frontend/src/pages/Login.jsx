import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password);

      if (result.mfaRequired) {
        navigate('/mfa-challenge', {
          state: {
            tempToken: result.tempToken,
            next: location.state?.from?.pathname || '/dashboard'
          }
        });
      } else {
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <style>{`
        .login-page-wrapper {
          --bg: #07091a;
          --surface: rgba(15,20,40,0.7);
          --border: rgba(255,255,255,0.07);
          --text: #e2e8f8;
          --muted: #5a6690;
          --accent: #2563eb;
          --critical: #ef4444;
          --low: #22c55e;
          --mono: 'Space Mono', monospace;
          --sans: 'Martel Sans', sans-serif;
          
          font-family: var(--sans);
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: fixed;
          top: 0;
          left: 0;
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
          filter: blur(80px);
          pointer-events: none;
          z-index: 0;
        }
        .login-page-wrapper .orb1 {
          width: 400px;
          height: 400px;
          background: rgba(37,99,235,0.12);
          top: -100px;
          right: -100px;
          animation: float1 8s ease-in-out infinite;
        }
        .login-page-wrapper .orb2 {
          width: 300px;
          height: 300px;
          background: rgba(139,92,246,0.08);
          bottom: -80px;
          left: -80px;
          animation: float2 10s ease-in-out infinite;
        }
        @keyframes float1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,30px)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,-20px)} }

        .login-page-wrapper .card {
          position: relative;
          z-index: 1;
          background: rgba(11,17,35,0.85);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 40px 44px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.06);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          animation: slideUp .4s cubic-bezier(.34,1.56,.64,1) both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }

        .login-page-wrapper .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg,transparent,#2563eb,transparent);
          border-radius: 20px 20px 0 0;
          animation: scan-h 4s ease-in-out infinite;
          opacity: 0.6;
        }
        @keyframes scan-h { 0%,100%{opacity:0.3} 50%{opacity:0.8} }

        .login-page-wrapper .logo-area { display:flex; align-items:center; gap:14px; margin-bottom:32px; }
        .login-page-wrapper .logo-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(135deg,#1d4ed8,#2563eb);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 24px rgba(37,99,235,0.4);
        }
        .login-page-wrapper .logo-icon .material-symbols-outlined { font-size:22px; color:#fff; font-variation-settings:'FILL' 1; }
        .login-page-wrapper .logo-name { font-family:var(--mono); font-size:16px; font-weight:700; color:#fff; letter-spacing:1px; }
        .login-page-wrapper .logo-sub { font-size:10px; color:var(--muted); letter-spacing:2px; text-transform:uppercase; margin-top:2px; }

        .login-page-wrapper h1 { font-size:22px; font-weight:800; letter-spacing:-0.5px; color:var(--text); margin-bottom:6px; }
        .login-page-wrapper .subtitle { font-size:12px; color:var(--muted); margin-bottom:28px; }

        .login-page-wrapper .field { margin-bottom:18px; }
        .login-page-wrapper .field label {
          display: block; font-size:11px; font-weight:600;
          color: var(--muted); text-transform:uppercase; letter-spacing:.8px; margin-bottom:8px;
        }
        .login-page-wrapper .input-wrap { position:relative; }
        .login-page-wrapper .input-icon {
          position: absolute; left:13px; top:50%; transform:translateY(-50%);
          font-size:18px; color:var(--muted); pointer-events:none;
        }
        .login-page-wrapper .field input {
          width: 100%; padding: 11px 14px 11px 42px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px; color: var(--text);
          font-family: var(--sans); font-size: 13px;
          outline: none; transition: all .2s;
        }
        .login-page-wrapper .field input:focus {
          border-color: rgba(37,99,235,0.7);
          background: rgba(37,99,235,0.05);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
        }
        .login-page-wrapper .field input::placeholder { color:rgba(255,255,255,0.2); }

        .login-page-wrapper .err-box {
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
          border-radius: 8px; padding: 10px 14px; margin-bottom: 18px;
          display: flex; align-items: center; gap: 10px;
          font-size: 12px; color: #f87171;
          animation: shake .3s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes shake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-3px)} 40%,60%{transform:translateX(3px)} }
        .login-page-wrapper .err-box .material-symbols-outlined { font-size:16px; flex-shrink:0; color:#ef4444; }

        .login-page-wrapper .btn-login {
          width: 100%; padding: 13px;
          background: linear-gradient(135deg,#1d4ed8,#2563eb);
          border: none; border-radius: 10px; color: #fff;
          font-family: var(--sans); font-size: 13px; font-weight: 700;
          cursor: pointer; letter-spacing: .3px;
          box-shadow: 0 6px 20px rgba(37,99,235,0.4);
          transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 8px;
          margin-top: 4px;
        }
        .login-page-wrapper .btn-login:hover { transform:translateY(-1px); box-shadow:0 10px 28px rgba(37,99,235,0.5); }
        .login-page-wrapper .btn-login:active { transform:translateY(0); box-shadow:0 4px 12px rgba(37,99,235,0.3); }

        .login-page-wrapper .footer { margin-top: 28px; text-align: center; font-size: 11px; color: var(--muted); }
        .login-page-wrapper .footer span { color: rgba(255,255,255,0.3); }
        .login-page-wrapper .status-strip {
          display: flex; align-items: center; gap: 6px; justify-content: center;
          margin-top: 14px; font-size: 10px; color: var(--muted); font-family: var(--mono);
        }
        .login-page-wrapper .live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--low); animation: pulse-dot 2s infinite; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <div className="orb orb1"></div>
      <div className="orb orb2"></div>
      <div className="card">
        <div className="logo-area">
          <div className="logo-icon"><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>security</span></div>
          <div>
            <div className="logo-name">IOC Hunt Central Server</div>
            <div className="logo-sub">Threat Intelligence Hub</div>
          </div>
        </div>
        <h1>Sign In</h1>
        <p className="subtitle">Access your central security operations dashboard</p>

        {error && (
          <div className="err-box">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Username</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>person</span>
              <input
                id="login-user"
                className="input-field"
                type="text"
                placeholder="Enter username"
                required
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Password</label>
            <div className="input-wrap">
              <span className="input-icon material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0" }}>lock</span>
              <input
                id="login-pass"
                className="input-field"
                type="password"
                placeholder="Enter password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button className="btn-login" type="submit" disabled={loading}>
            {loading ? (
              <><span className="material-symbols-outlined"></span> Signing in...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>login</span> Sign In</>
            )}
          </button>
        </form>
        <div className="footer">
          Central Server Node <span>//</span> v4.2.1-CEN
          <div className="status-strip"><div className="live-dot"></div> Hub Online</div>
        </div>
      </div>
    </div>
  );
}
