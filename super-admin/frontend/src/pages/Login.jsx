import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Lock, User, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await axios.post('/api/super/login', { username, password });
      if (res.data.force_password_change) {
        navigate('/setup');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials or connection error');
    } finally {
      setIsLoading(false);
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
    </div>
  );
}
