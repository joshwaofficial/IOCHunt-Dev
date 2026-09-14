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

function getBloodHoundSubtitle(entityType, raw = {}) {
  const type = String(entityType || '').toLowerCase();
  if (type === 'user') return 'Active Directory | User';
  if (type === 'group') return 'Active Directory | Group';
  if (type === 'machine' || type === 'computer') {
    if (raw.is_dc || (raw.name && String(raw.name).toUpperCase().includes('DC'))) {
      return 'Active Directory | Domain Controller';
    }
    return 'Active Directory | Computer';
  }
  if (type === 'ou') return 'Active Directory | OU';
  if (type === 'container') return 'Active Directory | Container';
  if (type === 'dc') return 'Active Directory | Domain Controller';
  if (type === 'domain') return 'Active Directory | Domain';
  if (type === 'gpo') return 'Active Directory | GPO';
  if (type === 'actor') return 'Attacker | Threat Actor';
  if (type === 'ad_attack') return 'Threat | AD Attack';
  if (type === 'ip_external') return 'Network | External IP';
  if (type === 'ip_private') return 'Network | Internal IP';
  return 'Active Directory | Object';
}

function formatNodeLabel(cleanId, entityType, raw = {}) {
  if (!cleanId) return '';
  let name = String(cleanId).trim();
  if (name.length > 28) {
    name = name.slice(0, 25) + '…';
  }
  const subtitle = getBloodHoundSubtitle(entityType, raw);
  return `${name}\n${subtitle}`;
}

function baseNodeSize(order) {
  if (order <= 30)  return 52;
  if (order <= 80)  return 48;
  if (order <= 160) return 44;
  if (order <= 300) return 40;
  if (order <= 600) return 36;
  return 32;
}

