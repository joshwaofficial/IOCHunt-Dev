import { useEffect, useRef, useState } from 'react';
import Sigma from 'sigma';
import { MultiDirectedGraph } from 'graphology';
import { drawBloodHoundNode, drawBloodHoundNodeHover, drawBloodHoundEdgeLabel, KIND_COLORS } from './nodeIconHelper';
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
 * BloodHound Bidirectional BFS Traversal:
 * Traces the complete inbound attacker chain and outbound compromise targets.
 */
function getFullPathHighlightedEntities(graph, highlightedItem) {
  const chainNodes = new Set();
  const chainEdges = new Set();
  if (!graph || !highlightedItem) {
    return { chainNodes, chainEdges };
  }

  if (graph.hasNode(highlightedItem)) {
    chainNodes.add(highlightedItem);

    // 1. Outbound BFS: Follow edges pointing away (source → target)
    const outboundQueue = [highlightedItem];
    while (outboundQueue.length > 0) {
      const curr = outboundQueue.shift();
      graph.forEachOutEdge(curr, (edge, attrs, source, target) => {
        chainEdges.add(edge);
        if (!chainNodes.has(target)) {
          chainNodes.add(target);
          outboundQueue.push(target);
        }
      });
    }

    // 2. Inbound BFS: Follow edges pointing toward (target → source)
    const inboundVisited = new Set([highlightedItem]);
    const inboundQueue = [highlightedItem];
    while (inboundQueue.length > 0) {
      const curr = inboundQueue.shift();
      graph.forEachInEdge(curr, (edge, attrs, source, target) => {
        chainEdges.add(edge);
        if (!inboundVisited.has(source)) {
          inboundVisited.add(source);
          chainNodes.add(source);
          inboundQueue.push(source);
        }
      });
    }
  } else if (graph.hasEdge(highlightedItem)) {
    chainEdges.add(highlightedItem);
    chainNodes.add(graph.source(highlightedItem));
    chainNodes.add(graph.target(highlightedItem));
  }

  return { chainNodes, chainEdges };
}

/**
 * BloodHound camera auto-framing:
 * Resets camera to fit all graph nodes cleanly inside the viewport with padding.
 */
