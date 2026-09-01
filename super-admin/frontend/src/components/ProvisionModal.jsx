import { useState } from 'react';
import { X, Server, Building, Check, Copy, AlertTriangle, ArrowRight } from 'lucide-react';
import axios from 'axios';

export default function ProvisionModal({ isOpen, onClose, onSuccess }) {
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [provisionedData, setProvisionedData] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

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
        tier
      });

      setProvisionedData(res.data);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Tenant provisioning failed. Check database logs.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (!provisionedData?.api_key) return;
    navigator.clipboard.writeText(provisionedData.api_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
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

              {/* API Key Box */}
              <div style={{
                background: '#0c0f17',
                border: '1px solid #2b354d',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: '600' }}>
                    Endpoint Agent Ingestion API Key
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                  >
                    {copiedKey ? <><Check size={12} color="#10b981" /> Copied</> : <><Copy size={12} /> Copy Key</>}
                  </button>
                </div>
                <div className="font-mono" style={{ fontSize: '14px', color: '#38bdf8', wordBreak: 'break-all', userSelect: 'all', padding: '6px 8px', background: '#07080c', borderRadius: '4px' }}>
                  {provisionedData.api_key}
                </div>
              </div>

              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#fbbf24',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  <strong>Important:</strong> Store this API Key in a secure credential manager. The raw key is hashed in the database and cannot be retrieved again.
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
