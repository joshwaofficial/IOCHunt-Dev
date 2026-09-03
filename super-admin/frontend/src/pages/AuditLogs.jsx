import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Layers,
  Search,
  RefreshCw,
  User,
  CheckCircle2,
  Download
} from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/api/super/audit-logs', {
        params: {
          limit: pageSize,
          offset: page * pageSize,
          search: searchQuery.trim() || undefined
        }
      });
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('[Audit Logs Error]', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, searchQuery]);

  const formatTimestamp = (epochSeconds) => {
    if (!epochSeconds) return '—';
    const d = new Date(epochSeconds * 1000);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  const getActionBadge = (action) => {
    const act = (action || '').toUpperCase();
    if (act.includes('PROVISION')) {
      return <span className="badge-pill badge-emerald">PROVISION</span>;
    }
    if (act.includes('DELETE')) {
      return <span className="badge-pill badge-rose">DELETE</span>;
    }
    if (act.includes('SUSPEND')) {
      return <span className="badge-pill badge-amber">SUSPEND</span>;
    }
    if (act.includes('ACTIVATE')) {
      return <span className="badge-pill badge-emerald">ACTIVATE</span>;
    }
    if (act.includes('PASSWORD') || act.includes('CREDENTIAL')) {
      return <span className="badge-pill badge-blue">CREDENTIALS</span>;
    }
    if (act.includes('SETTINGS')) {
      return <span className="badge-pill badge-blue">SETTINGS</span>;
    }
    if (act.includes('LOGIN')) {
      return <span className="badge-pill badge-neutral">AUTH</span>;
    }
    return <span className="badge-pill badge-neutral">{action}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.02em', marginBottom: '4px' }}>
            Control Plane Audit Trail
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Immutable security audit logs tracking all administrative interventions, tenant provisioning, and credential resets
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="/api/super/audit-logs/export"
            download="control-plane-audit-logs.json"
            className="btn btn-secondary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} /> Export JSON
          </a>
          <button className="btn btn-secondary" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh Log
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div className="search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="form-input search-input"
            placeholder="Search action, actor, tenant ID, or IP..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div style={{ fontSize: '12px', color: '#64748b' }}>
          Showing {logs.length} of {total} recorded events
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="ent-table-container">
        {logs.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <div style={{ fontSize: '14px', fontWeight: '500', color: '#94a3b8', marginBottom: '4px' }}>
              No audit events found
            </div>
            <div style={{ fontSize: '12px' }}>
              Actions performed in the Super Admin console will automatically appear here.
            </div>
          </div>
        ) : (
          <table className="ent-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Security Action</th>
                <th>Actor</th>
                <th>Target Tenant</th>
                <th>Operational Detail</th>
                <th>Source IP</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="font-mono tabular-nums" style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {formatTimestamp(log.created_at)}
                  </td>
                  <td>
                    {getActionBadge(log.action)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f8fafc', fontWeight: '500' }}>
                      <User size={13} color="#64748b" /> {log.username || 'system'}
                    </div>
                  </td>
                  <td>
                    {log.tenant_id ? (
                      <span className="badge-pill badge-neutral font-mono">{log.tenant_id}</span>
                    ) : (
                      <span style={{ color: '#475569' }}>—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '320px', color: '#cbd5e1' }}>
                    <div className="truncate" title={log.detail}>
                      {log.detail || log.action}
                    </div>
                  </td>
                  <td className="font-mono" style={{ fontSize: '12px', color: '#64748b' }}>
                    {log.ip_address || '—'}
                  </td>
                  <td>
                    <span className="badge-pill badge-emerald">
                      <CheckCircle2 size={11} /> {log.result || 'SUCCESS'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Bar */}
      {total > pageSize && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Page {page + 1} of {Math.ceil(total / pageSize)}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              disabled={page === 0 || isLoading}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Previous
            </button>
            <button
              className="btn btn-secondary"
              disabled={(page + 1) * pageSize >= total || isLoading}
              onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 10px', fontSize: '12px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
