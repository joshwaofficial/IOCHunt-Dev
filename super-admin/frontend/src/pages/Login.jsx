import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Shield, Lock, User } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      setError(err.response?.data?.error || 'Failed to login');
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
              <Shield size={32} color="var(--text-heading)" />
            </div>
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '4px', letterSpacing: '-0.02em', color: 'var(--text-heading)' }}>Cloud Orchestrator</h2>
          <p className="text-muted" style={{ fontSize: '14px' }}>Super Admin Control Plane</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <User size={16} /> Username
            </label>
            <input 
              type="text" 
              className="glass-input" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              <Lock size={16} /> Password
            </label>
            <input 
              type="password" 
              className="glass-input" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button 
            type="submit" 
            className="glass-button mt-4" 
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : 'Secure Access'}
          </button>
        </form>
      </div>
    </div>
  );
}
