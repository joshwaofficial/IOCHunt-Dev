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

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
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
  if (order <= 25)  return 60;
  if (order <= 60)  return 52;
  if (order <= 120) return 46;
  if (order <= 250) return 40;
  return 34;
}

const getCytoscapeStylesheet = (theme, showNodeLabels = true, showEdgeLabels = true) => {
  const isLight = theme !== 'dark';
  return [
    {
      selector: 'node',
      style: {
        'width': 'data(size)',
        'height': 'data(size)',
        'shape': 'ellipse',
        'background-color': isLight ? '#ffffff' : '#1e293b',
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
        'overlay-opacity': 0,
        'label': showNodeLabels ? 'data(shortLabel)' : '',
        'text-opacity': showNodeLabels ? 1.0 : 0,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size': '12px',
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showNodeLabels ? 0.95 : 0,
        'text-background-padding': '2px 5px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.12)',
        'text-border-width': showNodeLabels ? 1 : 0,
        'min-zoomed-font-size': showNodeLabels ? 0 : 9999,
        'z-index': 10,
        'transition-property': 'opacity, border-color, border-width, text-opacity, outline-width, outline-color',
        'transition-duration': '0.15s'
      }
    },
    {
      selector: ':active, :selected',
      style: {
        'overlay-opacity': 0,
        'overlay-padding': 0
      }
    },
    {
      selector: 'node.hovered',
      style: {
        'min-zoomed-font-size': 0,
        'label': 'data(fullLabel)',
        'text-opacity': 1.0,
        'text-background-opacity': 0.95,
        'text-border-width': 1,
        'border-width': 3.5,
        'border-color': 'data(borderColor)',
        'outline-width': 3.5,
        'outline-color': '#06b6d4',
        'outline-offset': 3,
        'outline-opacity': 1.0,
        'outline-style': 'solid',
        'z-index': 95
      }
    },
    {
      selector: 'node.selected',
      style: {
        'border-color': 'data(borderColor)',
        'border-width': 4.0,
        'outline-width': 4.0,
        'outline-color': '#06b6d4',
        'outline-offset': 4.0,
        'outline-opacity': 1.0,
        'outline-style': 'solid',
        'label': 'data(fullLabel)',
        'text-opacity': 1.0,
        'text-background-color': '#06b6d4',
        'color': '#ffffff',
        'text-border-color': '#06b6d4',
        'text-background-opacity': 1.0,
        'min-zoomed-font-size': 0,
        'z-index': 100,
        'opacity': 1.0
      }
    },
    {
      selector: 'node.in-chain',
      style: {
        'border-width': 3.5,
        'border-color': 'data(borderColor)',
        'outline-width': 0,
        'outline-opacity': 0,
        'min-zoomed-font-size': 0,
        'z-index': 60,
        'opacity': 1.0,
        'text-opacity': showNodeLabels ? 1.0 : 0
      }
    },
    {
      selector: 'node.faded',
      style: {
        'opacity': 0.20,
        'text-opacity': 0,
        'z-index': 1
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2.0,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.1,
        'curve-style': 'bezier',
        'label': showEdgeLabels ? 'data(label)' : '',
        'text-opacity': showEdgeLabels ? 1.0 : 0,
        'font-family': 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        'font-size': '10px',
        'font-weight': 700,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showEdgeLabels ? 0.95 : 0,
        'text-background-padding': '2px 5px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': 'data(color)',
        'text-border-width': showEdgeLabels ? 1 : 0,
        'text-rotation': 'autorotate',
        'text-margin-y': -7,
        'min-zoomed-font-size': showEdgeLabels ? 0 : 9999,
        'z-index': 5,
        'opacity': 0.85,
        'transition-property': 'opacity, width, line-color, target-arrow-color',
        'transition-duration': '0.15s'
      }
    },
    {
      selector: 'edge.in-chain',
      style: {
        'width': 3.8,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 1.3,
        'opacity': 1.0,
        'z-index': 80,
        'text-opacity': 1.0,
        'text-background-opacity': 1.0,
        'text-border-width': 1.5,
        'min-zoomed-font-size': 0
      }
    },
    {
      selector: 'edge.faded',
      style: {
        'opacity': 0.12,
        'text-opacity': 0,
        'z-index': 1
      }
    },
    {
      selector: 'node.hide-node-labels',
      style: {
        'label': '',
        'text-opacity': 0
      }
    },
    {
      selector: 'edge.hide-edge-labels',
      style: {
        'label': '',
        'text-opacity': 0
      }
    },
    // Sub-graph & Full Attack Path isolation: completely hide unrelated elements
    {
      selector: '.hidden',
      style: {
        'display': 'none'
      }
    }
  ];
};

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export default function FirewallNodeDiagram({
  inbound = [],
  outbound = [],
  lateral = [],
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
  const initialPositionsRef = useRef(new Map());
  const callbacksRef = useRef({ onSelectNode, onSelectEdge, onClearSelection });

  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [layoutMode, setLayoutMode] = useState('fcose'); // 'fcose' | 'dagre'
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [isLabelMenuOpen, setIsLabelMenuOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allGraphNodes, setAllGraphNodes] = useState([]);
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });
  const [isGraphModified, setIsGraphModified] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onSelectEdge, onClearSelection };
  }, [onSelectNode, onSelectEdge, onClearSelection]);

  // Update Cytoscape stylesheet when theme changes
  useEffect(() => {
    if (cyRef.current) {
      const isLightMode = theme !== 'dark';
      const iconCol = isLightMode ? '#0f172a' : '#ffffff';
      cyRef.current.batch(() => {
        cyRef.current.nodes().forEach(node => {
          const eType = node.data('entityType') || 'machine';
          node.data('svgIcon', getNodeSvgDataUri(eType, iconCol));
        });
      });
      cyRef.current.style(getCytoscapeStylesheet(theme, showNodeLabels, showEdgeLabels));
    }
  }, [theme]);

  // Node label toggling
  useEffect(() => {
    if (!cyRef.current) return;
    if (!showNodeLabels) {
      cyRef.current.nodes().addClass('hide-node-labels');
    } else {
      cyRef.current.nodes().removeClass('hide-node-labels');
    }
  }, [showNodeLabels]);

  // Edge label toggling
  useEffect(() => {
    if (!cyRef.current) return;
    if (!showEdgeLabels) {
      cyRef.current.edges().addClass('hide-edge-labels');
    } else {
      cyRef.current.edges().removeClass('hide-edge-labels');
    }
  }, [showEdgeLabels]);

  // Build and render graph in Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const totalConnections = inbound.length + outbound.length + lateral.length;
    if (totalConnections === 0 && machines.length === 0) {
      requestAnimationFrame(() => setCounts({ nodes: 0, edges: 0 }));
      setAllGraphNodes([]);
      return;
    }

    const elements = [];
    const nodesMap = new Map();
    const edgeMap = new Map();
    const approxOrder = Math.max(machines.length, Math.round(totalConnections * 0.5), 12);
    const nSize = baseNodeSize(approxOrder);

    function ensureNode(id, type = 'machine', raw = {}) {
      if (!id) return null;
      const cleanId = String(id).replace(/<[^>]*>/g, '').trim();
      if (!cleanId) return null;
      const nid = 'm:' + cleanId;

      if (!nodesMap.has(nid)) {
        const u = cleanId.toUpperCase();
        let eType = raw.entityType || type;

        if (u.includes('FW') || u.includes('FIREWALL') || u.includes('PALO') || u.includes('FORTI') || u.includes('GATEWAY') || eType === 'firewall') {
          eType = 'firewall';
        } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanId)) {
          eType = isPrivate(cleanId) ? 'ip_private' : 'ip_external';
        } else if (u.includes('DC') || u.includes('KDC') || u.includes('ROOTCA') || eType === 'dc') {
          eType = 'dc';
        } else if (u.includes('SQL') || u.includes('DB') || u.includes('SRV') || u.includes('SERVER') || u.includes('NGINX') || u.includes('K8S') || eType === 'server') {
          eType = 'server';
        } else if (u.includes('ACTOR') || u.includes('SCANNER') || eType === 'actor') {
          eType = 'actor';
        } else {
          eType = 'machine';
        }

        const col = KIND_COLORS[eType] || KIND_COLORS.default;
        const sLabel = getShortLabel(cleanId);
        const isLightMode = theme !== 'dark';
        const iconCol = isLightMode ? '#0f172a' : '#ffffff';
        const iconSvg = getNodeSvgDataUri(eType, iconCol);

        nodesMap.set(nid, {
          group: 'nodes',
          data: {
            id: nid,
            label: sLabel,
            shortLabel: sLabel,
            fullLabel: cleanId,
            subLabel: raw.ip || '',
            entityType: eType,
            size: nSize,
            color: col,
            borderColor: col,
            borderWidth: 2.8,
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

    // Track active connected node IDs to completely exclude orphan/single nodes with 0 connections
    const connectedNodeIds = new Set();

    // Add & bundle edges
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
          color: edgeData.color || '#06b6d4',
          width: edgeData.width || 2.2,
          count: edgeData.count || 1,
          severity: edgeData.severity || 'info',
          _detail: edgeData._detail,
          _detailList: edgeData._detail ? [edgeData._detail] : []
        });
      }
    }

    // Process Inbound
    inbound.forEach(c => {
      const fromId = ensureNode(c.from_ip || c.from_machine, isPrivate(c.from_ip || '') ? 'ip_private' : 'ip_external');
      const toId = ensureNode(c.to_machine || c.to_ip, 'machine');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const act = (c.action || '').toLowerCase();
        const isAccept = act === 'accept' || act === 'allow';
        const col = c.color || (bl ? '#ef4444' : isAccept ? '#22c55e' : '#f97316');
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
            protocol: c.protocol || '', port: c.port || '', action: c.action || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process Outbound
    outbound.forEach(c => {
      const fromId = ensureNode(c.from_machine, 'machine');
      const toId = ensureNode(c.to_ip || c.to_machine, isPrivate(c.to_ip || '') ? 'ip_private' : 'ip_external');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const act = (c.action || '').toLowerCase();
        const isAccept = act === 'accept' || act === 'allow';
        const col = c.color || (bl ? '#ef4444' : isAccept ? '#22c55e' : '#f97316');
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
            protocol: c.protocol || '', port: c.port || '', action: c.action || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process Lateral
    lateral.forEach(c => {
      const fromId = ensureNode(c.source, 'machine');
      const toId = ensureNode(c.target, 'machine');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const act = (c.action || '').toLowerCase();
        const isAccept = act === 'accept' || act === 'allow';
        const col = c.color || (bl ? '#ef4444' : isAccept ? '#22c55e' : '#06b6d4');
        addEdge(fromId, toId, {
          label: c.protocol || 'LATERAL',
          dir: 'lat',
          color: col,
          width: Math.min(2.2 + Math.log((c.count || 1) + 1), 5.5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.source, dst: c.target,
            protocol: c.protocol || '', port: c.port || '', action: c.action || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Only add nodes that have active incoming or outgoing connections (excludes orphan nodes!)
    const availableNodes = [];
    nodesMap.forEach((nodeObj, nid) => {
      if (connectedNodeIds.has(nid)) {
        availableNodes.push(nodeObj);
      }
    });

    setAllGraphNodes(availableNodes.map(n => ({
      id: n.data.id,
      label: n.data.fullLabel,
      shortLabel: n.data.shortLabel,
      entityType: n.data.entityType,
      color: n.data.color,
      subLabel: n.data.subLabel
    })));

    // Deterministic position persistence across page refreshes
    const nodeKeyHash = availableNodes.map(n => n.data.id).sort().join('|');
    const cacheKey = `fw_layout_${layoutMode}_${nodeKeyHash.length}_${simpleHash(nodeKeyHash)}`;

    let cachedPositions = null;
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (availableNodes.every(n => parsed[n.data.id])) {
          cachedPositions = parsed;
        }
      }
    } catch (e) {
      cachedPositions = null;
    }

    availableNodes.forEach(nodeObj => {
      if (cachedPositions && cachedPositions[nodeObj.data.id]) {
        nodeObj.position = { ...cachedPositions[nodeObj.data.id] };
      } else {
        delete nodeObj.position;
      }
      elements.push(nodeObj);
    });

    edgeMap.forEach(e => elements.push({ group: 'edges', data: e }));

    const finalNodeCount = availableNodes.length;
    const finalEdgeCount = edgeMap.size;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet(theme, showNodeLabels, showEdgeLabels),
      minZoom: 0.02,
      maxZoom: 8.0,
      wheelSensitivity: 1.8, // Ultra-fast, highly responsive mouse wheel zoom
      boxSelectionEnabled: false
    });

    cyRef.current = cy;
    setCounts({ nodes: finalNodeCount, edges: finalEdgeCount });
    if (!showNodeLabels) cy.nodes().addClass('hide-node-labels');
    if (!showEdgeLabels) cy.edges().addClass('hide-edge-labels');

    if (cachedPositions) {
      // 100% Deterministic: Instant restore from clean cached layout without random jumping
      cy.fit(undefined, 60);
      initialPositionsRef.current.clear();
      cy.nodes().forEach(n => {
        initialPositionsRef.current.set(n.id(), { ...n.position() });
      });
      setIsGraphModified(false);
    } else {
      // Run expansive layout physics with anti-collision separation
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
      } else {
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
          // Exponential repulsion pushes hubs and clusters far apart to prevent central clutter
          nodeRepulsion: (node) => {
            if (finalNodeCount <= 15) return 320000;
            if (finalNodeCount <= 40) return 850000;
            const deg = node.degree();
            return Math.min(12000000, 2000000 + Math.pow(deg, 1.5) * 85000);
          },
          // Hub-aware edge length: connected hubs pushed up to 1500px apart
          idealEdgeLength: (edge) => {
            if (finalNodeCount <= 15) return 300;
            const sDeg = edge.source().degree();
            const tDeg = edge.target().degree();
            const maxDeg = Math.max(sDeg, tDeg);
            const minDeg = Math.min(sDeg, tDeg);
            if (minDeg >= 3) {
              return Math.min(1500, 750 + (sDeg + tDeg) * 16);
            }
            if (finalNodeCount <= 40) return Math.min(600, 360 + maxDeg * 14);
            return Math.min(1100, 500 + maxDeg * 22);
          },
          edgeElasticity: (edge) => (finalNodeCount <= 15 ? 0.05 : (finalNodeCount <= 40 ? 0.02 : 0.006)),
          nestingFactor: 0.1,
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

      // Post-layout anti-collision relaxation loop:
      // Physically pushes every pair of nodes at least 240px-280px apart so labels & nodes NEVER overlap!
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
      const bb = cy.nodes().boundingBox();
      if (bb.h > bb.w && bb.w > 10) {
        const centerX = (bb.x1 + bb.x2) / 2;
        const targetW = Math.min(bb.h * 0.75, bb.w * 2.8);
        const xMultiplier = Math.max(1.0, targetW / bb.w);
        if (xMultiplier > 1.05) {
          cy.batch(() => {
            cy.nodes().forEach(node => {
              const p = node.position();
              node.position({
                x: centerX + (p.x - centerX) * xMultiplier,
                y: p.y
              });
            });
          });
        }
      }

      cy.fit(undefined, 50);

      // Save initial clean coordinates and cache to sessionStorage
      initialPositionsRef.current.clear();
      const posToCache = {};
      cy.nodes().forEach(n => {
        const pos = { ...n.position() };
        initialPositionsRef.current.set(n.id(), pos);
        posToCache[n.id()] = pos;
      });
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(posToCache));
      } catch (err) {}
      setIsGraphModified(false);
    }

    // Scale-adaptive font sizing on zoom: keeps labels crisp and readable without visual crowding
    let zoomRaf = null;
    let lastZ = -1;
    const updateAdaptiveFonts = () => {
      if (!cyRef.current) return;
      const z = cyRef.current.zoom();
      if (lastZ > 0 && Math.abs(z - lastZ) / lastZ < 0.035) return;
      lastZ = z;

      const nodeFont = Math.round(Math.min(30, Math.max(10, 13.5 / Math.pow(z, 0.62))));
      const maxEdge = finalEdgeCount > 60 ? 18 : 24;
      const baseEdge = finalEdgeCount > 60 ? 12 : 14;
      const edgeFont = Math.round(Math.min(maxEdge, Math.max(9, baseEdge / Math.pow(z, 0.52))));
      const nodeMargin = Math.round(Math.min(14, Math.max(5, 7 / Math.pow(z, 0.5))));

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

    cy.on('dragfree', 'node', () => {
      setIsGraphModified(true);
    });
    cy.on('userzoom', () => {
      setIsGraphModified(true);
    });
    cy.on('userpan', () => {
      setIsGraphModified(true);
    });

    // Node Hover
    cy.on('mouseover', 'node', (evt) => {
      evt.target.addClass('hovered');
    });
    cy.on('mouseout', 'node', (evt) => {
      evt.target.removeClass('hovered');
    });

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

        // MULTI-HOP ATTACK & TRAFFIC PATH: Trace full upstream & downstream flow chain
        const predecessors = node.predecessors();
        const successors = node.successors();
        const direct = node.closedNeighborhood();
        const chain = node.union(predecessors).union(successors).union(direct);
        chain.removeClass('faded').addClass('in-chain');
        node.removeClass('faded').addClass('selected');
      }

      const connectedEdges = [];
      node.connectedEdges().forEach(edge => {
        const otherNode = edge.source().id() === nid ? edge.target() : edge.source();
        const eData = edge.data();
        if (eData._detail) {
          const isTarget = edge.target().id() === nid;
          connectedEdges.push({
            ...eData._detail,
            _otherLabel: otherNode.data('fullLabel') || otherNode.data('label'),
            _isTarget: isTarget,
            dir: eData.dir
          });
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

    // Click background (Clear Selection)
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
        const hasHidden = cy.elements('.hidden').length > 0;
        if (hasHidden) {
          cy.elements().not('.hidden').removeClass('selected in-chain faded hovered');
        } else {
          cy.elements().removeClass('selected in-chain faded hovered');
        }
        if (callbacksRef.current.onClearSelection) {
          callbacksRef.current.onClearSelection(false);
        }
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [inbound, outbound, lateral, machines, layoutMode]);

  // Jump to specific node by name/ID when clicked from Entity panel
  useEffect(() => {
    if (!focusNodeTarget || !cyRef.current) return;
    const cy = cyRef.current;
    let targetNode = cy.getElementById(focusNodeTarget);
    if (!targetNode || targetNode.length === 0) {
      targetNode = cy.nodes().filter(n =>
        n.data('fullLabel') === focusNodeTarget ||
        n.data('label') === focusNodeTarget ||
        n.id() === `m:${focusNodeTarget}`
      );
    }
    if (targetNode && targetNode.length > 0) {
      targetNode.emit('tap');
      cy.animate({
        center: { eles: targetNode },
        zoom: Math.max(cy.zoom(), 1.2),
        duration: 500
      });
    }
  }, [focusNodeTarget]);

  // Dynamic Isolation & Hierarchical Layout when focusedCategory or selectedNode changes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Case A: Full graph mode (show all connected nodes)
    if (!focusedCategory || focusedCategory === 'all') {
      cy.elements().removeClass('hidden');

      if (!selectedNode) {
        cy.elements().removeClass('selected in-chain faded');
        return;
      }

      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      // Highlight full multi-hop path immediately
      cy.elements().removeClass('selected in-chain faded');
      cy.elements().addClass('faded');

      const predecessors = node.predecessors();
      const successors = node.successors();
      const direct = node.closedNeighborhood();
      const chain = node.union(predecessors).union(successors).union(direct);
      chain.removeClass('faded').addClass('in-chain');
      node.removeClass('faded').addClass('selected');
      return;
    }

    // When focus isolation is active, but no node is selected
    if (!selectedNode) {
      cy.elements().not('.hidden').removeClass('selected in-chain faded hovered');
      return;
    }

    // Case B: Subgraph is isolated
    if (focusedCategory === 'isolated') {
      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      const visible = cy.elements().not('.hidden');
      visible.removeClass('selected in-chain faded');
      visible.addClass('faded');
      node.removeClass('faded').addClass('selected');

      const visibleConnectedEdges = node.connectedEdges().not('.hidden');
      visibleConnectedEdges.removeClass('faded').addClass('in-chain');
      visibleConnectedEdges.connectedNodes().not('.hidden').removeClass('faded').addClass('in-chain');
      return;
    }

    // Case C: Full Attack Path Mode (Trace complete multi-hop chain from threat roots to targets)
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
          nodeSep: 90,
          rankSep: 240,
          animate: true,
          animationDuration: 300,
          fit: true,
          padding: 80
        }).run();
      }
      return;
    }

    // Case D: Active Category Isolation (inbound, outbound, lateral)
    if (!selectedNode) return;
    const node = cy.getElementById(selectedNode);
    if (!node || node.length === 0) return;

    const allConnectedEdges = node.connectedEdges();
    const filteredEdges = allConnectedEdges.filter(edge => {
      const dir = edge.data('dir');
      if (focusedCategory === 'inbound') {
        return edge.target().id() === selectedNode || dir === 'in';
      }
      if (focusedCategory === 'outbound') {
        return edge.source().id() === selectedNode || dir === 'out';
      }
      if (focusedCategory === 'lateral') {
        return dir === 'lat';
      }
      return true;
    });

    const activeNodes = node.union(filteredEdges.connectedNodes());
    const subGraph = activeNodes.union(filteredEdges);

    cy.elements().difference(subGraph).addClass('hidden');
    subGraph.removeClass('hidden faded').addClass('in-chain');
    node.addClass('selected');

    if (activeNodes.length > 1) {
      subGraph.layout({
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 75,
        rankSep: 180,
        animate: true,
        animationDuration: 300,
        fit: true,
        padding: 70
      }).run();
    }
  }, [focusedCategory, selectedNode]);

  // Toolbar Actions
  const handleZoom = (direction) => {
    if (!cyRef.current) return;
    const factor = direction === 'in' ? 1.65 : 1 / 1.65;
    cyRef.current.animate({
      zoom: cyRef.current.zoom() * factor,
      renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 }
    }, {
      duration: 120
    });
  };

  const handleFit = () => {
    if (!cyRef.current) return;
    cyRef.current.animate({
      fit: { eles: cyRef.current.elements(), padding: 50 },
      duration: 350
    });
  };

  const handleReset = () => {
    handleFullReset();
  };

  const handleFullReset = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    setSelectedNode(null);
    setSelectedEdge(null);
    setIsGraphModified(false);
    cy.elements().removeClass('hidden selected in-chain faded hovered');
    if (initialPositionsRef.current.size > 0) {
      cy.batch(() => {
        initialPositionsRef.current.forEach((pos, id) => {
          const ele = cy.getElementById(id);
          if (ele) ele.position(pos);
        });
      });
      cy.animate({ fit: { eles: cy.elements(), padding: 60 } }, { duration: 250 });
    }
    if (callbacksRef.current.onClearSelection) {
      callbacksRef.current.onClearSelection(true);
    }
  }, []);

  // Export handlers
  const handleExport = (format) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    setIsDownloadMenuOpen(false);

    if (format === 'png') {
      const png64 = cy.png({ full: true, scale: 2, bg: theme === 'light' ? '#f8fafc' : '#0b1326' });
      const a = document.createElement('a');
      a.href = png64;
      a.download = `firewall-topology-${Date.now()}.png`;
      a.click();
    } else if (format === 'jpg') {
      const jpg64 = cy.jpg({ full: true, scale: 2, bg: theme === 'light' ? '#f8fafc' : '#0b1326', quality: 0.9 });
      const a = document.createElement('a');
      a.href = jpg64;
      a.download = `firewall-topology-${Date.now()}.jpg`;
      a.click();
    } else if (format === 'json') {
      const jsonStr = JSON.stringify({
        generator: 'IOC Hunt Firewall Topology',
        timestamp: new Date().toISOString(),
        counts,
        elements: cy.json().elements
      }, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `firewall-topology-${Date.now()}.json`;
      a.click();
    }
  };

  const isLight = theme === 'light';
  // 100% Solid opaque toolbar styles (no transparent bleed-through)
  const controlBg = isLight ? '#ffffff' : '#0f172a';
  const controlBorder = isLight ? '#cbd5e1' : '#1e293b';
  const controlColor = isLight ? '#0f172a' : '#f8fafc';
  const controlHoverBg = isLight ? '#f1f5f9' : '#1e293b';

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top Right Clear & Reset Graph Button (Appears whenever there is any change/selection/filter) */}
      {(selectedNode || selectedEdge || (focusedCategory && focusedCategory !== 'all') || isGraphModified) && (
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

      {/* Floating Bottom-Left Toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: controlBg,
          border: `1px solid ${controlBorder}`,
          borderRadius: '8px',
          padding: '4px',
          boxShadow: isLight ? '0 4px 16px rgba(0,0,0,0.08)' : '0 6px 24px rgba(0,0,0,0.5)',
          zIndex: 70
        }}
      >
        {/* Zoom In */}
        <button
          onClick={() => handleZoom('in')}
          title="Zoom In"
          style={{
            width: '30px', height: '30px', background: 'transparent', border: 'none',
            borderRadius: '5px', color: controlColor, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseOver={e => e.currentTarget.style.background = controlHoverBg}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        </button>

        {/* Zoom Out */}
        <button
          onClick={() => handleZoom('out')}
          title="Zoom Out"
          style={{
            width: '30px', height: '30px', background: 'transparent', border: 'none',
            borderRadius: '5px', color: controlColor, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseOver={e => e.currentTarget.style.background = controlHoverBg}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove</span>
        </button>

        {/* Fit */}
        <button
          onClick={handleFit}
          title="Fit Diagram"
          style={{
            width: '30px', height: '30px', background: 'transparent', border: 'none',
            borderRadius: '5px', color: controlColor, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseOver={e => e.currentTarget.style.background = controlHoverBg}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>fit_screen</span>
        </button>

        <div style={{ width: '1px', height: '18px', background: controlBorder, margin: '0 2px' }} />

        {/* Label Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsLabelMenuOpen(!isLabelMenuOpen);
              setIsLayoutMenuOpen(false);
              setIsDownloadMenuOpen(false);
            }}
            title="Toggle Labels"
            style={{
              width: '30px', height: '30px', background: isLabelMenuOpen ? controlHoverBg : 'transparent', border: 'none',
              borderRadius: '5px', color: controlColor, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>label</span>
          </button>
          {isLabelMenuOpen && (
            <div
              style={{
                position: 'absolute', bottom: '40px', left: 0, minWidth: '170px',
                background: isLight ? '#ffffff' : '#0f172a', border: `1px solid ${controlBorder}`,
                borderRadius: '8px', padding: '6px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 99
              }}
            >
              <button
                onClick={() => { setShowNodeLabels(!showNodeLabels); setIsLabelMenuOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600, color: controlColor, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <span>{showNodeLabels ? 'Hide Node Labels' : 'Show Node Labels'}</span>
                {!showNodeLabels && <span style={{ fontSize: '9px', color: '#06b6d4', fontWeight: 800 }}>OFF</span>}
              </button>
              <button
                onClick={() => { setShowEdgeLabels(!showEdgeLabels); setIsLabelMenuOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600, color: controlColor, cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <span>{showEdgeLabels ? 'Hide Flow Labels' : 'Show Flow Labels'}</span>
                {!showEdgeLabels && <span style={{ fontSize: '9px', color: '#06b6d4', fontWeight: 800 }}>OFF</span>}
              </button>
            </div>
          )}
        </div>

        {/* Layout Switcher */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsLayoutMenuOpen(!isLayoutMenuOpen);
              setIsLabelMenuOpen(false);
              setIsDownloadMenuOpen(false);
            }}
            title="Graph Layout"
            style={{
              width: '30px', height: '30px', background: isLayoutMenuOpen ? controlHoverBg : 'transparent', border: 'none',
              borderRadius: '5px', color: controlColor, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>schema</span>
          </button>
          {isLayoutMenuOpen && (
            <div
              style={{
                position: 'absolute', bottom: '40px', left: 0, minWidth: '180px',
                background: isLight ? '#ffffff' : '#0f172a', border: `1px solid ${controlBorder}`,
                borderRadius: '8px', padding: '6px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 99
              }}
            >
              <button
                onClick={() => { setLayoutMode('fcose'); setIsLayoutMenuOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px',
                  background: layoutMode === 'fcose' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600,
                  color: layoutMode === 'fcose' ? '#06b6d4' : controlColor, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>scatter_plot</span>
                Organic Spring (fCoSE)
              </button>
              <button
                onClick={() => { setLayoutMode('dagre'); setIsLayoutMenuOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px',
                  background: layoutMode === 'dagre' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600,
                  color: layoutMode === 'dagre' ? '#06b6d4' : controlColor, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_tree</span>
                Hierarchical Tree (Dagre)
              </button>
            </div>
          )}
        </div>

        {/* Export Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setIsDownloadMenuOpen(!isDownloadMenuOpen);
              setIsLabelMenuOpen(false);
              setIsLayoutMenuOpen(false);
            }}
            title="Export Diagram"
            style={{
              width: '30px', height: '30px', background: isDownloadMenuOpen ? controlHoverBg : 'transparent', border: 'none',
              borderRadius: '5px', color: controlColor, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
          </button>
          {isDownloadMenuOpen && (
            <div
              style={{
                position: 'absolute', bottom: '40px', left: 0, minWidth: '160px',
                background: isLight ? '#ffffff' : '#0f172a', border: `1px solid ${controlBorder}`,
                borderRadius: '8px', padding: '6px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 99
              }}
            >
              <button
                onClick={() => handleExport('png')}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600, color: controlColor, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#06b6d4' }}>image</span>
                Export PNG (HD)
              </button>
              <button
                onClick={() => handleExport('jpg')}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600, color: controlColor, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#06b6d4' }}>photo</span>
                Export JPG
              </button>
              <button
                onClick={() => handleExport('json')}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent',
                  border: 'none', fontSize: '12px', fontWeight: 600, color: controlColor, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#06b6d4' }}>data_object</span>
                Export JSON Topology
              </button>
            </div>
          )}
        </div>

        {/* Search Toggle */}
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          title="Search Nodes"
          style={{
            width: '30px', height: '30px', background: isSearchOpen ? 'rgba(6, 182, 212, 0.2)' : 'transparent', border: 'none',
            borderRadius: '5px', color: isSearchOpen ? '#06b6d4' : controlColor, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
        </button>

        {/* Reset */}
        <button
          onClick={handleReset}
          title="Reset Layout & Selection"
          style={{
            width: '30px', height: '30px', background: 'transparent', border: 'none',
            borderRadius: '5px', color: controlColor, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
          onMouseOver={e => e.currentTarget.style.background = controlHoverBg}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
        </button>
      </div>

      {/* Search Drawer / Modal */}
      {isSearchOpen && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '280px',
            background: controlBg,
            border: `1px solid ${controlBorder}`,
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            padding: '10px',
            zIndex: 85
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#06b6d4' }}>search</span>
            <input
              placeholder="Search IP or node..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                background: isLight ? '#f8fafc' : '#141e33',
                border: `1px solid ${controlBorder}`,
                color: controlColor,
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'var(--mono)',
                outline: 'none'
              }}
            />
            <button
              onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
              style={{ background: 'none', border: 'none', color: controlColor, cursor: 'pointer', padding: '2px' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>

          <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {allGraphNodes
              .filter(n => !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase()) || (n.sub || '').includes(searchQuery))
              .slice(0, 15)
              .map(n => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!cyRef.current) return;
                    const node = cyRef.current.getElementById(n.id);
                    if (node && node.length > 0) {
                      node.emit('tap');
                      cyRef.current.animate({
                        center: { eles: node },
                        zoom: Math.max(cyRef.current.zoom(), 1.2),
                        duration: 400
                      });
                    }
                    setIsSearchOpen(false);
                  }}
                  style={{
                    padding: '4px 8px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                  onMouseOver={e => e.currentTarget.style.background = controlHoverBg}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontWeight: 700, color: controlColor, fontFamily: 'var(--mono)' }}>{n.label}</span>
                  <span style={{ fontSize: '9px', color: '#06b6d4', textTransform: 'uppercase' }}>{n.type}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
