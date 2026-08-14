import { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar, Bell, ShieldCheck, AlertCircle, Bug, Monitor, ArrowUpRight, ArrowDownRight, Server, Plus, Trash2 } from 'lucide-react';
import ProvisionModal from '../components/ProvisionModal';

export default function Dashboard() {
  const [companies, setCompanies] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, companyId: null, companyName: '', isDeleting: false, error: '' });

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

  const handleDelete = async () => {
    if (!deleteConfirm.companyId) return;
    setDeleteConfirm(prev => ({ ...prev, isDeleting: true, error: '' }));
    try {
      await axios.delete(`/api/super/companies/${deleteConfirm.companyId}`);
      setDeleteConfirm({ isOpen: false, companyId: null, companyName: '', isDeleting: false, error: '' });
      fetchCompanies();
    } catch (err) {
      setDeleteConfirm(prev => ({ ...prev, isDeleting: false, error: err.response?.data?.error || 'Failed to delete tenant' }));
    }
  };

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
          <div className="text-muted" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Server size={32} color="var(--border-color)" style={{ margin: '0 auto', marginBottom: '16px' }} />
            <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text-heading)', marginBottom: '4px' }}>No Tenants Provisioned</div>
            <div style={{ fontSize: '13px' }}>Click "Provision Tenant" to deploy your first Central Server.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Tenant ID</th>
                  <th>Company Name</th>
                  <th>Status</th>
                  <th>Central URL</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-heading)' }}>{company.company_id}</td>
                    <td style={{ fontWeight: '500', color: 'var(--text-heading)' }}>{company.company_name}</td>
                    <td>
                      <span className={`badge ${company.status === 'active' ? 'badge-info' : 'badge-warning'}`}>
                        {company.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <a href={company.central_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-main)', textDecoration: 'none', borderBottom: '1px solid var(--border-color)' }}>
                        {company.central_url}
                      </a>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn-danger" 
                        onClick={() => setDeleteConfirm({ isOpen: true, companyId: company.company_id, companyName: company.company_name, isDeleting: false, error: '' })}
                        title="Delete Tenant"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
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

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '50%', color: '#ef4444' }}>
                <Trash2 size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Delete Tenant</h3>
              </div>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
              Are you sure you want to completely erase <strong>{deleteConfirm.companyName}</strong>? 
              This will permanently drop their database and destroy all logs. This action <strong>cannot</strong> be undone.
            </p>

            {deleteConfirm.error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
                {deleteConfirm.error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setDeleteConfirm({ isOpen: false, companyId: null, companyName: '', isDeleting: false, error: '' })}
                disabled={deleteConfirm.isDeleting}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: '6px', cursor: deleteConfirm.isDeleting ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                disabled={deleteConfirm.isDeleting}
                style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontWeight: '500', cursor: deleteConfirm.isDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {deleteConfirm.isDeleting ? 'Deleting...' : 'Erase Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
