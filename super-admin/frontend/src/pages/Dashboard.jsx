import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Bell, ShieldCheck, AlertCircle, Bug, Monitor, ArrowUpRight, ArrowDownRight, Server, Plus } from 'lucide-react';
import ProvisionModal from '../components/ProvisionModal';

export default function Dashboard() {
  const [companies, setCompanies] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/super/companies');
      setCompanies(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const totalTenants = companies.length;
  const activeTenants = companies.filter(c => c.status === 'active').length;

  return (
    <div style={{ paddingBottom: '40px' }}>
      
      {/* Top Header */}
      <div className="top-header">
        <div>
          <h1>Overview</h1>
          <div className="text-muted">System security at a glance</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted" style={{ background: 'var(--bg-card)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <Calendar size={16} />
            <span style={{ fontSize: '13px' }}>May 12 – May 18, 2024</span>
          </div>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} /> Provision Tenant
          </button>
          <Bell size={20} color="var(--text-muted)" style={{ cursor: 'pointer', marginLeft: '8px' }} />
        </div>
      </div>

      {/* Main Table Row */}
      <div className="list-panel" style={{ marginTop: '24px' }}>
        <div className="flex items-center justify-between mb-6">
          <h2>Managed Tenants</h2>
        </div>
        
        {companies.length === 0 ? (
          <div className="text-muted" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Server size={48} color="var(--text-muted)" style={{ margin: '0 auto', marginBottom: '16px', opacity: 0.5 }} />
            <div style={{ fontSize: '18px', fontWeight: '500', color: '#fff', marginBottom: '8px' }}>No Tenants Provisioned</div>
            <div>Click "Provision Tenant" to deploy your first Central Server.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr className="text-muted" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>Tenant ID</th>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>Company Name</th>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>Status</th>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>Central URL</th>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>App Port</th>
                  <th style={{ paddingBottom: '16px', fontWeight: '500' }}>Syslog Port</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px 0', color: '#fff', fontFamily: 'monospace' }}>{company.company_id}</td>
                    <td style={{ padding: '16px 0', color: '#fff', fontWeight: '500' }}>{company.company_name}</td>
                    <td style={{ padding: '16px 0' }}>
                      <span className={`badge ${company.status === 'active' ? 'badge-info' : 'badge-warning'}`}>
                        {company.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px 0' }}>
                      <a href={company.central_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                        {company.central_url}
                      </a>
                    </td>
                    <td style={{ padding: '16px 0', color: 'var(--text-muted)' }}>{company.app_port}</td>
                    <td style={{ padding: '16px 0', color: 'var(--text-muted)' }}>{company.syslog_port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProvisionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchCompanies} 
      />

    </div>
  );
}
