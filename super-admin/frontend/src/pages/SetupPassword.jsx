import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShieldCheck, Lock, Check, X, ArrowRight } from 'lucide-react';

export default function SetupPassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Validation rules
  const hasMinLength = newPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword && newPassword === confirmPassword;

  const calculateStrength = () => {
    let score = 0;
    if (hasMinLength) score += 25;
    if (hasUppercase) score += 25;
    if (hasNumber) score += 25;
    if (hasSpecial) score += 25;
    return score;
  };

  const strength = calculateStrength();

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!hasMinLength) {
      return setError('Password must be at least 8 characters long');
    }
    if (!passwordsMatch) {
      return setError('Password confirmation does not match');
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
      setError(err.response?.data?.error || 'Failed to update permanent master password');
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
        maxWidth: '460px',
        background: '#0d1017',
        border: '1px solid #23293b',
        borderRadius: '10px',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.9)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '30px 32px 20px',
          borderBottom: '1px solid #191e2b',
          textAlign: 'center',
          background: 'linear-gradient(180deg, #10131d 0%, #0d1017 100%)'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', borderRadius: '10px', background: '#161b26', border: '1px solid #283044', marginBottom: '14px', color: '#10b981' }}>
            <ShieldCheck size={26} strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', marginBottom: '4px' }}>
            Security Initialization
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            First-time login: Define a permanent master password
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 32px 32px' }}>
          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSetup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} /> New Master Password
                </span>
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter strong password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isLoading}
                style={{ height: '40px' }}
              />
            </div>

            {/* Strength Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                <span>Password Strength</span>
                <span style={{
                  color: strength >= 100 ? '#10b981' : strength >= 50 ? '#f59e0b' : '#64748b',
                  fontWeight: '600'
                }}>
                  {strength >= 100 ? 'Strong' : strength >= 50 ? 'Fair' : 'Weak'}
                </span>
              </div>
              <div style={{ height: '4px', background: '#191e2b', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${strength}%`,
                  background: strength >= 100 ? '#10b981' : strength >= 50 ? '#f59e0b' : '#ef4444',
                  transition: 'all 0.2s ease'
                }} />
              </div>
            </div>

            {/* Requirements Checklist */}
            <div style={{
              background: '#090b10',
              border: '1px solid #191e2b',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '12px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasMinLength ? '#10b981' : '#64748b' }}>
                {hasMinLength ? <Check size={13} /> : <X size={13} />} 8+ Characters
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasUppercase ? '#10b981' : '#64748b' }}>
                {hasUppercase ? <Check size={13} /> : <X size={13} />} Uppercase (A-Z)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasNumber ? '#10b981' : '#64748b' }}>
                {hasNumber ? <Check size={13} /> : <X size={13} />} Number (0-9)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasSpecial ? '#10b981' : '#64748b' }}>
                {hasSpecial ? <Check size={13} /> : <X size={13} />} Symbol (!@#$)
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={14} /> Confirm Password
                </span>
                {confirmPassword && (
                  <span style={{ fontSize: '11px', color: passwordsMatch ? '#10b981' : '#ef4444' }}>
                    {passwordsMatch ? 'Passwords match' : 'Mismatch'}
                  </span>
                )}
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                style={{ height: '40px' }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || strength < 50 || !passwordsMatch}
              style={{
                height: '42px',
                marginTop: '10px',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              {isLoading ? 'Updating Master Password...' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Set Password & Access Console <ArrowRight size={16} />
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
