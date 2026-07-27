import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function MfaChallenge() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  
  const tempToken = location.state?.tempToken;
  
  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/mfa/verify', {
        tempToken,
        totpToken: code
      });

      const { user } = response.data;
      setUser(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid MFA code. Please try again.');
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Inter, sans-serif', padding: '20px' }}>
      <div style={{ background: 'var(--surface)', width: '100%', maxWidth: '380px', borderRadius: '16px', border: '1px solid var(--border)', padding: '40px', boxShadow: '0 24px 48px rgba(0,0,0,0.1)', position: 'relative' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg,rgba(37,99,235,0.2),rgba(37,99,235,0.05))', border: '1px solid rgba(37,99,235,0.3)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', fontVariationSettings: "'FILL' 0" }}>shield_lock</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)' }}>Two-Factor Auth</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>Verify your identity</div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#ef4444' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Authentication Code</label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--muted)', pointerEvents: 'none' }}>pin</span>
              <input 
                type="text" 
                value={code}
                onChange={handleCodeChange}
                placeholder="000000" 
                maxLength={6} 
                autoComplete="one-time-code" 
                inputMode="numeric" 
                pattern="[0-9]{6}" 
                required 
                className="input-field mfa-input"
                style={{ width: '100%', padding: '11px 14px 11px 42px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', fontFamily: 'Inter, sans-serif', textAlign: 'center', letterSpacing: '4px', fontSize: '16px', fontWeight: 700, outline: 'none', transition: 'all .2s' }}
                onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading || code.length !== 6}
            style={{ 
              width: '100%', padding: '13px', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', border: 'none', borderRadius: '10px', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 700, cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer', letterSpacing: '.3px', boxShadow: '0 6px 20px rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px', transition: 'all .2s', opacity: (loading || code.length !== 6) ? 0.5 : 1 
            }}
          >
            {loading ? (
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }}></div>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span>
            )}
            Verify Code
          </button>
        </form>

        <div style={{ marginTop: '28px', textAlign: 'center' }}>
          <button 
            onClick={() => navigate('/login')}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', transition: 'colors .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', margin: '0 auto', outline: 'none', fontSize: '11px' }}
            onMouseOver={(e) => e.currentTarget.style.color = '#f8fafc'}
            onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_back</span>
            Return to Login
          </button>
        </div>
      </div>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .mfa-input { color: #ffffff !important; }
        .mfa-input:-webkit-autofill,
        .mfa-input:-webkit-autofill:hover, 
        .mfa-input:-webkit-autofill:focus, 
        .mfa-input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #18181b inset !important;
            -webkit-text-fill-color: #ffffff !important;
            transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}
