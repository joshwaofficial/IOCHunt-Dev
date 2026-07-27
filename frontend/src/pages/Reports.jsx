import React, { useState, useEffect } from 'react';
import axios from 'axios';

const catColors = { DOMAIN: '#a855f7', ADCS: '#8b5cf6', NETWORK: '#3b82f6', SENSITIVE: '#ef4444', ENUM: '#f97316', PROCESSES: '#ec4899', CONFIG: '#eab308', REGISTRY: '#22c55e', LOGON: '#06b6d4', SERVICES: '#fb923c', TASKS: '#a3e635', USB: '#f43f5e', DEFENDER: '#ef4444', OTHER: '#6b7280' };

export default function Reports() {
  const [filters, setFilters] = useState({
    duration: '24',
    from_date: '',
    to_date: new Date().toISOString().slice(0, 10),
    machine: '',
    severity: '',
    category: '',
    aggregator: [],
    include_fw: true
  });
  const [machines, setMachines] = useState([]);
  const [aggregators, setAggregators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  useEffect(() => {
    axios.get('/api/machines').then(res => setMachines(res.data.data || res.data)).catch(console.error);
    axios.get('/api/aggregators').then(res => setAggregators(res.data.data || res.data)).catch(console.error);
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      let qs = `duration=${filters.duration}&include_fw=${filters.include_fw ? '1' : '0'}`;
      if (filters.duration === 'custom') {
        if (filters.from_date) qs += `&from_date=${encodeURIComponent(filters.from_date)}`;
        if (filters.to_date) qs += `&to_date=${encodeURIComponent(filters.to_date)}`;
      }
      if (filters.machine) qs += `&machine=${encodeURIComponent(filters.machine)}`;
      if (filters.aggregator && filters.aggregator.length > 0) qs += `&aggregator=${encodeURIComponent(filters.aggregator.join(','))}`;
      if (filters.severity) qs += `&severity=${encodeURIComponent(filters.severity)}`;
      if (filters.category) qs += `&category=${encodeURIComponent(filters.category)}`;

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
      ${f.category ? ` &nbsp;|&nbsp; Category: <b>${f.category}</b>` : ''}
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

    if ((ev.critical || []).length) {
      html += `<h2>Critical &amp; High Events</h2><table><thead><tr><th>Time</th><th>Machine</th><th>Sev</th><th>Category</th><th>Message</th></tr></thead><tbody>`;
      ev.critical.forEach(e => {
        html += `<tr><td style="white-space:nowrap;color:#4a5578">${e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
          <td style="color:#2563eb;font-weight:700">${e.machine}</td>
          <td><span class="badge ${e.severity === 'critical' ? 'c' : 'h'}">${e.severity}</span></td>
          <td style="color:#4a5578">${e.category}</td>
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
                {f.category && <>&nbsp;|&nbsp; Category: <b style={{ color: 'var(--text)' }}>{f.category}</b></>}
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

        {(ev.critical || []).length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingLeft: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--critical)' }}>warning</span>
                <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', margin: 0, color: 'var(--text)' }}>Critical &amp; High Events</div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{(ev.critical || []).length} events (max 300)</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Machine</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Severity</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Category</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Tag</th>
                    <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left' }}>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.critical.map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--muted2)', fontSize: '11px' }}>{e.ts ? new Date(e.ts).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : ''}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--accent)', fontWeight: 700, fontSize: '11px' }}>{e.machine}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px' }}><span className={`badge ${e.severity === 'critical' ? 'sev-critical' : 'sev-high'}`}>{e.severity}</span></td>
                      <td style={{ padding: '14px 16px', color: 'var(--muted2)', fontSize: '11px' }}>{e.category}</td>
                      <td style={{ padding: '14px 16px', fontSize: '10px', fontFamily: 'var(--mono)' }}>{e.tag}</td>
                      <td style={{ padding: '14px 16px', fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '1.5' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

      </div>
    );
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Security Report</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Generate, view, and export compliance and threat intelligence reports.</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '48px', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px', flexWrap: 'wrap' }}>
        
        {/* Left Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
          
          {/* Top Row: Duration, From, To */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Duration</label>
              <select value={filters.duration} onChange={e => setFilters({ ...filters, duration: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px', position: 'relative' }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Branch</label>
              
              <div 
                onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {filters.aggregator.length === 0 ? 'All Branches' : `${filters.aggregator.length} selected`}
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--muted)' }}>expand_more</span>
              </div>
              
              {showBranchDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', zIndex: 10, padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                  {aggregators.map(a => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Severity</label>
              <select value={filters.severity} onChange={e => setFilters({ ...filters, severity: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                <option value="">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '100px' }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--mono)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Category</label>
              <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })} style={{ width: '100%', height: '34px', boxSizing: 'border-box', padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '12px', borderRadius: '6px' }}>
                <option value="">All Categories</option>
                <option value="DOMAIN">Domain</option>
                <option value="ADCS">ADCS</option>
                <option value="NETWORK">Network</option>
                <option value="LOGON">Logon</option>
                <option value="PROCESSES">Processes</option>
                <option value="SERVICES">Services</option>
                <option value="TASKS">Tasks</option>
                <option value="REGISTRY">Registry</option>
                <option value="DEFENDER">Defender</option>
                <option value="USB">USB</option>
                <option value="SENSITIVE">Sensitive</option>
                <option value="CONFIG">Config</option>
              </select>
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
                  onChange={(e) => setFilters({ ...filters, include_fw: e.target.checked })} 
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

          {/* Bottom Row: JSON, PDF */}
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

      {error && <div style={{ color: 'var(--critical)', padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}

      <div id="rpt-content" style={{ minHeight: '400px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 10px', width: '24px', height: '24px', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px' }}>GENERATING REPORT</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          renderReportUI()
        )}
      </div>
    </div>
  );
}