const getCytoscapeStylesheet = (theme) => {
  const isLight = theme !== 'dark';
  return [
    // Base Node Style - BloodHound solid circle with centered silhouette icon
    {
      selector: 'node',
      style: {
        'width': 'data(size)',
        'height': 'data(size)',
        'shape': 'ellipse',
        'background-color': 'data(bgColor)',
        'border-width': 'data(borderWidth)',
        'border-color': 'data(borderColor)',
        'background-image': 'data(svgIcon)',
        'background-fit': 'contain',
        'background-width': '58%',
        'background-height': '58%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip': 'node',
        'label': 'data(displayLabel)',
        'text-wrap': 'wrap',
        'text-max-width': 220,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        'font-size': '12px',
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-margin-y': 8,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-outline-color': isLight ? '#ffffff' : '#0b1326',
        'text-outline-width': 2.5,
        'text-outline-opacity': 0.95,
        'text-background-opacity': 0, // Clean halo like BloodHound, NO thick boxy border!
        'min-zoomed-font-size': 4,    // Labels remain visible dynamically during zoom
        'z-index': 10,
        'transition-property': 'opacity, border-color, border-width, text-opacity',
        'transition-duration': '0.15s'
      }
    },
    // Hovered Node: Highlighted border ring
    {
      selector: 'node:hover',
      style: {
        'border-width': 4.5,
        'border-color': isLight ? '#0284c7' : '#38bdf8',
        'min-zoomed-font-size': 0,
        'z-index': 95
      }
    },
    // Crown Jewels / Landmark Nodes (Domain Admin, DC, Krbtgt, RootCA)
    {
      selector: 'node[?isCrownJewel]',
      style: {
        'min-zoomed-font-size': 0,
        'z-index': 30,
        'border-width': 4.0,
        'border-color': isLight ? '#b45309' : '#f59e0b'
      }
    },
    // Active Selection Node
    {
      selector: 'node.selected',
      style: {
        'border-color': isLight ? '#0284c7' : '#38bdf8',
        'border-width': 5.0,
        'label': 'data(fullLabel)', // Reveal full label when clicked
        'min-zoomed-font-size': 0,
        'z-index': 100,
        'opacity': 1.0,
        'text-opacity': 1.0
      }
    },
    // Connected Attack Chain Nodes
    {
      selector: 'node.in-chain',
      style: {
        'border-width': 3.5,
        'border-color': isLight ? '#2563eb' : '#60a5fa',
        'min-zoomed-font-size': 0,
        'z-index': 60,
        'opacity': 1.0,
        'text-opacity': 1.0
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
    // Base Edge Style: Clean directed bezier lines with clear relationship labels
    {
      selector: 'edge',
      style: {
        'width': 'data(width)',
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.2,
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
        'font-size': '10px',
        'font-weight': 600,
        'color': isLight ? '#334155' : '#cbd5e1',
        'text-outline-color': isLight ? '#ffffff' : '#0b1326',
        'text-outline-width': 2.0,
        'text-outline-opacity': 0.95,
        'text-background-opacity': 0, // Clean text halo like BloodHound
        'text-rotation': 'autorotate',
        'min-zoomed-font-size': 6,    // Clear relationship names visible at normal zoom
        'z-index': 5,
        'transition-property': 'opacity, width, line-color, target-arrow-color',
        'transition-duration': '0.15s'
      }
    },
    // Hovered Edge: Reveal label immediately!
    {
      selector: 'edge:hover',
      style: {
        'width': 3.5,
        'min-zoomed-font-size': 0,
        'z-index': 90
      }
    },
    // Selected / Active Attack Chain Edges: Reveal label immediately!
    {
      selector: 'edge.in-chain, edge.selected',
      style: {
        'width': 3.5,
        'line-color': isLight ? '#2563eb' : '#60a5fa',
        'target-arrow-color': isLight ? '#2563eb' : '#60a5fa',
        'min-zoomed-font-size': 0, // Reveal relationship name on active chain!
        'z-index': 70,
        'opacity': 1.0,
        'text-opacity': 1.0
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
  onSelectNode,
  onSelectEdge,
  onClearSelection
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const callbacksRef = useRef({ onSelectNode, onSelectEdge, onClearSelection });
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [layoutMode, setLayoutMode] = useState('fcose'); // 'fcose' (Organic) | 'dagre' (Tree) | 'cluster' (Stars)
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onSelectEdge, onClearSelection };
  }, [onSelectNode, onSelectEdge, onClearSelection]);

  // Update Cytoscape stylesheet when theme changes
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.style(getCytoscapeStylesheet(theme));
    }
  }, [theme]);

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
      return;
    }

    const elements = [];
    const nodeSet = new Set();
    const edgeSet = new Set();

    // Pre-calculate approx order
    const approxOrder = machines.length + totalConnections;
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
      const cleanId = String(id).trim();
      const nid = 'm:' + cleanId;
      if (!nodeSet.has(nid)) {
        nodeSet.add(nid);
        const u = cleanId.toUpperCase();
        let eType = type;
        if (eType === 'machine' || eType === 'computer') {
          if (u.includes('ADMINS') || u.includes('OPERATORS') || u.includes('USERS') || u.includes('GROUP')) eType = 'group';
          else if (cleanId.includes('@')) eType = 'user';
          else if (u.includes('DC') || u.includes('DOMAIN')) eType = 'dc';
          else if (u.startsWith('OU=') || u.includes('OU') || u.includes('CONTAINER')) eType = 'ou';
          else eType = 'machine';
        }
        const col = KIND_COLORS[eType] || KIND_COLORS.default;
        const isCrown = isCrownJewelCheck(cleanId, raw);
        const displayLabel = formatNodeLabel(cleanId, eType, raw);
        const iconSvg = getNodeSvgDataUri(eType, '#0f172a');

        elements.push({
          group: 'nodes',
          data: {
            id: nid,
            label: displayLabel,
            displayLabel: displayLabel,
            shortLabel: cleanId.length > 25 ? cleanId.slice(0, 23) + '…' : cleanId,
            fullLabel: cleanId,
            subLabel: getBloodHoundSubtitle(eType, raw),
            entityType: eType,
            isCrownJewel: isCrown,
            size: isCrown ? Math.round(nSize * 1.25) : nSize,
            bgColor: col,
            color: col,
            borderColor: isLight ? '#0f172a' : '#1e293b',
            borderWidth: isCrown ? 4.0 : 2.5,
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

    // Process Inbound
    inbound.forEach((c, idx) => {
      const fromId = ensureNode(c.from_ip || c.from_machine, isPrivate(c.from_ip || '') ? 'ip_private' : 'ip_external');
      const toId = ensureNode(c.to_machine || c.to_ip, 'machine');
      if (fromId && toId && fromId !== toId) {
        const eid = `e_in_${idx}_${fromId}_${toId}`;
        if (!edgeSet.has(eid)) {
          edgeSet.add(eid);
          const bl = c.blocked > 0;
          const col = bl ? '#ef4444' : '#3b82f6';
          elements.push({
            group: 'edges',
            data: {
              id: eid,
              source: fromId,
              target: toId,
              label: c.protocol || 'INBOUND',
              dir: 'in',
              color: col,
              width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
              _detail: {
                first_seen: c.first_seen, last_seen: c.last_seen,
                src: c.from_machine || c.from_ip || '?', dst: c.to_machine || c.to_ip || '?',
                protocol: c.protocol || '', port: c.port || '',
                count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
                extra: c.description || (bl ? 'BLOCKED' : '')
              }
            }
          });
        }
      }
    });

    // Process Outbound
    outbound.forEach((c, idx) => {
      const fromId = ensureNode(c.from_machine, 'machine');
      const toId = ensureNode(c.to_ip || c.to_machine, isPrivate(c.to_ip || '') ? 'ip_private' : 'ip_external');
      if (fromId && toId && fromId !== toId) {
        const eid = `e_out_${idx}_${fromId}_${toId}`;
        if (!edgeSet.has(eid)) {
          edgeSet.add(eid);
          const bl = c.blocked > 0;
          const col = bl ? '#ef4444' : '#10b981';
          elements.push({
            group: 'edges',
            data: {
              id: eid,
              source: fromId,
              target: toId,
              label: c.protocol || 'OUTBOUND',
              dir: 'out',
              color: col,
              width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
              _detail: {
                first_seen: c.first_seen, last_seen: c.last_seen,
                src: c.from_machine || '?', dst: c.to_machine || c.to_ip || '?',
                protocol: c.protocol || '', port: c.port || '',
                count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
                extra: c.description || (bl ? 'BLOCKED' : '')
              }
            }
          });
        }
      }
    });

    // Process Lateral
    lateral.forEach((c, idx) => {
      const fromId = ensureNode(c.source, c.source.includes('@') ? 'user' : 'machine');
      const toId = ensureNode(c.target, 'machine');
      if (fromId && toId && fromId !== toId) {
        const eid = `e_lat_${idx}_${fromId}_${toId}`;
        if (!edgeSet.has(eid)) {
          edgeSet.add(eid);
          const bl = c.blocked > 0;
          const isMemberOf = c.protocol === 'MemberOf';
          const col = bl ? '#ef4444' : (isMemberOf ? '#3b82f6' : (c.severity === 'critical' ? '#ef4444' : '#f97316'));
          elements.push({
            group: 'edges',
            data: {
              id: eid,
              source: fromId,
              target: toId,
              label: c.protocol || 'LATERAL',
              dir: 'lat',
              color: col,
              width: Math.min(2.5 + Math.log((c.count || 1) + 1), 5.5),
              _detail: {
                first_seen: c.first_seen, last_seen: c.last_seen,
                src: c.source, dst: c.target,
                protocol: c.protocol || '', port: c.port || '',
                count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'critical',
                extra: c.description || (bl ? 'BLOCKED' : '')
              }
            }
          });
        }
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
        const eid = `e_ad_${idx}_${fromId}_${toId}`;
        if (!edgeSet.has(eid)) {
          edgeSet.add(eid);
          const col = adCol(a.attack_type);
          elements.push({
            group: 'edges',
            data: {
              id: eid,
              source: fromId,
              target: toId,
              label: a.attack_type || 'AD ATTACK',
              dir: 'ad',
              color: col,
              width: Math.min(3 + Math.log((a.count || 1) + 1), 6),
              _detail: {
                first_seen: a.first_seen, last_seen: a.last_seen,
                src: a.actor || a.remote_ip || '?', dst: a.target_machine || '?',
                protocol: a.protocol || a.attack_type, port: '-',
                count: a.count || 1, blocked: 0, severity: a.severity || 'critical',
                extra: a.description || `AD Attack: ${a.attack_type}`
              }
            }
          });
        }
      }
    });

    const finalNodeCount = nodeSet.size;
    const finalEdgeCount = edgeSet.size;
    requestAnimationFrame(() => {
      setCounts({ nodes: finalNodeCount, edges: finalEdgeCount });
    });

    // Initialize Cytoscape instance with fast, responsive zoom
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet(theme),
      minZoom: 0.02,
      maxZoom: 8.0,
      wheelSensitivity: 1.2, // 5x faster mouse wheel zooming (was 0.25)
      boxSelectionEnabled: false
    });

    cyRef.current = cy;
    window.__cy = cy;

    // Run active layout with massive spread
    let layoutOpts;
    if (layoutMode === 'dagre') {
      layoutOpts = {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: finalNodeCount > 100 ? 90 : 130, // Vertical spacing untouched
        rankSep: finalNodeCount > 100 ? 600 : Math.min(1800, 600 + finalNodeCount * 30), // Generous rank separation
        ranker: 'network-simplex',
        animate: false,
        padding: 50
      };
    } else if (layoutMode === 'cluster') {
      // Stars / Concentric
      layoutOpts = {
        name: 'concentric',
        concentric: (node) => (node.data('isCrownJewel') ? 10 : (node.degree() >= 4 ? 6 : 2)),
        levelWidth: () => 3,
        minNodeSpacing: finalNodeCount > 100 ? 120 : 180,
        spacingFactor: 1.8,
        animate: false,
        padding: 50
      };
    } else {
      // fCoSE (BloodHound default organic layout) — expansive spring physics
      layoutOpts = {
        name: 'fcose',
        quality: 'default',
        randomize: true,
        animate: false,
        fit: true,
        padding: 50,
        nodeDimensionsIncludeLabels: true,
        uniformNodeDimensions: false,
        packComponents: true,
        nodeRepulsion: finalNodeCount > 150 ? 120000 : (finalNodeCount > 60 ? 95000 : 75000),
        idealEdgeLength: finalNodeCount > 150 ? 420 : (finalNodeCount > 60 ? 360 : 300),
        edgeElasticity: 0.08,
        nestingFactor: 0.1,
        gravity: 0.04,
        gravityRange: 3.8,
        numIter: 3000,
        tile: true,
        tilingPaddingVertical: 120,
        tilingPaddingHorizontal: 120,
        nodeSeparation: finalNodeCount > 100 ? 220 : 280
      };
    }

    const l = cy.layout(layoutOpts);
    l.run();

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

    // Dynamic Zoom-in & Zoom-out Handler for BloodHound-style crisp labels
    let zoomRaf = null;
    const updateDynamicZoom = () => {
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      zoomRaf = requestAnimationFrame(() => {
        if (!cyRef.current) return;
        const z = cyRef.current.zoom();

        // Calculate dynamic font size in model coordinates:
        // Keeps on-screen font size comfortably between ~10px and ~14px across all zoom scales!
        const targetScreenPx = Math.max(9.5, Math.min(13.5, 11 * Math.pow(z, 0.25)));
        const dynamicNodeFontSize = Math.max(12, Math.min(38, Math.round(targetScreenPx / z)));
        const dynamicMargin = Math.max(6, Math.min(16, Math.round(dynamicNodeFontSize * 0.4)));

        // Edge label visibility & scaling
        const edgeOpacity = z < 0.30 ? 0 : Math.min(1, (z - 0.30) / 0.20);
        const dynamicEdgeFontSize = Math.max(9, Math.min(22, Math.round(9 / z)));

        cyRef.current.batch(() => {
          cyRef.current.nodes().style({
            'font-size': dynamicNodeFontSize,
            'text-margin-y': dynamicMargin
          });
          cyRef.current.edges().style({
            'font-size': dynamicEdgeFontSize,
            'text-opacity': edgeOpacity
          });
        });
      });
    };

    cy.on('zoom', updateDynamicZoom);
    updateDynamicZoom();

    // Click Node
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nid = node.id();
      setSelectedNode(nid);
      setSelectedEdge(null);

      // Trace connected chain
      cy.elements().removeClass('selected in-chain faded');
      cy.elements().addClass('faded');

      const predecessors = node.predecessors();
      const successors = node.successors();
      const chain = node.union(predecessors).union(successors);
      chain.removeClass('faded').addClass('in-chain');
      node.addClass('selected');

      const connectedEdges = [];
      node.connectedEdges().forEach(edge => {
        const d = edge.data('_detail');
        if (d) connectedEdges.push({ ...d, _dir: edge.data('dir') });
      });
      connectedEdges.sort((a, b) => (b.count || 1) - (a.count || 1));

      if (callbacksRef.current.onSelectNode) {
        callbacksRef.current.onSelectNode({
          id: nid,
          label: node.data('fullLabel'),
          subLabel: node.data('subLabel'),
          entityType: node.data('entityType'),
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
          detail: edgeData._detail
        });
      }
    });

    // Click Background Stage
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
        cy.elements().removeClass('selected in-chain faded');
        if (callbacksRef.current.onClearSelection) {
          callbacksRef.current.onClearSelection();
        }
      }
    });

    // Hover indicators
    cy.on('mouseover', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'node', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    });
    cy.on('mouseover', 'edge', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'pointer';
    });
    cy.on('mouseout', 'edge', () => {
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    });

    // ResizeObserver
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (cyRef.current) {
          cyRef.current.resize();
        }
      }, 100);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      clearTimeout(resizeTimer);
      if (zoomRaf) cancelAnimationFrame(zoomRaf);
      if (cyRef.current) {
        cyRef.current.off('zoom', updateDynamicZoom);
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [dataKey]);

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

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
    if (cyRef.current) {
      cyRef.current.elements().removeClass('selected in-chain faded');
    }
    if (onClearSelection) onClearSelection();
  }, [onClearSelection]);

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

        {/* Layout Switcher: fCoSE | Tree | Stars */}
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
            onClick={() => setLayoutMode('fcose')}
            title="fCoSE Organic Spring Layout (Official BloodHound)"
            style={{
              height: '26px',
              padding: '0 6px',
              background: layoutMode === 'fcose' ? (isLight ? '#dbeafe' : '#1e3a8a') : 'transparent',
              border: layoutMode === 'fcose' ? '1px solid #3b82f6' : '1px solid transparent',
              borderRadius: '4px',
              color: layoutMode === 'fcose' ? '#3b82f6' : controlColor,
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
            fCoSE
          </button>

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
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#f87171', display: 'inline-block' }}></span> Host / Computer
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#22c55e', display: 'inline-block' }}></span> User
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#facc15', display: 'inline-block' }}></span> Group
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#fb923c', display: 'inline-block' }}></span> OU / Container
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#ef4444', display: 'inline-block' }}></span> AD Attack
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: isLight ? '1.5px solid #0f172a' : '1.5px solid #334155', background: '#94a3b8', display: 'inline-block' }}></span> WAN IP
        </span>
      </div>
    </div>
  );
}
