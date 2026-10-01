import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const catColors = { 
  FIREWALL: '#06b6d4',
  DOMAIN: '#a855f7', 
  ADCS: '#8b5cf6', 
  NETWORK: '#3b82f6', 
  SENSITIVE: '#ef4444', 
  ENUM: '#f97316', 
  PROCESSES: '#ec4899', 
  CONFIG: '#eab308', 
  REGISTRY: '#22c55e', 
  LOGON: '#06b6d4', 
  SERVICES: '#fb923c', 
  TASKS: '#a3e635', 
  USB: '#f43f5e', 
  DEFENDER: '#ef4444', 
  STARTUP: '#ec4899',
  OTHER: '#6b7280' 
};

const REPORT_CATEGORIES = [
  { id: 'FIREWALL', label: 'Firewall', color: '#06b6d4' },
  { id: 'DOMAIN', label: 'Domain', color: '#a855f7' },
  { id: 'ADCS', label: 'ADCS', color: '#8b5cf6' },
  { id: 'NETWORK', label: 'Network', color: '#3b82f6' },
  { id: 'LOGON', label: 'Logon', color: '#06b6d4' },
  { id: 'PROCESSES', label: 'Processes', color: '#ec4899' },
  { id: 'SERVICES', label: 'Services', color: '#fb923c' },
  { id: 'TASKS', label: 'Tasks', color: '#a3e635' },
  { id: 'REGISTRY', label: 'Registry', color: '#22c55e' },
  { id: 'DEFENDER', label: 'Defender', color: '#ef4444' },
  { id: 'USB', label: 'USB', color: '#f43f5e' },
  { id: 'SENSITIVE', label: 'Sensitive', color: '#ef4444' },
  { id: 'CONFIG', label: 'Config', color: '#eab308' },
  { id: 'STARTUP', label: 'Startup', color: '#ec4899' },
  { id: 'ENUM', label: 'Enum', color: '#f97316' },
];

const REPORT_SEVERITIES = [
  { id: 'critical', label: 'Critical', color: '#ef4444' },
  { id: 'high', label: 'High', color: '#f97316' },
  { id: 'medium', label: 'Medium', color: '#eab308' },
  { id: 'low', label: 'Low', color: '#3b82f6' },
  { id: 'info', label: 'Info', color: '#06b6d4' },
];

function getPageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function Reports() {
  const [filters, setFilters] = useState({
    duration: '24',
    from_date: '',
    to_date: new Date().toISOString().slice(0, 10),
    machine: '',
    severity: [],
    category: [],
    aggregator: [],
    include_fw: true
  });
  const [reportMode, setReportMode] = useState('general'); // 'general' | 'firewall'
  const [machines, setMachines] = useState([]);
  const [aggregators, setAggregators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSeverityDropdown, setShowSeverityDropdown] = useState(false);
  const branchDropdownRef = useRef(null);
  const categoryDropdownRef = useRef(null);
  const severityDropdownRef = useRef(null);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(100);
  const [eventSearch, setEventSearch] = useState('');

  // ── Firewall Report Specific State ──────────────────────────────────────────
  const [fwFilters, setFwFilters] = useState({
    duration: '24',
    from_date: '',
    to_date: new Date().toISOString().slice(0, 10),
    device: '',
    aggregator: [],
    action: '',
    severity: '',
    alert_type: '',
    service: '',
    ip: '',
    search: ''
  });
  const [fwDevices, setFwDevices] = useState([]);
  const [fwReportData, setFwReportData] = useState(null);
  const [fwShowBranchDropdown, setFwShowBranchDropdown] = useState(false);
  const fwBranchDropdownRef = useRef(null);

  // Security alerts table pagination & tab
  const [alertTab, setAlertTab] = useState('all');
  const [alertSearch, setAlertSearch] = useState('');
  const [alertPage, setAlertPage] = useState(1);
  const [alertPerPage, setAlertPerPage] = useState(10);

  // Connections table pagination & search
  const [connSearch, setConnSearch] = useState('');
  const [connPage, setConnPage] = useState(1);
  const [connPerPage, setConnPerPage] = useState(25);

  // USB Compliance table pagination & filter
  const [usbTab, setUsbTab] = useState('all'); // 'all' | 'non_compliant' | 'locked' | 'unlocked'
  const [usbSearch, setUsbSearch] = useState('');
  const [usbPage, setUsbPage] = useState(1);
  const [usbPerPage, setUsbPerPage] = useState(15);

  useEffect(() => {
    axios.get('/api/machines').then(res => setMachines(res.data.data || res.data)).catch(console.error);
    axios.get('/api/aggregators').then(res => setAggregators(res.data.data || res.data)).catch(console.error);
    axios.get('/api/firewall/devices').then(res => setFwDevices(res.data || [])).catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) {
        setShowBranchDropdown(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target)) {
        setShowCategoryDropdown(false);
      }
      if (severityDropdownRef.current && !severityDropdownRef.current.contains(e.target)) {
        setShowSeverityDropdown(false);
      }
      if (fwBranchDropdownRef.current && !fwBranchDropdownRef.current.contains(e.target)) {
        setFwShowBranchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getCategoryLabel = () => {
    if (!filters.category || filters.category.length === 0) return 'All Categories';
    if (filters.category.length === 1) {
      const match = REPORT_CATEGORIES.find(c => c.id === filters.category[0]);
      return match ? match.label : filters.category[0];
    }
    return `${filters.category.length} selected`;
  };

  const getSeverityLabel = () => {
    if (!filters.severity || filters.severity.length === 0) return 'All Severities';
    if (Array.isArray(filters.severity)) {
      if (filters.severity.length === 1) {
        const match = REPORT_SEVERITIES.find(s => s.id === filters.severity[0]);
        return match ? match.label : filters.severity[0];
      }
      return `${filters.severity.length} selected`;
    }
    return filters.severity;
  };

  const handleGenerateFirewall = async () => {
    setLoading(true);
    setError('');
    setAlertPage(1);
    setConnPage(1);
    setAlertSearch('');
    setConnSearch('');
    try {
      let qs = `duration=${fwFilters.duration}`;
      if (fwFilters.duration === 'custom') {
        if (fwFilters.from_date) qs += `&from_date=${encodeURIComponent(fwFilters.from_date)}`;
        if (fwFilters.to_date) qs += `&to_date=${encodeURIComponent(fwFilters.to_date)}`;
      }
      if (fwFilters.device) qs += `&device=${encodeURIComponent(fwFilters.device)}`;
      if (fwFilters.aggregator && fwFilters.aggregator.length > 0) qs += `&aggregator=${encodeURIComponent(fwFilters.aggregator.join(','))}`;
      if (fwFilters.action) qs += `&action=${encodeURIComponent(fwFilters.action)}`;
      if (fwFilters.severity) qs += `&severity=${encodeURIComponent(fwFilters.severity)}`;
      if (fwFilters.service) qs += `&service=${encodeURIComponent(fwFilters.service)}`;
      if (fwFilters.ip) qs += `&ip=${encodeURIComponent(fwFilters.ip)}`;
      if (fwFilters.search) qs += `&search=${encodeURIComponent(fwFilters.search)}`;
      if (fwFilters.alert_type) qs += `&alert_type=${encodeURIComponent(fwFilters.alert_type)}`;

      const res = await axios.get(`/api/reports/firewall?${qs}`);
      setFwReportData(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to generate firewall report');
    } finally {
      setLoading(false);
    }
  };

  const exportFwJson = () => {
    if (!fwReportData) return;
    const blob = new Blob([JSON.stringify(fwReportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firewall-security-report-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFwPdf = () => {
    if (!fwReportData) return;
    const d = fwReportData;
    const f = d.filters || {};
    const sum = d.summary || {};
    const tlColor = { CRITICAL: '#ef4444', HIGH: '#f97316', ELEVATED: '#eab308', NORMAL: '#22c55e' }[d.threat_level || 'NORMAL'];

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>Firewall Security Report</title>
      <style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a2540;margin:0;padding:24px;background:#fff}
      h1{font-size:20px;font-weight:700;color:#0e7490;letter-spacing:1px;margin:0 0 4px}
      h2{font-size:13px;font-weight:700;color:#1e3a5f;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:20px 0 10px}
      .meta{font-size:10px;color:#6b82a0;margin-bottom:20px}
      .threat-box{background:#f8faff;border:2px solid ${tlColor};border-radius:8px;padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;gap:20px}
      .threat-level{font-size:22px;font-weight:700;color:${tlColor};letter-spacing:1px}
      .threat-desc{font-size:11px;color:#4a5578;line-height:1.6}
      .stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
      .stat{background:#f0f4fc;border-radius:6px;padding:10px 14px;min-width:90px;text-align:center}
      .stat-n{font-size:22px;font-weight:700}
      .stat-l{font-size:9px;color:#6b82a0;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px}
      th{background:#f0f4fc;padding:6px 8px;text-align:left;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#4a5578;border-bottom:2px solid #d0daf0}
      td{padding:5px 8px;border-bottom:1px solid #e8eef8;vertical-align:middle}
      tr:nth-child(even) td{background:#f8faff}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700}
      .c{background:#fef2f2;color:#ef4444}.h{background:#fff7ed;color:#f97316}
      .m{background:#fefce8;color:#ca8a04}.l{background:#f0fdf4;color:#16a34a}
      @media print{body{padding:10px}h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}
      </style></head><body>`;

    html += `<h1>IOC HUNT FIREWALL SECURITY REPORT</h1>
      <div class="meta">Period: <b>${f.duration} (${f.from} to ${f.to})</b> &nbsp;|&nbsp; Device: <b>${f.device}</b>
      &nbsp;|&nbsp; Branch: <b>${f.aggregator}</b> &nbsp;|&nbsp; Action: <b>${f.action}</b>
      &nbsp;|&nbsp; Generated: <b>${new Date(d.generated).toLocaleString()}</b></div>`;

    html += `<div class="threat-box">
      <div><div style="font-size:9px;color:#6b82a0;letter-spacing:1px;margin-bottom:3px">THREAT LEVEL</div>
      <div class="threat-level">${d.threat_level}</div></div>
      <div class="threat-desc"><b>${(sum.total || 0).toLocaleString()}</b> total connections recorded.
      <b>${(sum.denied || 0).toLocaleString()}</b> denied/dropped connections.
      <b>${(sum.totalAlerts || 0).toLocaleString()}</b> security alerts detected 
      (${sum.configChange || 0} config changes, ${sum.adminLogin || 0} admin logins, ${sum.loginFailed || 0} login failures).
      </div></div>`;

    html += `<h2>Summary Statistics</h2><div class="stats">`;
    const statsList = [
      { n: sum.total || 0, l: 'Total Connections', c: '#0891b2' },
      { n: sum.accepted || 0, l: 'Accepted / Allowed', c: '#16a34a' },
      { n: sum.denied || 0, l: 'Denied / Dropped', c: '#ef4444' },
      { n: sum.totalAlerts || 0, l: 'Security Alerts', c: '#f97316' },
      { n: sum.configChange || 0, l: 'Config Changes', c: '#3b82f6' },
      { n: sum.loginFailed || 0, l: 'Login Failures', c: '#dc2626' },
      { n: sum.critical || 0, l: 'Critical Events', c: '#ef4444' },
      { n: sum.high || 0, l: 'High Events', c: '#ea580c' },
    ];
    statsList.forEach(s => {
      html += `<div class="stat"><div class="stat-n" style="color:${s.c}">${s.n.toLocaleString()}</div><div class="stat-l">${s.l}</div></div>`;
    });
    html += `</div>`;

    const alerts = d.alerts?.items || [];
    if (alerts.length > 0) {
      html += `<h2>Security Alerts (${alerts.length} alerts)</h2><table><thead><tr><th>Time</th><th>Device</th><th>Alert Type</th><th>User / Source</th><th>Severity</th><th>Details</th></tr></thead><tbody>`;
      alerts.forEach(a => {
        const sc = a.severity === 'critical' ? 'c' : a.severity === 'high' ? 'h' : a.severity === 'medium' ? 'm' : 'l';
        html += `<tr>
          <td style="font-family:monospace">${a.ts ? new Date(a.ts).toLocaleString() : ''}</td>
          <td><b>${a.machine || '-'}</b></td>
          <td><span class="badge ${sc}">${a.alertType || 'Alert'}</span></td>
          <td>${a.user !== '-' ? a.user + ' / ' : ''}${a.src_ip || '-'}</td>
          <td><span class="badge ${sc}">${(a.severity || 'info').toUpperCase()}</span></td>
          <td>${a.displayMsg || ''}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    const conns = d.connections?.items || [];
    if (conns.length > 0) {
      html += `<h2>Connection Logs (${conns.length} logs)</h2><table><thead><tr><th>Time</th><th>Device</th><th>Source</th><th>Dest</th><th>Service</th><th>Action</th><th>Proto</th><th>Bytes</th><th>Country</th><th>Severity</th></tr></thead><tbody>`;
      conns.forEach(c => {
        const actClass = c.action === 'deny' || c.action === 'drop' ? 'c' : 'l';
        const totalB = (c.sent_byte || 0) + (c.rcvd_byte || 0);
        const bStr = totalB > 1048576 ? (totalB / 1048576).toFixed(1) + 'MB' : totalB > 1024 ? (totalB / 1024).toFixed(0) + 'KB' : totalB + 'B';
        html += `<tr>
          <td style="font-family:monospace">${c.ts ? new Date(c.ts).toLocaleString() : ''}</td>
          <td>${c.machine || '-'}</td>
          <td style="font-family:monospace">${c.src_ip || ''}:${c.src_port || ''}</td>
          <td style="font-family:monospace">${c.dst_ip || ''}:${c.dst_port || ''}</td>
          <td>${c.service || '-'}</td>
          <td><span class="badge ${actClass}">${(c.action || 'accept').toUpperCase()}</span></td>
          <td>${c.proto || '-'}</td>
          <td>${bStr}</td>
          <td>${c.country || '-'}</td>
          <td>${c.severity || 'low'}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    html += `</body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 250);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setEventPage(1);
    setEventSearch('');
    try {
      let sendIncludeFw = filters.include_fw;
      if (Array.isArray(filters.category) && filters.category.length > 0) {
        sendIncludeFw = filters.category.includes('FIREWALL');
      }
      let qs = `duration=${filters.duration}&include_fw=${sendIncludeFw ? '1' : '0'}`;
      if (filters.duration === 'custom') {
        if (filters.from_date) qs += `&from_date=${encodeURIComponent(filters.from_date)}`;
        if (filters.to_date) qs += `&to_date=${encodeURIComponent(filters.to_date)}`;
      }
      if (filters.machine) qs += `&machine=${encodeURIComponent(filters.machine)}`;
      if (filters.aggregator && filters.aggregator.length > 0) qs += `&aggregator=${encodeURIComponent(filters.aggregator.join(','))}`;
      if (Array.isArray(filters.severity) && filters.severity.length > 0) {
        qs += `&severity=${encodeURIComponent(filters.severity.join(','))}`;
      } else if (typeof filters.severity === 'string' && filters.severity) {
        qs += `&severity=${encodeURIComponent(filters.severity)}`;
      }
      if (Array.isArray(filters.category) && filters.category.length > 0) {
        qs += `&category=${encodeURIComponent(filters.category.join(','))}`;
      } else if (typeof filters.category === 'string' && filters.category) {
        qs += `&category=${encodeURIComponent(filters.category)}`;
      }

      const res = await axios.get(`/api/reports/generate?${qs}`);
      setReportData(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportJson = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iochunt-report-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMachines = machines.filter(m => filters.aggregator.length === 0 || filters.aggregator.includes(m.aggregator_name));

  const exportPdf = () => {
    if (!reportData) return;
    const d = reportData;
    const f = d.filters || {};
    const ev = d.events || {};
    const sevMap = {};
    (ev.bySeverity || []).forEach(r => { sevMap[r.severity] = r.n; });

    let durLabel = 'Last 24 hours';
    if (f.duration === 'today') durLabel = 'Today (00:00 to now)';
    if (f.duration == 1) durLabel = 'Last 1 hour';
    if (f.duration == 4) durLabel = 'Last 4 hours';
    if (f.duration == 72) durLabel = 'Last 3 days';
    if (f.duration == 168) durLabel = 'Last 7 days';
    if (f.duration == 720) durLabel = 'Last 30 days';
    if (f.duration === 'custom') durLabel = `${f.from_date ? new Date(f.from_date).toLocaleString() : 'Any'} to ${f.to_date ? new Date(f.to_date).toLocaleString() : 'Now'}`;

    const critCount = sevMap.critical || 0;
    const highCount = sevMap.high || 0;
    const adCount = (d.ad_attacks || []).length;
    const threatLevel = critCount > 5 || adCount > 2 ? 'CRITICAL' : critCount > 0 || highCount > 5 ? 'HIGH' : highCount > 0 ? 'ELEVATED' : 'NORMAL';
    const tlColor = { CRITICAL: '#ef4444', HIGH: '#f97316', ELEVATED: '#eab308', NORMAL: '#22c55e' }[threatLevel];

    const maxCat = Math.max(...(ev.byCategory || []).map(r => r.n)) || 1;

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>IOC Hunt Security Report</title>
      <style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a2540;margin:0;padding:24px;background:#fff}
      h1{font-size:20px;font-weight:700;color:#1e3a5f;letter-spacing:1px;margin:0 0 4px}
      h2{font-size:13px;font-weight:700;color:#1e3a5f;border-bottom:2px solid #e2e8f0;padding-bottom:5px;margin:20px 0 10px}
      .meta{font-size:10px;color:#6b82a0;margin-bottom:20px}
      .threat-box{background:#f8faff;border:2px solid ${tlColor};border-radius:8px;padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;gap:20px}
      .threat-level{font-size:22px;font-weight:700;color:${tlColor};letter-spacing:1px}
      .threat-desc{font-size:11px;color:#4a5578;line-height:1.6}
      .stats{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}
      .stat{background:#f0f4fc;border-radius:6px;padding:10px 14px;min-width:90px;text-align:center}
      .stat-n{font-size:22px;font-weight:700}
      .stat-l{font-size:9px;color:#6b82a0;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px}
      th{background:#f0f4fc;padding:6px 8px;text-align:left;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#4a5578;border-bottom:2px solid #d0daf0}
      td{padding:5px 8px;border-bottom:1px solid #e8eef8;vertical-align:middle}
      tr:nth-child(even) td{background:#f8faff}
      .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700}
      .c{background:#fef2f2;color:#ef4444}.h{background:#fff7ed;color:#f97316}
      .m{background:#fefce8;color:#ca8a04}.l{background:#f0fdf4;color:#16a34a}
      .ad{background:#faf5ff;color:#a855f7}
      .bar-wrap{background:#e8eef8;border-radius:3px;height:8px;width:100%;overflow:hidden}
      .bar-fill{height:100%;border-radius:3px}
      .footer{margin-top:30px;padding-top:12px;border-top:1px solid #d0daf0;font-size:9px;color:#6b82a0;text-align:center}
      @media print{body{padding:10px}h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}
      </style></head><body>`;

    html += `<h1>IOC HUNT SECURITY REPORT</h1>
      <div class="meta">Period: <b>${durLabel}</b> &nbsp;|&nbsp; Machine: <b>${f.machine || 'All Machines'}</b>
      ${f.severity ? ` &nbsp;|&nbsp; Severity: <b>${f.severity}</b>` : ''}
      ${f.category ? ` &nbsp;|&nbsp; Category: <b>${Array.isArray(f.category) ? f.category.join(', ') : f.category}</b>` : ''}
      &nbsp;|&nbsp; Generated: <b>${new Date(d.generated).toLocaleString()}</b></div>`;

    html += `<div class="threat-box">
      <div><div style="font-size:9px;color:#6b82a0;letter-spacing:1px;margin-bottom:3px">THREAT LEVEL</div>
      <div class="threat-level">${threatLevel}</div></div>
      <div class="threat-desc"><b>${(ev.total || 0).toLocaleString()}</b> security events recorded.
      ${critCount ? `<b style="color:#ef4444">${critCount} critical</b>, ` : ''}
      <b style="color:#f97316">${highCount} high</b> severity events.
      ${adCount ? `<b style="color:#a855f7">${adCount} AD attack indicator${adCount !== 1 ? 's' : ''} detected.</b> ` : ''}
      ${(d.user_events || []).length ? `${d.user_events.length} account change events. ` : ''}
      ${d.firewall ? `Firewall: <b>${d.firewall.total.toLocaleString()}</b> connections.` : ''}
      </div></div>`;

    html += `<h2>Summary Statistics</h2><div class="stats">`;
    const statsList = [
      { n: ev.total, l: 'Total Events', c: '#1e3a5f' },
      { n: critCount, l: 'Critical', c: '#ef4444' },
      { n: highCount, l: 'High', c: '#f97316' },
      { n: sevMap.medium || 0, l: 'Medium', c: '#ca8a04' },
      { n: adCount, l: 'AD Indicators', c: '#a855f7' },
      { n: (d.user_events || []).length, l: 'Acct Changes', c: '#06b6d4' },
      { n: (d.machines || []).length, l: 'Machines', c: '#4a5578' }
    ];
    if (d.firewall) statsList.push({ n: d.firewall.total, l: 'FW Connections', c: '#0e7490' });
    statsList.forEach(s => {
      html += `<div class="stat"><div class="stat-n" style="color:${s.c}">${s.n.toLocaleString()}</div><div class="stat-l">${s.l}</div></div>`;
    });
    html += `</div>`;

    const pdfCats = Array.isArray(f.category)
      ? f.category.map(c => String(c).trim().toUpperCase())
      : (typeof f.category === 'string' && f.category ? f.category.split(',').map(c => c.trim().toUpperCase()) : []);
    const showUsbPdf = pdfCats.length === 0 || pdfCats.includes('ALL CATEGORIES') || pdfCats.includes('ALL') || pdfCats.includes('USB');

    if (showUsbPdf && d.usb_compliance && d.usb_compliance.machines && d.usb_compliance.machines.length > 0) {
      const uSum = d.usb_compliance.summary || {};
      html += `<h2>USB Policy & Device Compliance (${d.usb_compliance.machines.length} machines)</h2>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <div style="background:#f0f4fc;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#2563eb">${uSum.total_machines || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">Total Machines</div></div>
          <div style="background:#fef2f2;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#dc2626">${uSum.total_locked || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">USB Disabled</div></div>
          <div style="background:#f0fdf4;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#16a34a">${uSum.total_unlocked || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">USB Enabled</div></div>
          <div style="background:#fef2f2;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#dc2626">${uSum.compliant || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">Compliant (Locked)</div></div>
          <div style="background:#f0fdf4;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#16a34a">${uSum.non_compliant || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">Non-Compliant / Allowed</div></div>
          <div style="background:#fef2f2;border-radius:6px;padding:8px 12px;text-align:center"><div style="font-size:18px;font-weight:700;color:#dc2626">${uSum.total_violations || 0}</div><div style="font-size:8px;color:#6b82a0;text-transform:uppercase">USB Events</div></div>
        </div>
        <table><thead><tr>
          <th>Machine</th><th>Branch / IP</th><th>Group</th><th>Configured Policy</th><th>Current State</th><th>Compliance</th><th>USB Events</th><th>Last Sync</th>
        </tr></thead><tbody>`;
      d.usb_compliance.machines.forEach(u => {
        const isLocked = u.configured_lock === 'locked';
        const compClass = (u.status === 'Compliant' || (isLocked && u.is_compliant))
          ? 'c' // red
          : (u.status === 'Non Compliant' || u.status === 'Non-Compliant' || (!isLocked && u.is_compliant))
          ? 'l' // green
          : 'h';
        const compText = (u.status === 'Compliant' || (isLocked && u.is_compliant))
          ? 'Compliant'
          : (u.status === 'Non Compliant' || u.status === 'Non-Compliant' || (!isLocked && u.is_compliant))
          ? 'Non Compliant'
          : u.status;
        const confBadge = isLocked ? 'c' : 'l';
        html += `<tr>
          <td><b style="color:#2563eb">${u.machine}</b></td>
          <td>${u.aggregator_name || 'direct'} &nbsp;(${u.ip || '-'})</td>
          <td>${u.group_name || 'Ungrouped'}</td>
          <td><span class="badge ${confBadge}">${u.configured_usb}</span></td>
          <td>${u.current_usb}</td>
          <td><span class="badge ${compClass}">${compText}</span></td>
          <td style="font-weight:700;color:${u.usb_events_count > 0 ? (isLocked ? '#dc2626' : '#2563eb') : '#4a5578'}">${u.usb_events_count > 0 ? `${u.usb_events_count} events${isLocked ? ' (Violation)' : ''}` : '0'}</td>
          <td style="font-size:9px">${u.applied_at ? new Date(u.applied_at).toLocaleString('sv-SE').slice(0,16).replace('T',' ') : 'Never'}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
    }

    if ((ev.byCategory || []).length) {
      html += `<h2>Events by Category</h2><table><thead><tr><th>Category</th><th>Count</th><th style="width:200px">Distribution</th><th>%</th></tr></thead><tbody>`;
      ev.byCategory.forEach(r => {
        const col = catColors[r.category] || '#6b7280';
        const pct = Math.round(r.n / ev.total * 100);
        const barW = Math.round(r.n / maxCat * 100);
        html += `<tr><td><b>${r.category}</b></td><td>${r.n}</td>
          <td><div class="bar-wrap"><div class="bar-fill" style="width:${barW}%;background:${col}"></div></div></td>
          <td>${pct}%</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    if ((d.machines || []).length) {
      html += `<h2>Machine Health</h2><table><thead><tr><th>Machine</th><th>IP</th><th>Status</th><th>Total Events</th><th>Critical</th><th>High</th></tr></thead><tbody>`;
      d.machines.forEach(m => {
        const sc = m.status === 'Online' ? '#16a34a' : m.status === 'Offline' ? '#ef4444' : '#f97316';
        html += `<tr><td><b>${m.label}</b></td><td style="color:#4a5578">${m.ip}</td>
          <td><span style="color:${sc};font-weight:700">${m.status}</span></td>
          <td>${m.event_count.toLocaleString()}</td>
          <td><span class="badge c">${m.critical || 0}</span></td>
          <td><span class="badge h">${m.high || 0}</span></td></tr>`;
      });
      html += `</tbody></table>`;
    }

    const eventsToRender = ev.items || ev.critical || [];
    if (eventsToRender.length) {
      const sectionTitle = f.severity 
        ? `${f.severity.charAt(0).toUpperCase() + f.severity.slice(1)} Events` 
        : 'Security Events';
      html += `<h2>${sectionTitle} (${eventsToRender.length.toLocaleString()} events)</h2><table><thead><tr><th>Time</th><th>Machine</th><th>Sev</th><th>Category</th><th>Tag</th><th>Message</th></tr></thead><tbody>`;
      eventsToRender.forEach(e => {
        const sevClass = (e.severity || 'l').toLowerCase().charAt(0);
        html += `<tr><td style="white-space:nowrap;color:#4a5578">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
          <td style="color:#2563eb;font-weight:700">${e.machine}</td>
          <td><span class="badge ${sevClass}">${e.severity}</span></td>
          <td style="color:#4a5578">${e.category}</td>
          <td style="color:#7c3aed;font-size:9px">${e.tag || ''}</td>
          <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    if ((d.ad_attacks || []).length) {
      html += `<h2>AD Attack Indicators</h2><table><thead><tr><th>Time</th><th>Machine</th><th>Severity</th><th>Tag</th><th>Message</th></tr></thead><tbody>`;
      d.ad_attacks.forEach(e => {
        html += `<tr><td style="white-space:nowrap;color:#4a5578">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
          <td style="color:#2563eb;font-weight:700">${e.machine}</td>
          <td><span class="badge ad">${e.severity}</span></td>
          <td style="color:#7c3aed;font-size:9px">${e.tag}</td>
          <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    if ((d.user_events || []).length) {
      html += `<h2>Account Changes</h2><table><thead><tr><th>Time</th><th>Machine</th><th>Severity</th><th>Tag</th><th>Message</th></tr></thead><tbody>`;
      d.user_events.forEach(e => {
        html += `<tr><td style="white-space:nowrap;color:#4a5578">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
          <td style="color:#2563eb;font-weight:700">${e.machine}</td>
          <td><span class="badge ${e.severity === 'critical' ? 'c' : e.severity === 'high' ? 'h' : 'l'}">${e.severity}</span></td>
          <td style="font-size:9px;color:#4a5578">${e.tag}</td>
          <td>${(e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 120)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    if (d.firewall) {
      html += `<h2>Firewall Summary</h2><div style="display:flex;gap:24px">
        <div style="flex:1">
          <h3 style="font-size:10px;text-transform:uppercase;color:#6b82a0;margin:0 0 8px">Top Source IPs</h3>
          <table><thead><tr><th>IP Address</th><th>Count</th></tr></thead><tbody>`;
      (d.firewall.topSrc || []).forEach(r => {
        html += `<tr><td style="color:#ef4444;font-weight:700">${r.src_ip || 'Unknown'}</td><td>${r.n.toLocaleString()}</td></tr>`;
      });
      html += `</tbody></table>
        </div>
        <div style="flex:1">
          <h3 style="font-size:10px;text-transform:uppercase;color:#6b82a0;margin:0 0 8px">By Action</h3>
          <table><thead><tr><th>Action</th><th>Count</th></tr></thead><tbody>`;
      (d.firewall.byAction || []).forEach(r => {
        html += `<tr><td><span class="badge ${r.action === 'deny' || r.action === 'drop' ? 'c' : 'l'}">${r.action || 'Unknown'}</span></td><td>${r.n.toLocaleString()}</td></tr>`;
      });
      html += `</tbody></table>
        </div>
      </div>`;

      // Firewall Event Logs Detail Table
      if (d.firewall.events && d.firewall.events.length > 0) {
        html += `<h2>Firewall Event Logs</h2>
          <table><thead><tr>
            <th>Time</th><th>Device</th><th>User</th><th>From (UI)</th><th>Action</th>
            <th>Config Path</th><th>Object</th><th>Details</th><th>Message</th><th>Severity</th>
          </tr></thead><tbody>`;
        d.firewall.events.forEach(e => {
          const attr = (e.cfgattr || '').replace(/(\w+)\[([^\]]*)\]/g, '$1=$2').replace(/\]\s*/g, ', ').replace(/,\s*$/, '');
          const actCol = e.action === 'add' ? '#16a34a' : e.action === 'delete' ? '#dc2626' : e.action === 'edit' ? '#d97706' : '#2563eb';
          html += `<tr>
            <td style="white-space:nowrap;font-size:9px">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0,16).replace('T',' ') : ''}</td>
            <td style="color:#2563eb;font-weight:700;font-size:9px">${e.devname || '-'}</td>
            <td style="color:#a855f7;font-weight:600;font-size:9px">${e.fw_user || '-'}</td>
            <td style="font-size:9px">${e.fw_ui || e.src_ip || '-'}</td>
            <td><span style="color:${actCol};font-weight:700;text-transform:uppercase;font-size:9px">${e.action || '-'}</span></td>
            <td style="color:#0891b2;font-size:9px">${e.cfgpath || e.policy || '-'}</td>
            <td style="font-size:9px">${e.cfgobj || '-'}</td>
            <td style="font-size:8px;max-width:200px;word-break:break-word">${(attr || '-').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
            <td style="font-size:9px">${(e.msg || e.logdesc || '-').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
            <td><span class="badge ${e.severity === 'critical' ? 'c' : e.severity === 'high' ? 'h' : 'l'}">${e.severity || 'info'}</span></td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }
    }



    html += `<div class="footer">IOC Hunt Security Report &nbsp;|&nbsp; ${f.machine || 'All Machines'} &nbsp;|&nbsp; ${durLabel} &nbsp;|&nbsp; Generated ${new Date(d.generated).toLocaleString()}</div></body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
  };

  const renderReportUI = () => {
    if (!reportData) return <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>Configure filters above and click <b>Generate Report</b></div>;

    const d = reportData;
    const f = d.filters || {};
    const ev = d.events || {};
    const mach = d.machines.filter(m => f.aggregator?.length === 0 || f.aggregator?.includes(m.aggregator_name));
    const adEvs = d.ad_attacks || [];
    const userEvs = d.user_events || [];
    const fw = d.firewall;

    const sevMap = {};
    (ev.bySeverity || []).forEach(r => { sevMap[r.severity] = r.n; });
    const fwActMap = {};
    if (fw) (fw.byAction || []).forEach(r => { fwActMap[r.action] = r.n; });

    const critCount = sevMap.critical || 0;
    const highCount = sevMap.high || 0;
    const adCrit = adEvs.filter(a => a.severity === 'critical').length;
    const threatLevel = critCount > 5 || adCrit > 2 ? 'CRITICAL' : critCount > 0 || highCount > 5 ? 'HIGH' : highCount > 0 ? 'ELEVATED' : 'NORMAL';
    const tlColor = threatLevel === 'CRITICAL' ? 'var(--critical)' : threatLevel === 'HIGH' ? 'var(--high)' : threatLevel === 'ELEVATED' ? 'var(--medium)' : 'var(--low)';

    let durLabel = 'Last 24 hours';
    if (f.duration === 'today') durLabel = 'Today (00:00 to now)';
    if (f.duration == 1) durLabel = 'Last 1 hour';
    if (f.duration == 4) durLabel = 'Last 4 hours';
    if (f.duration == 72) durLabel = 'Last 3 days';
    if (f.duration == 168) durLabel = 'Last 7 days';
    if (f.duration == 720) durLabel = 'Last 30 days';
    if (f.duration === 'custom') durLabel = `${f.from_date ? new Date(f.from_date).toLocaleString() : 'Any'} to ${f.to_date ? new Date(f.to_date).toLocaleString() : 'Now'}`;

    const maxCat = Math.max(...(ev.byCategory || []).map(r => r.n)) || 1;

    return (
      <div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '20px 24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '1px' }}>IOC HUNT SECURITY REPORT</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Period: <b style={{ color: 'var(--text)' }}>{durLabel}</b>
                &nbsp;|&nbsp; Machine: <b style={{ color: 'var(--text)' }}>{f.machine || 'All Machines'}</b>
                {f.severity && <>&nbsp;|&nbsp; Severity: <b style={{ color: 'var(--text)' }}>{f.severity}</b></>}
                {f.category && <>&nbsp;|&nbsp; Category: <b style={{ color: 'var(--text)' }}>{Array.isArray(f.category) ? f.category.join(', ') : f.category}</b></>}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', textAlign: 'right' }}>
              Generated<br /><span style={{ color: 'var(--text)' }}>{new Date(d.generated).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${tlColor}`, borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Threat Level</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '22px', fontWeight: 700, color: tlColor }}>{threatLevel}</div>
            </div>
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--muted2)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--text)' }}>{(ev.total || 0).toLocaleString()}</b> security events recorded.{' '}
              {critCount > 0 && <><b style={{ color: 'var(--critical)' }}>{critCount} critical</b>, </>}
              <b style={{ color: 'var(--high)' }}>{highCount} high</b> severity events detected.{' '}
              {adEvs.length > 0 && <><b style={{ color: '#a855f7' }}>{adEvs.length} AD attack indicator{adEvs.length !== 1 ? 's' : ''} detected.</b> </>}
              {userEvs.length > 0 && <>{userEvs.length} account change event{userEvs.length !== 1 ? 's' : ''}. </>}
              {fw && <>Firewall logged <b style={{ color: '#06b6d4' }}>{fw.total.toLocaleString()}</b> connections ({(fwActMap['deny'] || 0) + (fwActMap['drop'] || 0)} denied/dropped).</>}
            </div>
          </div>
        </div>

        {/* ── TOP FIRST SECTION: USB Policy & Device Compliance ── */}
        {(() => {
          const catList = Array.isArray(f.category)
            ? f.category.map(c => String(c).trim().toUpperCase())
            : (typeof f.category === 'string' && f.category ? f.category.split(',').map(c => c.trim().toUpperCase()) : []);
          const isAllCats = catList.length === 0 || catList.includes('ALL CATEGORIES') || catList.includes('ALL');
          const hasUsb = catList.includes('USB');
          if (!isAllCats && !hasUsb) return null;
          if (!d.usb_compliance || !d.usb_compliance.machines || d.usb_compliance.machines.length === 0) return null;

          const uSum = d.usb_compliance.summary || {};
          const allUsbMachines = d.usb_compliance.machines;

          // Filter by tab
          let filtered = allUsbMachines.filter(m => {
            const isLocked = m.configured_lock === 'locked';
            if (usbTab === 'non_compliant') {
              return m.status === 'Non Compliant' || m.status === 'Non-Compliant' || !isLocked || m.status === 'Policy Mismatch' || m.status === 'Pending Sync' || m.status === 'Offline';
            }
            if (usbTab === 'locked') return isLocked;
            if (usbTab === 'unlocked') return !isLocked;
            return true;
          });

          // Filter by search (supports comma separation)
          if (usbSearch.trim()) {
            const searchTerms = usbSearch.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
            if (searchTerms.length > 0) {
              filtered = filtered.filter(m => {
                const rowText = [m.machine, m.label, m.ip, m.group_name, m.status, m.configured_usb, m.current_usb].filter(Boolean).join(' ').toLowerCase();
                return searchTerms.some(term => rowText.includes(term));
              });
            }
          }

          const totalPages = Math.max(1, Math.ceil(filtered.length / usbPerPage));
          const curPage = Math.min(usbPage, totalPages);
          const pagedList = filtered.slice((curPage - 1) * usbPerPage, curPage * usbPerPage);

          return (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#2563eb' }}>usb</span>
                  <div>
                    <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>
                      USB POLICY & DEVICE COMPLIANCE
                    </h3>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {uSum.non_compliant > 0 ? (
                    <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      ⚠️ {uSum.non_compliant} Non-Compliant / Pending
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                      ✓ 100% Policy Compliant
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {allUsbMachines.length} machines audited
                  </span>
                </div>
              </div>

              {/* USB Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                {[
                  { l: 'Total Machines', n: uSum.total_machines || 0, c: '#2563eb', icon: 'devices' },
                  { l: 'USB Disabled (Locked)', n: uSum.total_locked || 0, c: '#ef4444', icon: 'lock' },
                  { l: 'USB Enabled (Allowed)', n: uSum.total_unlocked || 0, c: '#22c55e', icon: 'lock_open' },
                  { l: 'Compliant Enforced', n: uSum.compliant || 0, c: '#ef4444', icon: 'verified' },
                  { l: 'Non-Compliant / Pending', n: uSum.non_compliant || 0, c: uSum.non_compliant > 0 ? '#16a34a' : 'var(--muted)', icon: 'warning' },
                  { l: 'USB Activity Events', n: uSum.total_violations || 0, c: uSum.total_violations > 0 ? '#ef4444' : 'var(--muted)', icon: 'usb' }
                ].map((s, idx) => (
                  <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>{s.l}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: s.c }}>{s.icon}</span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: s.c, marginTop: '4px' }}>
                      {s.n.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Table Container */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                {/* Filter Tabs and Search Bar */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: 'var(--surface2)' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'All Machines', count: allUsbMachines.length, icon: 'devices' },
                      { id: 'non_compliant', label: 'Non-Compliant / Pending', count: allUsbMachines.filter(m => m.configured_lock !== 'locked' || m.status !== 'Compliant').length, icon: 'warning' },
                      { id: 'locked', label: 'USB Disabled', count: uSum.total_locked || 0, icon: 'lock' },
                      { id: 'unlocked', label: 'USB Enabled', count: uSum.total_unlocked || 0, icon: 'lock_open' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setUsbTab(tab.id); setUsbPage(1); }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          borderRadius: '5px',
                          fontSize: '11px',
                          fontFamily: 'var(--sans)',
                          fontWeight: usbTab === tab.id ? 700 : 500,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: usbTab === tab.id ? '#2563eb' : 'var(--border)',
                          background: usbTab === tab.id ? 'rgba(37,99,235,0.12)' : 'transparent',
                          color: usbTab === tab.id ? '#2563eb' : 'var(--text)',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span>{tab.label}</span>
                        <span style={{
                          padding: '1px 5px',
                          borderRadius: '10px',
                          fontSize: '9px',
                          fontFamily: 'var(--mono)',
                          background: usbTab === tab.id ? '#2563eb' : 'var(--surface)',
                          color: usbTab === tab.id ? '#fff' : 'var(--muted)',
                          fontWeight: 700
                        }}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Search Bar & Per Page */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '220px' }}>
                      <input
                        type="text"
                        placeholder="Search machine, IP, group (comma-separated)..."
                        value={usbSearch}
                        onChange={e => { setUsbSearch(e.target.value); setUsbPage(1); }}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '5px 10px',
                          borderRadius: '5px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          fontSize: '11px',
                          outline: 'none'
                        }}
                      />
                      {usbSearch && (
                        <button
                          onClick={() => setUsbSearch('')}
                          style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <select
                      value={usbPerPage}
                      onChange={e => { setUsbPerPage(Number(e.target.value)); setUsbPage(1); }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '5px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value={10}>10 / page</option>
                      <option value={15}>15 / page</option>
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', fontFamily: 'var(--mono)' }}>
                        <th style={{ padding: '10px 14px' }}>Machine</th>
                        <th style={{ padding: '10px 14px' }}>Branch / IP</th>
                        <th style={{ padding: '10px 14px' }}>Policy Group</th>
                        <th style={{ padding: '10px 14px' }}>Policy Configured</th>
                        <th style={{ padding: '10px 14px' }}>Agent State</th>
                        <th style={{ padding: '10px 14px' }}>Compliance</th>
                        <th style={{ padding: '10px 14px' }}>USB Events</th>
                        <th style={{ padding: '10px 14px' }}>Last Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedList.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                            No machines matched the USB compliance filters
                          </td>
                        </tr>
                      ) : (
                        pagedList.map((m, idx) => {
                          const isLocked = m.configured_lock === 'locked';
                          const confBg = isLocked ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)';
                          const confCol = isLocked ? '#ef4444' : '#16a34a';

                          // Compliance badge: Disabled (Locked) => Compliant (RED)
                          // Enabled (Allowed) => Non Compliant (GREEN)
                          let statusLabel = m.status;
                          let statusBg = 'rgba(107,130,160,0.12)';
                          let statusCol = 'var(--muted)';
                          let statusIcon = '⚠️ ';

                          if (m.status === 'Compliant' || (isLocked && m.is_compliant)) {
                            statusLabel = 'Compliant';
                            statusBg = 'rgba(239,68,68,0.12)';
                            statusCol = '#ef4444';
                            statusIcon = '✓ ';
                          } else if (m.status === 'Non Compliant' || m.status === 'Non-Compliant' || (!isLocked && m.is_compliant)) {
                            statusLabel = 'Non Compliant';
                            statusBg = 'rgba(34,197,94,0.12)';
                            statusCol = '#16a34a';
                            statusIcon = '';
                          } else if (m.status === 'Policy Mismatch') {
                            statusLabel = 'Policy Mismatch';
                            statusBg = 'rgba(239,68,68,0.14)';
                            statusCol = '#dc2626';
                            statusIcon = '⚠️ ';
                          } else if (m.status === 'Pending Sync') {
                            statusLabel = 'Pending Sync';
                            statusBg = 'rgba(245,158,11,0.14)';
                            statusCol = '#d97706';
                            statusIcon = '⚠️ ';
                          } else if (m.status === 'Offline') {
                            statusLabel = 'Offline';
                            statusBg = 'rgba(107,130,160,0.12)';
                            statusCol = 'var(--muted)';
                            statusIcon = '⚠️ ';
                          }

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)' }}>desktop_windows</span>
                                  <div>
                                    <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{m.label || m.machine}</div>
                                    {m.label && m.label !== m.machine && (
                                      <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{m.machine}</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted2)' }}>
                                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{m.aggregator_name || 'direct'}</span>
                                {m.ip && <div>{m.ip}</div>}
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: '11px', color: '#8b5cf6', fontWeight: 600 }}>
                                {m.group_name || 'Ungrouped'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: confBg,
                                  color: confCol,
                                  border: `1px solid ${confCol}40`,
                                  textTransform: 'uppercase'
                                }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                    {isLocked ? 'lock' : 'lock_open'}
                                  </span>
                                  {m.configured_usb}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                                {m.current_usb === 'Disabled (Locked)' ? (
                                  <span style={{ color: '#ef4444', fontWeight: 600 }}>Disabled (Locked)</span>
                                ) : m.current_usb === 'Enabled (Allowed)' ? (
                                  <span style={{ color: '#16a34a', fontWeight: 600 }}>Enabled (Allowed)</span>
                                ) : (
                                  <span style={{ color: 'var(--muted)' }}>Unknown</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  background: statusBg,
                                  color: statusCol,
                                  border: `1px solid ${statusCol}40`
                                }}>
                                  {statusIcon}{statusLabel}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                {m.usb_events_count > 0 ? (
                                  <span style={{ color: isLocked ? '#ef4444' : 'var(--text)', fontWeight: isLocked ? 800 : 500 }}>
                                    {m.usb_events_count} event{m.usb_events_count !== 1 ? 's' : ''}
                                    {isLocked && <span style={{ fontSize: '9px', marginLeft: '4px', color: '#ef4444' }}>(Violation Alert)</span>}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--muted)' }}>0 events</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                                {m.applied_at ? new Date(m.applied_at).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : 'Never'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* USB Pagination */}
                {totalPages > 1 && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    <div>SHOWING {(curPage - 1) * usbPerPage + 1} TO {Math.min(curPage * usbPerPage, filtered.length)} OF {filtered.length} MACHINES</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button disabled={curPage === 1} onClick={() => setUsbPage(p => Math.max(1, p - 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: curPage === 1 ? 'var(--muted)' : 'var(--text)', cursor: curPage === 1 ? 'not-allowed' : 'pointer' }}>Prev</button>
                      {getPageNumbers(curPage, totalPages).map((p, i) => (
                        <button key={i} disabled={p === '...'} onClick={() => typeof p === 'number' && setUsbPage(p)} style={{ padding: '4px 10px', background: p === curPage ? '#2563eb' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: p === curPage ? '#fff' : 'var(--text)', cursor: p === '...' ? 'default' : 'pointer', fontWeight: p === curPage ? 700 : 500 }}>
                          {p}
                        </button>
                      ))}
                      <button disabled={curPage === totalPages} onClick={() => setUsbPage(p => Math.min(totalPages, p + 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: curPage === totalPages ? 'var(--muted)' : 'var(--text)', cursor: curPage === totalPages ? 'not-allowed' : 'pointer' }}>Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {[
            { n: ev.total, l: 'Total Events', c: 'var(--accent)' },
            { n: critCount, l: 'Critical', c: 'var(--critical)' },
            { n: highCount, l: 'High', c: 'var(--high)' },
            { n: sevMap.medium || 0, l: 'Medium', c: 'var(--medium)' },
            { n: adEvs.length, l: 'AD Indicators', c: '#a855f7' },
            { n: userEvs.length, l: 'Account Changes', c: 'var(--cyan)' },
            { n: mach.length, l: 'Machines', c: 'var(--muted2)' },
            ...(fw ? [{ n: fw.total, l: 'FW Connections', c: '#06b6d4' }] : [])
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: s.c }}></div>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: s.c, lineHeight: 1 }}>{s.n.toLocaleString()}</div>
              <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginTop: '6px' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {(ev.byCategory || []).length > 0 && (
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>pie_chart</span>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Events by Category</div>
              </div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {ev.byCategory.map((r, i) => {
                const col = catColors[r.category] || '#6b7280';
                const pct = Math.round(r.n / ev.total * 100);
                const barW = Math.round(r.n / maxCat * 100);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', width: '110px', color: 'var(--text)' }}>{r.category}</span>
                    <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barW}%`, background: col, borderRadius: '3px' }}></div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', width: '36px', textAlign: 'right' }}>{r.n}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', width: '32px' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mach.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingLeft: '4px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>computer</span>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Machine Health Summary</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>IP</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Events</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Critical</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>High</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {mach.map((m, i) => {
                    const riskPct = Math.min(100, (m.critical || 0) * 10 + (m.high || 0) * 3);
                    const riskCol = riskPct >= 50 ? 'var(--critical)' : riskPct >= 20 ? 'var(--high)' : riskPct >= 5 ? 'var(--medium)' : 'var(--low)';
                    const statusCol = m.status === 'Online' ? 'var(--low)' : m.status === 'Recent' ? '#84cc16' : m.status === 'Away' ? 'var(--high)' : 'var(--critical)';
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '14px 16px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)' }}>{m.label || m.id}</td>
                        <td style={{ padding: '14px 16px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{m.ip || '-'}</td>
                        <td style={{ padding: '14px 16px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusCol }}></span>{m.status}</span></td>
                        <td style={{ padding: '14px 16px', fontFamily: 'var(--mono)', fontSize: '11px' }}>{m.event_count.toLocaleString()}</td>
                        <td style={{ padding: '14px 16px' }}><span className="badge sev-critical">{m.critical || 0}</span></td>
                        <td style={{ padding: '14px 16px' }}><span className="badge sev-high">{m.high || 0}</span></td>
                        <td style={{ padding: '14px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '60px', height: '4px', background: 'var(--border)', borderRadius: '2px' }}><div style={{ height: '100%', width: `${riskPct}%`, background: riskCol, borderRadius: '2px' }}></div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: riskCol }}>{riskPct}</span></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(() => {
          const rawList = ev.items || ev.critical || [];
          if (rawList.length === 0) return null;

          const sevLower = (f.severity || '').toLowerCase();
          const title = sevLower
            ? `${sevLower.charAt(0).toUpperCase() + sevLower.slice(1)} Severity Events`
            : 'Security Events';

          const titleColor = sevLower === 'critical' ? 'var(--critical)'
            : sevLower === 'high' ? 'var(--high)'
            : sevLower === 'medium' ? 'var(--medium)'
            : sevLower === 'low' ? 'var(--low)'
            : 'var(--accent)';

          const titleIcon = (sevLower === 'critical' || sevLower === 'high') ? 'warning'
            : sevLower === 'medium' ? 'report_problem'
            : sevLower === 'low' ? 'verified_user'
            : 'shield';

          // Search filter within the loaded events (supports comma separation)
          const filteredEvents = eventSearch.trim()
            ? rawList.filter(e => {
                const terms = eventSearch.toLowerCase().split(",").map(t => t.trim()).filter(Boolean);
                if (terms.length === 0) return true;
                return terms.some(term =>
                  (e.machine && e.machine.toLowerCase().includes(term)) ||
                  (e.tag && e.tag.toLowerCase().includes(term)) ||
                  (e.category && e.category.toLowerCase().includes(term)) ||
                  (e.message && e.message.toLowerCase().includes(term)) ||
                  (e.severity && e.severity.toLowerCase().includes(term))
                );
              })
            : rawList;

          // Safe bounded per page: strictly between 50 and 1000 max
          const effectivePageSize = Math.min(1000, Math.max(50, Number(eventPageSize) || 100));
          const totalPages = Math.max(1, Math.ceil(filteredEvents.length / effectivePageSize));
          const currentPage = Math.min(eventPage, totalPages);
          const startIndex = (currentPage - 1) * effectivePageSize;
          const paginatedEvents = filteredEvents.slice(startIndex, startIndex + effectivePageSize);

          return (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
              marginBottom: '32px'
            }}>
              {/* Premium Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'linear-gradient(90deg, rgba(37,99,235,0.04) 0%, rgba(0,0,0,0) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background: `${titleColor}18`,
                    border: `1px solid ${titleColor}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: titleColor }}>{titleIcon}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0, color: 'var(--text)' }}>
                        {title}
                      </h3>
                      <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)', padding: '2px 10px', borderRadius: '12px' }}>
                        {rawList.length.toLocaleString()} events
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      Showing security activity for the selected filters
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Modern Search Input */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0 12px',
                    height: '36px',
                    width: '320px',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px', flexShrink: 0, lineHeight: 1 }}>search</span>
                    <input
                      type="text"
                      className="search-input-inner"
                      placeholder="Filter by machine, tag, message..."
                      value={eventSearch}
                      onChange={(e) => { setEventSearch(e.target.value); setEventPage(1); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        fontSize: '12px',
                        outline: 'none',
                        width: '100%',
                        height: '100%',
                        padding: 0,
                        margin: 0,
                        fontFamily: 'var(--sans)',
                        boxSizing: 'border-box'
                      }}
                    />
                    {eventSearch && (
                      <button
                        onClick={() => { setEventSearch(''); setEventPage(1); }}
                        title="Clear search"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--muted)', padding: '0 2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', width: '140px' }}>Time</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', width: '150px' }}>Machine</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', width: '100px' }}>Severity</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', width: '120px' }}>Category</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left', width: '160px' }}>Tag</th>
                      <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'left' }}>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.map((e, i) => {
                      const sevClass = (e.severity || 'low').toLowerCase();
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '11px' }}>
                            {e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--accent)', fontWeight: 700, fontSize: '12px' }}>
                            {e.machine}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '11px' }}>
                            <span className={`badge sev-${sevClass}`}>
                              {e.severity}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--muted2)', fontSize: '11px', fontWeight: 600 }}>
                            {e.category}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '10px', fontFamily: 'var(--mono)', color: '#a855f7' }}>
                            {e.tag}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text)', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.5' }}>
                            {e.message}
                          </td>
                        </tr>
                      );
                    })}
                    {paginatedEvents.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                          No events match your search query &quot;{eventSearch}&quot;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Dedicated Pagination Footer */}
              <div style={{
                padding: '16px 20px',
                borderTop: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.01)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '16px'
              }}>
                {/* Left: Summary text */}
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  Showing <strong style={{ color: 'var(--text)' }}>{(filteredEvents.length > 0 ? startIndex + 1 : 0).toLocaleString()}</strong> to <strong style={{ color: 'var(--text)' }}>{Math.min(startIndex + effectivePageSize, filteredEvents.length).toLocaleString()}</strong> of <strong style={{ color: 'var(--text)' }}>{filteredEvents.length.toLocaleString()}</strong> events
                  {filteredEvents.length !== rawList.length && (
                    <span style={{ marginLeft: '6px', color: 'var(--muted)' }}>(filtered from {rawList.length.toLocaleString()} total)</span>
                  )}
                </div>

                {/* Right: Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  {/* Page Size Segmented Buttons - Max 1,000 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Per Page:</span>
                    <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px' }}>
                      {[50, 100, 250, 500, 1000].map(sz => {
                        const isSelected = effectivePageSize === sz;
                        return (
                          <button
                            key={sz}
                            onClick={() => { setEventPageSize(sz); setEventPage(1); }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              fontFamily: 'var(--mono)',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              background: isSelected ? 'var(--accent)' : 'transparent',
                              color: isSelected ? '#fff' : 'var(--muted)',
                              boxShadow: isSelected ? '0 2px 6px rgba(37,99,235,0.25)' : 'none'
                            }}
                          >
                            {sz === 1000 ? '1,000' : sz}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Navigation Page Buttons */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => setEventPage(1)}
                        disabled={currentPage <= 1}
                        title="First Page"
                        style={{
                          height: '32px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          color: currentPage <= 1 ? 'var(--muted)' : 'var(--text)',
                          cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                          opacity: currentPage <= 1 ? 0.4 : 1,
                          transition: 'all 0.15s'
                        }}
                      >
                        First
                      </button>

                      <button
                        onClick={() => setEventPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        style={{
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          color: currentPage <= 1 ? 'var(--muted)' : 'var(--text)',
                          cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                          opacity: currentPage <= 1 ? 0.4 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_left</span> Prev
                      </button>

                      {/* Page numbers chips */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {getPageNumbers(currentPage, totalPages).map((pNum, pIdx) => {
                          if (pNum === '...') {
                            return (
                              <span key={`dots-${pIdx}`} style={{ padding: '0 4px', color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--mono)' }}>
                                ...
                              </span>
                            );
                          }
                          const isCur = pNum === currentPage;
                          return (
                            <button
                              key={pNum}
                              onClick={() => setEventPage(pNum)}
                              style={{
                                minWidth: '32px',
                                height: '32px',
                                padding: '0 6px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                                fontFamily: 'var(--mono)',
                                border: isCur ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: isCur ? 'var(--accent)' : 'var(--surface2)',
                                color: isCur ? '#fff' : 'var(--text)',
                                cursor: 'pointer',
                                boxShadow: isCur ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                                transition: 'all 0.15s'
                              }}
                            >
                              {pNum}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setEventPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        style={{
                          height: '32px',
                          padding: '0 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: 'var(--accent)',
                          border: '1px solid var(--accent)',
                          color: '#fff',
                          boxShadow: '0 4px 12px rgba(37,99,235,0.2)',
                          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                          opacity: currentPage >= totalPages ? 0.4 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s'
                        }}
                      >
                        Next <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
                      </button>

                      <button
                        onClick={() => setEventPage(totalPages)}
                        disabled={currentPage >= totalPages}
                        title="Last Page"
                        style={{
                          height: '32px',
                          padding: '0 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          color: currentPage >= totalPages ? 'var(--muted)' : 'var(--text)',
                          cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                          opacity: currentPage >= totalPages ? 0.4 : 1,
                          transition: 'all 0.15s'
                        }}
                      >
                        Last
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {adEvs.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#a855f7' }}>local_police</span>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>AD Attack Indicators</div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{adEvs.length} events</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Attack Type</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {adEvs.map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '11px' }}>{e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--accent)', fontWeight: 700, fontSize: '11px' }}>{e.machine}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px' }}><span className="badge" style={{ background: '#faf5ff', color: '#a855f7' }}>{e.tag}</span></td>
                      <td style={{ padding: '14px 16px', fontSize: '11px' }}><span className={`badge ${e.severity === 'critical' ? 'sev-critical' : e.severity === 'high' ? 'sev-high' : 'sev-medium'}`}>{e.severity}</span></td>
                      <td style={{ padding: '14px 16px', fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.5' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {userEvs.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--cyan)' }}>person</span>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Account Changes</div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{userEvs.length} events</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Tag</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {userEvs.map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '11px' }}>{e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--accent)', fontWeight: 700, fontSize: '11px' }}>{e.machine}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px' }}><span className={`badge ${e.severity === 'critical' ? 'sev-critical' : e.severity === 'high' ? 'sev-high' : e.severity === 'medium' ? 'sev-medium' : 'sev-low'}`}>{e.severity}</span></td>
                      <td style={{ padding: '14px 16px', fontSize: '10px', fontFamily: 'var(--mono)' }}>{e.tag}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.5' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {fw && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', paddingLeft: '4px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#06b6d4' }}>security</span>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Firewall Summary</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 50%', minWidth: '300px', borderRight: '1px solid var(--border)' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Top Source IPs</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                  <tbody>
                    {(fw.topSrc || []).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', height: '44px' }}>
                        <td style={{ padding: '0 16px', color: 'var(--high)', fontWeight: 700, fontSize: '11px' }}>{r.src_ip || 'Unknown'}</td>
                        <td style={{ padding: '0 16px', textAlign: 'right', fontSize: '11px' }}>{r.n.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ flex: '1 1 50%', minWidth: '300px' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>By Action</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                  <tbody>
                    {(fw.byAction || []).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', height: '44px' }}>
                        <td style={{ padding: '0 16px', fontSize: '11px' }}>
                          <span className={`badge ${r.action === 'deny' || r.action === 'drop' ? 'sev-critical' : 'sev-low'}`} style={{ textTransform: 'uppercase' }}>
                            {r.action || 'Unknown'}
                          </span>
                        </td>
                        <td style={{ padding: '0 16px', textAlign: 'right', fontSize: '11px' }}>{r.n.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Firewall Event Logs Detail Table ── */}
        {fw && fw.events && fw.events.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#f59e0b' }}>local_fire_department</span>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Firewall Event Logs</div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{fw.events.length} events</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', minWidth: '1100px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0) 100%)' }}>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Time</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Device</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>User</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>From (UI)</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Action</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Config Path</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Object</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Details / Attributes</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                      <th style={{ padding: '12px 14px', fontSize: '9px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', whiteSpace: 'nowrap' }}>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fw.events.map((e, i) => {
                      // Parse cfgattr for readable display: "name[checking]srcintf[port1]" → "name=checking, srcintf=port1"
                      const attrDisplay = (e.cfgattr || '').replace(/(\w+)\[([^\]]*)\]/g, '$1=$2').replace(/\]\s*/g, ', ').replace(/,\s*$/, '');
                      const actionColor = e.action === 'add' ? '#22c55e' : e.action === 'delete' ? '#ef4444' : e.action === 'edit' ? '#f59e0b' : e.action === 'login' ? '#3b82f6' : 'var(--muted2)';
                      const actionBg = e.action === 'add' ? 'rgba(34,197,94,0.1)' : e.action === 'delete' ? 'rgba(239,68,68,0.1)' : e.action === 'edit' ? 'rgba(245,158,11,0.1)' : e.action === 'login' ? 'rgba(59,130,246,0.1)' : 'rgba(107,130,160,0.1)';
                      const sevClass = e.severity === 'critical' ? 'sev-critical' : e.severity === 'high' ? 'sev-high' : e.severity === 'medium' ? 'sev-medium' : 'sev-low';

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                          onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(37,99,235,0.03)'}
                          onMouseLeave={ev => ev.currentTarget.style.background = ''}
                        >
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '10px' }}>
                            {e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--accent)', fontWeight: 700, fontSize: '10px', whiteSpace: 'nowrap' }}>
                            {e.devname || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                            {e.fw_user ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#a855f7' }}>person</span>
                                <span style={{ color: '#a855f7', fontWeight: 600 }}>{e.fw_user}</span>
                              </span>
                            ) : <span style={{ color: 'var(--muted)' }}>-</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--muted2)', whiteSpace: 'nowrap' }}>
                            {e.fw_ui || e.src_ip || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: actionColor,
                              background: actionBg,
                              border: `1px solid ${actionColor}30`,
                              letterSpacing: '0.5px'
                            }}>
                              {e.action || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', color: '#06b6d4', fontWeight: 600 }}>
                            {e.cfgpath || e.policy || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--text)' }}>
                            {e.cfgobj || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--muted2)', maxWidth: '280px', wordBreak: 'break-word', lineHeight: '1.5' }}>
                            {attrDisplay || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '10px', color: 'var(--text)', maxWidth: '220px', wordBreak: 'break-word', lineHeight: '1.5' }}>
                            {e.msg || e.logdesc || '-'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span className={`badge ${sevClass}`}>{e.severity || 'info'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}



      </div>
    );
  };

  const renderFirewallReportUI = () => {
    if (!fwReportData) {
      return (
        <div style={{ padding: '64px 24px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', marginTop: '16px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(6,182,212,0.3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#06b6d4' }}>local_fire_department</span>
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>Firewall Threat & Traffic Report</h3>
          <p style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '520px', margin: '0 auto 24px', lineHeight: 1.6 }}>
            Select your firewall telemetry and audit filters above and click <b style={{ color: '#06b6d4' }}>Generate Firewall Report</b> to analyze security alerts, policy alterations, admin logins, and connection logs.
          </p>
          <button onClick={handleGenerateFirewall} style={{ background: '#06b6d4', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '6px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(6,182,212,0.3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>play_arrow</span> Generate Firewall Report
          </button>
        </div>
      );
    }

    const d = fwReportData;
    const f = d.filters || {};
    const sum = d.summary || {};
    const alerts = d.alerts?.items || [];
    const conns = d.connections?.items || [];
    const tlColor = { CRITICAL: '#ef4444', HIGH: '#f97316', ELEVATED: '#eab308', NORMAL: '#22c55e' }[d.threat_level || 'NORMAL'];

    // Filter alerts by tab and search
    let filteredAlerts = alerts.filter(a => {
      if (alertTab === 'loginFailed' && !a.alertType.includes('Failed')) return false;
      if (alertTab === 'configChange' && !a.alertType.includes('Config') && !a.alertType.includes('Policy') && !a.alertType.includes('User') && !a.alertType.includes('Password')) return false;
      if (alertTab === 'adminLogin' && !a.alertType.includes('Admin Login')) return false;
      if (alertTab === 'mfa' && !a.alertType.includes('MFA')) return false;
      if (alertTab === 'bruteForce' && !a.alertType.includes('Brute')) return false;

      if (alertSearch.trim()) {
        const terms = alertSearch.toLowerCase().split(",").map(t => t.trim()).filter(Boolean);
        if (terms.length > 0) {
          const match = terms.some(s =>
            (a.machine && a.machine.toLowerCase().includes(s)) ||
            (a.alertType && a.alertType.toLowerCase().includes(s)) ||
            (a.user && a.user.toLowerCase().includes(s)) ||
            (a.src_ip && a.src_ip.toLowerCase().includes(s)) ||
            (a.displayMsg && a.displayMsg.toLowerCase().includes(s)) ||
            (a.severity && a.severity.toLowerCase().includes(s))
          );
          if (!match) return false;
        }
      }
      return true;
    });

    const totalAlertPages = Math.max(1, Math.ceil(filteredAlerts.length / alertPerPage));
    const pagedAlerts = filteredAlerts.slice((alertPage - 1) * alertPerPage, alertPage * alertPerPage);

    // Filter connection logs by search
    let filteredConns = conns.filter(c => {
      if (!connSearch.trim()) return true;
      const terms = connSearch.toLowerCase().split(",").map(t => t.trim()).filter(Boolean);
      if (terms.length === 0) return true;
      return terms.some(s =>
        (c.src_ip && c.src_ip.toLowerCase().includes(s)) ||
        (c.dst_ip && c.dst_ip.toLowerCase().includes(s)) ||
        (c.service && c.service.toLowerCase().includes(s)) ||
        (c.action && c.action.toLowerCase().includes(s)) ||
        (c.proto && c.proto.toLowerCase().includes(s)) ||
        (c.machine && c.machine.toLowerCase().includes(s)) ||
        (c.country && c.country.toLowerCase().includes(s)) ||
        (c.policy && String(c.policy).toLowerCase().includes(s))
      );
    });

    const totalConnPages = Math.max(1, Math.ceil(filteredConns.length / connPerPage));
    const pagedConns = filteredConns.slice((connPage - 1) * connPerPage, connPage * connPerPage);

    return (
      <div style={{ marginTop: '20px' }}>
        {/* Threat Level Banner */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${tlColor}`, borderRadius: '10px', padding: '16px 20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '4px' }}>Threat Level</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '22px', fontWeight: 700, color: tlColor }}>{d.threat_level}</div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: 1.6, maxWidth: '650px' }}>
                <b style={{ color: 'var(--text)' }}>{(sum.total || 0).toLocaleString()}</b> firewall connection records analyzed.{' '}
                <b style={{ color: '#ef4444' }}>{(sum.denied || 0).toLocaleString()} denied/dropped</b> connections.{' '}
                <b style={{ color: '#f59e0b' }}>{(sum.totalAlerts || 0).toLocaleString()} security alerts</b> detected 
                ({sum.configChange || 0} config changes, {sum.adminLogin || 0} admin logins, {sum.loginFailed || 0} login failures).
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              Period: <b style={{ color: 'var(--text)' }}>{f.duration === 'custom' ? `${f.from} to ${f.to}` : f.duration + 'h'}</b> &nbsp;|&nbsp;
              Device: <b style={{ color: 'var(--text)' }}>{f.device}</b><br />
              Generated: <span style={{ color: 'var(--text)' }}>{new Date(d.generated).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Summary KPI Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
          {[
            { n: sum.total || 0, l: 'Total Connections', c: '#06b6d4', icon: 'hub' },
            { n: sum.accepted || 0, l: 'Accepted / Allowed', c: '#22c55e', icon: 'check_circle' },
            { n: sum.denied || 0, l: 'Denied / Dropped', c: '#ef4444', icon: 'block' },
            { n: sum.totalAlerts || 0, l: 'Security Alerts', c: '#f59e0b', icon: 'gpp_maybe' },
            { n: sum.configChange || 0, l: 'Config Changes', c: '#3b82f6', icon: 'edit_note' },
            { n: sum.loginFailed || 0, l: 'Login Failures', c: '#dc2626', icon: 'no_accounts' },
            { n: sum.adminLogin || 0, l: 'Admin Logins', c: '#a855f7', icon: 'admin_panel_settings' },
            { n: (sum.critical || 0) + (sum.high || 0), l: 'Critical / High', c: '#ef4444', icon: 'warning' },
          ].map((item, idx) => (
            <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.l}</span>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: item.c, opacity: 0.8 }}>{item.icon}</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--mono)', color: item.c }}>{item.n.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* ── SECURITY ALERTS TABLE ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(249,115,22,.4)', borderRadius: '8px', overflow: 'hidden', marginBottom: '28px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(249,115,22,.2)', background: 'rgba(249,115,22,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#f97316' }}>gpp_maybe</span>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#f97316', letterSpacing: '-0.2px' }}>SECURITY ALERTS</h3>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', background: 'rgba(249,115,22,0.15)', color: '#f97316', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                {filteredAlerts.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Filter alerts (comma-separated)..."
                value={alertSearch}
                onChange={e => { setAlertSearch(e.target.value); setAlertPage(1); }}
                style={{ height: '30px', padding: '0 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px', outline: 'none', width: '180px' }}
              />
              <select
                value={alertPerPage}
                onChange={e => { setAlertPerPage(Number(e.target.value)); setAlertPage(1); }}
                style={{ height: '30px', padding: '0 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px' }}
              >
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
              </select>
            </div>
          </div>

          {/* Alert Filter Tabs / Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {[
              { id: 'all', label: 'All Alerts', count: d.alerts?.counts?.all || alerts.length, col: '#f97316' },
              { id: 'loginFailed', label: 'Login Failed', count: d.alerts?.counts?.loginFailed || 0, col: '#ef4444' },
              { id: 'configChange', label: 'Config Changes', count: d.alerts?.counts?.configChange || 0, col: '#3b82f6' },
              { id: 'adminLogin', label: 'Admin Logins', count: d.alerts?.counts?.adminLogin || 0, col: '#a855f7' },
              { id: 'mfa', label: 'MFA Events', count: d.alerts?.counts?.mfa || 0, col: '#06b6d4' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setAlertTab(tab.id); setAlertPage(1); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '5px',
                  border: alertTab === tab.id ? `1px solid ${tab.col}` : '1px solid var(--border)',
                  background: alertTab === tab.id ? `${tab.col}20` : 'var(--surface)',
                  color: alertTab === tab.id ? tab.col : 'var(--muted)',
                  fontSize: '11px',
                  fontWeight: alertTab === tab.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <span>{tab.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 800, background: alertTab === tab.id ? tab.col : 'var(--border)', color: alertTab === tab.id ? '#fff' : 'var(--text)', padding: '1px 5px', borderRadius: '4px' }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Time</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Machine</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Alert Type</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>User / Source IP</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Severity</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {pagedAlerts.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                      No security alerts match the selected criteria.
                    </td>
                  </tr>
                ) : (
                  pagedAlerts.map((a, idx) => {
                    const isFailed = a.alertType.includes('Failed') || a.alertType.includes('Deleted');
                    const isAdded = a.alertType.includes('Added');
                    const badgeColor = isFailed ? '#ef4444' : isAdded ? '#3b82f6' : a.alertType.includes('Admin') ? '#a855f7' : '#f97316';
                    const sevClass = a.severity === 'critical' ? 'sev-critical' : a.severity === 'high' ? 'sev-high' : a.severity === 'medium' ? 'sev-medium' : 'sev-low';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {a.ts ? new Date(a.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {a.machine || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: `${badgeColor}18`, border: `1px solid ${badgeColor}40`, color: badgeColor, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                            {a.alertType}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                          {a.user && a.user !== '-' ? <b style={{ color: '#a855f7' }}>{a.user} </b> : null}
                          <span style={{ color: '#f97316' }}>{a.src_ip}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className={`badge ${sevClass}`}>{a.severity || 'medium'}</span>
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: '380px', wordBreak: 'break-word', color: 'var(--text)' }} title={a.displayMsg}>
                          {a.displayMsg || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Alert Pagination */}
          {totalAlertPages > 1 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              <div>SHOWING {(alertPage - 1) * alertPerPage + 1} TO {Math.min(alertPage * alertPerPage, filteredAlerts.length)} OF {filteredAlerts.length} ALERTS</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button disabled={alertPage === 1} onClick={() => setAlertPage(p => Math.max(1, p - 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: alertPage === 1 ? 'var(--muted)' : 'var(--text)', cursor: alertPage === 1 ? 'not-allowed' : 'pointer' }}>Prev</button>
                {getPageNumbers(alertPage, totalAlertPages).map((p, i) => (
                  <button key={i} disabled={p === '...'} onClick={() => typeof p === 'number' && setAlertPage(p)} style={{ padding: '4px 10px', background: p === alertPage ? '#f97316' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: p === alertPage ? '#fff' : 'var(--text)', cursor: p === '...' ? 'default' : 'pointer', fontWeight: p === alertPage ? 700 : 500 }}>
                    {p}
                  </button>
                ))}
                <button disabled={alertPage === totalAlertPages} onClick={() => setAlertPage(p => Math.min(totalAlertPages, p + 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: alertPage === totalAlertPages ? 'var(--muted)' : 'var(--text)', cursor: alertPage === totalAlertPages ? 'not-allowed' : 'pointer' }}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* ── CONNECTION LOG TABLE ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '28px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#06b6d4' }}>sync_alt</span>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.2px' }}>CONNECTION LOGS</h3>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', background: 'rgba(6,182,212,0.15)', color: '#06b6d4', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                {filteredConns.length}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search connections (comma-separated)..."
                value={connSearch}
                onChange={e => { setConnSearch(e.target.value); setConnPage(1); }}
                style={{ height: '30px', padding: '0 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px', outline: 'none', width: '240px' }}
              />
              <select
                value={connPerPage}
                onChange={e => { setConnPerPage(Number(e.target.value)); setConnPage(1); }}
                style={{ height: '30px', padding: '0 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px' }}
              >
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
                <option value="200">200 / page</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Time</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Machine</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Source IP:Port</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10px', fontWeight: 800, color: 'var(--muted)' }}>→</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Dest IP:Port</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Service</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Action</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Proto</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Bytes</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Country</th>
                  <th style={{ padding: '10px 14px', fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Severity</th>
                </tr>
              </thead>
              <tbody>
                {pagedConns.length === 0 ? (
                  <tr>
                    <td colSpan="11" style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                      No connection logs match the search query.
                    </td>
                  </tr>
                ) : (
                  pagedConns.map((c, idx) => {
                    const actName = (c.action || '').toLowerCase();
                    const isDenied = actName === 'deny' || actName === 'drop' || actName === 'block';
                    const actColor = isDenied ? '#ef4444' : '#22c55e';
                    const actBg = isDenied ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
                    const totalBytes = (c.sent_byte || 0) + (c.rcvd_byte || 0);
                    const bStr = totalBytes > 1048576 ? (totalBytes / 1048576).toFixed(1) + 'MB' : totalBytes > 1024 ? (totalBytes / 1024).toFixed(0) + 'KB' : totalBytes + 'B';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)', fontSize: '11px' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {c.ts ? new Date(c.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {c.machine || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', color: '#f97316', whiteSpace: 'nowrap' }}>
                          {c.src_ip || '-'}{c.src_port ? `:${c.src_port}` : ''}
                        </td>
                        <td style={{ padding: '10px 6px', textAlign: 'center', color: 'var(--muted)' }}>→</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', color: '#06b6d4', whiteSpace: 'nowrap' }}>
                          {c.dst_ip || '-'}{c.dst_port ? `:${c.dst_port}` : ''}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
                            {c.service || 'OTHER'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: actBg, color: actColor, border: `1px solid ${actColor}40`, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                            {c.action || 'ACCEPT'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{c.proto || 'TCP'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>{bStr}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--muted2)' }}>{c.country || '-'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className={`badge ${c.severity === 'critical' ? 'sev-critical' : c.severity === 'high' ? 'sev-high' : 'sev-low'}`}>{c.severity || 'info'}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Connection Pagination */}
          {totalConnPages > 1 && (
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              <div>SHOWING {(connPage - 1) * connPerPage + 1} TO {Math.min(connPage * connPerPage, filteredConns.length)} OF {filteredConns.length} CONNECTIONS</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button disabled={connPage === 1} onClick={() => setConnPage(p => Math.max(1, p - 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: connPage === 1 ? 'var(--muted)' : 'var(--text)', cursor: connPage === 1 ? 'not-allowed' : 'pointer' }}>Prev</button>
                {getPageNumbers(connPage, totalConnPages).map((p, i) => (
                  <button key={i} disabled={p === '...'} onClick={() => typeof p === 'number' && setConnPage(p)} style={{ padding: '4px 10px', background: p === connPage ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: p === connPage ? '#fff' : 'var(--text)', cursor: p === '...' ? 'default' : 'pointer', fontWeight: p === connPage ? 700 : 500 }}>
                    {p}
                  </button>
                ))}
                <button disabled={connPage === totalConnPages} onClick={() => setConnPage(p => Math.min(totalConnPages, p + 1))} style={{ padding: '4px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: connPage === totalConnPages ? 'var(--muted)' : 'var(--text)', cursor: connPage === totalConnPages ? 'not-allowed' : 'pointer' }}>Next</button>
              </div>
            </div>
          )}
        </div>

        {/* ── TRAFFIC & ANALYTICS BREAKDOWN ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {/* Top Source IPs */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(6,182,212,0.08) 0%, transparent 100%)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#06b6d4', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>dns</span> TOP SOURCE IPS
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
              <tbody>
                {(d.analytics?.topSrc || []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', height: '40px' }}>
                    <td style={{ padding: '0 16px', color: '#f97316', fontWeight: 700, fontSize: '11px' }}>{r.src_ip || 'Unknown'}</td>
                    <td style={{ padding: '0 16px', textAlign: 'right', fontSize: '11px', color: 'var(--text)' }}>{r.n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Destination Services */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(59,130,246,0.08) 0%, transparent 100%)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#3b82f6', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>hub</span> TOP DESTINATION SERVICES
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
              <tbody>
                {(d.analytics?.topServices || []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', height: '40px' }}>
                    <td style={{ padding: '0 16px', color: '#3b82f6', fontWeight: 700, fontSize: '11px' }}>{r.service || 'Unknown'}</td>
                    <td style={{ padding: '0 16px', textAlign: 'right', fontSize: '11px', color: 'var(--text)' }}>{r.n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      {/* Page Title & Dedicated Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>
            {reportMode === 'firewall' ? 'Firewall Security Report' : 'Security Report'}
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>
            {reportMode === 'firewall'
              ? 'Comprehensive firewall traffic telemetry, policy change audits, security alerts, and connection logs.'
              : 'Generate, view, and export compliance and threat intelligence reports.'}
          </p>
        </div>

        {/* Dedicated Mode Switcher Buttons */}
        <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', gap: '4px' }}>
          <button
            onClick={() => setReportMode('general')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              fontFamily: 'var(--sans)',
              background: reportMode === 'general' ? 'var(--accent)' : 'transparent',
              color: reportMode === 'general' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s',
              boxShadow: reportMode === 'general' ? '0 2px 8px rgba(37,99,235,0.3)' : 'none'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shield</span>
            General Security Report
          </button>

          <button
            onClick={() => setReportMode('firewall')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              fontFamily: 'var(--sans)',
              background: reportMode === 'firewall' ? '#06b6d4' : 'transparent',
              color: reportMode === 'firewall' ? '#fff' : 'var(--muted)',
              transition: 'all 0.2s',
              boxShadow: reportMode === 'firewall' ? '0 2px 8px rgba(6,182,212,0.35)' : 'none'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>local_fire_department</span>
            Firewall Report
          </button>
        </div>
      </div>

      {/* ── FILTER TOOLBAR ── */}
      {reportMode === 'general' ? (
        /* GENERAL FILTER BAR */
        <div style={{ display: 'flex', gap: '48px', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            
            {/* Top Row: Duration, From, To */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Duration</label>
                <select value={filters.duration} onChange={e => setFilters({ ...filters, duration: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="today">Today (00:00 to now)</option>
                  <option value="1">Last 1 hour</option>
                  <option value="4">Last 4 hours</option>
                  <option value="24">Last 24 hours</option>
                  <option value="72">Last 3 days</option>
                  <option value="168">Last 7 days</option>
                  <option value="720">Last 30 days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {filters.duration === 'custom' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>From</label>
                    <input type="date" value={filters.from_date} onChange={e => setFilters({ ...filters, from_date: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>To</label>
                    <input type="date" value={filters.to_date} onChange={e => setFilters({ ...filters, to_date: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                </>
              )}
            </div>

            {/* Bottom Row: Branch, Machine, Severity, Category */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div ref={branchDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px', position: 'relative' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Branch</label>
                
                <div 
                  onClick={() => {
                    setShowBranchDropdown(!showBranchDropdown);
                    setShowCategoryDropdown(false);
                  }}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {filters.aggregator.length === 0 ? 'All Branches' : `${filters.aggregator.length} selected`}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)', transform: showBranchDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                </div>
                
                {showBranchDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 30, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                      <span 
                        onClick={() => setFilters({ ...filters, aggregator: [] })}
                        style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {filters.aggregator.length === 0 ? '✓ All Branches' : 'Reset to All'}
                      </span>
                      {filters.aggregator.length > 0 && (
                        <span 
                          onClick={() => setFilters({ ...filters, aggregator: [] })}
                          style={{ color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          Clear
                        </span>
                      )}
                    </div>
                    {aggregators.map(a => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', padding: '2px 4px', borderRadius: '4px' }}>
                        <input 
                          type="checkbox"
                          checked={filters.aggregator.includes(a.name)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            let newAggrs = [...filters.aggregator];
                            if (isChecked) {
                              newAggrs.push(a.name);
                            } else {
                              newAggrs = newAggrs.filter(name => name !== a.name);
                            }
                            setFilters({ ...filters, aggregator: newAggrs });
                          }}
                        />
                        {a.name}
                      </label>
                    ))}
                    {aggregators.length === 0 && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No branches available</div>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Machine</label>
                <select value={filters.machine} onChange={e => setFilters({ ...filters, machine: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="">All Machines</option>
                  {filteredMachines.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              <div ref={severityDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px', position: 'relative' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Severity</label>
                
                <div 
                  onClick={() => {
                    setShowSeverityDropdown(!showSeverityDropdown);
                    setShowCategoryDropdown(false);
                    setShowBranchDropdown(false);
                  }}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getSeverityLabel()}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)', transform: showSeverityDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                </div>
                
                {showSeverityDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', minWidth: '180px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 35, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                      <span 
                        onClick={() => setFilters({ ...filters, severity: [] })}
                        style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {(!filters.severity || filters.severity.length === 0) ? '✓ All Severities' : 'Reset to All'}
                      </span>
                      {filters.severity && filters.severity.length > 0 && (
                        <span 
                          onClick={() => setFilters({ ...filters, severity: [] })}
                          style={{ color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          Clear
                        </span>
                      )}
                    </div>

                    {REPORT_SEVERITIES.map(sev => {
                      const isSelected = Array.isArray(filters.severity) ? filters.severity.includes(sev.id) : filters.severity === sev.id;
                      return (
                        <label 
                          key={sev.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            cursor: 'pointer', 
                            fontSize: '12px', 
                            color: 'var(--text)', 
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                            transition: 'background 0.15s'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              let current = Array.isArray(filters.severity) ? [...filters.severity] : (filters.severity ? [filters.severity] : []);
                              if (isChecked) {
                                current.push(sev.id);
                              } else {
                                current = current.filter(s => s !== sev.id);
                              }
                              setFilters({ 
                                ...filters, 
                                severity: current
                              });
                            }}
                          />
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sev.color, flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{sev.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div ref={categoryDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px', position: 'relative' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Category</label>
                
                <div 
                  onClick={() => {
                    setShowCategoryDropdown(!showCategoryDropdown);
                    setShowBranchDropdown(false);
                  }}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getCategoryLabel()}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)', transform: showCategoryDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                </div>
                
                {showCategoryDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', minWidth: '220px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 30, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                      <span 
                        onClick={() => setFilters({ ...filters, category: [], include_fw: true })}
                        style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        {(!filters.category || filters.category.length === 0) ? '✓ All Categories' : 'Reset to All'}
                      </span>
                      {filters.category && filters.category.length > 0 && (
                        <span 
                          onClick={() => setFilters({ ...filters, category: [], include_fw: true })}
                          style={{ color: 'var(--muted)', cursor: 'pointer' }}
                        >
                          Clear
                        </span>
                      )}
                    </div>

                    {REPORT_CATEGORIES.map(cat => {
                      const isSelected = filters.category && filters.category.includes(cat.id);
                      return (
                        <label 
                          key={cat.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            cursor: 'pointer', 
                            fontSize: '12px', 
                            color: 'var(--text)', 
                            padding: '3px 6px',
                            borderRadius: '4px',
                            background: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                            transition: 'background 0.15s'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              let current = Array.isArray(filters.category) ? [...filters.category] : [];
                              if (isChecked) {
                                current.push(cat.id);
                              } else {
                                current = current.filter(c => c !== cat.id);
                              }
                              const willIncludeFw = current.length > 0 ? current.includes('FIREWALL') : filters.include_fw;
                              setFilters({ 
                                ...filters, 
                                category: current,
                                include_fw: willIncludeFw
                              });
                            }}
                          />
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{cat.label}</span>
                          {cat.id === 'FIREWALL' && (
                            <span style={{ fontSize: '9px', fontFamily: 'var(--mono)', padding: '1px 5px', borderRadius: '3px', background: 'rgba(6,182,212,0.15)', color: '#06b6d4', textTransform: 'uppercase' }}>
                              Syslog
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', flex: '0 0 auto', paddingBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Include Firewall</span>
                <div style={{ position: 'relative', width: '36px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    checked={filters.include_fw} 
                    onChange={(e) => {
                      const checked = e.target.checked;
                      let currentCats = Array.isArray(filters.category) ? [...filters.category] : [];
                      if (!checked) {
                        currentCats = currentCats.filter(c => c !== 'FIREWALL');
                      } else if (currentCats.length > 0 && !currentCats.includes('FIREWALL')) {
                        currentCats.push('FIREWALL');
                      }
                      setFilters({ ...filters, include_fw: checked, category: currentCats });
                    }} 
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: filters.include_fw ? '#2563eb' : 'var(--border2)',
                    transition: '.3s', borderRadius: '20px'
                  }}>
                    <span style={{
                      position: 'absolute', height: '14px', width: '14px', left: filters.include_fw ? '19px' : '3px', bottom: '3px',
                      backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
                    }}></span>
                  </span>
                </div>
              </label>
            </div>

            <button onClick={handleGenerate} className="rbtn" style={{ width: '100%', padding: '8px 24px', fontSize: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap' }} disabled={loading}>
              {loading ? 'Generating...' : 'Generate Report'}
            </button>

            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button className="ctl" style={{ flex: 1, padding: '8px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: !reportData ? 'not-allowed' : 'pointer', opacity: !reportData ? 0.4 : 1, whiteSpace: 'nowrap' }} onClick={exportJson} disabled={!reportData}>
                JSON
              </button>
              <button className="ctl" style={{ flex: 1, padding: '8px 12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#f97316', background: 'var(--surface2)', border: '1px solid rgba(249,115,22,.4)', borderRadius: '6px', cursor: !reportData ? 'not-allowed' : 'pointer', opacity: !reportData ? 0.4 : 1, whiteSpace: 'nowrap' }} onClick={exportPdf} disabled={!reportData}>
                PDF
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── DEDICATED FIREWALL FILTER BAR ── */
        <div style={{ display: 'flex', gap: '32px', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            
            {/* Top Row: Duration, Branch, Device, Action */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Duration</label>
                <select value={fwFilters.duration} onChange={e => setFwFilters({ ...fwFilters, duration: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="today">Today (00:00 to now)</option>
                  <option value="1">Last 1 hour</option>
                  <option value="4">Last 4 hours</option>
                  <option value="24">Last 24 hours</option>
                  <option value="72">Last 3 days</option>
                  <option value="168">Last 7 days</option>
                  <option value="720">Last 30 days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {fwFilters.duration === 'custom' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>From</label>
                    <input type="date" value={fwFilters.from_date} onChange={e => setFwFilters({ ...fwFilters, from_date: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>To</label>
                    <input type="date" value={fwFilters.to_date} onChange={e => setFwFilters({ ...fwFilters, to_date: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} />
                  </div>
                </>
              )}

              <div ref={fwBranchDropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '140px', position: 'relative' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Branch</label>
                <div 
                  onClick={() => setFwShowBranchDropdown(!fwShowBranchDropdown)}
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fwFilters.aggregator.length === 0 ? 'All Branches' : `${fwFilters.aggregator.length} selected`}
                  </span>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)', transform: fwShowBranchDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
                </div>
                
                {fwShowBranchDropdown && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 30, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '6px', borderBottom: '1px solid var(--border)', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                      <span onClick={() => setFwFilters({ ...fwFilters, aggregator: [] })} style={{ color: '#06b6d4', cursor: 'pointer', fontWeight: 600 }}>
                        {fwFilters.aggregator.length === 0 ? '✓ All Branches' : 'Reset to All'}
                      </span>
                      {fwFilters.aggregator.length > 0 && (
                        <span onClick={() => setFwFilters({ ...fwFilters, aggregator: [] })} style={{ color: 'var(--muted)', cursor: 'pointer' }}>Clear</span>
                      )}
                    </div>
                    {aggregators.map(a => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)', padding: '2px 4px' }}>
                        <input 
                          type="checkbox"
                          checked={fwFilters.aggregator.includes(a.name)}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            let newAggrs = [...fwFilters.aggregator];
                            if (isChecked) newAggrs.push(a.name);
                            else newAggrs = newAggrs.filter(name => name !== a.name);
                            setFwFilters({ ...fwFilters, aggregator: newAggrs });
                          }}
                        />
                        {a.name}
                      </label>
                    ))}
                    {aggregators.length === 0 && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>No branches available</div>}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Firewall Device</label>
                <select value={fwFilters.device} onChange={e => setFwFilters({ ...fwFilters, device: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="">All Firewalls</option>
                  {fwDevices.map((dName, i) => (
                    <option key={i} value={dName}>{dName}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '110px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Action</label>
                <select value={fwFilters.action} onChange={e => setFwFilters({ ...fwFilters, action: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="">All Actions</option>
                  <option value="accept">Accept / Allow</option>
                  <option value="deny">Deny / Drop</option>
                  <option value="close">Close / Timeout</option>
                </select>
              </div>
            </div>

            {/* Bottom Row: Severity, Alert Type, Service, IP/Search */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '110px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Severity</label>
                <select value={fwFilters.severity} onChange={e => setFwFilters({ ...fwFilters, severity: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="information">Information</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '130px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Alert Type</label>
                <select value={fwFilters.alert_type} onChange={e => setFwFilters({ ...fwFilters, alert_type: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                  <option value="">All Alert Types</option>
                  <option value="loginFailed">Login Failed</option>
                  <option value="configChange">Config Changes</option>
                  <option value="adminLogin">Admin Logins</option>
                  <option value="mfa">MFA Events</option>
                  <option value="bruteForce">Brute Force</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Service</label>
                <input 
                  type="text" 
                  placeholder="e.g. HTTPS, SSH (comma-separated)..." 
                  value={fwFilters.service} 
                  onChange={e => setFwFilters({ ...fwFilters, service: e.target.value })} 
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '160px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Filter IP / Keyword</label>
                <input 
                  type="text" 
                  placeholder="IP, port, user, policy (comma-separated)..." 
                  value={fwFilters.search} 
                  onChange={e => setFwFilters({ ...fwFilters, search: e.target.value })} 
                  style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', outline: 'none' }} 
                />
              </div>
            </div>
          </div>

          {/* Right Action Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', flex: '0 0 auto', alignSelf: 'center' }}>
            <button onClick={handleGenerateFirewall} className="rbtn" style={{ width: '100%', padding: '9px 24px', fontSize: '13px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(6,182,212,0.3)' }} disabled={loading}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>analytics</span>
              {loading ? 'Generating...' : 'Generate Report'}
            </button>

            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <button className="ctl" style={{ flex: 1, padding: '7px 10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px', fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: !fwReportData ? 'not-allowed' : 'pointer', opacity: !fwReportData ? 0.4 : 1, fontSize: '11px' }} onClick={exportFwJson} disabled={!fwReportData}>
                JSON
              </button>
              <button className="ctl" style={{ flex: 1, padding: '7px 10px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '5px', fontWeight: 600, color: '#06b6d4', background: 'var(--surface2)', border: '1px solid rgba(6,182,212,.4)', borderRadius: '6px', cursor: !fwReportData ? 'not-allowed' : 'pointer', opacity: !fwReportData ? 0.4 : 1, fontSize: '11px' }} onClick={exportFwPdf} disabled={!fwReportData}>
                PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--critical)', padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}

      <div id="rpt-content" style={{ minHeight: '400px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 10px', width: '24px', height: '24px', border: '3px solid var(--border)', borderTopColor: reportMode === 'firewall' ? '#06b6d4' : 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px' }}>
              {reportMode === 'firewall' ? 'GENERATING FIREWALL REPORT' : 'GENERATING REPORT'}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : reportMode === 'firewall' ? (
          renderFirewallReportUI()
        ) : (
          renderReportUI()
        )}
      </div>
    </div>
  );
}
