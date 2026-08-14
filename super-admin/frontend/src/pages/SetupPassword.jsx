import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, LockKeyhole } from 'lucide-react';

export default function SetupPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSetup = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters long');
    }

    setIsLoading(true);
    setError('');
    
    try {
      await axios.post('/api/super/change-password', { 
        new_password: newPassword, 
        confirm_password: confirmPassword 
      });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="layout-wrapper flex items-center justify-center" style={{ minHeight: '100vh', width: '100vw', background: 'var(--bg-dark)' }}>
      <div 
        className="glass-panel" 
        style={{ width: '100%', maxWidth: '400px', padding: '40px 32px', background: 'var(--bg-card)' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ background: '#111', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px' }}>
              <ShieldCheck size={32} color="var(--success)" />
            </div>
          </div>
          <h2 style={{ fontSize: '20px', marginBottom: '4px', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>Security Setup Required</h2>
          <p className="text-muted" style={{ fontSize: '14px' }}>Please set a secure permanent password for the Super Admin Control Plane.</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <LockKeyhole size={16} /> New Password
            </label>
            <input 
              type="password" 
              className="glass-input" 
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required 
            />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <LockKeyhole size={16} /> Confirm Password
            </label>
            <input 
              type="password" 
              className="glass-input" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
            />
          </div>
          <button 
            type="submit" 
            className="glass-button primary mt-4" 
            disabled={isLoading}
          >
            {isLoading ? 'Securing...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
