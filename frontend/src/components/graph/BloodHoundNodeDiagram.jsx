import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';
import { KIND_COLORS, getNodeSvgDataUri } from './nodeIconHelper';

// Register layout extensions once
try {
  cytoscape.use(fcose);
  cytoscape.use(dagre);
} catch (e) {
  // Already registered
}

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

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
}

function adCol(t) {
  return AD_COL[t] || '#a855f7';
}

function getShortLabel(label) {
  if (!label) return '';
  const str = String(label);
  let clean = str
    .replace(/@[^.]+(\.[^.]+)+$/i, '')
    .replace(/@.*$/, '')
    .replace(/\.(local|corp|internal|lan)$/i, '');
  if (clean.length > 20) {
    clean = clean.slice(0, 18) + '…';
  }
  return clean;
}

function baseNodeSize(order) {
  if (order <= 25)  return 64;
  if (order <= 60)  return 56;
  if (order <= 120) return 48;
  if (order <= 250) return 42;
  if (order <= 500) return 36;
  return 32;
}

const getCytoscapeStylesheet = (theme, showNodeLabels = true, showEdgeLabels = true) => {
  const isLight = theme !== 'dark';
  return [
    // Base Node Style - Clean circular body with distinct colored border ring & centered colored vector icon
    {
      selector: 'node',
      style: {
        'width': 'data(size)',
        'height': 'data(size)',
        'shape': 'ellipse',
        'background-color': isLight ? '#ffffff' : '#0f172a',
        'border-width': 'data(borderWidth)',
        'border-color': 'data(borderColor)',
        'background-image': 'data(svgIcon)',
        'background-fit': 'none',
        'background-width': '60%',
        'background-height': '60%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip': 'node',
        'outline-width': 0,
        'outline-opacity': 0,
        'overlay-opacity': 0, // Removes the gray box on tap/click!
        'overlay-padding': 0,
        'label': showNodeLabels ? 'data(shortLabel)' : '',
        'text-opacity': showNodeLabels ? 1.0 : 0,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size': '11px',
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showNodeLabels ? 0.95 : 0,
        'text-background-padding': '2px 5px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)',
        'text-border-width': showNodeLabels ? 1 : 0,
        'text-border-opacity': showNodeLabels ? 0.7 : 0,
        'min-zoomed-font-size': showNodeLabels ? 0 : 9999,
        'z-index': 10,
        'transition-property': 'opacity, border-color, border-width, text-opacity, outline-width, outline-color',
        'transition-duration': '0.15s'
      }
    },
    // Remove Cytoscape default tap/active gray overlay box completely
    {
      selector: ':active, :selected',
      style: {
        'overlay-opacity': 0,
        'overlay-padding': 0
      }
    },
    // Hovered Node: Concentric outer blue halo ring APPEARS ONLY ON HOVER!
    {
      selector: 'node.hovered',
      style: {
        'min-zoomed-font-size': 0,
        'label': 'data(fullLabel)',
        'text-opacity': 1.0,
        'text-background-opacity': 0.96,
        'text-border-width': 1,
        'border-width': 3.8,
        'border-color': 'data(borderColor)',
        'outline-width': 3.8,
        'outline-color': '#0052FF',
        'outline-offset': 3.5,
        'outline-opacity': 1.0,
        'outline-style': 'solid',
        'z-index': 95
      }
    },
    // Crown Jewels / Landmark Nodes (Domain Admin, DC, Krbtgt, RootCA)
    {
      selector: 'node[?isCrownJewel]',
      style: {
        'min-zoomed-font-size': 4,
        'z-index': 30,
        'border-width': 3.8
      }
    },
    // Active Selection Node: Fixed blue halo ring + highlighted blue pill label (BloodHound CE style)
    {
      selector: 'node.selected',
      style: {
        'border-color': 'data(borderColor)',
        'border-width': 4.2,
        'outline-width': 4.5,
        'outline-color': '#0052FF',
        'outline-offset': 4.5,
        'outline-opacity': 1.0,
        'outline-style': 'solid',
        'label': 'data(fullLabel)',
        'text-opacity': 1.0,
        'text-background-color': '#0052FF',
        'color': '#ffffff',
        'text-border-color': '#0052FF',
        'text-background-opacity': 1.0,
        'min-zoomed-font-size': 0,
        'z-index': 100,
        'opacity': 1.0
      }
    },
    // Connected Attack Chain Nodes: PRESERVE ORIGINAL NODE BORDER COLOR!
    {
      selector: 'node.in-chain',
      style: {
        'border-width': 3.8,
        'border-color': 'data(borderColor)',
        'outline-width': 0,
        'outline-opacity': 0,
        'min-zoomed-font-size': 0,
        'z-index': 60,
        'opacity': 1.0,
        'text-opacity': showNodeLabels ? 1.0 : 0
      }
    },
    // Faded Nodes during focus selection
    {
      selector: 'node.faded',
      style: {
        'opacity': 0.20,
        'text-opacity': 0,
        'z-index': 1
      }
    },
    // Base Edge Style: Centered relationship label on the line
    {
      selector: 'edge',
      style: {
        'width': 1.8,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.95,
        'curve-style': 'bezier',
        'control-point-step-size': 28,
        'label': showEdgeLabels ? 'data(label)' : '',
        'text-opacity': showEdgeLabels ? 1.0 : 0,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size': '8.5px',
        'font-weight': 600,
        'color': isLight ? '#475569' : '#94a3b8',
        'text-background-color': isLight ? '#ffffff' : '#0f172a',
        'text-background-opacity': showEdgeLabels ? 1.0 : 0,
        'text-background-padding': '1.5px 3.5px',
        'text-background-shape': 'roundrectangle',
        'text-border-width': 0,
        'text-rotation': 'autorotate',
        'text-margin-x': 0,
        'text-margin-y': 0,
        'min-zoomed-font-size': showEdgeLabels ? 0 : 9999,
        'overlay-opacity': 0,
        'overlay-padding': 0,
        'z-index': 5,
        'transition-property': 'opacity, width, line-color, target-arrow-color',
        'transition-duration': '0.15s'
      }
    },
    // Explicit class to completely hide node labels
    {
      selector: 'node.hide-node-labels',
      style: {
        'label': '',
        'text-opacity': 0,
        'text-background-opacity': 0,
        'text-border-width': 0,
        'min-zoomed-font-size': 99999
      }
    },
    // Explicit class to completely hide edge labels
    {
      selector: 'edge.hide-edge-labels',
      style: {
        'label': '',
        'text-opacity': 0,
        'text-background-opacity': 0,
        'min-zoomed-font-size': 99999
      }
    },
    // BloodHound focus mode: isolated sub-graph display (unrelated elements completely hidden)
    {
      selector: '.hidden',
      style: {
        'display': 'none'
      }
    },
    // Hovered Edge: Reveal label with high z-index and subtle highlight
    {
      selector: 'edge.hovered',
      style: {
        'width': 2.8,
        'label': 'data(label)',
        'text-opacity': 1.0,
        'min-zoomed-font-size': 0,
        'font-size': '10px',
        'font-weight': 700,
        'z-index': 999,
        'text-background-opacity': 1.0,
        'text-border-color': 'data(color)',
        'text-border-width': 1.2,
        'text-background-color': isLight ? '#ffffff' : '#0f172a',
        'color': isLight ? '#0f172a' : '#ffffff',
        'text-margin-x': 0,
        'text-margin-y': 0
      }
    },
    // Selected / Active Attack Chain Edges: Reveal label immediately!
    {
      selector: 'edge.in-chain, edge.selected',
      style: {
        'width': 2.8,
        'line-color': isLight ? '#2563eb' : '#60a5fa',
        'target-arrow-color': isLight ? '#2563eb' : '#60a5fa',
        'label': 'data(label)',
        'text-opacity': 1.0,
        'min-zoomed-font-size': 0,
        'font-size': '9.5px',
        'font-weight': 700,
        'z-index': 85,
        'opacity': 1.0,
        'text-background-opacity': 1.0,
        'text-border-color': isLight ? '#2563eb' : '#60a5fa',
        'text-border-width': 1.2,
        'text-margin-x': 0,
        'text-margin-y': 0
      }
    },
    // Faded Edges during focus selection
    {
      selector: 'edge.faded',
      style: {
        'opacity': 0.08,
        'text-opacity': 0,
        'z-index': 0
      }
    }
  ];
};

