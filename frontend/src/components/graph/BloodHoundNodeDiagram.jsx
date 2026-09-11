import { useEffect, useRef, useState } from 'react';
import Sigma from 'sigma';
import { MultiDirectedGraph } from 'graphology';
import { drawBloodHoundNode, drawBloodHoundEdgeLabel } from './nodeIconHelper';
import { applyBloodHoundClusterLayout, applyForceAtlas2, applyDagreLayout } from './layoutManager';

const AD_COL = {
  DCSync: '#ef4444',
  DCShadow: '#ef4444',
  Kerberoasting: '#f97316',
  RBCD: '#ef4444',
  PasswordSpray: '#f97316',
  'NTLM-Brute': '#f97316',
  ShadowCred: '#a855f7',
  ESC1: '#a855f7',
  ESC2: '#a855f7',
  ESC3: '#a855f7',
  ESC6: '#a855f7',
  CertipyEnum: '#8b5cf6',
  GoldenCert: '#ef4444',
  PassCert: '#a855f7',
  ExplicitCred: '#f97316',
  NewComputer: '#eab308',
  ASREPRoast: '#f97316',
  OverpassHash: '#ef4444',
  PassTheHash: '#ef4444',
  ForgedPAC: '#ef4444',
  SkeletonKey: '#ef4444'
};

function adCol(t) {
  return AD_COL[t] || '#a855f7';
}

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
}

