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
    // Base Node Style - Clean circular body with distinct colored border ring & centered vector icon
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
        'background-width': '62%',
        'background-height': '62%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip': 'node',
        'outline-width': 0,
        'outline-opacity': 0,
        'overlay-opacity': 0,
        'overlay-padding': 0,
        'label': showNodeLabels ? 'data(shortLabel)' : '',
        'text-opacity': showNodeLabels ? 1.0 : 0,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size': '13px',
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-margin-y': 7,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showNodeLabels ? 0.95 : 0,
        'text-background-padding': '3px 6px',
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
        'border-width': 3.8,
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
        'border-width': 4.5,
        'outline-width': 4.5,
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
    {
      selector: 'node.faded',
      style: {
        'opacity': 0.16,
        'text-opacity': 0,
        'z-index': 1
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 'data(width)',
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.25,
        'curve-style': 'bezier',
        'label': showEdgeLabels ? 'data(label)' : '',
        'text-opacity': showEdgeLabels ? 1.0 : 0,
        'font-family': 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        'font-size': '11px',
        'font-weight': 700,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showEdgeLabels ? 0.95 : 0,
        'text-background-padding': '3px 6px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': 'data(color)',
        'text-border-width': showEdgeLabels ? 1 : 0,
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
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
        'width': 4.2,
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 1.4,
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
        'opacity': 0.08,
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
    {
      selector: '.hidden',
      style: {
        'display': 'none'
      }
    }
  ];
};

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
  const initialCleanPositionsRef = useRef(new Map());
  const callbacksRef = useRef({ onSelectNode, onSelectEdge, onClearSelection });

  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [isGraphModified, setIsGraphModified] = useState(false);
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

  // Clear any legacy cached positions from previous versions on mount
  useEffect(() => {
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('fw_layout_')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch (e) {}
  }, []);

  useEffect(() => {
    callbacksRef.current = { onSelectNode, onSelectEdge, onClearSelection };
  }, [onSelectNode, onSelectEdge, onClearSelection]);

  // Update Cytoscape stylesheet and node icon colors when theme changes
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

  const dataKey = `${inbound.length}|${outbound.length}|${lateral.length}|${machines.length}|${layoutMode}|${theme}`;

  // Build and render graph in Cytoscape (Matching Network Topology exactly)
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
    const connectedNodeIds = new Set();

    const approxOrder = Math.max(machines.length, Math.round(totalConnections * 0.45), 12);
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

    // Bundle / Aggregate parallel edges between the same nodes
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
          width: edgeData.width || 2.5,
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
          label: c.protocol || c.service || 'INBOUND',
          dir: 'in',
          color: col,
          width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.from_machine || c.from_ip || '?', dst: c.to_machine || c.to_ip || '?',
            protocol: c.protocol || c.service || '', port: c.port || '', action: c.action || '',
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
          label: c.protocol || c.service || 'OUTBOUND',
          dir: 'out',
          color: col,
          width: Math.min(2 + Math.log((c.count || 1) + 1), 5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.from_machine || '?', dst: c.to_machine || c.to_ip || '?',
            protocol: c.protocol || c.service || '', port: c.port || '', action: c.action || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Process Lateral
    lateral.forEach(c => {
      const fromId = ensureNode(c.source || c.from_machine, 'machine');
      const toId = ensureNode(c.target || c.to_machine, 'machine');
      if (fromId && toId && fromId !== toId) {
        const bl = c.blocked > 0;
        const act = (c.action || '').toLowerCase();
        const isAccept = act === 'accept' || act === 'allow';
        const col = c.color || (bl ? '#ef4444' : isAccept ? '#22c55e' : '#06b6d4');
        addEdge(fromId, toId, {
          label: c.protocol || c.service || 'LATERAL',
          dir: 'lat',
          color: col,
          width: Math.min(2.5 + Math.log((c.count || 1) + 1), 5.5),
          count: c.count || 1,
          severity: c.severity || 'info',
          _detail: {
            first_seen: c.first_seen, last_seen: c.last_seen,
            src: c.source || c.from_machine, dst: c.target || c.to_machine,
            protocol: c.protocol || c.service || '', port: c.port || '', action: c.action || '',
            count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
            extra: c.description || (bl ? 'BLOCKED' : '')
          }
        });
      }
    });

    // Only add nodes that have active incoming or outgoing connections
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

    // Add consolidated edges
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

    // Initialize Cytoscape instance with responsive zoom
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet(theme, showNodeLabels, showEdgeLabels),
      minZoom: 0.02,
      maxZoom: 8.0,
      wheelSensitivity: 1.8,
      boxSelectionEnabled: false
    });

    cyRef.current = cy;
    window.__cy = cy;
    if (!showNodeLabels) cy.nodes().addClass('hide-node-labels');
    if (!showEdgeLabels) cy.edges().addClass('hide-edge-labels');

    // Run active layout with clean, readable spacing (Matching Network Topology exactly)
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
        nodeRepulsion: (node) => {
          if (finalNodeCount <= 15) return 320000;
          if (finalNodeCount <= 40) return 850000;
          const deg = node.degree();
          return Math.min(12000000, 2000000 + Math.pow(deg, 1.5) * 85000);
        },
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

    // Post-layout anti-collision relaxation
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

    // Save initial pristine coordinates to enable 1-click full reset
    initialCleanPositionsRef.current.clear();
    cy.nodes().forEach(n => {
      initialCleanPositionsRef.current.set(n.id(), { ...n.position() });
    });
    setIsGraphModified(false);

    // Scale-adaptive font sizing
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

    // Track user modifications so Clear Graph button appears
    cy.on('dragfree', 'node', () => setIsGraphModified(true));
    cy.on('userzoom', () => setIsGraphModified(true));
    cy.on('userpan', () => setIsGraphModified(true));

    updateAdaptiveFonts();

    // Click Node
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nid = node.id();
      setSelectedNode(nid);
      setSelectedEdge(null);

      const hasHidden = cy.elements('.hidden').length > 0;
      if (hasHidden) {
        const visible = cy.elements().not('.hidden');
        visible.removeClass('selected in-chain faded');
        visible.addClass('faded');
        node.removeClass('faded').addClass('selected');

        const visibleConnectedEdges = node.connectedEdges().not('.hidden');
        visibleConnectedEdges.removeClass('faded').addClass('in-chain');
        visibleConnectedEdges.connectedNodes().not('.hidden').removeClass('faded').addClass('in-chain');
      } else {
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

    // Click Background Stage
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
    cy.on('mouseover', 'node', (evt) => evt.target.addClass('hovered'));
    cy.on('mouseout', 'node', (evt) => evt.target.removeClass('hovered'));
    cy.on('mouseover', 'edge', (evt) => evt.target.addClass('hovered'));
    cy.on('mouseout', 'edge', (evt) => evt.target.removeClass('hovered'));

    // Resize observer
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (cyRef.current) cyRef.current.resize();
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

  // Dynamic Redesign & Layout when focusedCategory or selectedNode changes
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    // Case A: Full graph mode
    if (!focusedCategory || focusedCategory === 'all') {
      cy.elements().removeClass('hidden');

      if (!selectedNode) {
        cy.elements().removeClass('selected in-chain faded');
        return;
      }

      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

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

    // Case C: Full Attack Path Mode
    if (focusedCategory === 'full_path') {
      if (!selectedNode) return;
      const node = cy.getElementById(selectedNode);
      if (!node || node.length === 0) return;

      const predecessors = node.predecessors();
      const successors = node.successors();
      const direct = node.closedNeighborhood();
      const fullPath = node.union(predecessors).union(successors).union(direct);

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
      if (layoutMode === 'dagre') {
        subGraph.layout({
          name: 'dagre',
          rankDir: 'LR',
          nodeSep: 85,
          rankSep: 200,
          animate: true,
          animationDuration: 350,
          fit: true,
          padding: 85
        }).run();
      } else {
        subGraph.layout({
          name: 'fcose',
          quality: 'default',
          randomize: false,
          animate: true,
          animationDuration: 350,
          fit: true,
          padding: 85,
          nodeRepulsion: 350000,
          idealEdgeLength: 180
        }).run();
      }
    }
  }, [focusedCategory, selectedNode]);

  // Jump to specific node by name/ID when clicked from entity panel
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

  // Zoom and Reset Handlers (Fast & Snappy)
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

      cy.animate({
        fit: { eles: cy.elements(), padding: 50 }
      }, { duration: 300 });
    }

    if (callbacksRef.current.onClearSelection) {
      callbacksRef.current.onClearSelection(true);
    }
  }, []);

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
      generator: 'IOC Hunt Firewall Network Topology',
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
    link.download = `iochunt_firewall_topology_export_${new Date().toISOString().slice(0, 10)}.json`;
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
    link.download = `iochunt_firewall_topology_${new Date().toISOString().slice(0, 10)}.png`;
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
      if (!e.target.closest('#fw-bottom-toolbar') && !e.target.closest('#fw-search-popover')) {
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
          No active firewall connections match current filters
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
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#06b6d4', display: 'inline-block' }}></span>
          <span style={{ color: 'var(--muted)' }}>Edges:</span> <strong>{counts.edges}</strong>
        </div>
      </div>

      {/* Top Right Clear & Reset Graph Button */}
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
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; e.currentTarget.style.borderColor = '#06b6d4'; }}
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
          onMouseOver={(e) => { e.currentTarget.style.background = controlHoverBg; e.currentTarget.style.borderColor = '#06b6d4'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = controlBg; e.currentTarget.style.borderColor = controlBorder; }}
        >
          −
        </button>
      </div>

      {/* Search Node Floating Popover */}
      {isSearchOpen && (
        <div
          id="fw-search-popover"
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
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.color || '#06b6d4', flexShrink: 0 }}></span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: isLight ? '#0f172a' : '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {n.label}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '4px',
                    background: `${n.color || '#06b6d4'}22`,
                    color: n.color || '#06b6d4',
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

      {/* Firewall Authentic Bottom Toolbar (Bottom Left - Matching Network Topology exactly) */}
      <div
        id="fw-bottom-toolbar"
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

        {/* 2. Label Visibility (visibility icon with menu) */}
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
                  color: layoutMode === 'fcose' ? '#06b6d4' : (isLight ? '#0f172a' : '#f8fafc'),
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
                onMouseOver={(e) => { e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#06b6d4' }}>data_object</span>
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
                onMouseOver={(e) => { e.currentTarget.style.background = isLight ? '#f1f5f9' : '#1e293b'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
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
              color: isSearchOpen ? '#06b6d4' : controlColor,
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

      {/* Bottom Subtle Legend Indicator (Matching Network Topology layout) */}
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
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #06b6d4', background: legendNodeCore }}></span> Server / Gateway
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #3b82f6', background: legendNodeCore }}></span> Firewall
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #a855f7', background: legendNodeCore }}></span> DC / KDC
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #64748b', background: legendNodeCore }}></span> WAN IP
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #10b981', background: legendNodeCore }}></span> Internal LAN
        </span>
      </div>
    </div>
  );
}
