import { useState, useMemo } from 'react';

/**
 * Kind color palette for firewall nodes
 */
const KIND_COLORS = {
  firewall: '#06b6d4',
  server: '#06b6d4',
  machine: '#3b82f6',
  dc: '#a855f7',
  ip_external: '#64748b',
  ip_private: '#10b981',
  actor: '#ef4444',
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
  server: 'Internal Production Server',
  machine: 'Corporate Workstation',
  dc: 'Domain Controller / KDC',
  ip_external: 'External Internet WAN IP',
  ip_private: 'Internal Subnet / LAN Host',
  actor: 'External Threat / Scanner',
  default: 'Network Node'
};

/**
 * Modern Left-Side Entity & Edge Inspection Panel for Firewall Topology
 * Overlays the Cytoscape graph canvas on the LEFT side.
 * Supports:
 * - Left window frame docking (collapse into left border with mini-pill button to re-appear)
 * - Node inspection mode (Object Information + Inbound, Outbound, Lateral flow accordions)
 * - Edge inspection mode (Source, Destination, Protocol, Port, Count, Action status, Severity, Timestamps)
 */
export default function FirewallEntityPanel({
  selectedNode,
  selectedEdge,
  activeCategory = 'all',
  onFocusCategory,
  onClose,
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

  // 100% Solid opaque styles (no transparency / bleed-through)
  const panelBg = isLight ? '#ffffff' : '#0f172a';
  const borderColor = isLight ? '#cbd5e1' : '#1e293b';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const mutedColor = isLight ? '#64748b' : '#94a3b8';
  const sectionBg = isLight ? '#f8fafc' : '#141e33';
  const hoverBg = isLight ? '#f1f5f9' : '#1e293b';

  // Categorize connected flows for selected node
  const categorizedFlows = useMemo(() => {
    if (!selectedNode || !selectedNode.rows) {
      return { in: [], out: [], lat: [] };
    }

    const inList = [];
    const outList = [];
    const latList = [];

    const selfLabel = (selectedNode.label || selectedNode.fullLabel || '').toLowerCase();
    const selfId = (selectedNode.id || '').replace(/^m:/, '').toLowerCase();

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

    return { in: inList, out: outList, lat: latList };
  }, [selectedNode]);

  if (!selectedNode && !selectedEdge) return null;

  // Render Mini-Pill when collapsed
  if (isCollapsed) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '0',
          zIndex: 90,
          background: panelBg,
          border: `1px solid ${borderColor}`,
          borderLeft: 'none',
          borderTopRightRadius: '8px',
          borderBottomRightRadius: '8px',
          padding: '6px 8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onClick={() => setIsCollapsed(false)}
        title="Show Details Panel"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#06b6d4' }}>
          chevron_right
        </span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: textColor }}>
          {selectedNode ? selectedNode.label : 'Edge Details'}
        </span>
      </div>
    );
  }

  const isEdgeMode = Boolean(selectedEdge);
  const nodeType = selectedNode?.entityType || 'machine';
  const nodeColor = KIND_COLORS[nodeType] || KIND_COLORS.default;
  const nodeIcon = KIND_ICONS[nodeType] || KIND_ICONS.default;
  const nodeLabel = KIND_LABELS[nodeType] || 'Network Node';

  return (
    <div
      id="firewall-entity-panel"
      style={{
        position: 'absolute',
        top: '16px',
        bottom: '16px',
        left: '16px',
        width: '380px',
        maxWidth: 'calc(100% - 32px)',
        zIndex: 80,
        background: panelBg,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.2s ease-out'
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isLight ? 'rgba(241, 245, 249, 0.5)' : 'rgba(255, 255, 255, 0.02)',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: isEdgeMode ? 'rgba(6, 182, 212, 0.15)' : `${nodeColor}22`,
              border: `1px solid ${isEdgeMode ? '#06b6d4' : nodeColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isEdgeMode ? '#06b6d4' : nodeColor,
              flexShrink: 0
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {isEdgeMode ? 'alt_route' : nodeIcon}
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
                textOverflow: 'ellipsis'
              }}
              title={isEdgeMode ? selectedEdge.label : selectedNode.fullLabel || selectedNode.label}
            >
              {isEdgeMode ? (selectedEdge.label || 'Connection Flow') : (selectedNode.label || 'Network Node')}
            </div>
            <div style={{ fontSize: '10px', color: mutedColor }}>
              {isEdgeMode ? 'Traffic Connection Details' : nodeLabel}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            onClick={() => setIsCollapsed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: mutedColor,
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Collapse Panel to Left"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              chevron_left
            </span>
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: mutedColor,
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Close Panel"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* ================= EDGE INSPECTION MODE ================= */}
        {isEdgeMode && (
          <>
            {/* Source & Destination Connection Card */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: mutedColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Traffic Endpoints
                </span>
                {selectedEdge.detail?.action && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      background: selectedEdge.detail.blocked > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: selectedEdge.detail.blocked > 0 ? '#ef4444' : '#22c55e',
                      border: `1px solid ${selectedEdge.detail.blocked > 0 ? '#ef4444' : '#22c55e'}44`
                    }}
                  >
                    {selectedEdge.detail.blocked > 0 ? '🛑 BLOCKED' : selectedEdge.detail.action.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Source -> Destination Visual Flow */}
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
                    {selectedEdge.detail?.src || selectedEdge.source || '-'}
                  </div>
                </div>

                <div style={{ color: selectedEdge.color || '#06b6d4', display: 'flex', alignItems: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                    arrow_forward
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: '9px', color: mutedColor, textTransform: 'uppercase', fontWeight: 700 }}>
                    Destination
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#06b6d4',
                      fontFamily: 'var(--mono)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={selectedEdge.detail?.dst}
                  >
                    {selectedEdge.detail?.dst || selectedEdge.target || '-'}
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
                      padding: '5px 8px',
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
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hub</span>
                    Inspect Source
                  </button>
                )}
                {selectedEdge.detail?.dst && onSelectNodeById && (
                  <button
                    onClick={() => onSelectNodeById(selectedEdge.detail.dst)}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
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
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hub</span>
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
                  <span>Flow Properties</span>
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
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: '#06b6d4' }}>
                        {selectedEdge.detail.port}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Event Count / Hits:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: textColor }}>
                      {selectedEdge.detail?.count || 1}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Firewall Action:</span>
                    <span>
                      {selectedEdge.detail?.blocked > 0 ? (
                        <span style={{ color: '#ef4444', fontWeight: 800 }}>🛑 BLOCKED / DENIED</span>
                      ) : (
                        <span style={{ color: '#22c55e', fontWeight: 700 }}>
                          {(selectedEdge.detail?.action || 'Allowed').toUpperCase()}
                        </span>
                      )}
                    </span>
                  </div>
                  {selectedEdge.detail?.severity && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>Severity:</span>
                      <span style={{ fontWeight: 700, textTransform: 'uppercase', color: selectedEdge.detail.severity === 'critical' ? '#ef4444' : selectedEdge.detail.severity === 'high' ? '#f97316' : '#22c55e' }}>
                        {selectedEdge.detail.severity}
                      </span>
                    </div>
                  )}
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
                      <div style={{ fontSize: '10px', color: mutedColor, fontWeight: 700, textTransform: 'uppercase' }}>Description / Policy</div>
                      <div style={{ fontSize: '11px', color: textColor, marginTop: '2px', wordBreak: 'break-word' }}>
                        {selectedEdge.detail.extra}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ================= NODE INSPECTION MODE ================= */}
        {!isEdgeMode && selectedNode && (
          <>
            {/* Quick Action: Trace Full Attack Path */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => onFocusCategory && onFocusCategory(activeCategory === 'full_path' ? 'all' : 'full_path')}
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
                  cursor: 'pointer',
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
              {activeCategory && activeCategory !== 'all' && (
                <button
                  onClick={() => onFocusCategory && onFocusCategory('all')}
                  title="Reset to show all nodes"
                  style={{
                    padding: '9px 12px',
                    borderRadius: '7px',
                    background: isLight ? '#f1f5f9' : '#1e293b',
                    border: `1px solid ${borderColor}`,
                    color: textColor,
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>restart_alt</span>
                  Reset
                </button>
              )}
            </div>
            {/* Object Information Card */}
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
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#06b6d4' }}>info</span>
                  <span>Node Information</span>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                  {openAccordions.objectInfo ? 'expand_less' : 'expand_more'}
                </span>
              </div>

              {openAccordions.objectInfo && (
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: mutedColor, textTransform: 'uppercase', fontWeight: 700 }}>Node Identifier</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: textColor, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                      {selectedNode.fullLabel || selectedNode.label}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: mutedColor }}>Node Type:</span>
                    <span style={{ background: `${nodeColor}1A`, color: nodeColor, padding: '2px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>
                      {nodeLabel}
                    </span>
                  </div>

                  {selectedNode.raw?.ip && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>IP Address:</span>
                      <span style={{ fontFamily: 'var(--mono)', color: textColor, fontWeight: 700 }}>
                        {selectedNode.raw.ip}
                      </span>
                    </div>
                  )}

                  {selectedNode.raw?.os && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: mutedColor }}>Operating System:</span>
                      <span style={{ color: textColor, fontWeight: 600 }}>
                        {selectedNode.raw.os}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: mutedColor }}>Total Connections:</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, color: textColor }}>
                      {selectedNode.rows?.length || 0}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Inbound Flows Accordion */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div
                onClick={() => toggleAccordion('inbound')}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: openAccordions.inbound ? `1px solid ${borderColor}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#f97316' }}>arrow_downward</span>
                  <span>Inbound Traffic ({categorizedFlows.in.length})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {categorizedFlows.in.length > 0 && onFocusCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusCategory(activeCategory === 'inbound' ? 'all' : 'inbound');
                      }}
                      title="Focus inbound connections for this node"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: activeCategory === 'inbound' ? '#f97316' : (isLight ? '#e2e8f0' : '#1e293b'),
                        color: activeCategory === 'inbound' ? '#ffffff' : mutedColor
                      }}
                    >
                      {activeCategory === 'inbound' ? 'Active' : 'Focus'}
                    </button>
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                    {openAccordions.inbound ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {openAccordions.inbound && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
                  {categorizedFlows.in.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: mutedColor, fontSize: '11px' }}>
                      No inbound connections recorded
                    </div>
                  ) : (
                    categorizedFlows.in.map((flow, idx) => (
                      <div
                        key={idx}
                        onClick={() => flow._otherLabel && onSelectNodeById && onSelectNodeById(flow._otherLabel)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = hoverBg}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: textColor, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {flow._otherLabel}
                          </div>
                          <div style={{ fontSize: '10px', color: mutedColor }}>
                            {flow.protocol || flow.service || 'IP'}{flow.port ? `:${flow.port}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: flow.blocked > 0 ? '#ef4444' : '#22c55e' }}>
                            {flow.blocked > 0 ? 'BLOCKED' : 'ALLOW'}
                          </span>
                          <div style={{ fontSize: '10px', color: mutedColor, fontFamily: 'var(--mono)' }}>
                            x{flow.count || 1}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Outbound Flows Accordion */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div
                onClick={() => toggleAccordion('outbound')}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: openAccordions.outbound ? `1px solid ${borderColor}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#3b82f6' }}>arrow_upward</span>
                  <span>Outbound Traffic ({categorizedFlows.out.length})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {categorizedFlows.out.length > 0 && onFocusCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusCategory(activeCategory === 'outbound' ? 'all' : 'outbound');
                      }}
                      title="Focus outbound connections for this node"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: activeCategory === 'outbound' ? '#3b82f6' : (isLight ? '#e2e8f0' : '#1e293b'),
                        color: activeCategory === 'outbound' ? '#ffffff' : mutedColor
                      }}
                    >
                      {activeCategory === 'outbound' ? 'Active' : 'Focus'}
                    </button>
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                    {openAccordions.outbound ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {openAccordions.outbound && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
                  {categorizedFlows.out.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: mutedColor, fontSize: '11px' }}>
                      No outbound connections recorded
                    </div>
                  ) : (
                    categorizedFlows.out.map((flow, idx) => (
                      <div
                        key={idx}
                        onClick={() => flow._otherLabel && onSelectNodeById && onSelectNodeById(flow._otherLabel)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = hoverBg}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: textColor, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {flow._otherLabel}
                          </div>
                          <div style={{ fontSize: '10px', color: mutedColor }}>
                            {flow.protocol || flow.service || 'IP'}{flow.port ? `:${flow.port}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: flow.blocked > 0 ? '#ef4444' : '#22c55e' }}>
                            {flow.blocked > 0 ? 'BLOCKED' : 'ALLOW'}
                          </span>
                          <div style={{ fontSize: '10px', color: mutedColor, fontFamily: 'var(--mono)' }}>
                            x{flow.count || 1}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Internal / Lateral Flows Accordion */}
            <div
              style={{
                background: sectionBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <div
                onClick={() => toggleAccordion('lateral')}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: openAccordions.lateral ? `1px solid ${borderColor}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#06b6d4' }}>swap_horiz</span>
                  <span>Internal Lateral Flows ({categorizedFlows.lat.length})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {categorizedFlows.lat.length > 0 && onFocusCategory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusCategory(activeCategory === 'lateral' ? 'all' : 'lateral');
                      }}
                      title="Focus lateral flows for this node"
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: activeCategory === 'lateral' ? '#06b6d4' : (isLight ? '#e2e8f0' : '#1e293b'),
                        color: activeCategory === 'lateral' ? '#ffffff' : mutedColor
                      }}
                    >
                      {activeCategory === 'lateral' ? 'Active' : 'Focus'}
                    </button>
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '16px', color: mutedColor }}>
                    {openAccordions.lateral ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </div>

              {openAccordions.lateral && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
                  {categorizedFlows.lat.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', color: mutedColor, fontSize: '11px' }}>
                      No internal lateral connections recorded
                    </div>
                  ) : (
                    categorizedFlows.lat.map((flow, idx) => (
                      <div
                        key={idx}
                        onClick={() => flow._otherLabel && onSelectNodeById && onSelectNodeById(flow._otherLabel)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = hoverBg}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: textColor, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {flow._otherLabel}
                          </div>
                          <div style={{ fontSize: '10px', color: mutedColor }}>
                            {flow.protocol || flow.service || 'IP'}{flow.port ? `:${flow.port}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 800, color: flow.blocked > 0 ? '#ef4444' : '#22c55e' }}>
                            {flow.blocked > 0 ? 'BLOCKED' : 'ALLOW'}
                          </span>
                          <div style={{ fontSize: '10px', color: mutedColor, fontFamily: 'var(--mono)' }}>
                            x{flow.count || 1}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
