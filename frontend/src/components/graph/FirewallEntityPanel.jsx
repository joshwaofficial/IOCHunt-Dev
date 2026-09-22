import { useState, useMemo } from 'react';

/**
 * Kind color palette matching Network Topology standards
 */
const KIND_COLORS = {
  firewall: '#06b6d4',
  server: '#06b6d4',
  machine: '#3b82f6',
  dc: '#a855f7',
  ip_external: '#64748b',
  ip_private: '#10b981',
  actor: '#dc2626',
  default: '#3b82f6'
};

const KIND_ICONS = {
  firewall: 'shield',
  server: 'dns',
  machine: 'desktop_windows',
  dc: 'shield_person',
  ip_external: 'public',
  ip_private: 'router',
  actor: 'warning',
  default: 'adjust'
};

const KIND_LABELS = {
  firewall: 'Security Gateway / Firewall',
  server: 'Production Server',
  machine: 'Corporate Workstation',
  dc: 'Domain Controller / KDC',
  ip_external: 'External Internet WAN IP',
  ip_private: 'Internal Subnet / LAN Host',
  actor: 'External Threat / Scanner',
  default: 'Network Node'
};

/**
 * Left-Side Entity & Edge Inspection Panel for Firewall Topology
 *
 * Overlays the Cytoscape graph canvas on the LEFT side.
 * Supports:
 * - Left window frame docking (collapse into left border with mini-pill button to re-appear)
 * - Node inspection mode (Object Information + Inbound, Outbound, Lateral flow accordions)
 * - Edge inspection mode (Source, Destination, Protocol, Count, Blocked status, Severity, Timestamps)
 * - Exact matching layout, controls, and interaction model with Network Topology
 */
