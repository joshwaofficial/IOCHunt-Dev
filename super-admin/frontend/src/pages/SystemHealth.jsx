import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Database,
  Radio,
  Cpu,
  RefreshCw,
  CheckCircle2,
  Clock
} from 'lucide-react';

export default function SystemHealth() {
  const [healthData, setHealthData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/super/system-health');
      setHealthData(res.data);
    } catch (err) {
      console.error('[Health Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Infrastructure & System Health
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Control plane telemetry, memory utilization, PostgreSQL cluster connections, and Syslog listeners
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchHealth} disabled={isLoading}>
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh Telemetry
        </button>
      </div>

      {/* Top Health Metric Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Overall Status</span>
            <CheckCircle2 size={15} color="#10b981" />
          </div>
          <div className="kpi-value" style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="status-dot active" /> Operational
          </div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>All core daemons online</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>Node Process Uptime</span>
            <Clock size={15} color="#38bdf8" />
          </div>
          <div className="kpi-value font-mono tabular-nums" style={{ fontSize: '22px' }}>
            {formatUptime(healthData?.uptimeSeconds)}
          </div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>Control Plane Backend</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>Memory Resident (RSS)</span>
            <Cpu size={15} color="#f59e0b" />
          </div>
          <div className="kpi-value font-mono tabular-nums">
            {healthData?.memory?.rssMb || 0} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '400' }}>MB</span>
          </div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>Heap: {healthData?.memory?.heapUsedMb || 0} MB / {healthData?.memory?.heapTotalMb || 0} MB</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-title">
            <span>PostgreSQL Connections</span>
            <Database size={15} color="#6366f1" />
          </div>
          <div className="kpi-value font-mono tabular-nums">
            {healthData?.postgres?.totalConnections || 0}
          </div>
          <div className="kpi-subtitle">
            <span style={{ color: '#94a3b8' }}>{healthData?.postgres?.activeQueries || 0} Active Query Channels</span>
          </div>
        </div>
      </div>

      {/* Two Grid Cards: Database Storage Breakdown & Syslog Listeners */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* PostgreSQL Databases Footprint */}
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                PostgreSQL Database Allocations
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Disk footprint per tenant database schema</span>
            </div>
            <Database size={16} color="#6366f1" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Database Name</th>
                  <th>Disk Footprint</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {healthData?.postgres?.databases?.length ? (
                  healthData.postgres.databases.map((db, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="badge-pill badge-neutral font-mono">{db.db_name}</span>
                      </td>
                      <td className="font-mono tabular-nums" style={{ color: '#38bdf8', fontWeight: '500' }}>
                        {db.pretty_size}
                      </td>
                      <td>
                        <span className="badge-pill badge-emerald">
                          <span className="status-dot active" /> READY
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No active database tables found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Syslog Port Mappings */}
        <div className="ent-card">
          <div className="ent-card-header">
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', margin: 0 }}>
                Syslog Receiver Port Mappings
              </h2>
              <span style={{ fontSize: '12px', color: '#64748b' }}>UDP port dispatch mapping to tenant databases</span>
            </div>
            <Radio size={16} color="#10b981" />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Port</th>
                  <th>Protocol</th>
                  <th>Assigned Tenant</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {healthData?.syslogPorts?.length ? (
                  healthData.syslogPorts.map((spm, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="font-mono" style={{ color: '#10b981', fontWeight: '600' }}>
                          :{spm.port}
                        </span>
                      </td>
                      <td>
                        <span className="badge-pill badge-neutral" style={{ textTransform: 'uppercase' }}>
                          {spm.protocol || 'UDP'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '500', color: '#f8fafc' }}>{spm.company_name || spm.tenant_id}</div>
                        <div className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>{spm.tenant_id}</div>
                      </td>
                      <td>
                        {spm.enabled ? (
                          <span className="badge-pill badge-emerald">
                            <span className="status-dot active" /> LISTENING
                          </span>
                        ) : (
                          <span className="badge-pill badge-amber">
                            DISABLED
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No Syslog ports assigned yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
