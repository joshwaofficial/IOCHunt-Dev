import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Shield, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle2, AlertTriangle, Monitor, Globe, Clock, LogOut } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const [terminatedNotice, setTerminatedNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [takeoverData, setTakeoverData] = useState(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

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

  const handleLogin = async (e, confirmTakeover = false) => {
    if (e) e.preventDefault();
    if (confirmTakeover) {
      setIsTakingOver(true);
    } else {
      setIsLoading(true);
    }
    setError('');
    setTerminatedNotice('');

    try {
      setRetryAfterSeconds(null);
      const res = await axios.post('/api/super/login', {
        username,
        password,
        confirm_takeover: confirmTakeover
      });

      setTakeoverData(null);
      if (res.data.force_password_change) {
        navigate('/setup');
      } else {
        navigate('/');
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.session_already_active) {
        setTakeoverData(err.response.data.active_session || {});
        setRetryAfterSeconds(null);
      } else {
        if (err.response?.status === 429 && err.response?.data?.retryAfter) {
          setRetryAfterSeconds(err.response.data.retryAfter);
        } else {
          setRetryAfterSeconds(null);
        }
        setError(err.response?.data?.error || err.response?.data?.message || 'Invalid credentials or connection error');
      }
    } finally {
      setIsLoading(false);
      setIsTakingOver(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #111522 0%, #08090d 70%)',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#0d1017',
        border: '1px solid #23293b',
        borderRadius: '10px',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.9)',
        overflow: 'hidden'
      }}>
        {/* Top Header Section */}
        <div style={{
          padding: '32px 32px 24px',
          borderBottom: '1px solid #191e2b',
          textAlign: 'center',
          background: 'linear-gradient(180deg, #10131d 0%, #0d1017 100%)'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '10px', background: '#161b26', border: '1px solid #283044', marginBottom: '16px', color: '#38bdf8' }}>
            <Shield size={26} strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            IOC Hunt Control Plane
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Super Administrator Authentication Gateway
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '28px 32px 32px' }}>
          {terminatedNotice && (
            <div style={{
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              color: '#facc15',
              padding: '12px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              lineHeight: 1.4
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <span style={{ fontWeight: '600' }}>Session Terminated:</span> {terminatedNotice}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontWeight: '600' }}>Error:</span> {error}
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} /> Master Username
                </span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="superadmin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                required
                disabled={isLoading}
                style={{ height: '40px' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} /> Master Password
                </span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  style={{ height: '40px', paddingRight: '38px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
              style={{
                height: '42px',
                marginTop: '10px',
                fontSize: '14px',
                fontWeight: '600',
                letterSpacing: '0.01em',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
              }}
            >
              {isLoading ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Verifying Credentials...
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Authenticate Control Plane <ArrowRight size={16} />
                </span>
              )}
            </button>
          </form>

          {/* Security Guarantee Pill */}
          <div style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid #191e2b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color="#10b981" /> TLS 1.3 / AES-256
            </span>
            <span style={{ fontFamily: 'monospace', color: '#475569' }}>
              v2.0-SaaS
            </span>
          </div>
        </div>
      </div>

      {/* Concurrent Login Takeover Modal */}
      {takeoverData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '460px',
            background: '#0e121b',
            border: '1px solid #2a3449',
            borderRadius: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.95)',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #1d2537',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'linear-gradient(180deg, #161c2a 0%, #0e121b 100%)'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#facc15'
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                  Active Session Detected
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  This account is logged in on another device
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 16px' }}>
                A session is already active for <strong style={{ color: '#38bdf8' }}>{username}</strong>. Only one concurrent session is permitted for administrator accounts.
              </p>

              {/* Active Session Info Card */}
              <div style={{
                background: '#131826',
                border: '1px solid #232c40',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '18px',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Globe size={14} color="#38bdf8" />
                  <span>IP Address:</span>
                  <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>
                    {takeoverData.ip_address || 'Unknown'}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Clock size={14} color="#f59e0b" />
                  <span>Logged In:</span>
                  <strong style={{ color: '#f8fafc' }}>
                    {takeoverData.created_at ? new Date(takeoverData.created_at * 1000).toLocaleString() : 'Just now'}
                  </strong>
                </div>

                {takeoverData.user_agent && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#94a3b8' }}>
                    <Monitor size={14} color="#a855f7" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ wordBreak: 'break-all', fontSize: '11px', color: '#64748b' }}>
                      {takeoverData.user_agent.slice(0, 100)}...
                    </span>
                  </div>
                )}
              </div>

              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '6px',
                padding: '10px 12px',
                fontSize: '12px',
                color: '#f87171',
                lineHeight: 1.4,
                marginBottom: '20px'
              }}>
                <strong>Warning:</strong> Logging in will terminate the other session immediately. The other device will be locked out and returned to the login screen.
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setTakeoverData(null)}
                  disabled={isTakingOver}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#1a2233',
                    border: '1px solid #2e3b56',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => handleLogin(null, true)}
                  disabled={isTakingOver}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    background: '#dc2626',
                    border: '1px solid #ef4444',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                  }}
                >
                  {isTakingOver ? (
                    <>
                      <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      Terminating & Logging In...
                    </>
                  ) : (
                    <>
                      <LogOut size={14} /> Log Out Other Device & Continue
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
