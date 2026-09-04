import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  Power,
  KeyRound,
  AlertTriangle,
  RefreshCw,
  X,
  Server
} from 'lucide-react';
import ProvisionModal from '../components/ProvisionModal';
import ResetPasswordModal from '../components/ResetPasswordModal';

export default function Tenants() {
  const [companies, setCompanies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  // Modals
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [resetPwdTenant, setResetPwdTenant] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    companyId: null,
    companyName: '',
    confirmText: '',
    isDeleting: false,
    error: ''
  });

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/super/companies');
      setCompanies(res.data || []);
    } catch (err) {
      console.error('[Fetch Tenants Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCopyKey = (key, id) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleStatus = async (company) => {
    const nextStatus = company.status === 'active' ? 'suspended' : 'active';
    try {
      await axios.patch(`/api/super/companies/${company.company_id}/status`, { status: nextStatus });
      fetchCompanies();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update tenant status');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.companyId) return;
    if (deleteConfirm.confirmText !== deleteConfirm.companyId) {
      return setDeleteConfirm(prev => ({ ...prev, error: 'Confirmation ID does not match exactly.' }));
    }

    setDeleteConfirm(prev => ({ ...prev, isDeleting: true, error: '' }));
    try {
      await axios.delete(`/api/super/companies/${deleteConfirm.companyId}`);
      setDeleteConfirm({ isOpen: false, companyId: null, companyName: '', confirmText: '', isDeleting: false, error: '' });
      fetchCompanies();
    } catch (err) {
      setDeleteConfirm(prev => ({
        ...prev,
        isDeleting: false,
        error: err.response?.data?.error || 'Failed to delete tenant database'
      }));
    }
  };

  // Filtering
  const filteredCompanies = companies.filter(c => {
    const matchesSearch =
      c.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.company_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(c.syslog_port || '').includes(searchQuery);

    if (statusFilter === 'active') return matchesSearch && c.status === 'active';
    if (statusFilter === 'suspended') return matchesSearch && c.status === 'suspended';
    return matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Managed Tenants Directory
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Multi-tenant PostgreSQL database allocations, Syslog ports, and organization status controls
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={fetchCompanies} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setIsProvisionOpen(true)}>
            <Plus size={14} /> Provision Tenant
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div className="search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search by company, ID, or port..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="tab-group">
          <button
            className={`tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Tenants ({companies.length})
          </button>
          <button
            className={`tab-btn ${statusFilter === 'active' ? 'active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            Active ({companies.filter(c => c.status === 'active').length})
          </button>
          <button
            className={`tab-btn ${statusFilter === 'suspended' ? 'active' : ''}`}
            onClick={() => setStatusFilter('suspended')}
          >
            Suspended ({companies.filter(c => c.status === 'suspended').length})
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="ent-table-container">
        {filteredCompanies.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <Building2 size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#94a3b8', marginBottom: '4px' }}>
              No matching tenants found
            </div>
            <div style={{ fontSize: '12px' }}>
              Try adjusting your search criteria or provision a new tenant.
            </div>
          </div>
        ) : (
          <table className="ent-table">
            <thead>
              <tr>
                <th>Tenant Organization</th>
                <th>Database & Subdomain</th>
                <th>Status</th>
                <th>Syslog Listener</th>
                <th>Enrolled Agents</th>
                <th>Ingestion API Key</th>
                <th className="text-right">Operational Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompanies.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '13px' }}>{c.company_name}</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Tier: <span style={{ textTransform: 'capitalize' }}>{c.tier || 'standard'}</span></div>
                  </td>

                  <td>
                    <span className="badge-pill badge-neutral font-mono" style={{ fontSize: '12px' }}>{c.company_id}</span>
                  </td>

                  <td>
                    {c.status === 'active' ? (
                      <span className="badge-pill badge-emerald">
                        <span className="status-dot active" /> ACTIVE
                      </span>
                    ) : (
                      <span className="badge-pill badge-amber">
                        <span className="status-dot suspended" /> SUSPENDED
                      </span>
                    )}
                  </td>

                  <td>
                    <span className="font-mono" style={{ color: '#10b981', fontWeight: '500' }}>
                      UDP :{c.syslog_port || '—'}
                    </span>
                  </td>

                  <td>
                    <span className="badge-pill badge-neutral font-mono" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <Server size={11} color={c.agent_count > 0 ? '#10b981' : '#64748b'} />
                      <span>{c.agent_count || 0} {c.agent_count === 1 ? 'Agent' : 'Agents'}</span>
                    </span>
                  </td>

                  <td>
                    {c.api_key ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono" style={{ fontSize: '12px', color: '#64748b' }}>
                          iochunt-••••••••
                        </span>
                        <button
                          onClick={() => handleCopyKey(c.api_key, c.id)}
                          className="btn-ghost"
                          style={{ padding: '3px 6px', borderRadius: '4px', color: copiedId === c.id ? '#10b981' : '#64748b' }}
                          title="Copy API Key"
                        >
                          {copiedId === c.id ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#475569', fontSize: '12px' }}>Encrypted</span>
                    )}
                  </td>



                  <td className="text-right">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {/* Suspend / Resume Button */}
                      <button
                        className="btn-ghost"
                        onClick={() => handleToggleStatus(c)}
                        title={c.status === 'active' ? 'Suspend Tenant Access' : 'Activate Tenant Access'}
                        style={{ padding: '6px', borderRadius: '4px', color: c.status === 'active' ? '#f59e0b' : '#10b981' }}
                      >
                        <Power size={15} />
                      </button>

                      {/* Reset Admin Password Button */}
                      <button
                        className="btn-ghost"
                        onClick={() => setResetPwdTenant(c)}
                        title="Reset Admin Password"
                        style={{ padding: '6px', borderRadius: '4px', color: '#38bdf8' }}
                      >
                        <KeyRound size={15} />
                      </button>

                      {/* Delete Tenant Button */}
                      <button
                        className="btn-danger-ghost"
                        onClick={() => setDeleteConfirm({
                          isOpen: true,
                          companyId: c.company_id,
                          companyName: c.company_name,
                          confirmText: '',
                          isDeleting: false,
                          error: ''
                        })}
                        title="Delete Tenant Database"
                        style={{ padding: '6px', borderRadius: '4px' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Provisioning Modal */}
      <ProvisionModal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        onSuccess={fetchCompanies}
      />

      {/* Reset Admin Password Modal */}
      <ResetPasswordModal
        isOpen={Boolean(resetPwdTenant)}
        tenant={resetPwdTenant}
        onClose={() => setResetPwdTenant(null)}
        onSuccess={fetchCompanies}
      />

      {/* Enterprise Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '6px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e' }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>Permanent Tenant Destruction</h3>
                  <p style={{ fontSize: '12px', color: '#64748b' }}>Irreversible database purge action</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, companyId: null, companyName: '', confirmText: '', isDeleting: false, error: '' })}
                className="btn-ghost"
                style={{ padding: '4px', borderRadius: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5', marginBottom: '14px' }}>
                You are about to permanently drop the database <strong>iochunt_tenant_{deleteConfirm.companyId}</strong> for <strong>{deleteConfirm.companyName}</strong>. All associated event logs, machine groups, and policies will be wiped.
              </p>

              {deleteConfirm.error && (
                <div style={{
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fb7185',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '14px'
                }}>
                  {deleteConfirm.error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '12px' }}>
                  Type <code className="font-mono" style={{ color: '#f43f5e' }}>{deleteConfirm.companyId}</code> to confirm:
                </label>
                <input
                  type="text"
                  className="form-input font-mono"
                  placeholder={deleteConfirm.companyId}
                  value={deleteConfirm.confirmText}
                  onChange={(e) => setDeleteConfirm(prev => ({ ...prev, confirmText: e.target.value }))}
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirm({ isOpen: false, companyId: null, companyName: '', confirmText: '', isDeleting: false, error: '' })}
                disabled={deleteConfirm.isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={handleDelete}
                disabled={deleteConfirm.isDeleting || deleteConfirm.confirmText !== deleteConfirm.companyId}
              >
                {deleteConfirm.isDeleting ? 'Dropping DB...' : 'Erase Database & Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