export default function BloodHoundNodeDiagram({
  inbound = [],
  outbound = [],
  lateral = [],
  adAttacks = [],
  machines = [],
  theme = 'dark',
  onSelectNode,
  onSelectEdge,
  onClearSelection
}) {
  const containerRef = useRef(null);
  const sigmaRef = useRef(null);
  const graphRef = useRef(null);
  const callbacksRef = useRef({ onSelectNode, onSelectEdge, onClearSelection });
  const themeRef = useRef(theme);

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onSelectEdge, onClearSelection };
  }, [onSelectNode, onSelectEdge, onClearSelection]);

  useEffect(() => {
    themeRef.current = theme;
    if (sigmaRef.current) {
      sigmaRef.current.refresh();
    }
  }, [theme]);

  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const selectedNodeRef = useRef(null);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  const [layoutMode, setLayoutMode] = useState('cluster'); // 'cluster' | 'force' | 'dagre'
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });

  // Build and render graph
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous instance
    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const totalConnections = inbound.length + outbound.length + lateral.length + adAttacks.length;
    if (totalConnections === 0 && machines.length === 0) {
      requestAnimationFrame(() => setCounts({ nodes: 0, edges: 0 }));
      return;
    }

    const graph = new MultiDirectedGraph();
    graphRef.current = graph;

    const knownIds = new Set(machines.map(m => m.id || m.machine || m.name || m.ip));
    const machinesMap = new Map();
    machines.forEach(m => {
      const k = m.id || m.machine || m.name || m.ip;
      if (k) machinesMap.set(k, m);
    });

    // Helper to safely add node
    const ensureMachine = (id) => {
      if (!id) return null;
      const nid = 'm:' + id;
      if (graph.hasNode(nid)) return nid;

      const mData = machinesMap.get(id) || {};
      const isGroup = mData.entityType === 'group' || id.includes('SUBSYSTEM') || id.includes('ADMINS') || id.includes('MANAGEMENT');
      const isUser = mData.entityType === 'user' || id.includes('@');
      const isCritical = mData.has_threat || (mData.threat_count && mData.threat_count > 0);

      let color = '#3b82f6';
      let iconType = 'machine';
      let size = 18;

      if (isGroup) {
        color = '#eab308';
        iconType = 'group';
        size = 21;
      } else if (isUser) {
        color = '#22c55e';
        iconType = 'user';
        size = 18;
      } else if (isCritical) {
        color = '#ef4444';
        iconType = 'critical';
        size = 18;
      }

      graph.addNode(nid, {
        label: id,
        subLabel: mData.ip || (isGroup ? 'Active Directory Group' : isUser ? 'User Account' : 'Monitored Host'),
        iconType: iconType,
        borderColor: color,
        color: color,
        size: size,
        entityType: isGroup ? 'group' : isUser ? 'user' : 'machine',
        memberCount: mData.memberCount || 0,
        raw: mData
      });
      return nid;
    };

    const ensureIp = (ip) => {
      if (!ip) return null;
      const nid = 'i:' + ip;
      if (graph.hasNode(nid)) return nid;

      const priv = isPrivate(ip);
      const color = priv ? '#84cc16' : '#94a3b8';

      graph.addNode(nid, {
        label: ip,
        subLabel: priv ? 'Private IP' : 'External WAN',
        iconType: priv ? 'ip_private' : 'ip_external',
        borderColor: color,
        color: color,
        size: 14,
        entityType: priv ? 'ip_private' : 'ip_external',
        raw: { ip, is_private: priv }
      });
      return nid;
    };

    const ensureActor = (key, label, type) => {
      if (!key) return null;
      const nid = 'a:' + key;
      if (graph.hasNode(nid)) return nid;

      const isUser = label.includes('@') || label.startsWith('DA-');
      const col = isUser ? '#22c55e' : adCol(type);
      graph.addNode(nid, {
        label: label,
        subLabel: type || (isUser ? 'Domain Account' : 'AD Actor'),
        iconType: isUser ? 'user' : 'actor',
        borderColor: col,
        color: col,
        size: 18,
        entityType: isUser ? 'user' : 'actor',
        raw: { actor: label, attack_type: type }
      });
      return nid;
    };

    // Add Monitored Machines
    machines.forEach(m => {
      const id = m.name || m.machine || m.id || m.ip;
      if (id) ensureMachine(id);
    });

    // Process Inbound
    inbound.forEach(c => {
      const toId = ensureMachine(c.to_machine);
      let fromId;
      if (c.from_machine && knownIds.has(c.from_machine)) {
        fromId = ensureMachine(c.from_machine);
      } else {
        fromId = ensureIp(c.from_ip);
      }

      if (fromId && toId && graph.hasNode(fromId) && graph.hasNode(toId)) {
        const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
        const bl = c.blocked > 0;
        const col = bl ? '#ef4444' : '#f97316';

        const detailRow = {
          first_seen: c.first_seen,
          last_seen: c.last_seen,
          src: c.from_machine || c.from_ip || '?',
          dst: c.to_machine || '?',
          protocol: c.protocol || '',
          port: c.port || '',
          count: c.count || 1,
          blocked: c.blocked || 0,
          severity: c.severity || 'info',
          extra: c.description || (bl ? 'BLOCKED' : '')
        };

        graph.addEdge(fromId, toId, {
          label: proto || 'INBOUND',
          color: col,
          size: Math.min(2 + Math.log((c.count || 1) + 1), 6),
          type: 'arrow',
          dir: 'in',
          _detail: detailRow
        });
      }
    });

    // Process Outbound
    outbound.forEach(c => {
      const fromId = ensureMachine(c.from_machine);
      let toId;
      if (c.to_machine && knownIds.has(c.to_machine)) {
        toId = ensureMachine(c.to_machine);
      } else {
        toId = ensureIp(c.to_ip);
      }

      if (fromId && toId && graph.hasNode(fromId) && graph.hasNode(toId)) {
        const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
        const bl = c.blocked > 0;
        const col = bl ? '#ef4444' : '#3b82f6';

        const detailRow = {
          first_seen: c.first_seen,
          last_seen: c.last_seen,
          src: c.from_machine || '?',
          dst: c.to_machine || c.to_ip || '?',
          protocol: c.protocol || '',
          port: c.port || '',
          count: c.count || 1,
          blocked: c.blocked || 0,
          severity: c.severity || 'info',
          extra: c.description || (bl ? 'BLOCKED' : '')
        };

        graph.addEdge(fromId, toId, {
          label: proto || 'OUTBOUND',
          color: col,
          size: Math.min(2 + Math.log((c.count || 1) + 1), 6),
          type: 'arrow',
          dir: 'out',
          _detail: detailRow
        });
      }
    });

    // Process Lateral
    lateral.forEach(c => {
      const fromId = ensureMachine(c.source);
      const toId = ensureMachine(c.target);

      if (fromId && toId && graph.hasNode(fromId) && graph.hasNode(toId)) {
        const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
        const bl = c.blocked > 0;
        const isMemberOf = c.protocol === 'MemberOf';
        const col = bl ? '#ef4444' : (isMemberOf ? '#3b82f6' : (c.severity === 'critical' ? '#ef4444' : '#f97316'));

        const detailRow = {
          first_seen: c.first_seen,
          last_seen: c.last_seen,
          src: c.source,
          dst: c.target,
          protocol: c.protocol || '',
          port: c.port || '',
          count: c.count || 1,
          blocked: c.blocked || 0,
          severity: c.severity || 'critical',
          extra: c.description || (bl ? 'BLOCKED' : '')
        };

        graph.addEdge(fromId, toId, {
          label: proto || 'LATERAL',
          color: col,
          size: Math.min(2.5 + Math.log((c.count || 1) + 1), 6),
          type: 'arrow',
          dir: 'lat',
          _detail: detailRow
        });
      }
    });

    // Process AD Attacks
    adAttacks.forEach(a => {
      const toId = ensureMachine(a.target_machine);
      let fromId;
      if (a.remote_ip && isPrivate(a.remote_ip)) {
        fromId = ensureIp(a.remote_ip);
      } else {
        const ak = (a.actor || '?') + '|' + a.attack_type;
        fromId = ensureActor(ak, a.actor || '?', a.attack_type);
      }

      if (fromId && toId && graph.hasNode(fromId) && graph.hasNode(toId)) {
        const col = adCol(a.attack_type);
        const detailRow = {
          first_seen: a.first_seen,
          last_seen: a.last_seen,
          src: a.actor || a.remote_ip || '?',
          dst: a.target_machine || '?',
          protocol: a.protocol || a.attack_type,
          port: '-',
          count: a.count || 1,
          blocked: 0,
          severity: a.severity || 'critical',
          extra: a.description || `AD Attack: ${a.attack_type}`
        };

        graph.addEdge(fromId, toId, {
          label: a.attack_type || 'AD ATTACK',
          color: col,
          size: Math.min(3 + Math.log((a.count || 1) + 1), 7),
          type: 'arrow',
          dir: 'ad',
          _detail: detailRow
        });
      }
    });

    const order = graph.order;
    const size = graph.size;
    requestAnimationFrame(() => {
      setCounts({ nodes: order, edges: size });
    });

    // Apply layout based on active mode
    if (layoutMode === 'dagre') {
      applyDagreLayout(graph);
    } else if (layoutMode === 'force') {
      applyForceAtlas2(graph, 250);
    } else {
      applyBloodHoundClusterLayout(graph);
    }

    // Initialize Sigma with BloodHound configuration
    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: true,
      // CRITICAL: labelRenderedSizeThreshold: 0 ensures text labels NEVER disappear when zoomed out or minimized!
      labelRenderedSizeThreshold: 0,
      labelDensity: 1,
      defaultNodeType: 'circle',
      defaultEdgeType: 'arrow',
      defaultDrawNodeLabel: drawBloodHoundNode,
      defaultDrawEdgeLabel: drawBloodHoundEdgeLabel,
      enableEdgeEvents: true,
      allowInvalidContainer: true,
      stagePadding: 50,
      nodeReducer: (node, attrs) => {
        const res = { ...attrs };
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;
        if (sel) {
          if (node === sel) {
            res.highlighted = true;
            res.selected = true;
            res.size = (attrs.size || 16) * 1.35;
          } else if (graph.areNeighbors(node, sel)) {
            res.highlighted = true;
            res.isNeighbor = true;
            res.size = (attrs.size || 16) * 1.1;
          } else {
            // NEVER TURN TO GRAY! Keep original colors, borders, and icons 100% intact!
            res.highlighted = false;
            res.selected = false;
            res.isNeighbor = false;
          }
        }
        return res;
      },
      edgeReducer: (edge, attrs) => {
        const res = { ...attrs };
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;
        // Keep the original edge color (Red, Blue, Purple, Orange, etc.) - NEVER turn to gray!
        res.color = attrs.color || '#3b82f6';
        if (sel) {
          const [src, tgt] = graph.extremities(edge);
          if (src === sel || tgt === sel) {
            // Highlight connected edges with bold thickness and top z-index
            res.size = Math.max((attrs.size || 2.5) * 2.2, 5);
            res.zIndex = 10;
          } else {
            // Unselected edges retain their full original color and normal arrow visibility!
            res.size = attrs.size || 2;
            res.zIndex = 1;
          }
        } else {
          res.size = attrs.size || 2;
          res.zIndex = 1;
        }
        return res;
      }
    });

    sigmaRef.current = sigma;

    // Immediately fit and center camera so the entire network topology is perfectly framed with generous padding
    requestAnimationFrame(() => {
      if (sigmaRef.current) {
        sigmaRef.current.refresh();
        sigmaRef.current.getCamera().animatedReset({ duration: 300 });
      }
    });

    // Node Interaction / Dragging
    let isDragging = false;
    let draggedNode = null;

    sigma.on('downNode', (e) => {
      isDragging = true;
      draggedNode = e.node;
      sigma.getCamera().disable();
    });

    sigma.getMouseCaptor().on('mousemovebody', (e) => {
      if (!isDragging || !draggedNode) return;
      const pos = sigma.viewportToGraph(e);
      graph.setNodeAttribute(draggedNode, 'x', pos.x);
      graph.setNodeAttribute(draggedNode, 'y', pos.y);
      e.preventSigmaDefault();
      if (e.original) {
        e.original.preventDefault();
        e.original.stopPropagation();
      }
    });

    sigma.getMouseCaptor().on('mouseup', () => {
      if (draggedNode) {
        draggedNode = null;
        isDragging = false;
      }
      sigma.getCamera().enable();
    });

    // Click events
    sigma.on('clickNode', ({ node }) => {
      setSelectedNode(node);
      setSelectedEdge(null);

      const nodeAttrs = graph.getNodeAttributes(node);
      const connectedEdges = [];
      graph.forEachEdge(node, (edge, edgeAttrs) => {
        if (edgeAttrs._detail) {
          connectedEdges.push({ ...edgeAttrs._detail, _dir: edgeAttrs.dir });
        }
      });
      connectedEdges.sort((a, b) => (b.count || 1) - (a.count || 1));

      if (callbacksRef.current.onSelectNode) {
        callbacksRef.current.onSelectNode({
          id: node,
          label: nodeAttrs.label,
          subLabel: nodeAttrs.subLabel,
          entityType: nodeAttrs.entityType,
          raw: nodeAttrs.raw,
          rows: connectedEdges
        });
      }
    });

    sigma.on('clickEdge', ({ edge }) => {
      setSelectedEdge(edge);
      setSelectedNode(null);

      const edgeAttrs = graph.getEdgeAttributes(edge);
      if (callbacksRef.current.onSelectEdge && edgeAttrs._detail) {
        callbacksRef.current.onSelectEdge({
          id: edge,
          label: edgeAttrs.label,
          dir: edgeAttrs.dir,
          detail: edgeAttrs._detail
        });
      }
    });

    sigma.on('clickStage', () => {
      setSelectedNode(null);
      setSelectedEdge(null);
      if (callbacksRef.current.onClearSelection) {
        callbacksRef.current.onClearSelection();
      }
    });

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (sigmaRef.current) {
        sigmaRef.current.resize();
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [inbound, outbound, lateral, adAttacks, machines, layoutMode]);

  // Refresh sigma when selectedNode changes
  useEffect(() => {
    if (sigmaRef.current) {
      sigmaRef.current.refresh();
    }
  }, [selectedNode, selectedEdge]);

  // Floating Controls Handlers
  const handleZoomIn = () => {
    if (sigmaRef.current) {
      sigmaRef.current.getCamera().animatedZoom({ factor: 1.35, duration: 250 });
    }
  };

  const handleZoomOut = () => {
    if (sigmaRef.current) {
      sigmaRef.current.getCamera().animatedUnzoom({ factor: 1.35, duration: 250 });
    }
  };

  const handleResetFit = () => {
    if (sigmaRef.current) {
      sigmaRef.current.getCamera().animatedReset({ duration: 350 });
    }
  };

  const toggleLayout = () => {
    const cycle = {
      cluster: 'force',
      force: 'dagre',
      dagre: 'cluster'
    };
    setLayoutMode(cycle[layoutMode] || 'cluster');
  };

  const handleClearSelection = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    if (onClearSelection) onClearSelection();
  };

  const isLight = theme === 'light';
  const controlBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)';
  const controlBorder = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.12)';
  const controlColor = isLight ? '#0f172a' : '#f8fafc';
  const controlHoverBg = isLight ? '#f1f5f9' : '#1e293b';
  const badgeBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)';
  const badgeBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const badgeText = isLight ? '#0f172a' : 'var(--text)';
  const legendBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)';
  const legendBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const legendText = isLight ? '#334155' : 'var(--muted)';
  const legendNodeCore = isLight ? '#ffffff' : '#111526';

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '480px',
        background: isLight ? '#f8fafc' : '#0b1326',
        borderRadius: '8px',
        overflow: 'hidden',
        userSelect: 'none',
        border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid var(--border)'
      }}
    >
      {/* WebGL Sigma Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0
        }}
      />

      {/* Empty State */}
      {counts.nodes === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--muted)',
            fontSize: '13px',
            textAlign: 'center',
            pointerEvents: 'none'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '36px', display: 'block', marginBottom: '8px', opacity: 0.4 }}>hub</span>
          No active topology connections match current filters
        </div>
      )}

      {/* Top Left Stats Badge */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '14px',
          background: badgeBg,
          backdropFilter: 'blur(8px)',
          border: `1px solid ${badgeBorder}`,
          boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
          borderRadius: '6px',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '11px',
          fontFamily: 'var(--mono)',
          color: badgeText,
          pointerEvents: 'none',
          zIndex: 5
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
          <span style={{ color: 'var(--muted)' }}>Nodes:</span> <strong>{counts.nodes}</strong>
        </div>
        <div style={{ width: '1px', height: '12px', background: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
          <span style={{ color: 'var(--muted)' }}>Edges:</span> <strong>{counts.edges}</strong>
        </div>
      </div>

      {/* Floating Canvas Controls (Right-Hand Side) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 10
        }}
      >
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            width: '32px',
            height: '32px',
            background: controlBg,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${controlBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            color: controlColor,
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; e.currentTarget.style.borderColor = '#3b82f6'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = controlBg; e.currentTarget.style.borderColor = controlBorder; }}
        >
          +
        </button>

        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            width: '32px',
            height: '32px',
            background: controlBg,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${controlBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            color: controlColor,
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; e.currentTarget.style.borderColor = '#3b82f6'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = controlBg; e.currentTarget.style.borderColor = controlBorder; }}
        >
          −
        </button>

        <button
          onClick={handleResetFit}
          title="Fit to Center"
          style={{
            width: '32px',
            height: '32px',
            background: controlBg,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${controlBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            color: controlColor,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; e.currentTarget.style.borderColor = '#3b82f6'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = controlBg; e.currentTarget.style.borderColor = controlBorder; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>filter_center_focus</span>
        </button>

        {/* Layout Switcher (Star Clusters vs Physics vs Dagre Tree) */}
        <button
          onClick={toggleLayout}
          title={`Switch Layout (Current: ${layoutMode === 'cluster' ? 'BloodHound Star Clusters' : layoutMode === 'force' ? 'Physics ForceAtlas2' : 'Hierarchical Tree'})`}
          style={{
            height: '32px',
            padding: '0 8px',
            background: controlBg,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${controlBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            color: layoutMode === 'cluster' ? '#eab308' : layoutMode === 'dagre' ? '#a855f7' : '#3b82f6',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'var(--mono)',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; }}
          onMouseOut={(e) => { e.currentTarget.style.background = controlBg; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {layoutMode === 'cluster' ? 'hub' : layoutMode === 'force' ? 'scatter_plot' : 'account_tree'}
          </span>
          {layoutMode === 'cluster' ? 'Stars' : layoutMode === 'force' ? 'Physics' : 'Tree'}
        </button>

        {selectedNode && (
          <button
            onClick={handleClearSelection}
            title="Clear Selection"
            style={{
              height: '28px',
              padding: '0 8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '6px',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--mono)'
            }}
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* Bottom Subtle Legend Indicator */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: legendBg,
          backdropFilter: 'blur(8px)',
          border: `1px solid ${legendBorder}`,
          boxShadow: isLight ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
          borderRadius: '6px',
          padding: '5px 14px',
          display: 'flex',
          gap: '14px',
          fontSize: '10px',
          fontFamily: 'var(--mono)',
          color: legendText,
          pointerEvents: 'none',
          zIndex: 5
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #3b82f6', background: legendNodeCore }}></span> Host
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #22c55e', background: legendNodeCore }}></span> User
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #eab308', background: legendNodeCore }}></span> Group
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #a855f7', background: legendNodeCore }}></span> AD Attack
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #94a3b8', background: legendNodeCore }}></span> WAN IP
        </span>
      </div>
    </div>
  );
}