export default function FirewallEntityPanel({
  selectedNode,
  selectedEdge,
  onClose,
  onFocusCategory,
  activeCategory = 'all',
  onSelectNodeById,
  theme = 'dark'
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openAccordions, setOpenAccordions] = useState({
    objectInfo: true,
    inbound: true,
    outbound: true,
    lateral: true,
    edgeDetails: true
  });

  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isLight = theme === 'light';

  // Styles
  const panelBg = isLight
    ? 'rgba(255, 255, 255, 0.94)'
    : 'rgba(13, 19, 33, 0.92)';
  const borderColor = isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(255, 255, 255, 0.12)';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const mutedColor = isLight ? '#64748b' : '#94a3b8';
  const sectionBg = isLight ? 'rgba(241, 245, 249, 0.75)' : 'rgba(255, 255, 255, 0.03)';
  const hoverBg = isLight ? 'rgba(226, 232, 240, 0.8)' : 'rgba(255, 255, 255, 0.07)';

  // Process relationships from selectedNode.rows
  const categorizedRelationships = useMemo(() => {
    if (!selectedNode || !selectedNode.rows) {
      return { in: [], out: [], lat: [] };
    }

    const inList = [];
    const outList = [];
    const latList = [];

    const selfId = (selectedNode.id || '').replace(/^m:/, '').toLowerCase();
    const selfLabel = (selectedNode.label || selectedNode.fullLabel || '').toLowerCase();

    selectedNode.rows.forEach(r => {
      const isTarget = r._isTarget !== undefined
        ? r._isTarget
        : ((r.dst || '').toLowerCase() === selfLabel || (r.dst || '').toLowerCase() === selfId);

      const otherNodeName = r._otherLabel || (isTarget ? (r.src || r.source) : (r.dst || r.target)) || 'Node';
      const cleanItem = { ...r, _otherLabel: otherNodeName, _direction: isTarget ? 'in' : 'out' };

      const dir = r.dir || (isTarget ? 'in' : 'out');
      if (dir === 'lat') {
        latList.push(cleanItem);
      } else if (dir === 'in' || isTarget) {
        inList.push(cleanItem);
      } else {
        outList.push(cleanItem);
      }
    });

    return {
      in: inList,
      out: outList,
      lat: latList
    };
  }, [selectedNode]);

  // Extract pure raw properties for Object Information
  const objectInfoFields = useMemo(() => {
    if (!selectedNode) return [];
    const raw = selectedNode.raw || {};
    const fields = [];

    const add = (label, val) => {
      if (val !== undefined && val !== null && val !== '') {
        let displayVal = String(val);
        if (typeof val === 'boolean') displayVal = val ? 'TRUE' : 'FALSE';
        fields.push({ label, value: displayVal });
      }
    };

    add('Node Type', KIND_LABELS[selectedNode.entityType] || selectedNode.entityType);
    add('Node Name', selectedNode.label || selectedNode.fullLabel);
    if (selectedNode.subLabel && selectedNode.subLabel !== selectedNode.label) {
      add('IP / Subtitle', selectedNode.subLabel);
    }
    add('IP Address', raw.ip || (selectedNode.id && selectedNode.id.startsWith('ip:') ? selectedNode.id.slice(3) : undefined));
    add('Operating System', raw.os || raw.operatingsystem);
    add('Total Connections', selectedNode.rows?.length || 0);
    add('Threat Status', raw.has_threat ? 'Critical Threat Detected' : 'Monitored Host');
    add('Description', raw.description || (raw.firewall_model ? `Security Appliance: ${raw.firewall_model}` : undefined));

    return fields;
  }, [selectedNode]);

  // If nothing is selected, do not render
  if (!selectedNode && !selectedEdge) {
    return null;
  }

  // Mini toggle pill when collapsed in the window frame
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        title="Show Firewall Details Panel"
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
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          backdropFilter: 'blur(12px)'
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'scale(1.04)';
          e.currentTarget.style.borderColor = '#06b6d4';
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.borderColor = borderColor;
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '16px',
            color: selectedNode ? (KIND_COLORS[selectedNode.entityType] || '#06b6d4') : '#06b6d4'
          }}
        >
          {selectedNode ? 'account_tree' : 'alt_route'}
        </span>
        <span>{selectedNode ? (selectedNode.label || 'Node Info') : 'Edge Info'}</span>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
          dock_to_left
        </span>
      </button>
    );
  }

  // Node Kind Styling
  const kindColor = selectedNode ? (KIND_COLORS[selectedNode.entityType] || KIND_COLORS.default) : '#06b6d4';
  const kindIcon = selectedNode ? (KIND_ICONS[selectedNode.entityType] || KIND_ICONS.default) : 'alt_route';
  const kindSubtitle = selectedNode ? (KIND_LABELS[selectedNode.entityType] || 'Network Node') : 'Traffic Connection';

  return (
    <div
      id="firewall-entity-panel"
      style={{
        position: 'absolute',
        top: '14px',
        left: '14px',
        bottom: '14px',
        width: '380px',
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 50,
        background: panelBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        boxShadow: isLight
          ? '0 16px 40px -8px rgba(0, 0, 0, 0.15), 0 0 1px rgba(0,0,0,0.1)'
          : '0 20px 50px -10px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255,255,255,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s',
        animation: 'slideInLeft 0.2s ease-out'
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${borderColor}`,
          background: isLight ? 'rgba(241, 245, 249, 0.5)' : 'rgba(255, 255, 255, 0.02)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              border: `2px solid ${kindColor}`,
              background: isLight ? '#f1f5f9' : '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: kindColor,
              flexShrink: 0
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              {kindIcon}
            </span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 800,
                color: textColor,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontFamily: 'var(--sans)',
                letterSpacing: '0.2px'
              }}
              title={selectedNode ? (selectedNode.fullLabel || selectedNode.label) : selectedEdge?.label}
            >
              {selectedNode ? (selectedNode.label || selectedNode.fullLabel) : (selectedEdge?.label || 'Connection')}
            </div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: mutedColor,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              {kindSubtitle}
            </div>
          </div>
        </div>

        {/* Action Controls: Dock To Left Frame & Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => setIsCollapsed(true)}
            title="Hide / Dock to left window frame"
            style={{
              background: 'transparent',
              border: 'none',
              color: mutedColor,
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = hoverBg;
              e.currentTarget.style.color = textColor;
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = mutedColor;
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              dock_to_left
            </span>
          </button>

          <button
            onClick={onClose}
            title="Close Panel (Clear Selection)"
            style={{
              background: 'transparent',
              border: 'none',
              color: mutedColor,
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              transition: 'background 0.15s, color 0.15s'
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.color = '#ef4444';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = mutedColor;
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Active Focus Filter Indicator (When user isolates Inbound / Outbound / etc.) */}
      {activeCategory && activeCategory !== 'all' && (
        <div
          style={{
            padding: '7px 14px',
            background: 'rgba(59, 130, 246, 0.12)',
            borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: '#60a5fa'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>filter_alt</span>
            <span>Focus: <b>{activeCategory === 'full_path' ? 'FULL ATTACK PATH' : (activeCategory === 'isolated' ? 'ISOLATED VIEW' : activeCategory.toUpperCase())}</b></span>
          </div>
        </div>
      )}

      {/* Scrollable Content Body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {/* ========================================================================= */}
        {/* MODE A: EDGE INSPECTION MODE (When edge arrow is clicked) */}
        {/* ========================================================================= */}
        {selectedEdge && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Edge Hero Header */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: selectedEdge.color || '#06b6d4',
                    fontFamily: 'var(--mono)',
                    letterSpacing: '0.3px'
                  }}
                >
                  {selectedEdge.label || 'CONNECTION'}
                </span>
                {selectedEdge.detail?.severity && (
                  <span
                    className={`badge sev-${selectedEdge.detail.severity}`}
                    style={{ textTransform: 'uppercase', fontSize: '9px', fontWeight: 700 }}
                  >
                    {selectedEdge.detail.severity}
                  </span>
                )}
              </div>

              {/* Source -> Target Connected Cards */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: isLight ? '#ffffff' : 'rgba(0,0,0,0.25)',
                  border: `1px solid ${borderColor}`,
                  borderRadius: '6px',
                  padding: '8px 10px'
                }}
              >
                {/* Source Node */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '9px', color: mutedColor, textTransform: 'uppercase', fontWeight: 700 }}>
                    Source
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: textColor,
                      fontFamily: 'var(--mono)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={selectedEdge.detail?.src}
                  >
                    {selectedEdge.detail?.src || '-'}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ color: selectedEdge.color || '#06b6d4', display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    arrow_forward
                  </span>
                </div>

                {/* Target Node */}
                <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', color: mutedColor, textTransform: 'uppercase', fontWeight: 700 }}>
                    Destination
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#60a5fa',
                      fontFamily: 'var(--mono)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={selectedEdge.detail?.dst}
                  >
                    {selectedEdge.detail?.dst || '-'}
                  </div>
                </div>
              </div>

              {/* Quick Jump Buttons to inspect endpoints */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {selectedEdge.detail?.src && onSelectNodeById && (
                  <button
                    onClick={() => onSelectNodeById(selectedEdge.detail.src)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: '5px',
                      background: 'rgba(6, 182, 212, 0.1)',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      color: '#06b6d4',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>hub</span>
                    Inspect Source
                  </button>
                )}
                {selectedEdge.detail?.dst && onSelectNodeById && (
                  <button
                    onClick={() => onSelectNodeById(selectedEdge.detail.dst)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      borderRadius: '5px',
                      background: 'rgba(6, 182, 212, 0.1)',
                      border: '1px solid rgba(6, 182, 212, 0.25)',
                      color: '#06b6d4',
                      fontSize: '10px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>hub</span>
                    Inspect Destination
                  </button>
                )}
              </div>
            </div>

            {/* Edge Properties Accordion */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div
                onClick={() => toggleAccordion('edgeDetails')}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: openAccordions.edgeDetails ? `1px solid ${borderColor}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#06b6d4' }}>tune</span>
                  <span>Connection Properties</span>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                  {openAccordions.edgeDetails ? 'expand_less' : 'expand_more'}
                </span>
              </div>

              {openAccordions.edgeDetails && (
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Protocol / Service:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: textColor }}>
                      {selectedEdge.detail?.protocol || selectedEdge.label || '-'}
                    </span>
                  </div>
                  {selectedEdge.detail?.port && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>Port:</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: textColor }}>
                        {selectedEdge.detail.port}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Event Count:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: textColor }}>
                      {selectedEdge.detail?.count || 1}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Status / Action:</span>
                    <span>
                      {selectedEdge.detail?.blocked > 0 || (selectedEdge.detail?.action || '').toLowerCase() === 'deny' || (selectedEdge.detail?.action || '').toLowerCase() === 'drop' ? (
                        <span style={{ color: '#ef4444', fontWeight: 800 }}>🛑 BLOCKED</span>
                      ) : (
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>Allowed</span>
                      )}
                    </span>
                  </div>
                  {selectedEdge.detail?.first_seen && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>First Seen:</span>
                      <span style={{ fontFamily: 'var(--mono)', color: mutedColor, fontSize: '10px' }}>
                        {new Date(selectedEdge.detail.first_seen).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedEdge.detail?.last_seen && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>Last Seen:</span>
                      <span style={{ fontFamily: 'var(--mono)', color: mutedColor, fontSize: '10px' }}>
                        {new Date(selectedEdge.detail.last_seen).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedEdge.detail?.extra && (
                    <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: `1px solid ${borderColor}` }}>
                      <div style={{ fontSize: '10px', color: mutedColor, fontWeight: 700, textTransform: 'uppercase' }}>Description</div>
                      <div style={{ fontSize: '11px', color: textColor, marginTop: '2px', wordBreak: 'break-word' }}>
                        {selectedEdge.detail.extra}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Aggregated Parallel Rows List (if multiple connections exist on this edge) */}
            {selectedEdge.rows && selectedEdge.rows.length > 1 && (
              <div
                style={{
                  background: sectionBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${borderColor}`, fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase' }}>
                  Aggregated Flow Events ({selectedEdge.rows.length})
                </div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
                  {selectedEdge.rows.map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                        fontSize: '10px',
                        fontFamily: 'var(--mono)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ color: textColor }}>{row.protocol || row.extra || 'Event'}</span>
                      <span style={{ color: mutedColor }}>x{row.count || 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODE B: NODE INSPECTION MODE */}
        {/* ========================================================================= */}
        {selectedNode && (
          <>
            {/* Quick Action: Trace Full Attack Path (ONLY ENABLE, NEVER DISABLE) */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onFocusCategory && onFocusCategory('full_path')}
                disabled={activeCategory === 'full_path'}
                title="Show full attack path from threat roots to targets for this node"
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '7px',
                  background: activeCategory === 'full_path'
                    ? 'linear-gradient(135deg, #0052FF, #2563eb)'
                    : (isLight ? 'rgba(0, 82, 255, 0.08)' : 'rgba(0, 82, 255, 0.16)'),
                  border: `1px solid ${activeCategory === 'full_path' ? '#0052FF' : 'rgba(0, 82, 255, 0.35)'}`,
                  color: activeCategory === 'full_path' ? '#ffffff' : '#3b82f6',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: activeCategory === 'full_path' ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: activeCategory === 'full_path' ? '0 2px 10px rgba(0, 82, 255, 0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                  {activeCategory === 'full_path' ? 'check_circle' : 'alt_route'}
                </span>
                {activeCategory === 'full_path' ? 'Full Attack Path Active' : 'Show Full Attack Path'}
              </button>
            </div>

            {/* Accordion 1: Node Information */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div
                onClick={() => toggleAccordion('objectInfo')}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: openAccordions.objectInfo ? `1px solid ${borderColor}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '15px', color: kindColor }}>info</span>
                  <span>Node Information</span>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                  {openAccordions.objectInfo ? 'expand_less' : 'expand_more'}
                </span>
              </div>

              {openAccordions.objectInfo && (
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {objectInfoFields.map((field, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '10px',
                        fontSize: '11px',
                        paddingBottom: '4px',
                        borderBottom: idx < objectInfoFields.length - 1 ? `1px solid ${borderColor}` : 'none'
                      }}
                    >
                      <span style={{ color: mutedColor, minWidth: '110px', flexShrink: 0 }}>
                        {field.label}:
                      </span>
                      <span
                        style={{
                          color: textColor,
                          fontFamily: 'var(--mono)',
                          fontWeight: 600,
                          textAlign: 'right',
                          wordBreak: 'break-word'
                        }}
                      >
                        {field.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Accordion 2: Inbound Connections */}
            <RelationshipAccordion
              title="Inbound Traffic"
              icon="arrow_downward"
              iconColor="#3b82f6"
              items={categorizedRelationships.in}
              isOpen={openAccordions.inbound}
              onToggle={() => toggleAccordion('inbound')}
              onFocusCategory={() => onFocusCategory && onFocusCategory('inbound')}
              isActiveCategory={activeCategory === 'inbound'}
              onSelectNodeById={onSelectNodeById}
              targetKey="src"
              isLight={isLight}
              borderColor={borderColor}
              sectionBg={sectionBg}
              textColor={textColor}
              mutedColor={mutedColor}
            />

            {/* Accordion 3: Outbound Connections */}
            <RelationshipAccordion
              title="Outbound Traffic"
              icon="arrow_upward"
              iconColor="#10b981"
              items={categorizedRelationships.out}
              isOpen={openAccordions.outbound}
              onToggle={() => toggleAccordion('outbound')}
              onFocusCategory={() => onFocusCategory && onFocusCategory('outbound')}
              isActiveCategory={activeCategory === 'outbound'}
              onSelectNodeById={onSelectNodeById}
              targetKey="dst"
              isLight={isLight}
              borderColor={borderColor}
              sectionBg={sectionBg}
              textColor={textColor}
              mutedColor={mutedColor}
            />

            {/* Accordion 4: Lateral Flows */}
            <RelationshipAccordion
              title="Internal Lateral Flows"
              icon="swap_horiz"
              iconColor="#f97316"
              items={categorizedRelationships.lat}
              isOpen={openAccordions.lateral}
              onToggle={() => toggleAccordion('lateral')}
              onFocusCategory={() => onFocusCategory && onFocusCategory('lateral')}
              isActiveCategory={activeCategory === 'lateral'}
              onSelectNodeById={onSelectNodeById}
              targetKey="dst"
              isLight={isLight}
              borderColor={borderColor}
              sectionBg={sectionBg}
              textColor={textColor}
              mutedColor={mutedColor}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Reusable Accordion Item for Relationships & Flows (Exact match to Network Topology)
 */
function RelationshipAccordion({
  title,
  icon,
  iconColor,
  items,
  isOpen,
  onToggle,
  onFocusCategory,
  isActiveCategory,
  onSelectNodeById,
  targetKey = 'dst',
  isLight,
  borderColor,
  sectionBg,
  textColor,
  mutedColor
}) {
  const count = items.length;

  return (
    <div
      style={{
        background: sectionBg,
        border: `1px solid ${isActiveCategory ? iconColor : borderColor}`,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: isActiveCategory ? `0 0 10px ${iconColor}33` : 'none',
        transition: 'all 0.2s'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '9px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          background: isActiveCategory ? `${iconColor}15` : 'transparent',
          borderBottom: isOpen && count > 0 ? `1px solid ${borderColor}` : 'none'
        }}
      >
        <div
          onClick={onToggle}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px', color: iconColor }}>
            {icon}
          </span>
          <span style={{ fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {title}
          </span>
          <span
            style={{
              padding: '1px 6px',
              borderRadius: '10px',
              background: count > 0 ? (isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)') : 'transparent',
              color: count > 0 ? textColor : mutedColor,
              fontSize: '10px',
              fontWeight: 800,
              fontFamily: 'var(--mono)'
            }}
          >
            {count}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {count > 0 && (
            isActiveCategory ? (
              <span
                title={`Currently focusing graph on ${title}`}
                style={{
                  background: `${iconColor}22`,
                  border: `1px solid ${iconColor}`,
                  color: iconColor,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  cursor: 'default',
                  userSelect: 'none'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>
                  check_circle
                </span>
                Focused
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onFocusCategory) onFocusCategory();
                }}
                title={`Focus graph on ${title}`}
                style={{
                  background: 'transparent',
                  border: `1px solid ${iconColor}`,
                  color: iconColor,
                  padding: '2px 7px',
                  borderRadius: '4px',
                  fontSize: '9px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>
                  filter_center_focus
                </span>
                Focus
              </button>
            )
          )}

          <span
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: mutedColor, marginLeft: '2px' }}
          >
            {isOpen ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </div>

      {/* Accordion Body List */}
      {isOpen && count > 0 && (
        <div style={{ maxHeight: '170px', overflowY: 'auto', padding: '4px' }}>
          {items.map((it, idx) => {
            const targetName = it._otherLabel || it[targetKey] || it.src || it.dst || it.from_machine || it.to_machine || 'Node';
            const isBlocked = it.blocked > 0 || it.action === 'deny' || it.action === 'drop' || it.action === 'block';
            return (
              <div
                key={idx}
                onClick={() => onSelectNodeById && onSelectNodeById(targetName)}
                title={`Click to inspect ${targetName}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '5px',
                  background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.07)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)');
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', color: iconColor }}>
                    arrow_right_alt
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      color: textColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {targetName}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: isBlocked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: isBlocked ? '#ef4444' : '#22c55e',
                      fontFamily: 'var(--mono)',
                      textTransform: 'uppercase'
                    }}
                  >
                    {isBlocked ? 'BLOCKED' : 'ALLOW'}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--mono)',
                      color: mutedColor
                    }}
                  >
                    x{it.count || 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
