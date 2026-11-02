import React, { useState } from 'react';
import { ExternalLink, Copy, Check, ShieldAlert, ShieldCheck, Ban, RotateCcw, AlertTriangle, Network, X } from 'lucide-react';
import toast from 'react-hot-toast';

const KIND_COLORS = {
  malware_family: '#a855f7',
  threat_ioc: '#ef4444',
  malware_hash: '#eab308',
  patient_zero: '#f97316',
  machine: '#3b82f6',
  firewall: '#06b6d4',
  default: '#2563eb'
};

const KIND_LABELS = {
  malware_family: 'Adversary Malware Campaign',
  threat_ioc: 'Malicious Threat Indicator (C2)',
  malware_hash: 'Malicious Executable SHA256',
  patient_zero: '⭐ Patient Zero (Initial Compromise)',
  machine: 'Compromised Internal Host',
  firewall: 'Network Security Gateway',
  default: 'Threat Entity'
};

const KIND_ICONS = {
  malware_family: 'coronavirus',
  threat_ioc: 'public_off',
  malware_hash: 'fingerprint',
  patient_zero: 'emergency',
  machine: 'desktop_windows',
  firewall: 'shield',
  default: 'adjust'
};

export default function ThreatEntityPanel({
  selectedNode,
  selectedEdge,
  onClose,
  onOpenSuppressModal,
  theme = 'dark'
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openAccordions, setOpenAccordions] = useState({
    details: true,
    intel: true,
    impact: true,
    actions: true
  });

  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isLight = theme === 'light';

  // Colors
  const panelBg = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(13, 19, 33, 0.94)';
  const borderColor = isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(255, 255, 255, 0.12)';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const mutedColor = isLight ? '#64748b' : '#94a3b8';
  const sectionBg = isLight ? 'rgba(241, 245, 249, 0.75)' : 'rgba(255, 255, 255, 0.03)';

  if (!selectedNode && !selectedEdge) return null;

  const copyVal = (val) => {
    navigator.clipboard.writeText(val);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Mini toggle pill when collapsed
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        title="Expand Threat Investigation Panel"
        style={{
          position: 'absolute',
          top: '18px',
          left: '14px',
          zIndex: 60,
          background: isLight ? '#ffffff' : '#0f172a',
          border: `1px solid ${borderColor}`,
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          color: textColor,
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'var(--sans)',
          fontSize: '12px',
          fontWeight: 700,
          backdropFilter: 'blur(12px)'
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '16px',
            color: selectedNode ? (KIND_COLORS[selectedNode.kind] || '#2563eb') : '#2563eb'
          }}
        >
          {selectedNode ? KIND_ICONS[selectedNode.kind] || 'policy' : 'alt_route'}
        </span>
        <span>{selectedNode ? selectedNode.label : 'Connection Link'}</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
          dock_to_left
        </span>
      </button>
    );
  }

  const kind = selectedNode ? (selectedNode.kind || 'default') : 'edge';
  const kindColor = selectedNode ? (KIND_COLORS[kind] || KIND_COLORS.default) : '#2563eb';
  const kindIcon = selectedNode ? (KIND_ICONS[kind] || KIND_ICONS.default) : 'alt_route';
  const kindTitle = selectedNode ? (KIND_LABELS[kind] || 'Threat Entity') : 'Attack Flow Link';

  // Smart VirusTotal link generator
  const getVtUrl = () => {
    if (!selectedNode) return 'https://www.virustotal.com';
    const val = selectedNode.fullLabel || selectedNode.label || '';
    if (kind === 'malware_hash') return `https://www.virustotal.com/gui/file/${val}`;
    if (/[a-zA-Z]/.test(val) && !val.includes(':')) return `https://www.virustotal.com/gui/domain/${val}`;
    return `https://www.virustotal.com/gui/ip-address/${val}`;
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '14px',
        left: '14px',
        bottom: '14px',
        width: '380px',
        maxWidth: 'calc(100% - 28px)',
        background: panelBg,
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        boxShadow: isLight ? '0 12px 36px rgba(0,0,0,0.1)' : '0 12px 36px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Header with Type Pill & Actions */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: `${kindColor}20`,
              border: `1px solid ${kindColor}50`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: kindColor
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {kindIcon}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '10px', color: kindColor, fontWeight: 800, textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px', display: 'block' }}>
              {kindTitle}
            </span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: textColor, display: 'block', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedNode ? selectedNode.label : `${selectedEdge?.source} → ${selectedEdge?.target}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setIsCollapsed(true)}
            title="Minimize Panel to Margin"
            style={{ background: 'transparent', border: 'none', color: mutedColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>dock_to_left</span>
          </button>
          <button
            onClick={onClose}
            title="Close Panel"
            style={{ background: 'transparent', border: 'none', color: mutedColor, cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* 1. NODE OVERVIEW ACCORDION */}
        <div style={{ marginBottom: '14px', background: sectionBg, border: `1px solid ${borderColor}`, borderRadius: '8px', overflow: 'hidden' }}>
          <div
            onClick={() => toggleAccordion('details')}
            style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderBottom: openAccordions.details ? `1px solid ${borderColor}` : 'none' }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
              Entity Overview
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
              {openAccordions.details ? 'expand_less' : 'expand_more'}
            </span>
          </div>

          {openAccordions.details && (
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              {selectedNode && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Full Value:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: textColor, fontWeight: 700, fontFamily: 'var(--mono)', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedNode.fullLabel}>
                        {selectedNode.fullLabel}
                      </span>
                      <button
                        onClick={() => copyVal(selectedNode.fullLabel || selectedNode.label)}
                        title="Copy"
                        style={{ background: 'none', border: 'none', color: mutedColor, cursor: 'pointer', padding: 0 }}
                      >
                        {copied ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  {selectedNode.malwareFamily && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Campaign:</span>
                      <span style={{ color: '#a855f7', fontWeight: 700, fontFamily: 'var(--mono)' }}>{selectedNode.malwareFamily}</span>
                    </div>
                  )}

                  {selectedNode.feed && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Origin Feed:</span>
                      <span style={{ color: textColor, fontWeight: 600, fontFamily: 'var(--mono)' }}>{selectedNode.feed}</span>
                    </div>
                  )}

                  {selectedNode.confidence && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Confidence:</span>
                      <span style={{ color: '#22c55e', fontWeight: 800, fontFamily: 'var(--mono)' }}>{selectedNode.confidence}%</span>
                    </div>
                  )}

                  {selectedNode.isPatientZero && (
                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.3)', color: '#f97316', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} />
                      Identified as Patient Zero (Earliest Contact)
                    </div>
                  )}
                </>
              )}

              {selectedEdge && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Source:</span>
                    <span style={{ color: textColor, fontWeight: 700, fontFamily: 'var(--mono)' }}>{selectedEdge.source}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Target:</span>
                    <span style={{ color: textColor, fontWeight: 700, fontFamily: 'var(--mono)' }}>{selectedEdge.target}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor, fontFamily: 'var(--mono)' }}>Relationship:</span>
                    <span style={{ color: '#ef4444', fontWeight: 700, fontFamily: 'var(--mono)' }}>{selectedEdge.label}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 2. THREAT ATTRIBUTION & VERIFICATION (for IOCs and Hashes) */}
        {(kind === 'threat_ioc' || kind === 'malware_hash') && (
          <div style={{ marginBottom: '14px', background: sectionBg, border: `1px solid ${borderColor}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div
              onClick={() => toggleAccordion('intel')}
              style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderBottom: openAccordions.intel ? `1px solid ${borderColor}` : 'none' }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Multi-Source Verification
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                {openAccordions.intel ? 'expand_less' : 'expand_more'}
              </span>
            </div>

            {openAccordions.intel && (
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <a
                  href={getVtUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    color: '#2563eb',
                    fontSize: '12px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Network size={14} />
                    Inspect on VirusTotal Multi-Engine
                  </span>
                  <ExternalLink size={13} />
                </a>

                {selectedNode.feed && (
                  <div style={{ fontSize: '11px', color: mutedColor, lineHeight: '1.5' }}>
                    Direct attribution confirmed by <strong>{selectedNode.feed}</strong> sensor network telemetry.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. MITIGATION ACTIONS */}
        {(kind === 'threat_ioc' || kind === 'malware_hash') && (
          <div style={{ background: sectionBg, border: `1px solid ${borderColor}`, borderRadius: '8px', overflow: 'hidden' }}>
            <div
              onClick={() => toggleAccordion('actions')}
              style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none', borderBottom: openAccordions.actions ? `1px solid ${borderColor}` : 'none' }}
            >
              <span style={{ fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Response & Containment
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                {openAccordions.actions ? 'expand_less' : 'expand_more'}
              </span>
            </div>

            {openAccordions.actions && (
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  onClick={() => {
                    if (onOpenSuppressModal) {
                      onOpenSuppressModal(selectedNode.fullLabel || selectedNode.label, kind === 'malware_hash' ? 'sha256' : 'ip');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    color: '#ca8a04',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={14} />
                  Add Indicator to Whitelist
                </button>

                <div style={{ fontSize: '10px', color: mutedColor, textAlign: 'center', marginTop: '2px' }}>
                  Suppresses false alerts across all firewall aggregators
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${borderColor}`, fontSize: '10px', color: mutedColor, fontFamily: 'var(--mono)', textAlign: 'center', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
        Click any connected node or drag timeline to track lateral spread
      </div>
    </div>
  );
}
