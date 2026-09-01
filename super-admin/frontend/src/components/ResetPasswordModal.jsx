import { useState } from 'react';
import { X, KeyRound, Check, ArrowRight } from 'lucide-react';
import axios from 'axios';

export default function ResetPasswordModal({ isOpen, tenant, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tenant) return;
    setIsLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await axios.post(`/api/super/companies/${tenant.company_id}/reset-password`, {
        new_password: newPassword,
        admin_username: adminUsername
      });
      setSuccessMsg(res.data.message || 'Password successfully reset.');
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset tenant password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setError('');
    setSuccessMsg('');
    onClose();
  };

  if (!isOpen || !tenant) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', borderRadius: '6px', background: '#161b26', border: '1px solid #23293b', color: '#f59e0b' }}>
              <KeyRound size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>Reset Tenant Password</h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>Override admin credentials for {tenant.company_name}</p>
            </div>
          </div>
          <button onClick={!isLoading ? handleClose : null} className="btn-ghost" style={{ padding: '4px', borderRadius: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          {successMsg ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Check size={24} />
              </div>
              <h4 style={{ fontSize: '16px', color: '#f8fafc', marginBottom: '6px' }}>Password Successfully Updated</h4>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                The administrator will be forced to change this password upon their next login.
              </p>
              <button type="button" className="btn btn-primary" onClick={handleClose} style={{ width: '100%' }}>
                Done
              </button>
            </div>
          ) : (
            <form id="reset-pwd-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Target Admin Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  <span>New Temporary Password</span>
                  <button
                    type="button"
                    onClick={generatePassword}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer', fontSize: '11px' }}
                  >
                    Generate
                  </button>
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="Enter at least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            </form>
          )}
        </div>

        {!successMsg && (
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              type="submit"
              form="reset-pwd-form"
              className="btn btn-primary"
              disabled={isLoading || newPassword.length < 8}
            >
              {isLoading ? 'Updating...' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Update Password <ArrowRight size={14} />
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
