import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  HardDrive,
  Activity,
  Server,
  Plus,
  Clock,
  Database,
  Layers,
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import ProvisionModal from '../components/ProvisionModal';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    suspendedTenants: 0,
    totalEnrolledAgents: 0,
    totalStoragePretty: '0 MB',
    activeSyslogPorts: 0,
    totalAuditEvents: 0
  });
  const [companies, setCompanies] = useState([]);
  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const navigate = useNavigate();

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, companiesRes, healthRes] = await Promise.all([
        axios.get('/api/super/stats'),
        axios.get('/api/super/companies'),
        axios.get('/api/super/system-health')
      ]);
      setStats(statsRes.data);
      setCompanies(companiesRes.data || []);
      setHealth(healthRes.data);
    } catch (err) {
      console.error('[Dashboard Load Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatCreated = (ts) => {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' && ts < 1e11 ? ts * 1000 : ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Top Header & Fast Actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Control Plane Overview
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b' }}>
            Central multi-tenant telemetry, database cluster metrics, and fleet statistics
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={loadDashboardData} disabled={isLoading}>
            <Activity size={14} className={isLoading ? 'spin' : ''} /> Refresh Metrics
          </button>
          <button className="btn btn-primary" onClick={() => setIsProvisionOpen(true)}>
            <Plus size={14} /> Provision Tenant
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (4 Columns) */}
      <div className="kpi-grid">
        {/* Total Tenants */}
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Managed Tenants</span>
            <Building2 size={15} color="#38bdf8" />
          </div>
          <div className="kpi-value">{stats.totalTenants}</div>
          <div className="kpi-subtitle">
            <span className="badge-pill badge-emerald">
              <span className="status-dot active" /> {stats.activeTenants} Active
            </span>
            {stats.suspendedTenants > 0 && (
              <span className="badge-pill badge-amber">
                {stats.suspendedTenants} Suspended
              </span>
            )}
          </div>
        </div>

        {/* Total Enrolled Agents */}
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Enrolled Agents</span>
            <Server size={15} color="#10b981" />
          </div>
          <div className="kpi-value">{stats.totalEnrolledAgents}</div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>Across {stats.activeTenants} active organizations</span>
          </div>
        </div>

        {/* Storage Footprint */}
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Database Storage</span>
            <HardDrive size={15} color="#f59e0b" />
          </div>
          <div className="kpi-value tabular-nums">{stats.totalStoragePretty}</div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>PostgreSQL Cluster Footprint</span>
          </div>
        </div>

        {/* Audit Events Recorded */}
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Control Audit Logs</span>
            <Layers size={15} color="#ec4899" />
          </div>
          <div className="kpi-value tabular-nums">{stats.totalAuditEvents}</div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>Immutable Actions Logged</span>
          </div>
        </div>
      </div>

      {/* Two Columns: Recent Tenants & Cluster Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Left: Active Tenants Summary Table */}
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                Recent Tenant Deployments
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Showing up to 6 recently provisioned tenant databases</span>
            </div>
            <button className="btn btn-ghost" onClick={() => navigate('/tenants')} style={{ fontSize: '12px', padding: '4px 8px' }}>
              View All ({companies.length}) <ChevronRight size={13} />
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {companies.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                <Server size={28} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '4px' }}>No Tenants Provisioned Yet</p>
                <p style={{ fontSize: '12px' }}>Click "Provision Tenant" to deploy your first isolated company workspace.</p>
              </div>
            ) : (
              <table className="ent-table">
                <thead>
                  <tr>
                    <th>Tenant Organization</th>
                    <th>Database Identifier</th>
                    <th>Status</th>
                    <th>Syslog Port</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.slice(0, 6).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: '500', color: '#f8fafc' }}>{c.company_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Tier: {c.tier || 'standard'}</div>
                      </td>
                      <td>
                        <span className="badge-pill badge-neutral font-mono">{c.company_id}</span>
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
                        <span className="font-mono" style={{ color: '#38bdf8' }}>:{c.syslog_port || '—'}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {formatCreated(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Cluster & Infrastructure Telemetry */}
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                Control Plane Health
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>PostgreSQL & Container telemetry</span>
            </div>
            <span className="badge-pill badge-emerald">
              <CheckCircle2 size={11} /> Healthy
            </span>
          </div>

          <div className="ent-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#090b10', border: '1px solid #191e2b', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={15} color="#38bdf8" />
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Service Uptime</span>
              </div>
              <span className="font-mono tabular-nums" style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
                {formatUptime(health?.uptimeSeconds)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#090b10', border: '1px solid #191e2b', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={15} color="#10b981" />
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Active DB Pools</span>
              </div>
              <span className="font-mono tabular-nums" style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
                {health?.postgres?.totalConnections || 0} Connections
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#090b10', border: '1px solid #191e2b', borderRadius: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={15} color="#f59e0b" />
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Node Process RSS</span>
              </div>
              <span className="font-mono tabular-nums" style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
                {health?.memory?.rssMb || 0} MB
              </span>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '14px', borderTop: '1px solid #191e2b', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Load Balancing:</span>
              <span style={{ fontSize: '12px', color: '#38bdf8' }}>NGINX Port 8080 (Unified)</span>
            </div>
          </div>
        </div>
      </div>

      <ProvisionModal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        onSuccess={loadDashboardData}
      />
    </div>
  );
}
