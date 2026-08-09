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

      {/* Metric Cards */}
      <div className="dashboard-grid">
        
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
            <ShieldCheck size={24} color="#10b981" />
          </div>
          <div>
            <div className="text-muted mb-2">Security Score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
              <span style={{ fontSize: '32px', fontWeight: '600', color: '#10b981' }}>82</span>
              <span className="text-muted" style={{ fontSize: '14px' }}>/100</span>
            </div>
            <div className="mt-2 text-muted" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span> Good
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
            <AlertCircle size={24} color="#ef4444" />
          </div>
          <div>
            <div className="text-muted mb-2">Active Alerts</div>
            <div style={{ fontSize: '32px', fontWeight: '600', color: '#ef4444' }}>7</div>
            <div className="mt-2 text-muted" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <ArrowUpRight size={14} color="#ef4444" />
              <span style={{ color: '#ef4444' }}>2</span> from last 7 days
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
            <Bug size={24} color="#f59e0b" />
          </div>
          <div>
            <div className="text-muted mb-2">Threats Blocked</div>
            <div style={{ fontSize: '32px', fontWeight: '600', color: '#fff' }}>128</div>
            <div className="mt-2 text-muted" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <ArrowUpRight size={14} color="#10b981" />
              <span style={{ color: '#10b981' }}>18%</span> from last 7 days
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
            <Monitor size={24} color="#3b82f6" />
          </div>
          <div>
            <div className="text-muted mb-2">Assets Monitored</div>
            <div style={{ fontSize: '32px', fontWeight: '600', color: '#fff' }}>{totalTenants > 0 ? totalTenants : 342}</div>
            <div className="mt-2 text-muted" style={{ fontSize: '12px' }}>
              No change
            </div>
          </div>
        </div>

      </div>

      {/* Lists Row */}
      <div className="dashboard-list-grid">
        
        {/* Left List: Managed Tenants (Styled like Recent Alerts) */}
        <div className="list-panel">
          <h2>Recent Alerts (Managed Tenants)</h2>
          <div className="flex-col gap-4">
            {companies.length === 0 ? (
              <div className="text-muted" style={{ textAlign: 'center', padding: '20px' }}>No alerts/tenants to display</div>
            ) : (
              companies.map((company, idx) => (
                <div key={company.id} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: idx !== companies.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} color={company.status === 'active' ? '#10b981' : '#ef4444'} />
                    <span style={{ fontSize: '14px', color: '#fff' }}>{company.company_name} provisioned</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`badge ${company.status === 'active' ? 'badge-info' : 'badge-danger'}`}>
                      {company.status === 'active' ? 'Low' : 'High'}
                    </span>
                    <span className="text-muted" style={{ width: '60px', textAlign: 'right' }}>
                      2m ago
                    </span>
                  </div>
                </div>
              ))
            )}
            
            {/* Hardcoded fake alerts to match screenshot if companies list is small */}
            {companies.length < 5 && (
              <>
                <div className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} color="#f59e0b" />
                    <span style={{ fontSize: '14px', color: '#fff' }}>Suspicious file detected</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="badge badge-warning">Medium</span>
                    <span className="text-muted" style={{ width: '60px', textAlign: 'right' }}>15m ago</span>
                  </div>
                </div>
                <div className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} color="#f59e0b" />
                    <span style={{ fontSize: '14px', color: '#fff' }}>Unusual outbound connection</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="badge badge-warning">Medium</span>
                    <span className="text-muted" style={{ width: '60px', textAlign: 'right' }}>1h ago</span>
                  </div>
                </div>
                <div className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={16} color="#3b82f6" />
                    <span style={{ fontSize: '14px', color: '#fff' }}>New device added</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="badge badge-info">Low</span>
                    <span className="text-muted" style={{ width: '60px', textAlign: 'right' }}>3h ago</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-4">
            <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>View all alerts &gt;</a>
          </div>
        </div>

        {/* Right List: Top Vulnerabilities */}
        <div className="list-panel">
          <h2>Top Vulnerabilities</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr className="text-muted" style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ paddingBottom: '16px', fontWeight: '400' }}>Vulnerability</th>
                <th style={{ paddingBottom: '16px', fontWeight: '400' }}>Severity</th>
                <th style={{ paddingBottom: '16px', fontWeight: '400', textAlign: 'right' }}>Assets</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '16px 0', color: '#fff' }}>CVE-2024-3094</td>
                <td style={{ color: '#ef4444' }}>Critical</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>12</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0', color: '#fff' }}>CVE-2024-2811</td>
                <td style={{ color: '#f97316' }}>High</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>24</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0', color: '#fff' }}>CVE-2024-2472</td>
                <td style={{ color: '#f97316' }}>High</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>17</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0', color: '#fff' }}>CVE-2023-4966</td>
                <td style={{ color: '#f59e0b' }}>Medium</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>31</td>
              </tr>
              <tr>
                <td style={{ padding: '16px 0', color: '#fff' }}>CVE-2023-38831</td>
                <td style={{ color: '#f59e0b' }}>Medium</td>
                <td style={{ textAlign: 'right', color: '#fff' }}>29</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-4">
            <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>View all vulnerabilities &gt;</a>
          </div>
        </div>

      </div>

      {/* System Status Footer */}
      <div className="status-footer">
        <div className="status-footer-left">
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', width: '40px', height: '40px' }}>
            <ShieldCheck size={20} color="#10b981" />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>All systems operational</div>
            <div className="text-muted" style={{ fontSize: '13px' }}>No incidents reported</div>
          </div>
        </div>

        <div className="status-footer-right">
          <div className="flex items-center gap-3">
            <Calendar size={18} color="var(--text-muted)" />
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Uptime</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>99.9%</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Server size={18} color="var(--text-muted)" />
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Users</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>24</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Monitor size={18} color="var(--text-muted)" />
            <div>
              <div className="text-muted" style={{ fontSize: '12px' }}>Data Sources</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>16</div>
            </div>
          </div>
        </div>
      </div>

      <ProvisionModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchCompanies} 
      />

    </div>
  );
}
