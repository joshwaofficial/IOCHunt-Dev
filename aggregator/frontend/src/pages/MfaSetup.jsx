import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function MfaSetup() {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchMfaData() {
      try {
        const res = await axios.get('/api/users/mfa/generate');
        setQrDataUrl(res.data.qrDataUrl);
        setSecret(res.data.secret);
        setLoading(false);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to generate MFA secret');
        setLoading(false);
      }
    }
    fetchMfaData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!totp || totp.length !== 6) {
      setError('Invalid verification code. Please try again.');
      return;
    }

    try {
      await axios.post('/api/users/mfa/verify', { secret, totp });
      // Redirect back to dashboard/users on success
      navigate('/users');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid verification code. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
        <p>Generating MFA setup...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#f8fafc', fontFamily: 'Inter, sans-serif', padding: '20px' }}>
      <div style={{ background: '#18181b', width: '100%', maxWidth: '420px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '40px', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', position: 'relative' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg,rgba(6,182,212,0.2),rgba(6,182,212,0.05))', border: '1px solid rgba(6,182,212,0.3)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px' }}>qr_code_scanner</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' }}>Enable MFA</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace', marginTop: '4px' }}>Scan with your Authenticator app</div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#f87171' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
            {error}
          </div>
        )}

        {qrDataUrl && (
          <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', margin: '24px auto', width: 'fit-content', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <img src={qrDataUrl} alt="QR Code" style={{ display: 'block', width: '200px', height: '200px' }} />
          </div>
        )}

        {secret && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px', borderRadius: '8px', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', letterSpacing: '2px', color: '#06b6d4', marginBottom: '24px' }}>
            {secret}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verify Code</label>
            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: '#94a3b8', pointerEvents: 'none' }}>pin</span>
              <input 
                type="text" 
                value={totp}
                onChange={e => setTotp(e.target.value)}
                placeholder="000000" 
                maxLength={6} 
                autoComplete="off" 
                inputMode="numeric" 
                pattern="[0-9]{6}" 
                required 
                autoFocus 
                style={{ width: '100%', padding: '11px 14px 11px 42px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#f8fafc', fontFamily: 'Inter, sans-serif', textAlign: 'center', letterSpacing: '4px', fontSize: '16px', fontWeight: 700, outline: 'none', transition: 'all .2s' }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(6,182,212,0.7)'; e.target.style.background = 'rgba(6,182,212,0.05)'; e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.04)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          
          <button type="submit" style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#0891b2,#06b6d4)', border: 'none', borderRadius: '10px', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '.3px', boxShadow: '0 6px 20px rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '4px', transition: 'all .2s' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>how_to_reg</span> Enable Multi-Factor Auth
          </button>
        </form>
      </div>
    </div>
  );
}
