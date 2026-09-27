import { useState } from 'react';
import { X, Server, Building, Check, Copy, AlertTriangle, ArrowRight } from 'lucide-react';
import axios from 'axios';

export default function ProvisionModal({ isOpen, onClose, onSuccess }) {
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [tier, setTier] = useState('standard');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [provisionedData, setProvisionedData] = useState(null);

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 14; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAdminPassword(pass);
  };

  const handleCompanyNameChange = (e) => {
    const val = e.target.value;
    setCompanyName(val);
    if (!companyId || companyId === companyName.toLowerCase().replace(/[^a-z0-9_]/g, '')) {
      setCompanyId(val.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await axios.post('/api/super/companies', {
        company_name: companyName.trim(),
        company_id: companyId.trim(),
        admin_username: adminUsername.trim(),
        admin_password: adminPassword.trim(),
        tier: tier || 'standard'
      });

      setProvisionedData(res.data);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('[ProvisionModal]', err);
      setError(err.response?.data?.error || err.message || 'Tenant provisioning failed. Check database logs.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCompanyName('');
    setCompanyId('');
    setAdminPassword('');
    setProvisionedData(null);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" style={{ maxWidth: provisionedData ? '540px' : '520px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', borderRadius: '6px', background: '#161b26', border: '1px solid #23293b', color: '#38bdf8' }}>
              <Server size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>
                {provisionedData ? 'Tenant Successfully Provisioned' : 'Provision Isolated Tenant Workspace'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                {provisionedData ? 'Secure deployment details generated' : 'Creates dedicated PostgreSQL schema & assigned Syslog port'}
              </p>
            </div>
          </div>
          <button onClick={!isLoading ? handleClose : null} className="btn-ghost" style={{ padding: '4px', borderRadius: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
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

          {provisionedData ? (
            <div>
              <div style={{
                background: '#090b10',
                border: '1px solid #1e2538',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: '10px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Company:</span>
                  <span style={{ fontWeight: '500', color: '#f8fafc' }}>{provisionedData.company_name}</span>

                  <span style={{ color: '#64748b' }}>Tenant ID:</span>
                  <span className="font-mono" style={{ color: '#38bdf8' }}>{provisionedData.company_id}</span>

                  <span style={{ color: '#64748b' }}>Database:</span>
                  <span className="font-mono" style={{ color: '#94a3b8' }}>{provisionedData.db_name}</span>

                  <span style={{ color: '#64748b' }}>Syslog Port:</span>
                  <span className="font-mono" style={{ color: '#10b981' }}>UDP :{provisionedData.syslog_port}</span>

                  <span style={{ color: '#64748b' }}>Central URL:</span>
                  <a href={provisionedData.central_url} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                    {provisionedData.central_url}
                  </a>
                </div>
              </div>

              {/* Zero-Trust Endpoint Information */}
              <div style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                color: '#93c5fd',
                padding: '12px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginBottom: '16px'
              }}>
                <Server size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span style={{ lineHeight: 1.5 }}>
                  <strong>Zero-Trust Endpoint Security:</strong> Endpoint agents connect using individual, unique credentials provisioned via the <strong>Agent Keys</strong> management interface in the Central Dashboard.
                </span>
              </div>
            </div>
          ) : (
            <form id="provision-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={13} /> Company / Organization Name
                  </span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Acme Corporation"
                  value={companyName}
                  onChange={handleCompanyNameChange}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={13} /> Tenant Identifier (Slug & Database Name)
                  </span>
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder="acme_corp"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  required
                  disabled={isLoading}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Resulting DB: <code className="font-mono" style={{ color: '#94a3b8' }}>iochunt_tenant_{companyId || 'company'}</code>
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Initial Admin User</label>
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
                    <span>Admin Password</span>
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
                    placeholder="Enter or generate"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {provisionedData ? (
            <button type="button" className="btn btn-primary" onClick={handleClose}>
              Done & Return to Workspace
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={isLoading}>
                Cancel
              </button>
              <button
                type="submit"
                form="provision-form"
                className="btn btn-primary"
                disabled={isLoading || !companyName || !companyId || !adminPassword}
              >
                {isLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    Provisioning Database...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Deploy Tenant <ArrowRight size={14} />
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
