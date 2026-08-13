import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, Building, Activity, ShieldPlus } from 'lucide-react';
import axios from 'axios';

export default function ProvisionModal({ isOpen, onClose, onSuccess }) {
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');
  const [provisionedApiKey, setProvisionedApiKey] = useState('');

  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAdminPassword(pass);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setProvisioningStatus('Allocating ports and generating environment...');

    try {
      // Simulate steps for UI UX
      setTimeout(() => setProvisioningStatus('Building isolated Docker containers...'), 1500);
      setTimeout(() => setProvisioningStatus('Finalizing database configuration...'), 4000);
      
      const res = await axios.post('/api/super/companies', {
        company_name: companyName,
        company_id: companyId,
        admin_username: adminUsername,
        admin_password: adminPassword
      });
      
      onSuccess();
      setProvisionedApiKey(res.data.api_key || 'Unknown (Check Logs)');
    } catch (err) {
      setError(err.response?.data?.error || 'Provisioning failed. Check server logs.');
    } finally {
      setIsLoading(false);
      setProvisioningStatus('');
    }
  };

  const handleClose = () => {
    onClose();
    setCompanyName('');
    setCompanyId('');
    setAdminPassword('');
    setProvisionedApiKey('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}
      >
        <motion.div 
          initial={{ y: 50, scale: 0.9 }}
          animate={{ y: 0, scale: 1 }}
          className="glass-panel"
          style={{ width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative' }}
        >
          <button 
            onClick={!isLoading ? handleClose : null}
            style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: isLoading ? 'not-allowed' : 'pointer' }}
          >
            <X size={24} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '0.75rem', borderRadius: '12px' }}>
              <ShieldPlus size={28} color="var(--primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem' }}>Provision New Tenant</h2>
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Spin up a fully isolated Central Server</p>
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {provisionedApiKey ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '1rem', borderRadius: '50%', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <ShieldPlus size={40} />
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#fff' }}>Tenant Provisioned Successfully!</h3>
              <p className="text-muted" style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
                The workspace database has been isolated and seeded. Provide the following API key to the company so they can configure their endpoint agents.
              </p>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', fontWeight: 600 }}>Workspace API Key</div>
                <code style={{ fontSize: '1.1rem', color: 'var(--primary)', userSelect: 'all', wordBreak: 'break-all' }}>{provisionedApiKey}</code>
              </div>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '2rem' }}>
                <strong>WARNING:</strong> Copy this API Key now! For security reasons, it is irreversibly hashed in the database and cannot be retrieved again later.
              </div>
              <button className="glass-button primary" onClick={handleClose} style={{ width: '100%' }}>
                I have copied the key
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  <Building size={16} /> Company Name
                </label>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="e.g. Acme Corp"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    if (!companyId) {
                      setCompanyId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''));
                    }
                  }}
                  disabled={isLoading}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  <Server size={16} /> Tenant ID (Database Name & Subdomain)
                </label>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="e.g. acmecorp"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  disabled={isLoading}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  Admin Username
                </label>
                <input 
                  type="text" 
                  className="glass-input" 
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value.trim())}
                  disabled={isLoading}
                  required 
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  Initial Admin Password
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="glass-input" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value.trim())}
                    disabled={isLoading}
                    required 
                  />
                  <button type="button" className="glass-button" onClick={generatePassword} disabled={isLoading} style={{ padding: '0.5rem 1rem' }}>Generate</button>
                </div>
              </div>

              {isLoading && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <Activity size={24} color="var(--accent)" className="animate-pulse" style={{ margin: '0 auto', marginBottom: '0.5rem' }} />
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>{provisioningStatus}</p>
                </div>
              )}

              <button 
                type="submit" 
                className="glass-button primary mt-4" 
                disabled={isLoading}
                style={{ width: '100%' }}
              >
                {isLoading ? 'Deploying...' : 'Deploy Central Server'}
              </button>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