function centerCameraOnGraph(sigma) {
  if (!sigma) return;
  const graph = sigma.getGraph();
  if (graph.order === 0) return;
  const camera = sigma.getCamera();
  camera.animatedReset({ duration: 350 });
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
      chainStateRef.current = getFullPathHighlightedEntities(graphRef.current, selectedNode);
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
      const rawType = (mData.entityType || '').toLowerCase();
      const uId = id.toUpperCase();

      let iconType = 'machine';
      let color = KIND_COLORS.machine || '#E67873';

      if (rawType === 'user' || (uId.includes('@') && !uId.includes('-CA'))) {
        iconType = 'user';
        color = KIND_COLORS.user; // #17E625
      } else if (rawType === 'group' || uId.includes('ADMINS') || uId.includes('OPERATORS') || uId.includes('SUBSYSTEM') || uId.includes('MANAGEMENT')) {
        iconType = 'group';
        color = KIND_COLORS.group; // #DBE617
      } else if (rawType === 'container' || uId.includes('CONTAINER') || uId.includes('CN=') || uId.includes('SYSTEM VOLUME')) {
        iconType = 'container';
        color = KIND_COLORS.container; // #F79A78
      } else if (rawType === 'gpo' || uId.includes('GPO') || uId.includes('POLICY')) {
        iconType = 'gpo';
        color = KIND_COLORS.gpo; // #998EFD
      } else if (rawType === 'ou') {
        iconType = 'ou';
        color = KIND_COLORS.ou; // #FFAA00
      } else if (rawType === 'domain' || uId.endsWith('.CORP') || uId.endsWith('.LOCAL')) {
        iconType = 'domain';
        color = KIND_COLORS.domain; // #17E6B9
      } else if (rawType === 'enterpriseca' || uId.includes('-CA') || uId.includes('ENTERPRISECA')) {
        iconType = 'enterpriseca';
        color = KIND_COLORS.enterpriseca; // #4696E9
      } else if (rawType === 'rootca' || uId.includes('ROOTCA')) {
        iconType = 'rootca';
        color = KIND_COLORS.rootca; // #6968E8
      } else if (rawType === 'certtemplate' || uId.includes('TEMPLATE')) {
        iconType = 'certtemplate';
        color = KIND_COLORS.certtemplate; // #B153F3
      } else if (rawType === 'aiaca') {
        iconType = 'aiaca';
        color = KIND_COLORS.aiaca; // #9769F0
      } else if (rawType === 'ntauthstore') {
        iconType = 'ntauthstore';
        color = KIND_COLORS.ntauthstore; // #D575F5
      } else if (mData.has_threat || (mData.threat_count && mData.threat_count > 0)) {
        iconType = 'critical';
        color = '#ef4444';
      } else {
        iconType = 'machine';
        color = KIND_COLORS.machine; // #E67873
      }

      graph.addNode(nid, {
        label: id,
        subLabel: mData.ip || (rawType ? `AD ${rawType.toUpperCase()}` : (iconType === 'group' ? 'AD Group' : iconType === 'user' ? 'AD User' : 'AD Host')),
        iconType: iconType,
        borderColor: color,
        iconColor: color,
        color: theme === 'dark' ? '#0f172a' : '#ffffff',
        size: 14,
        entityType: iconType,
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
      const color = priv ? KIND_COLORS.ip_private : KIND_COLORS.ip_external;

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
      const col = isUser ? KIND_COLORS.user : (adCol(type) || KIND_COLORS.actor);
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

    // BloodHound Multi-Edge Grouping: group edges between identical node pairs
    const edgeGroups = new Map();
    graph.forEachEdge((edge, attrs, source, target) => {
      const pair = [source, target].sort().join('###');
      if (!edgeGroups.has(pair)) edgeGroups.set(pair, []);
      edgeGroups.get(pair).push(edge);
    });

    edgeGroups.forEach((edgeList) => {
      const groupSize = edgeList.length;
      edgeList.forEach((edge, idx) => {
        graph.setEdgeAttribute(edge, 'groupSize', groupSize);
        graph.setEdgeAttribute(edge, 'groupPosition', idx);
      });
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
      labelRenderedSizeThreshold: 0,
      labelDensity: 1,
      minCameraRatio: 0.05,
      maxCameraRatio: 15,
      defaultNodeType: 'circle',
      defaultEdgeType: 'arrow',
      defaultDrawNodeLabel: drawBloodHoundNode,
      defaultDrawNodeHover: drawBloodHoundNodeHover,
      defaultDrawEdgeLabel: drawBloodHoundEdgeLabel,
      enableEdgeEvents: true,
      allowInvalidContainer: true,
      stagePadding: 80,
      nodeReducer: (node, attrs) => {
        const res = { ...attrs };
        const isLight = themeRef.current !== 'dark';
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;

        const ratio = sigmaRef.current ? sigmaRef.current.getCamera().ratio : 1;
        res.inverseSqrtZoomRatio = 1 / Math.sqrt(Math.max(ratio, 0.001));

        res.color = isLight ? '#ffffff' : '#0f172a';
        res.size = 14;

        if (sel) {
          if (node === sel) {
            res.selected = true;
            res.inChain = true;
            res.dimmed = false;
            res.zIndex = 100;
          } else if (chainStateRef.current.chainNodes && chainStateRef.current.chainNodes.has(node)) {
            res.selected = false;
            res.inChain = true;
            res.dimmed = false;
            res.zIndex = 50;
          } else {
            res.selected = false;
            res.inChain = false;
            res.dimmed = true;
            res.zIndex = 1;
          }
        } else {
          res.selected = false;
          res.inChain = false;
          res.dimmed = false;
          res.zIndex = 10;
        }
        return res;
      },
      edgeReducer: (edge, attrs) => {
        const res = { ...attrs };
        const isLight = themeRef.current !== 'dark';
        res.theme = themeRef.current;
        const sel = selectedNodeRef.current;

        const ratio = sigmaRef.current ? sigmaRef.current.getCamera().ratio : 1;
        res.inverseSqrtZoomRatio = 1 / Math.sqrt(Math.max(ratio, 0.001));

        // Multi-edge bezier control point calculation
        if (res.groupSize > 1) {
          const source = graph.source(edge);
          const target = graph.target(edge);
          const sNode = sigmaRef.current ? sigmaRef.current.getNodeDisplayData(source) : graph.getNodeAttributes(source);
          const tNode = sigmaRef.current ? sigmaRef.current.getNodeDisplayData(target) : graph.getNodeAttributes(target);
          if (sNode && tNode && typeof sNode.x === 'number' && typeof tNode.x === 'number') {
            const dx = tNode.x - sNode.x;
            const dy = tNode.y - sNode.y;
            const dist = Math.hypot(dx, dy) || 1;
            const midX = (sNode.x + tNode.x) / 2;
            const midY = (sNode.y + tNode.y) / 2;
            const nx = -dy / dist;
            const ny = dx / dist;

            const curveOffset = (res.groupPosition - (res.groupSize - 1) / 2) * 32;
            res.control = {
              x: midX + nx * curveOffset,
              y: midY + ny * curveOffset
            };
          }
        }

        if (sel) {
          if (chainStateRef.current.chainEdges && chainStateRef.current.chainEdges.has(edge)) {
            res.size = Math.max((attrs.size || 2) * 1.6, 3.4);
            res.color = attrs.color || (isLight ? '#2563eb' : '#60a5fa');
            res.zIndex = 20;
            res.inChain = true;
            res.dimmed = false;
          } else {
            res.size = 1.0;
            res.color = isLight ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)';
            res.zIndex = 0;
            res.inChain = false;
            res.dimmed = true;
          }
        } else {
          res.size = attrs.size || 2;
          res.color = attrs.color || (isLight ? '#3b82f6' : '#60a5fa');
          res.zIndex = 1;
          res.inChain = false;
          res.dimmed = false;
        }
        return res;
      }
    });

    sigmaRef.current = sigma;

    // React dynamically to camera zoom to trigger Level of Detail (LOD) label fading
    sigma.getCamera().on('updated', () => {
      sigma.refresh();
    });

    // Auto-fit and center camera with generous padding
    requestAnimationFrame(() => {
      if (sigmaRef.current) {
        centerCameraOnGraph(sigmaRef.current);
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
      chainStateRef.current = getFullPathHighlightedEntities(graph, node);
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
      chainStateRef.current = getFullPathHighlightedEntities(graph, edge);
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
      centerCameraOnGraph(sigmaRef.current);
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
