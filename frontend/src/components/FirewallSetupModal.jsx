import React, { useState } from 'react';
import toast from 'react-hot-toast';

export default function FirewallSetupModal({ isOpen, onClose, configInfo }) {
  const [activeTab, setActiveTab] = useState('fortinet');

  if (!isOpen) return null;

  const serverHost = configInfo?.server_host || window.location.hostname;
  const syslogPort = configInfo?.syslog_port || 5514;
  const tenantId = configInfo?.tenant_id || 'default';

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const fortigateCli = `config log syslogd setting
    set status enable
    set server "${serverHost}"
    set port ${syslogPort}
    set mode udp
    set facility local7
    set format default
end`;

  const powershellTest = `$client = New-Object System.Net.Sockets.UdpClient
$msg = '<189>date=${new Date().toISOString().slice(0, 10)} time=${new Date().toTimeString().slice(0, 8)} devname="FGT-OFFICE" type="traffic" srcip=185.220.101.5 srcport=49152 dstip=10.90.122.247 dstport=3389 action="deny" proto=6 service="RDP"'
$bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)
$client.Send($bytes, $bytes.Length, "${serverHost}", ${syslogPort})
$client.Close()
Write-Host "Test Firewall Log Sent to Port ${syslogPort} Successfully!" -ForegroundColor Green`;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)', padding: '20px'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(37,99,235,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings_ethernet</span>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>
                Firewall Syslog Ingestion Setup
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                Dedicated UDP Syslog Endpoint for Tenant: <strong>{tenantId}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', borderRadius: '6px', transition: 'color 0.2s' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>close</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Key Parameters Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ background: 'var(--surface2)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '1px' }}>Server IP / Host</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--mono)' }}>{serverHost}</span>
                <button onClick={() => copyToClipboard(serverHost, 'Server Host')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }} title="Copy Host">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(234,179,8,0.3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#eab308', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '1px' }}>Assigned UDP Port</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#facc15', fontFamily: 'var(--mono)' }}>UDP : {syslogPort}</span>
                <button onClick={() => copyToClipboard(String(syslogPort), 'Port Number')} style={{ background: 'none', border: 'none', color: '#eab308', cursor: 'pointer', padding: '2px' }} title="Copy Port">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span>
                </button>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '1px' }}>Protocol & Format</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#22c55e', fontFamily: 'var(--mono)' }}>UDP / RFC 5424</span>
            </div>
          </div>

          {/* Quick Setup Tabs */}
          <div>
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {[
                { id: 'fortinet', label: 'Fortinet FortiGate' },
                { id: 'paloalto', label: 'Palo Alto Networks' },
                { id: 'pfsense', label: 'pfSense / OPNsense' },
                { id: 'powershell', label: 'PowerShell Test' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    background: activeTab === t.id ? 'var(--accent)' : 'var(--surface2)',
                    color: activeTab === t.id ? '#fff' : 'var(--text)',
                    border: `1px solid ${activeTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontFamily: 'var(--sans)'
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab: FortiGate */}
            {activeTab === 'fortinet' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                  Configure your FortiGate firewall via CLI or Web GUI (<strong>Log & Report ➔ Log Settings ➔ Remote Syslog</strong>):
                </p>
                <div style={{ position: 'relative' }}>
                  <pre style={{ background: '#0b0f19', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', fontSize: '12px', color: '#38bdf8', fontFamily: 'var(--mono)', overflowX: 'auto', margin: 0 }}>
                    {fortigateCli}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(fortigateCli, 'FortiGate CLI config')}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>content_copy</span> Copy CLI
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Palo Alto */}
            {activeTab === 'paloalto' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text)' }}>
                <p style={{ color: 'var(--muted)', margin: 0 }}>
                  In the Palo Alto Web Interface:
                </p>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  <li>Go to <strong>Device ➔ Server Profiles ➔ Syslog</strong>.</li>
                  <li>Click <strong>Add</strong> and specify:
                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                      <li><strong>Syslog Server:</strong> <code>{serverHost}</code></li>
                      <li><strong>Transport:</strong> <code>UDP</code></li>
                      <li><strong>Port:</strong> <code>{syslogPort}</code></li>
                      <li><strong>Format:</strong> <code>BSD</code></li>
                    </ul>
                  </li>
                  <li>Commit changes.</li>
                </ol>
              </div>
            )}

            {/* Tab: pfSense / OPNsense */}
            {activeTab === 'pfsense' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: 'var(--text)' }}>
                <p style={{ color: 'var(--muted)', margin: 0 }}>
                  In pfSense / OPNsense Dashboard:
                </p>
                <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
                  <li>Navigate to <strong>Status ➔ System Logs ➔ Settings</strong>.</li>
                  <li>Check <strong>Enable Remote Logging</strong>.</li>
                  <li>Enter Remote log server: <code>{serverHost}:{syslogPort}</code></li>
                  <li>Check <strong>Firewall Events</strong> and Save.</li>
                </ol>
              </div>
            )}

            {/* Tab: PowerShell Test */}
            {activeTab === 'powershell' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>
                  Test sending a simulated blocked RDP connection log directly from your Windows Office PC:
                </p>
                <div style={{ position: 'relative' }}>
                  <pre style={{ background: '#0b0f19', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 16px', fontSize: '11px', color: '#4ade80', fontFamily: 'var(--mono)', overflowX: 'auto', margin: 0 }}>
                    {powershellTest}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(powershellTest, 'PowerShell script')}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>content_copy</span> Copy Script
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(255,255,255,0.02)' }}>
          <button
            onClick={onClose}
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 22px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
