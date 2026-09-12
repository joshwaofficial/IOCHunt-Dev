import { useEffect, useRef, useState } from 'react';
import Sigma from 'sigma';
import { MultiDirectedGraph } from 'graphology';
import { drawBloodHoundNode, drawBloodHoundNodeHover, drawBloodHoundEdgeLabel } from './nodeIconHelper';
import {
  applyBloodHoundTreeLayout,
  applyBloodHoundStarLayout,
  applyBloodHoundPhysicsLayout,
  applyBloodHoundClusterLayout
} from './layoutManager';

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

/**
 * Fast BFS traversal to trace the full connected attack path chain (upstream ancestors & downstream targets)
 */
function getConnectedChain(graph, startNode) {
  const chainNodes = new Set();
  const chainEdges = new Set();
  if (!graph || !startNode || !graph.hasNode(startNode)) {
    return { chainNodes, chainEdges };
  }

  chainNodes.add(startNode);

  // 1. Trace upstream (ancestors / attackers leading into startNode)
  const upQueue = [startNode];
  const upVisited = new Set([startNode]);
  while (upQueue.length > 0) {
    const curr = upQueue.shift();
    graph.forEachInEdge(curr, (edge, edgeAttrs, source) => {
      chainEdges.add(edge);
      if (!upVisited.has(source)) {
        upVisited.add(source);
        chainNodes.add(source);
        upQueue.push(source);
      }
    });
  }

  // 2. Trace downstream (descendants / targets reachable from startNode)
  const downQueue = [startNode];
  const downVisited = new Set([startNode]);
  while (downQueue.length > 0) {
    const curr = downQueue.shift();
    graph.forEachOutEdge(curr, (edge, edgeAttrs, source, target) => {
      chainEdges.add(edge);
      if (!downVisited.has(target)) {
        downVisited.add(target);
        chainNodes.add(target);
        downQueue.push(target);
      }
    });
  }

  return { chainNodes, chainEdges };
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
  const chainStateRef = useRef({ chainNodes: new Set(), chainEdges: new Set() });

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
    if (graphRef.current && selectedNode) {
      chainStateRef.current = getConnectedChain(graphRef.current, selectedNode);
    } else {
      chainStateRef.current = { chainNodes: new Set(), chainEdges: new Set() };
    }
  }, [selectedNode]);

  const [layoutMode, setLayoutMode] = useState('dagre'); // 'dagre' (Tree) | 'cluster' (Stars) | 'force' (Physics)
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
      let size = 14;

      if (isGroup) {
        color = '#eab308';
        iconType = 'group';
        size = 14;
      } else if (isUser) {
        color = '#22c55e';
        iconType = 'user';
        size = 13;
      } else if (isCritical) {
        color = '#ef4444';
        iconType = 'critical';
        size = 14;
      }

      graph.addNode(nid, {
        label: id,
        subLabel: mData.ip || (isGroup ? 'Active Directory Group' : isUser ? 'User Account' : 'Monitored Host'),
        iconType: iconType,
        borderColor: color,
        iconColor: color,
        color: theme === 'dark' ? '#0f172a' : '#ffffff', // Clean white/dark base, NEVER solid yellow!
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
        iconColor: color,
        color: theme === 'dark' ? '#0f172a' : '#ffffff',
        size: 12,
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
        iconColor: col,
        color: theme === 'dark' ? '#0f172a' : '#ffffff',
        size: 14,
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
      const mActorId = a.actor ? ('m:' + a.actor) : null;
      if (mActorId && graph.hasNode(mActorId)) {
        fromId = mActorId;
      } else if (a.remote_ip && isPrivate(a.remote_ip)) {
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
      applyBloodHoundTreeLayout(graph);
    } else if (layoutMode === 'force') {
      applyBloodHoundPhysicsLayout(graph);
    } else {
      applyBloodHoundStarLayout(graph);
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
      defaultDrawNodeHover: drawBloodHoundNodeHover,
      defaultDrawEdgeLabel: drawBloodHoundEdgeLabel,
      enableEdgeEvents: true,
      allowInvalidContainer: true,
      stagePadding: 75,
      nodeReducer: (node, attrs) => {
        const res = { ...attrs };
        const isLight = themeRef.current !== 'dark';
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;

        // CRITICAL: WebGL base fill is ALWAYS pure clean white in light mode, dark slate in dark mode.
        res.color = isLight ? '#ffffff' : '#0f172a';

        // Keep node size crisp and visible (12.5px - 15px so it NEVER disappears or turns blank when zoomed out!)
        const order = graph.order;
        const baseSize = order <= 25 ? 15 : (order <= 60 ? 13.5 : 12.5);
        res.size = baseSize;

        if (sel) {
          if (node === sel) {
            // Clicked Node: clean selection ring, fully opaque, top z-index
            res.selected = true;
            res.inChain = true;
            res.dimmed = false;
            res.zIndex = 100;
            res.borderColor = attrs.borderColor || '#3b82f6';
            res.iconColor = attrs.iconColor || attrs.borderColor || '#3b82f6';
            res.label = attrs.label;
          } else if (chainStateRef.current.chainNodes && chainStateRef.current.chainNodes.has(node)) {
            // Full connected attack path chain from start to end!
            res.selected = false;
            res.inChain = true;
            res.dimmed = false;
            res.zIndex = 50;
            res.borderColor = attrs.borderColor || '#3b82f6';
            res.iconColor = attrs.iconColor || attrs.borderColor || '#3b82f6';
            res.label = attrs.label;
          } else {
            // Other nodes: KEEP original category colors, reduce opacity slightly like BloodHound!
            res.selected = false;
            res.inChain = false;
            res.dimmed = true;
            res.zIndex = 1;
            res.borderColor = attrs.borderColor || '#3b82f6'; // Keep original color!
            res.iconColor = attrs.iconColor || attrs.borderColor || '#3b82f6'; // Keep original color!
            res.label = attrs.label;
          }
        } else {
          // Normal view: all nodes fully visible with category borders and crisp labels
          res.selected = false;
          res.inChain = false;
          res.dimmed = false;
          res.zIndex = 10;
          res.borderColor = attrs.borderColor || '#3b82f6';
          res.iconColor = attrs.iconColor || attrs.borderColor || '#3b82f6';
          res.label = attrs.label;
        }
        return res;
      },
      edgeReducer: (edge, attrs) => {
        const res = { ...attrs };
        const isLight = themeRef.current !== 'dark';
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;

        if (sel) {
          if (chainStateRef.current.chainEdges && chainStateRef.current.chainEdges.has(edge)) {
            // Active connection along the entire attack path chain: bold, vibrant, visible label
            res.size = Math.max((attrs.size || 2) * 1.6, 3.4);
            res.color = attrs.color || (isLight ? '#2563eb' : '#60a5fa');
            res.zIndex = 20;
            res.forceLabel = true;
            res.dimmed = false;
            res.label = attrs.label;
          } else {
            // Other edges: gray arrow with reduced opacity like BloodHound
            res.size = 1.0;
            res.color = isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)';
            res.zIndex = 0;
            res.forceLabel = false;
            res.dimmed = true;
            res.label = ''; // Hide label for background edges
          }
        } else {
          // Normal view: clean edge lines with labels
          res.size = attrs.size || 2;
          res.color = attrs.color || (isLight ? '#3b82f6' : '#60a5fa');
          res.zIndex = 1;
          res.forceLabel = true;
          res.dimmed = false;
          res.label = attrs.label;
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
      selectedNodeRef.current = node;
      chainStateRef.current = getConnectedChain(graph, node);
      setSelectedNode(node);
      setSelectedEdge(null);
      sigma.refresh();

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
      selectedNodeRef.current = null;
      chainStateRef.current = { chainNodes: new Set(), chainEdges: new Set() };
      setSelectedEdge(edge);
      setSelectedNode(null);
      sigma.refresh();

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
      selectedNodeRef.current = null;
      chainStateRef.current = { chainNodes: new Set(), chainEdges: new Set() };
      setSelectedNode(null);
      setSelectedEdge(null);
      sigma.refresh();
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


  const handleClearSelection = () => {
    selectedNodeRef.current = null;
    chainStateRef.current = { chainNodes: new Set(), chainEdges: new Set() };
    setSelectedNode(null);
    setSelectedEdge(null);
    if (sigmaRef.current) {
      sigmaRef.current.refresh();
    }
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

        {/* Layout Switcher: Tree | Stars | Physics */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            background: controlBg,
            backdropFilter: 'blur(8px)',
            border: `1px solid ${controlBorder}`,
            boxShadow: isLight ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            padding: '3px'
          }}
        >
          <button
            onClick={() => setLayoutMode('dagre')}
            title="Hierarchical Attack Tree (BloodHound DAG)"
            style={{
              height: '26px',
              padding: '0 6px',
              background: layoutMode === 'dagre' ? (isLight ? '#f3e8ff' : '#581c87') : 'transparent',
              border: layoutMode === 'dagre' ? '1px solid #a855f7' : '1px solid transparent',
              borderRadius: '4px',
              color: layoutMode === 'dagre' ? '#a855f7' : controlColor,
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--mono)',
              transition: 'all 0.15s'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>account_tree</span>
            Tree
          </button>

          <button
            onClick={() => setLayoutMode('cluster')}
            title="Star Clusters (Radial Hub & Spoke)"
            style={{
              height: '26px',
              padding: '0 6px',
              background: layoutMode === 'cluster' ? (isLight ? '#fef9c3' : '#713f12') : 'transparent',
              border: layoutMode === 'cluster' ? '1px solid #eab308' : '1px solid transparent',
              borderRadius: '4px',
              color: layoutMode === 'cluster' ? '#eab308' : controlColor,
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--mono)',
              transition: 'all 0.15s'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>hub</span>
            Stars
          </button>

          <button
            onClick={() => setLayoutMode('force')}
            title="Physics Simulation (Gephi ForceAtlas2)"
            style={{
              height: '26px',
              padding: '0 6px',
              background: layoutMode === 'force' ? (isLight ? '#dbeafe' : '#1e3a8a') : 'transparent',
              border: layoutMode === 'force' ? '1px solid #3b82f6' : '1px solid transparent',
              borderRadius: '4px',
              color: layoutMode === 'force' ? '#3b82f6' : controlColor,
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--mono)',
              transition: 'all 0.15s'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>scatter_plot</span>
            Physics
          </button>
        </div>

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
