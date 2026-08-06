import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Plus, Server, Activity, Database, LogOut } from 'lucide-react';
import ProvisionModal from '../components/ProvisionModal';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [companies, setCompanies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/super/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleLogout = () => {
    // In a real app we'd call a logout endpoint. For now we can clear cookies if we could, 
    // but httpOnly cookies require backend to clear. We'll just hard redirect to login.
    document.cookie = "super_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    navigate('/login');
  };

  return (
    <div className="container" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Cloud Control Plane</h1>
          <p className="text-muted">Manage all tenant Central Server instances</p>
        </div>
        <div className="flex gap-4">
          <button className="glass-button" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Provision Tenant
          </button>
          <button className="glass-button" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }} onClick={handleLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center mt-8">
          <Activity className="animate-pulse" size={40} color="var(--primary)" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <AnimatePresence>
            {companies.map((company, i) => (
              <motion.div 
                key={company.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-panel"
                style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}
              >
                <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
                
                <div className="flex justify-between items-center mb-4">
                  <h3 style={{ fontSize: '1.25rem' }}>{company.company_name}</h3>
                  <span style={{ 
                    background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', 
                    padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600 
                  }}>
                    {company.status.toUpperCase()}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="flex items-center gap-2 text-muted" style={{ fontSize: '0.9rem' }}>
                    <Server size={16} /> Tenant ID: <strong style={{ color: 'var(--text-main)' }}>{company.company_id}</strong>
                  </div>
                  <div className="flex items-center gap-2 text-muted" style={{ fontSize: '0.9rem' }}>
                    <Database size={16} /> Database: <span style={{ color: 'var(--text-main)' }}>Isolated Postgres</span>
                  </div>
                  
                  <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Central Server URL</p>
                    <a href={company.central_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
                      {company.central_url}
                    </a>
                  </div>
                  
                  <div className="flex gap-4 mt-2" style={{ fontSize: '0.8rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px' }}>App Port: {company.app_port}</div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '6px' }}>Syslog: {company.syslog_port}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {companies.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
              <Server size={48} color="var(--text-muted)" style={{ margin: '0 auto', marginBottom: '1rem', opacity: 0.5 }} />
              <h3>No Tenants Provisioned</h3>
              <p className="text-muted mt-2">Click "Provision Tenant" to deploy your first Central Server.</p>
            </div>
          )}
        </div>
      )}

      <ProvisionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchCompanies} 
      />
    </div>
  );
}

// Ensure AnimatePresence is imported correctly
import { AnimatePresence as FramerAnimatePresence } from 'framer-motion';
const AnimatePresence = FramerAnimatePresence;