export default function BloodHoundNodeDiagram({
  inbound = [],
  outbound = [],
  lateral = [],
  adAttacks = [],
  machines = [],
  theme = 'dark',
  focusedCategory = 'all',
  focusNodeTarget = null,
  isPanelOpen = false,
  onSelectNode,
  onSelectEdge,
  onClearSelection
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const initialCleanPositionsRef = useRef(new Map());
  const callbacksRef = useRef({ onSelectNode, onSelectEdge, onClearSelection });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isGraphModified, setIsGraphModified] = useState(false);
  const [layoutMode, setLayoutMode] = useState('fcose'); // 'fcose' (Organic) | 'dagre' (Tree) | 'cluster' (Stars)
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [isLabelMenuOpen, setIsLabelMenuOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allGraphNodes, setAllGraphNodes] = useState([]);
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onSelectEdge, onClearSelection };
  }, [onSelectNode, onSelectEdge, onClearSelection]);

  // Update Cytoscape stylesheet when theme changes
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.style(getCytoscapeStylesheet(theme, showNodeLabels, showEdgeLabels));
    }
  }, [theme]);

  // Guaranteed instant class-based node label toggling
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (!showNodeLabels) {
      cy.nodes().addClass('hide-node-labels');
    } else {
      cy.nodes().removeClass('hide-node-labels');
    }
  }, [showNodeLabels]);

  // Guaranteed instant class-based edge label toggling
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (!showEdgeLabels) {
      cy.edges().addClass('hide-edge-labels');
    } else {
      cy.edges().removeClass('hide-edge-labels');
    }
  }, [showEdgeLabels]);

  const dataKey = `${inbound.length}|${outbound.length}|${lateral.length}|${adAttacks.length}|${machines.length}|${layoutMode}`;

  // Build and render graph in Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const totalConnections = inbound.length + outbound.length + lateral.length + adAttacks.length;
    if (totalConnections === 0 && machines.length === 0) {
      requestAnimationFrame(() => setCounts({ nodes: 0, edges: 0 }));
      setAllGraphNodes([]);
      return;
    }

    const elements = [];
    const nodesMap = new Map();
    const edgeMap = new Map();
    const connectedNodeIds = new Set();

    // Pre-calculate approx order
    const approxOrder = Math.max(machines.length, Math.round(totalConnections * 0.45), 12);
    const nSize = baseNodeSize(approxOrder);

    const isCrownJewelCheck = (name, raw) => {
      const u = String(name || '').toUpperCase();
      return (
        u.includes('DOMAIN ADMIN') ||
        u.includes('ENTERPRISE ADMIN') ||
        u.includes('DC01') ||
        u.includes('DC-01') ||
        u.includes('KRBTGT') ||
        u.includes('ADMINISTRATOR@') ||
        u.includes('ROOTCA') ||
        Boolean(raw && (raw.admincount || raw.is_dc))
      );
    };

    function ensureNode(id, type = 'machine', raw = {}) {
      if (!id) return null;
      // Strip any raw HTML tags (e.g. <b>Test Injection</b>)
      const cleanId = String(id).replace(/<[^>]*>/g, '').trim();
      if (!cleanId) return null;
      const nid = 'm:' + cleanId;
      if (!nodesMap.has(nid)) {
        const u = cleanId.toUpperCase();
        let eType = raw.entityType || type;

        // Differentiate node types with precision to ensure distinct, intuitive colors & icons
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanId)) {
          // IP addresses
          eType = isPrivate(cleanId) ? 'ip_private' : 'ip_external';
        } else if (u.includes('DC-01') || u.includes('DC01') || u.includes('DC-02') || u.includes('BACKUP-DC') || u.includes('-DC') || u.includes('DOMAIN CONTROLLER') || u.includes('ROOTCA') || u.includes('CA-') || u.includes('CA_') || u.includes('KRBTGT') || Boolean(raw.is_dc) || raw.entityType === 'dc') {
          // Domain Controllers & High-Value CAs (Royal Purple)
          eType = 'dc';
        } else if (u.includes('ADMINS') || u.includes('OPERATORS') || u.includes('GROUP') || u.includes('SUBSYSTEM') || u.includes('MANAGEMENT') || (u.includes('USERS') && !cleanId.includes('@')) || raw.entityType === 'group') {
          // Administrative & Security Groups (Amber Gold)
          eType = 'group';
        } else if (u.includes('SQL') || u.includes('DB') || u.includes('PROD') || u.includes('K8S') || u.includes('EXCH') || u.includes('MAIL') || u.includes('SRV') || u.includes('SERVER') || u.includes('GATEWAY') || u.includes('FS-') || raw.entityType === 'server') {
          // Production Servers & Databases (Cyan)
          eType = 'server';
        } else if (u.startsWith('OU=') || u.includes('OU') || u.includes('CONTAINER') || raw.entityType === 'ou') {
          // Organizational Units (Vibrant Orange)
          eType = 'ou';
        } else if (cleanId.includes('@') && !u.includes('SRV') && !u.includes('CA@') && !u.includes('DC') && !u.includes('EXCH')) {
          // User Identity Accounts (Emerald Green)
          eType = 'user';
        } else if (u.includes('ACTOR') || u.includes('ATTACKER') || u.includes('SCANNER') || eType === 'actor' || eType === 'ad_attack') {
          // Attacker / Threat Actor (Crimson)
          eType = 'actor';
        } else if (eType === 'computer' || eType === 'machine' || u.includes('PC') || u.includes('WS') || u.includes('DESK') || u.includes('CLIENT') || u.includes('LAPTOP')) {
          // Workstations & Endpoints (Coral Red)
          eType = 'machine';
        }

        const col = KIND_COLORS[eType] || KIND_COLORS.default;
        const isCrown = isCrownJewelCheck(cleanId, raw);
        const sLabel = getShortLabel(cleanId);
        // Colored vector icon matching the border ring color
        const iconSvg = getNodeSvgDataUri(eType, col);

        nodesMap.set(nid, {
          group: 'nodes',
          data: {
            id: nid,
            label: sLabel,
            shortLabel: sLabel,
            fullLabel: cleanId,
            subLabel: raw.ip || '',
            entityType: eType,
            isCrownJewel: isCrown,
            size: isCrown ? Math.round(nSize * 1.25) : nSize,
            color: col,
            borderColor: col,
            borderWidth: isCrown ? 3.8 : 2.8,
            svgIcon: iconSvg,
            raw
          }
        });
      }
      return nid;
    }

    // Process Machines
    machines.forEach(m => {
      ensureNode(m.name || m.ip, m.entityType || 'machine', m.raw || m);
    });

    // Bundle / Aggregate parallel edges between the same nodes to prevent overlapping text collision!
    function addEdge(fromId, toId, edgeData) {
      if (!fromId || !toId || fromId === toId) return;
      connectedNodeIds.add(fromId);
      connectedNodeIds.add(toId);
      const key = `${fromId}->${toId}`;
      if (edgeMap.has(key)) {
        const existing = edgeMap.get(key);
        existing.count = (existing.count || 1) + (edgeData.count || 1);
        if (edgeData.label && !existing.labelList.includes(edgeData.label)) {
          existing.labelList.push(edgeData.label);
        }
        if (existing.labelList.length > 1) {
          existing.label = `${existing.labelList[0]} (+${existing.labelList.length - 1})`;
        }
        if (edgeData.color === '#ef4444' || edgeData.severity === 'critical') {
          existing.color = '#ef4444';
        }
        existing.width = Math.min(5.5, existing.width + 0.4);
        if (edgeData._detail) existing._detailList.push(edgeData._detail);
      } else {
        edgeMap.set(key, {
          id: `e_${fromId}_${toId}`,
          source: fromId,
          target: toId,
          label: edgeData.label,
          labelList: edgeData.label ? [edgeData.label] : [],
          dir: edgeData.dir,
          color: edgeData.color,
          width: edgeData.width || 2.5,
          count: edgeData.count || 1,
          severity: edgeData.severity || 'info',
          _detail: edgeData._detail,
          _detailList: edgeData._detail ? [edgeData._detail] : []
        });
      }
    }

    // Process Inbound
    inbound.forEach((c, idx) => {
      const fromId = ensureNode(c.from_ip || c.from_machine, isPrivate(c.from_ip || '') ? 'ip_private' : 'ip_external');
      const toId = ensureNode(c.to_machine || c.to_ip, 'machine');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const col = bl ? '#ef4444' : '#3b82f6';
        addEdge(fromId, toId, {
          label: c.protocol || 'INBOUND',
          dir: 'in',
          color: col,
          width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.from_machine || c.from_ip || '?', dst: c.to_machine || c.to_ip || '?',
            protocol: c.protocol || '', port: c.port || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process Outbound
    outbound.forEach((c, idx) => {
      const fromId = ensureNode(c.from_machine, 'machine');
      const toId = ensureNode(c.to_ip || c.to_machine, isPrivate(c.to_ip || '') ? 'ip_private' : 'ip_external');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const col = bl ? '#ef4444' : '#10b981';
        addEdge(fromId, toId, {
          label: c.protocol || 'OUTBOUND',
          dir: 'out',
          color: col,
          width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.from_machine || '?', dst: c.to_machine || c.to_ip || '?',
            protocol: c.protocol || '', port: c.port || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process Lateral
    lateral.forEach((c, idx) => {
      const fromId = ensureNode(c.source, c.source.includes('@') ? 'user' : 'machine');
      const toId = ensureNode(c.target, 'machine');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const isMemberOf = c.protocol === 'MemberOf';
        const col = bl ? '#ef4444' : (isMemberOf ? '#3b82f6' : (c.severity === 'critical' ? '#ef4444' : '#f97316'));
        addEdge(fromId, toId, {
          label: c.protocol || 'LATERAL',
          dir: 'lat',
          color: col,
          width: Math.min(2.5 + Math.log((c.count || 1) + 1), 5.5),
          count: c.count || 1,
          severity: c.severity || 'critical',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.source, dst: c.target,
            protocol: c.protocol || '', port: c.port || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'critical',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process AD Attacks
    adAttacks.forEach((a, idx) => {
      const toId = ensureNode(a.target_machine, 'machine');
      let fromId;
      if (a.actor) {
        fromId = ensureNode(a.actor, a.actor.includes('@') ? 'user' : 'actor');
      } else if (a.remote_ip) {
        fromId = ensureNode(a.remote_ip, isPrivate(a.remote_ip) ? 'ip_private' : 'ip_external');
      } else {
        fromId = ensureNode('Attacker', 'actor');
      }

      if (fromId && toId && fromId !== toId) {
        const col = adCol(a.attack_type);
        addEdge(fromId, toId, {
          label: a.attack_type || 'AD ATTACK',
          dir: 'ad',
          color: col,
          width: Math.min(3 + Math.log((a.count || 1) + 1), 6),
          count: a.count || 1,
          severity: a.severity || 'critical',
          _detail: {
            first_seen: a.first_seen, last_seen: a.last_seen,
            src: a.actor || a.remote_ip || '?', dst: a.target_machine || '?',
            protocol: a.protocol || a.attack_type, port: '-',
            count: a.count || 1, blocked: 0, severity: a.severity || 'critical',
            extra: a.description || `AD Attack: ${a.attack_type}`
          }
        });
      }
    });

    // Only add nodes that have active incoming or outgoing connections (excludes orphan nodes!)
    const availableNodes = [];
    nodesMap.forEach((nodeObj, nid) => {
      if (connectedNodeIds.has(nid)) {
        elements.push(nodeObj);
        availableNodes.push({
          id: nid,
          label: nodeObj.data.fullLabel,
          shortLabel: nodeObj.data.shortLabel,
          entityType: nodeObj.data.entityType,
          color: nodeObj.data.color,
          subLabel: nodeObj.data.subLabel
        });
      }
    });
    setAllGraphNodes(availableNodes);

    // Add consolidated edges to elements
    edgeMap.forEach(e => {
      elements.push({
        group: 'edges',
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          dir: e.dir,
          color: e.color,
          width: e.width,
          textMarginX: 0,
          _detail: e._detail,
          _detailList: e._detailList
        }
      });
    });

    const finalNodeCount = elements.filter(e => e.group === 'nodes').length;
    const finalEdgeCount = edgeMap.size;
    requestAnimationFrame(() => {
      setCounts({ nodes: finalNodeCount, edges: finalEdgeCount });
    });

    // Initialize Cytoscape instance with fast, responsive zoom
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet(theme, showNodeLabels, showEdgeLabels),
      minZoom: 0.02,
      maxZoom: 8.0,
      wheelSensitivity: 1.2, // 5x faster mouse wheel zooming (was 0.25)
      boxSelectionEnabled: false
    });

    cyRef.current = cy;
    window.__cy = cy;
    if (!showNodeLabels) cy.nodes().addClass('hide-node-labels');
    if (!showEdgeLabels) cy.edges().addClass('hide-edge-labels');

    // Run active layout with clean, readable spacing
    let layoutOpts;
    if (layoutMode === 'dagre') {
      layoutOpts = {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: finalNodeCount > 100 ? 70 : 90,
        rankSep: finalNodeCount > 100 ? 250 : 340,
        ranker: 'network-simplex',
        animate: false,
        padding: 45
      };
    } else if (layoutMode === 'cluster') {
      // Stars / Concentric
      layoutOpts = {
        name: 'concentric',
        concentric: (node) => (node.data('isCrownJewel') ? 10 : (node.degree() >= 4 ? 6 : 2)),
        levelWidth: () => 3,
        minNodeSpacing: finalNodeCount > 100 ? 100 : 160,
        spacingFactor: 1.5,
        animate: false,
        padding: 45
      };
    } else {
      // fCoSE (BloodHound default organic layout) — expansive spring physics
      layoutOpts = {
        name: 'fcose',
        quality: finalNodeCount > 30 ? 'proof' : 'default',
        randomize: true,
        animate: false,
        fit: true,
        padding: 60,
        nodeDimensionsIncludeLabels: true,
        uniformNodeDimensions: false,
        packComponents: true,
        // High exponential repulsion for hubs so multiple hubs (Domain Admins, Enterprise Admins, etc.)
        // push far away from each other instead of clustering together in the center!
        nodeRepulsion: (node) => {
          if (finalNodeCount <= 15) return 320000;
          if (finalNodeCount <= 40) return 850000;
          const deg = node.degree();
          return Math.min(12000000, 2000000 + Math.pow(deg, 1.5) * 85000);
        },
        // Hub-aware edge length: edges connecting two hubs are up to 1500px long,
        // while leaf edges give wide radius so leaves never bunch around the hub!
        idealEdgeLength: (edge) => {
          if (finalNodeCount <= 15) return 300;
          const sDeg = edge.source().degree();
          const tDeg = edge.target().degree();
          const maxDeg = Math.max(sDeg, tDeg);
          const minDeg = Math.min(sDeg, tDeg);
          // Two hubs connected: push them very far apart!
          if (minDeg >= 3) {
            return Math.min(1500, 750 + (sDeg + tDeg) * 16);
          }
          if (finalNodeCount <= 40) return Math.min(600, 360 + maxDeg * 14);
          return Math.min(1100, 500 + maxDeg * 22);
        },
        edgeElasticity: (edge) => (finalNodeCount <= 15 ? 0.05 : (finalNodeCount <= 40 ? 0.02 : 0.006)),
        nestingFactor: 0.1,
        // Ultra-low gravity eliminates central crushing so the graph expands in full 2D space
        gravity: finalNodeCount <= 15 ? 0.04 : (finalNodeCount <= 40 ? 0.008 : 0.001),
        gravityRange: finalNodeCount <= 15 ? 1.5 : 5.0,
        numIter: finalNodeCount > 40 ? 4500 : 2500,
        tile: true,
        tilingPaddingVertical: finalNodeCount > 30 ? 200 : 70,
        tilingPaddingHorizontal: finalNodeCount > 30 ? 200 : 70,
        nodeSeparation: finalNodeCount <= 15 ? 180 : (finalNodeCount <= 40 ? 300 : 480)
      };
    }

    const l = cy.layout(layoutOpts);
    l.run();

    // Post-layout anti-collision relaxation for large fCoSE graphs:
    // Enforces strict minimum spacing (260px-280px) between every single node so labels & icons NEVER overlap!
    if (layoutMode === 'fcose' && finalNodeCount > 15) {
      cy.batch(() => {
        const nArray = cy.nodes().toArray();
        const minSpacing = finalNodeCount > 80 ? 280 : 240;
        for (let iter = 0; iter < 12; iter++) {
          let hadCollision = false;
          for (let i = 0; i < nArray.length; i++) {
            const n1 = nArray[i];
            const p1 = n1.position();
            for (let j = i + 1; j < nArray.length; j++) {
              const n2 = nArray[j];
              const p2 = n2.position();
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.hypot(dx, dy) || 1;
              if (dist < minSpacing) {
                hadCollision = true;
                const overlap = (minSpacing - dist) / 2;
                const nx = dx / dist;
                const ny = dy / dist;
                n1.position({ x: p1.x - nx * overlap, y: p1.y - ny * overlap });
                n2.position({ x: p2.x + nx * overlap, y: p2.y + ny * overlap });
              }
            }
          }
          if (!hadCollision) break;
        }
      });
    }

    // Adaptively expand horizontal width for tall diagrams using empty side space
    // STRICT RULE: Vertical height (y) is 100% preserved and untouched!
    const bb = cy.nodes().boundingBox();
    if (bb.h > bb.w && bb.w > 10) {
      const centerX = (bb.x1 + bb.x2) / 2;
      // Target width uses a healthy portion of the side space (up to ~75% of height or 2.8x current width)
      const targetW = Math.min(bb.h * 0.75, bb.w * 2.8);
      const xMultiplier = Math.max(1.0, targetW / bb.w);
      if (xMultiplier > 1.05) {
        cy.batch(() => {
          cy.nodes().forEach(node => {
            const p = node.position();
            node.position({
              x: centerX + (p.x - centerX) * xMultiplier,
              y: p.y // VERTICAL HEIGHT KEPT EXACTLY THE SAME
            });
          });
        });
      }
    }

    cy.fit(undefined, 50);

    // Save initial pristine coordinates to enable 1-click full reset
    initialCleanPositionsRef.current.clear();
    cy.nodes().forEach(n => {
      initialCleanPositionsRef.current.set(n.id(), { ...n.position() });
    });
    setIsGraphModified(false);

    // BloodHound-style scale-adaptive font sizing:
    // When zoomed OUT (diagram overview is big), labels scale UP in world space so text remains clearly readable.
    // When zoomed IN, labels scale DOWN in world space so text doesn't bloat up and crowd the nodes and edges.
    let zoomRaf = null;
    let lastZ = -1;
    const updateAdaptiveFonts = () => {
      if (!cyRef.current) return;
      const z = cyRef.current.zoom();
      if (lastZ > 0 && Math.abs(z - lastZ) / lastZ < 0.035) return;
      lastZ = z;

      // Optical zoom dampening curve:
      const nodeFont = Math.round(Math.min(26, Math.max(7, 11 / Math.pow(z, 0.68))));
      // On dense graphs (>60 edges), cap edgeFont at 10px so 200+ edge labels don't collide or obscure nodes
      const maxEdge = finalEdgeCount > 60 ? 10 : 20;
      const baseEdge = finalEdgeCount > 60 ? 6.5 : 8.5;
      const edgeFont = Math.round(Math.min(maxEdge, Math.max(5, baseEdge / Math.pow(z, 0.55))));
      const nodeMargin = Math.round(Math.min(12, Math.max(4, 6 / Math.pow(z, 0.5))));

      cyRef.current.batch(() => {
        cyRef.current.nodes(':not(:hover):not(.selected):not(.hide-node-labels)').style({
          'font-size': `${nodeFont}px`,
          'text-margin-y': nodeMargin
        });
        cyRef.current.edges(':not(:hover):not(.selected):not(.hide-edge-labels)').style({
          'font-size': `${edgeFont}px`
        });
      });
    };

    cy.on('zoom', () => {
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      zoomRaf = requestAnimationFrame(updateAdaptiveFonts);
    });

    // Track user drag, zoom, and pan modifications so the Clear Graph button appears on any change
    cy.on('dragfree', 'node', () => {
      setIsGraphModified(true);
    });
    cy.on('userzoom', () => {
      setIsGraphModified(true);
    });
    cy.on('userpan', () => {
      setIsGraphModified(true);
    });

    updateAdaptiveFonts();

    // Click Node
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nid = node.id();
      setSelectedNode(nid);
      setSelectedEdge(null);

      // Check if we are currently in an isolated sub-graph view (some elements are hidden)
      const hasHidden = cy.elements('.hidden').length > 0;
      if (hasHidden) {
        // Keep hidden elements hidden; only manage selection on visible elements
        const visible = cy.elements().not('.hidden');
        visible.removeClass('selected in-chain faded');
        visible.addClass('faded');
        node.removeClass('faded').addClass('selected');

        const visibleConnectedEdges = node.connectedEdges().not('.hidden');
        visibleConnectedEdges.removeClass('faded').addClass('in-chain');
        visibleConnectedEdges.connectedNodes().not('.hidden').removeClass('faded').addClass('in-chain');
      } else {
        // Full graph: blur/fade all other nodes immediately on 1st click
        cy.elements().removeClass('selected in-chain faded');
        cy.elements().addClass('faded');

        const predecessors = node.predecessors();
        const successors = node.successors();
        const direct = node.closedNeighborhood();
        const chain = node.union(predecessors).union(successors).union(direct);
        chain.removeClass('faded').addClass('in-chain');
        node.removeClass('faded').addClass('selected');
      }

      const connectedEdges = [];

      node.connectedEdges().forEach(edge => {
        const d = edge.data('_detail') || {};
        const dList = edge.data('_detailList');
        const isTarget = edge.target().id() === nid;
        const otherNode = isTarget ? edge.source() : edge.target();
        const otherLabel = otherNode.data('fullLabel') || otherNode.data('label') || otherNode.id().replace(/^m:/, '');
        const otherType = otherNode.data('entityType') || 'machine';

        const baseMeta = {
          _dir: edge.data('dir'),
          _isTarget: isTarget,
          _direction: isTarget ? 'in' : 'out',
          _otherLabel: otherLabel,
          _otherType: otherType,
          protocol: d.protocol || edge.data('label') || '',
          src: isTarget ? otherLabel : (node.data('fullLabel') || node.data('label')),
          dst: isTarget ? (node.data('fullLabel') || node.data('label')) : otherLabel,
          count: edge.data('count') || d.count || 1
        };

        if (dList && dList.length > 0) {
          dList.forEach(item => {
            if (item) connectedEdges.push({ ...item, ...baseMeta });
          });
        } else if (d) {
          connectedEdges.push({ ...d, ...baseMeta });
        } else {
          connectedEdges.push(baseMeta);
        }
      });
      connectedEdges.sort((a, b) => (b.count || 1) - (a.count || 1));

      if (callbacksRef.current.onSelectNode) {
        callbacksRef.current.onSelectNode({
          id: nid,
          label: node.data('fullLabel') || node.data('label'),
          shortLabel: node.data('shortLabel'),
          fullLabel: node.data('fullLabel'),
          subLabel: node.data('subLabel'),
          entityType: node.data('entityType'),
          isCrownJewel: node.data('isCrownJewel'),
          raw: node.data('raw'),
          rows: connectedEdges
        });
      }
    });

    // Click Edge
    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const eid = edge.id();
      setSelectedEdge(eid);
      setSelectedNode(null);

      cy.elements().removeClass('selected in-chain faded');
      cy.elements().addClass('faded');
      edge.removeClass('faded').addClass('in-chain');
      edge.source().removeClass('faded').addClass('in-chain');
      edge.target().removeClass('faded').addClass('in-chain');

      const edgeData = edge.data();
      if (callbacksRef.current.onSelectEdge && edgeData._detail) {
        callbacksRef.current.onSelectEdge({
          id: eid,
          label: edgeData.label,
          dir: edgeData.dir,
          color: edgeData.color,
          source: edge.source().data('fullLabel') || edge.source().id(),
          target: edge.target().data('fullLabel') || edge.target().id(),
          detail: edgeData._detail,
          rows: edgeData._detailList || [edgeData._detail]
        });
      }
    });

    // Click Background Stage (Deselect without resetting dragged positions or zooming out)
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
        const hasHidden = cy.elements('.hidden').length > 0;
        if (!hasHidden) {
          cy.elements().removeClass('selected in-chain faded hovered');
        } else {
          cy.elements().not('.hidden').removeClass('selected in-chain faded hovered');
        }
        if (callbacksRef.current.onClearSelection) {
          callbacksRef.current.onClearSelection();
        }
      }
    });

    // Hover indicators
    cy.on('mouseover', 'node', (evt) => {
      evt.target.addClass('hovered');
    });
    cy.on('mouseout', 'node', (evt) => {
      evt.target.removeClass('hovered');
    });
    cy.on('mouseover', 'edge', (evt) => {
      evt.target.addClass('hovered');
    });
    cy.on('mouseout', 'edge', (evt) => {
      evt.target.removeClass('hovered');
    });

    // Automatic container resize observer
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (cyRef.current) {
          cyRef.current.resize();
        }
      }, 60);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearTimeout(resizeTimer);
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [dataKey]);

  // Dynamic Redesign & Radial Layout when focusedCategory or selectedNode changes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Case A: Full graph mode (show all nodes)
    if (!focusedCategory || focusedCategory === 'all') {
      cy.elements().removeClass('hidden');

      if (!selectedNode) {
        cy.elements().removeClass('selected in-chain faded');
        return;
      }

      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      // Ensure all other nodes are blurred/faded immediately on 1st click
      cy.elements().removeClass('selected in-chain faded');
      cy.elements().addClass('faded');

      const predecessors = node.predecessors();
      const successors = node.successors();
      const direct = node.closedNeighborhood();
      const chain = node.union(predecessors).union(successors).union(direct);
      chain.removeClass('faded').addClass('in-chain');
      node.removeClass('faded').addClass('selected');
      // DO NOT animate fit or reset coordinates! Keep camera and dragged positions intact.
      return;
    }

    // When focus isolation is active, but no node is selected (e.g. side panel was closed or canvas tapped)
    if (!selectedNode) {
      // Keep hidden elements completely hidden! Do NOT reveal background nodes.
      // Clean up selection and fading on the visible elements
      cy.elements().not('.hidden').removeClass('selected in-chain faded hovered');
      return;
    }

    // Case B: Subgraph is isolated (user clicked a node within the isolated sub-graph)
    if (focusedCategory === 'isolated') {
      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      // Keep hidden elements hidden; only manage selection on visible elements
      const visible = cy.elements().not('.hidden');
      visible.removeClass('selected in-chain faded');
      visible.addClass('faded');
      node.removeClass('faded').addClass('selected');

      const visibleConnectedEdges = node.connectedEdges().not('.hidden');
      visibleConnectedEdges.removeClass('faded').addClass('in-chain');
      visibleConnectedEdges.connectedNodes().not('.hidden').removeClass('faded').addClass('in-chain');
      return;
    }

    // Case C: Full Attack Path Mode (Trace complete kill chain from entry points to crown jewels)
    if (focusedCategory === 'full_path') {
      if (!selectedNode) return;
      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      const predecessors = node.predecessors();
      const successors = node.successors();
      const direct = node.closedNeighborhood();
      const fullPath = node.union(predecessors).union(successors).union(direct);

      // Completely hide all elements not part of the full attack path
      cy.elements().difference(fullPath).addClass('hidden');
      fullPath.removeClass('hidden faded').addClass('in-chain');
      node.addClass('selected');

      if (fullPath.nodes().length > 1) {
        fullPath.layout({
          name: 'dagre',
          rankDir: 'LR',
          nodeSep: 85,
          rankSep: 220,
          animate: true,
          animationDuration: 350,
          fit: true,
          padding: 80
        }).run();
      }
      return;
    }

    // Case D: Active Category Isolation (inbound, outbound, lateral, ad_attacks, sessions)
    if (!selectedNode) return;
    const node = cy.getElementById(selectedNode);
    if (!node || node.length === 0) return;

    // Filter connected edges by category
    const allConnectedEdges = node.connectedEdges();
    const filteredEdges = allConnectedEdges.filter(edge => {
      const dir = edge.data('dir');
      const label = (edge.data('label') || '').toLowerCase();
      if (focusedCategory === 'inbound') {
        return edge.target().id() === selectedNode || dir === 'in';
      }
      if (focusedCategory === 'outbound') {
        return edge.source().id() === selectedNode || dir === 'out';
      }
      if (focusedCategory === 'lateral') {
        return dir === 'lat' || label === 'memberof' || label === 'containedin' || label === 'adminto' || label === 'smb' || label === 'ssh' || label === 'winrm';
      }
      if (focusedCategory === 'ad_attacks') {
        return dir === 'ad' || label.includes('attack') || ['genericall', 'writedacl', 'writeowner', 'dcsync', 'privilegedsession', 'certipyenum', 'esc1', 'kerberoasting', 'passwordspray', 'overpasshash'].includes(label);
      }
      if (focusedCategory === 'sessions') {
        return dir === 'lat' || label === 'hassession' || label === 'session' || label === 'loggedon';
      }
      return true;
    });

    const activeNodes = node.union(filteredEdges.connectedNodes());
    const subGraph = activeNodes.union(filteredEdges);

    // Completely HIDE all elements not in the focused subGraph (BloodHound focus mode)
    cy.elements().difference(subGraph).addClass('hidden');
    subGraph.removeClass('hidden faded').addClass('in-chain');
    node.addClass('selected');

    if (activeNodes.length > 1) {
      subGraph.layout({
        name: 'concentric',
        concentric: (n) => (n.id() === selectedNode ? 2 : 1),
        levelWidth: () => 1,
        spacingFactor: 1.8,
        animate: true,
        animationDuration: 350,
        fit: true,
        padding: 90
      }).run();
    }
  }, [focusedCategory, selectedNode]);

  // Jump to specific node by name/ID when clicked from BloodHound entity panel
  useEffect(() => {
    if (!focusNodeTarget || !cyRef.current) return;
    const cy = cyRef.current;
    const clean = String(focusNodeTarget).trim().toLowerCase();
    const targetNode = cy.nodes().filter(n => {
      const nid = n.id().toLowerCase();
      const fl = (n.data('fullLabel') || '').toLowerCase();
      const sl = (n.data('label') || '').toLowerCase();
      return nid === 'm:' + clean || nid === clean || fl === clean || sl === clean;
    });
    if (targetNode.length > 0) {
      targetNode.first().trigger('tap');
      cy.animate({
        center: { eles: targetNode.first() },
        zoom: Math.max(cy.zoom(), 1.05)
      }, { duration: 300 });
    }
  }, [focusNodeTarget]);

  // Floating Controls Handlers (Fast & Snappy)
  const handleZoomIn = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() * 1.75,
        renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
      }, { duration: 120 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        zoom: cyRef.current.zoom() / 1.75,
        renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
      }, { duration: 120 });
    }
  }, []);

  const handleResetFit = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.animate({
        fit: { eles: cyRef.current.elements(), padding: 50 }
      }, { duration: 200 });
    }
  }, []);

  const handleFullReset = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setIsGraphModified(false);

    if (cyRef.current) {
      const cy = cyRef.current;
      cy.elements().removeClass('hidden selected in-chain faded hovered');

      // Restore baseline pristine coordinates of all nodes
      if (initialCleanPositionsRef.current && initialCleanPositionsRef.current.size > 0) {
        cy.batch(() => {
          cy.nodes().forEach(n => {
            const pos = initialCleanPositionsRef.current.get(n.id());
            if (pos) {
              n.position({ x: pos.x, y: pos.y });
            }
          });
        });
      }

      // Smoothly re-fit to center the initial graph
      cy.animate({
        fit: { eles: cy.elements(), padding: 50 }
      }, { duration: 300 });
    }

    if (callbacksRef.current.onClearSelection) {
      callbacksRef.current.onClearSelection(true);
    }
  }, []);

  // Detect any modification or active selection from pristine initial stage
  const hasChanges = Boolean(
    selectedNode ||
    selectedEdge ||
    (focusedCategory && focusedCategory !== 'all') ||
    isGraphModified
  );

  // Export JSON Graph Data
  const handleExportJson = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const nodesData = cy.nodes().map(n => ({
      id: n.id(),
      label: n.data('fullLabel') || n.data('label'),
      shortLabel: n.data('shortLabel'),
      entityType: n.data('entityType'),
      isCrownJewel: n.data('isCrownJewel'),
      ip: n.data('subLabel') || '',
      position: n.position()
    }));
    const edgesData = cy.edges().map(e => ({
      id: e.id(),
      source: e.source().data('fullLabel') || e.source().id(),
      target: e.target().data('fullLabel') || e.target().id(),
      label: e.data('label'),
      dir: e.data('dir'),
      count: e.data('count') || 1,
      color: e.data('color'),
      detail: e.data('_detail')
    }));

    const exportPayload = {
      generator: 'IOC Hunt BloodHound Network Topology',
      exportDate: new Date().toISOString(),
      summary: {
        totalNodes: nodesData.length,
        totalEdges: edgesData.length
      },
      nodes: nodesData,
      edges: edgesData
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iochunt_topology_export_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Export High-Res PNG Screenshot
  const handleExportPng = useCallback(() => {
    if (!cyRef.current) return;
    const isLightNow = theme === 'light';
    const pngUri = cyRef.current.png({
      full: true,
      scale: 2.0,
      bg: isLightNow ? '#f8fafc' : '#0b1326'
    });
    const link = document.createElement('a');
    link.href = pngUri;
    link.download = `iochunt_topology_${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [theme]);

  // Jump to Searched Node
  const handleSelectSearchedNode = useCallback((targetId) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    const node = cy.getElementById(targetId);
    if (node && node.length > 0) {
      node.trigger('tap');
      cy.animate({
        center: { eles: node },
        zoom: Math.max(cy.zoom(), 1.25)
      }, { duration: 300 });
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  }, []);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('#bh-bottom-toolbar') && !e.target.closest('#bh-search-popover')) {
        setIsLabelMenuOpen(false);
        setIsLayoutMenuOpen(false);
        setIsDownloadMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isLight = theme === 'light';
  const controlBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.90)';
  const controlBorder = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.14)';
  const controlColor = isLight ? '#0f172a' : '#f8fafc';
  const controlHoverBg = isLight ? '#f1f5f9' : '#1e293b';
  const badgeBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)';
  const badgeBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const badgeText = isLight ? '#0f172a' : 'var(--text)';
  const legendBg = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.85)';
  const legendBorder = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.08)';
  const legendText = isLight ? '#334155' : 'var(--muted)';
  const legendNodeCore = isLight ? '#ffffff' : '#111526';

  const filteredSearchNodes = allGraphNodes.filter(n => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (n.label && n.label.toLowerCase().includes(q)) ||
      (n.shortLabel && n.shortLabel.toLowerCase().includes(q)) ||
      (n.subLabel && n.subLabel.toLowerCase().includes(q)) ||
      (n.entityType && n.entityType.toLowerCase().includes(q))
    );
  }).slice(0, 15);

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
      {/* Cytoscape Canvas Container */}
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

      {/* Top Right Clear & Reset Graph Button (Appears whenever there is any change/selection/drag/zoom) */}
      {hasChanges && (
        <button
          onClick={handleFullReset}
          title="Clear all selections and reset graph to initial view"
          style={{
            position: 'absolute',
            top: '12px',
            right: '14px',
            height: '29px',
            padding: '0 11px',
            background: isLight ? 'rgba(239, 68, 68, 0.09)' : 'rgba(239, 68, 68, 0.16)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'var(--mono)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            transition: 'all 0.15s ease',
            zIndex: 15
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = isLight ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.28)';
            e.currentTarget.style.borderColor = '#ef4444';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = isLight ? 'rgba(239, 68, 68, 0.09)' : 'rgba(239, 68, 68, 0.16)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>restart_alt</span>
          Clear Graph
        </button>
      )}

      {/* Floating Zoom Controls (Right-Hand Side) */}
      <div
        style={{
          position: 'absolute',
          top: '50px',
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
      </div>

      {/* Search Node Floating Popover (Above Search Button) */}
      {isSearchOpen && (
        <div
          id="bh-search-popover"
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '16px',
            width: '300px',
            maxHeight: '360px',
            background: isLight ? '#ffffff' : '#0f172a',
            border: `1px solid ${controlBorder}`,
            borderRadius: '8px',
            boxShadow: isLight ? '0 12px 36px rgba(0,0,0,0.14)' : '0 12px 36px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 999
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${controlBorder}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>search</span>
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search node name or IP…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: isLight ? '#0f172a' : '#f8fafc',
                fontSize: '12px',
                fontFamily: 'var(--mono)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
            {filteredSearchNodes.length > 0 ? (
              filteredSearchNodes.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleSelectSearchedNode(n.id)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    transition: 'background 0.15s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.color || '#3b82f6', flexShrink: 0 }}></span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#0f172a' : '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {n.label}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: `${n.color || '#3b82f6'}22`,
                    color: n.color || '#3b82f6',
                    textTransform: 'uppercase',
                    flexShrink: 0
                  }}>
                    {n.entityType}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
                No matching nodes found
              </div>
            )}
          </div>
        </div>
      )}

      {/* BloodHound CE Authentic Bottom Toolbar (Bottom Left - Matching Reference Image 2) */}
      <div
        id="bh-bottom-toolbar"
        style={{
          position: 'absolute',
          bottom: '14px',
          left: isPanelOpen ? '410px' : '16px',
          transition: 'left 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: controlBg,
          backdropFilter: 'blur(12px)',
          border: `1px solid ${controlBorder}`,
          boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 4px 16px rgba(0,0,0,0.4)',
          borderRadius: '8px',
          padding: '4px',
          zIndex: 40
        }}
      >
        {/* 1. Fit to Screen (crop_free) */}
        <button
          onClick={handleResetFit}
          title="Fit Graph to Screen (Center)"
          style={{
            width: '32px',
            height: '32px',
            background: 'transparent',
            border: 'none',
            borderRadius: '6px',
            color: controlColor,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = controlHoverBg}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>crop_free</span>
        </button>

        {/* 2. Label Visibility (eye icon with popup menu) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsLabelMenuOpen(!isLabelMenuOpen);
              setIsLayoutMenuOpen(false);
              setIsDownloadMenuOpen(false);
              setIsSearchOpen(false);
            }}
            title="Label Visibility Settings"
            style={{
              width: '32px',
              height: '32px',
              background: (!showNodeLabels || !showEdgeLabels) ? (isLight ? '#ede9fe' : '#3b0764') : (isLabelMenuOpen ? controlHoverBg : 'transparent'),
              border: 'none',
              borderRadius: '6px',
              color: (!showNodeLabels || !showEdgeLabels) ? '#a855f7' : controlColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = controlHoverBg}
            onMouseOut={(e) => e.currentTarget.style.background = (!showNodeLabels || !showEdgeLabels) ? (isLight ? '#ede9fe' : '#3b0764') : (isLabelMenuOpen ? controlHoverBg : 'transparent')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {(!showNodeLabels && !showEdgeLabels) ? 'visibility_off' : 'visibility'}
            </span>
          </button>

          {/* BloodHound CE Label Dropdown Menu */}
          {isLabelMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '0',
                minWidth: '170px',
                background: isLight ? '#ffffff' : '#0f172a',
                border: `1px solid ${controlBorder}`,
                borderRadius: '8px',
                boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.12)' : '0 10px 30px rgba(0,0,0,0.6)',
                padding: '6px 0',
                zIndex: 999
              }}
            >
              <button
                onClick={() => {
                  const next = !(showNodeLabels || showEdgeLabels);
                  setShowNodeLabels(next);
                  setShowEdgeLabels(next);
                  setIsLabelMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isLight ? '#0f172a' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {showNodeLabels || showEdgeLabels ? 'Hide All Labels' : 'Show All Labels'}
                {!(showNodeLabels || showEdgeLabels) && (
                  <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 800 }}>HIDDEN</span>
                )}
              </button>

              <button
                onClick={() => {
                  setShowNodeLabels(!showNodeLabels);
                  setIsLabelMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isLight ? '#0f172a' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {showNodeLabels ? 'Hide Node Labels' : 'Show Node Labels'}
                {!showNodeLabels && (
                  <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 800 }}>HIDDEN</span>
                )}
              </button>

              <button
                onClick={() => {
                  setShowEdgeLabels(!showEdgeLabels);
                  setIsLabelMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isLight ? '#0f172a' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {showEdgeLabels ? 'Hide Edge Labels' : 'Show Edge Labels'}
                {!showEdgeLabels && (
                  <span style={{ fontSize: '10px', color: '#a855f7', fontWeight: 800 }}>HIDDEN</span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 3. Layout Selector (schema icon with menu) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsLayoutMenuOpen(!isLayoutMenuOpen);
              setIsLabelMenuOpen(false);
              setIsDownloadMenuOpen(false);
              setIsSearchOpen(false);
            }}
            title="Graph Layout Mode"
            style={{
              width: '32px',
              height: '32px',
              background: isLayoutMenuOpen ? controlHoverBg : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: controlColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = controlHoverBg}
            onMouseOut={(e) => e.currentTarget.style.background = isLayoutMenuOpen ? controlHoverBg : 'transparent'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>schema</span>
          </button>

          {isLayoutMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '0',
                minWidth: '200px',
                background: isLight ? '#ffffff' : '#0f172a',
                border: `1px solid ${controlBorder}`,
                borderRadius: '8px',
                boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.12)' : '0 10px 30px rgba(0,0,0,0.6)',
                padding: '6px 0',
                zIndex: 999
              }}
            >
              <button
                onClick={() => { setLayoutMode('fcose'); setIsLayoutMenuOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: layoutMode === 'fcose' ? (isLight ? '#eff6ff' : '#1e3a8a') : 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: layoutMode === 'fcose' ? '#3b82f6' : (isLight ? '#0f172a' : '#f8fafc'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => { if (layoutMode !== 'fcose') e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'; }}
                onMouseOut={(e) => { if (layoutMode !== 'fcose') e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>scatter_plot</span>
                Organic (fCoSE Spring)
              </button>

              <button
                onClick={() => { setLayoutMode('dagre'); setIsLayoutMenuOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: layoutMode === 'dagre' ? (isLight ? '#f3e8ff' : '#581c87') : 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: layoutMode === 'dagre' ? '#a855f7' : (isLight ? '#0f172a' : '#f8fafc'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => { if (layoutMode !== 'dagre') e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'; }}
                onMouseOut={(e) => { if (layoutMode !== 'dagre') e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>account_tree</span>
                Tree (Hierarchical DAG)
              </button>

              <button
                onClick={() => { setLayoutMode('cluster'); setIsLayoutMenuOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: layoutMode === 'cluster' ? (isLight ? '#fef9c3' : '#713f12') : 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: layoutMode === 'cluster' ? '#eab308' : (isLight ? '#0f172a' : '#f8fafc'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => { if (layoutMode !== 'cluster') e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'; }}
                onMouseOut={(e) => { if (layoutMode !== 'cluster') e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hub</span>
                Stars (Radial Concentric)
              </button>
            </div>
          )}
        </div>

        {/* 4. Download Export (download icon with JSON & PNG options) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsDownloadMenuOpen(!isDownloadMenuOpen);
              setIsLabelMenuOpen(false);
              setIsLayoutMenuOpen(false);
              setIsSearchOpen(false);
            }}
            title="Download Graph Data / PNG Image"
            style={{
              width: '32px',
              height: '32px',
              background: isDownloadMenuOpen ? controlHoverBg : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: controlColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = controlHoverBg}
            onMouseOut={(e) => e.currentTarget.style.background = isDownloadMenuOpen ? controlHoverBg : 'transparent'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>download</span>
          </button>

          {isDownloadMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '0',
                minWidth: '200px',
                background: isLight ? '#ffffff' : '#0f172a',
                border: `1px solid ${controlBorder}`,
                borderRadius: '8px',
                boxShadow: isLight ? '0 10px 30px rgba(0,0,0,0.12)' : '0 10px 30px rgba(0,0,0,0.6)',
                padding: '6px 0',
                zIndex: 999
              }}
            >
              <button
                onClick={() => { handleExportJson(); setIsDownloadMenuOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isLight ? '#0f172a' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>data_object</span>
                Download JSON Data
              </button>

              <button
                onClick={() => { handleExportPng(); setIsDownloadMenuOpen(false); }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 16px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: isLight ? '#0f172a' : '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#10b981' }}>image</span>
                Export PNG Screenshot
              </button>
            </div>
          )}
        </div>

        {/* 5. Search Node (search icon with popover) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              setIsLabelMenuOpen(false);
              setIsLayoutMenuOpen(false);
              setIsDownloadMenuOpen(false);
            }}
            title="Search and Highlight Node"
            style={{
              width: '32px',
              height: '32px',
              background: isSearchOpen ? (isLight ? '#eff6ff' : '#1e3a8a') : 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: isSearchOpen ? '#3b82f6' : controlColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = controlHoverBg}
            onMouseOut={(e) => e.currentTarget.style.background = isSearchOpen ? (isLight ? '#eff6ff' : '#1e3a8a') : 'transparent'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>search</span>
          </button>
        </div>
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
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #ef4444', background: legendNodeCore }}></span> Workstation
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #06b6d4', background: legendNodeCore }}></span> Server
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #22c55e', background: legendNodeCore }}></span> User
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #eab308', background: legendNodeCore }}></span> Group
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #a855f7', background: legendNodeCore }}></span> DC / CA
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #64748b', background: legendNodeCore }}></span> WAN IP
        </span>
      </div>
    </div>
  );
}
