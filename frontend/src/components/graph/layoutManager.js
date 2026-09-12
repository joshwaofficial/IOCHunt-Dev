import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(400, nodeCount * 45);
  let i = 0;
  graph.forEachNode((node, attrs) => {
    if (typeof attrs.x !== 'number' || typeof attrs.y !== 'number') {
      const angle = (2 * Math.PI * i) / nodeCount;
      graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
      graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius * 0.75);
    }
    i++;
  });
}

/**
 * Balanced 4-Quadrant Widescreen Constellation Presets for Default Synthetic Network
 */
const PRESET_COORDINATES = [
  // Top-Left: Monitored Host & Network Flow (D3F53C0N3 Tree)
  { match: l => l.includes('D3F53C0N3'), x: -620, y: -260 },
  { match: l => l.includes('10.90.121.226') || l.includes('10.90'), x: -840, y: -370 },
  { match: l => l.includes('185.220.101.5') || l.includes('185.220'), x: -850, y: -160 },
  { match: l => l.includes('72.62.241.39') || l.includes('72.62'), x: -410, y: -260 },
  { match: l => l.includes('194.26.29.112') || l.includes('194.26'), x: -440, y: -430 },
  { match: l => l.includes('8.8.8.8'), x: -240, y: -260 },
  { match: l => l.includes('14.99.11.58') || l.includes('14.99'), x: -620, y: -70 },

  // Bottom-Left: Organization Management & Admin Workstations
  { match: l => l.includes('ORGANIZATION MANAGEMENT'), x: -560, y: 240 },
  { match: l => l.includes('ADMIN-WS-01'), x: -780, y: 160 },
  { match: l => l.includes('ADMIN-WS-02'), x: -560, y: 440 },
  { match: l => l.includes('SEC-OPS-01') || l.includes('SEC-OPS'), x: -350, y: 240 },
  { match: l => l.includes('FS-CORP-01') || l.includes('FS-CORP'), x: -770, y: 350 },
  { match: l => l.includes('K8S-MASTER') || l.includes('K8S'), x: -180, y: 240 },
  { match: l => l.includes('PAYMENT-SRV') || l.includes('PAYMENT'), x: -740, y: 490 },

  // Center Zone: Bridge Attacker & Databases
  { match: l => l.includes('OPIERCE'), x: 0, y: 0 },
  { match: l => l.includes('SQL-PROD-01') || l.includes('SQL-PROD'), x: -180, y: 80 },
  { match: l => l.includes('EXCHANGE RECIPIENT ADMINS') || l.includes('RECIPIENT ADMINS'), x: 0, y: -260 },
  { match: l => l.includes('MAIL-GATEWAY') || l.includes('MAIL-GATEWAY-01'), x: 200, y: -260 },
  { match: l => l.includes('HR-DESK') || l.includes('HR-DESK-01'), x: -160, y: -380 },
  { match: l => l.includes('SALES-WS') || l.includes('SALES-WS-01'), x: 0, y: -440 },

  // Top-Right: Tier-0 Active Directory & Threat Actors
  { match: l => l.includes('DOMAIN ADMINS'), x: 580, y: -260 },
  { match: l => l.includes('DC-01.DEFSECON.LOCAL') || l === 'DC-01', x: 780, y: -180 },
  { match: l => l.includes('DC-02.DEFSECON.LOCAL') || l === 'DC-02', x: 780, y: -340 },
  { match: l => l.includes('BACKUP-DC') || l.includes('BACKUP-DC-01'), x: 990, y: -260 },
  { match: l => l.includes('CA-ROOT') || l.includes('CA-ROOT-01'), x: 990, y: -110 },
  { match: l => l.includes('APT29') || l.includes('COZY BEAR'), x: 380, y: -390 },
  { match: l => l.includes('CERTIPY'), x: 380, y: -260 },
  { match: l => l.includes('BACKUP_SVC'), x: 380, y: -130 },

  // Bottom-Right: Exchange Trusted Subsystem
  { match: l => l.includes('EXCHANGE TRUSTED SUBSYSTEM') || l.includes('EXCHANGE TRUSTED'), x: 580, y: 240 },
  { match: l => l.includes('EXCH-001'), x: 800, y: 110 },
  { match: l => l.includes('EXCH-002'), x: 890, y: 200 },
  { match: l => l.includes('EXCH-003'), x: 890, y: 320 },
  { match: l => l.includes('EXCH-004'), x: 790, y: 410 },
  { match: l => l.includes('EXCH-005'), x: 580, y: 470 },
  { match: l => l.includes('EXCH-006'), x: 390, y: 390 }
];

/**
 * 1. BloodHound Hierarchical Tree Layout (Tree Mode)
 * Uses @dagrejs/dagre — the EXACT algorithm and parameters BloodHound CE uses:
 * - Left-to-Right (LR) DAG progression from roots → targets
 * - Virtual 30x30 node sizing for Dagre to pack ranks cleanly
 * - ranksep: 480, nodesep: 120
 * - Multi-edges collapsed for Dagre layout to eliminate parallel edge routing crashes
 * - Smart Rank Packing: wide ranks (> 8 nodes) distributed across staggered sub-columns
 *   to maintain optimal 16:9 widescreen layout without vertical clumping
 */
export function applyBloodHoundTreeLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodes = graph.nodes();
  if (nodes.length <= 2) {
    applyCircular(graph);
    return;
  }

  const graphlibGraph = new dagre.graphlib.Graph({ directed: true, multigraph: true });
  graphlibGraph.setGraph({
    rankdir: 'LR',
    ranksep: 480,
    nodesep: 120,
    marginx: 60,
    marginy: 60
  });
  graphlibGraph.setDefaultEdgeLabel(() => ({}));
  graphlibGraph.setDefaultNodeLabel(() => ({}));

  graph.forEachNode(node => {
    const attrs = graph.getNodeAttributes(node);
    graphlibGraph.setNode(node, {
      label: attrs.label || '',
      width: 30,
      height: 30
    });
  });

  // Exactly like BloodHound CE (dagre.ts:102): DO NOT pass 4th argument (edge key)
  // This collapses parallel multi-edges into 1 directed edge between (source, target),
  // completely preventing Dagre's 'Not possible to find intersection' crash!
  graph.forEachEdge((edge, attrs, source, target) => {
    if (graph.hasNode(source) && graph.hasNode(target)) {
      graphlibGraph.setEdge(source, target, { label: attrs.label || '', points: [] });
    }
  });

  try {
    dagre.layout(graphlibGraph);
  } catch (err) {
    console.warn('[BloodHound Layout] Dagre error, falling back to Physics layout:', err);
    applyBloodHoundPhysicsLayout(graph);
    return;
  }

  // Group nodes by Dagre computed rank
  const rankMap = new Map();
  graphlibGraph.nodes().forEach(node => {
    const pos = graphlibGraph.node(node);
    if (!pos) return;
    const r = pos.rank ?? 0;
    if (!rankMap.has(r)) rankMap.set(r, []);
    rankMap.get(r).push({ node, pos });
  });

  // Smart Rank Packing: For any rank with > 8 nodes (e.g. 75 containers/GPOs/users),
  // distribute into a 2D staggered sub-column grid to maintain a 16:9 widescreen aspect ratio
  rankMap.forEach((rankNodes) => {
    rankNodes.sort((a, b) => (a.pos.y || 0) - (b.pos.y || 0));
    const n = rankNodes.length;
    const colCount = n > 8 ? Math.ceil(Math.sqrt(n * 1.5)) : 1;
    const maxPerCol = Math.ceil(n / colCount);
    const colWidth = 260;
    const rowHeight = 120;

    rankNodes.forEach((item, idx) => {
      const col = Math.floor(idx / maxPerCol);
      const row = idx % maxPerCol;
      const staggerY = (col % 2) * (rowHeight * 0.3);
      item.pos.x += col * colWidth;
      item.pos.y = row * rowHeight + staggerY;
    });
  });

  // Center all ranks vertically along the horizontal midline
  rankMap.forEach((rankNodes) => {
    const rankMinY = Math.min(...rankNodes.map(n => n.pos.y));
    const rankMaxY = Math.max(...rankNodes.map(n => n.pos.y));
    const rankMid = (rankMinY + rankMaxY) / 2;
    rankNodes.forEach(item => {
      item.pos.y -= rankMid;
    });
  });

  // Apply layout positions from graphlib into sigma graph
  graphlibGraph.nodes().forEach(node => {
    const pos = graphlibGraph.node(node);
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      graph.setNodeAttribute(node, 'x', pos.x);
      graph.setNodeAttribute(node, 'y', pos.y);
    }
  });

  preventEllipticalCollisions(graph, 240, 110, 25);
  centerGraphAtOrigin(graph);
}

/**
 * 2. BloodHound Star Layout (Star Mode)
 * Expansive radial cluster layout (Gephi / Cytoscape Concentric):
 * - Primary community hubs placed in golden-ratio phyllotaxis spiral across a huge canvas
 * - Satellite members fanned out in concentric spoke rings with generous spacing
 * - Eliminates clumping/hairballs even on 100+ node graphs
 */
export function applyBloodHoundStarLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 2) {
    applyCircular(graph);
    return;
  }

  const placed = new Set();
  const sorted = graph.nodes().slice().sort((a, b) => graph.degree(b) - graph.degree(a));
  const hubs = sorted.filter(n => graph.degree(n) >= 2).slice(0, 24);

  // Expansive hub spread radius scales dynamically with network order
  const hubSpreadR = Math.max(1400, Math.sqrt(nodeCount) * 320);

  hubs.forEach((hub, idx) => {
    const angle = idx * 2.399963; // Golden angle (~137.5 deg)
    const r = hubSpreadR * Math.sqrt((idx + 1) / hubs.length);
    const hx = Math.cos(angle) * r;
    const hy = Math.sin(angle) * r * 0.72; // 16:9 widescreen oval
    graph.setNodeAttribute(hub, 'x', hx);
    graph.setNodeAttribute(hub, 'y', hy);
    placed.add(hub);
  });

  // Fan out members for each hub in outward spokes or concentric rings
  hubs.forEach(hub => {
    const hx = graph.getNodeAttribute(hub, 'x') || 0;
    const hy = graph.getNodeAttribute(hub, 'y') || 0;
    const nbrs = graph.neighbors(hub).filter(n => !placed.has(n));

    nbrs.forEach((nbr, nIdx) => {
      const spokeAngle = (2 * Math.PI * nIdx) / (nbrs.length || 1);
      const spokeR = 380 + (nIdx % 3) * 200 + Math.floor(nIdx / 6) * 140;
      graph.setNodeAttribute(nbr, 'x', hx + Math.cos(spokeAngle) * spokeR);
      graph.setNodeAttribute(nbr, 'y', hy + Math.sin(spokeAngle) * spokeR * 0.85);
      placed.add(nbr);
    });
  });

  // Any remaining unplaced nodes onto outer constellation ring
  const unplaced = graph.nodes().filter(n => !placed.has(n));
  const perimR = hubSpreadR * 1.6;
  unplaced.forEach((n, idx) => {
    const a = (2 * Math.PI * idx) / (unplaced.length || 1);
    graph.setNodeAttribute(n, 'x', Math.cos(a) * perimR);
    graph.setNodeAttribute(n, 'y', Math.sin(a) * perimR * 0.68);
    placed.add(n);
  });

  const scale = Math.max(1.0, Math.sqrt(nodeCount / 10));
  const minDx = Math.max(340, Math.min(520, 280 * scale * 0.7));
  const minDy = Math.max(170, Math.min(270, 150 * scale * 0.7));
  preventEllipticalCollisions(graph, minDx, minDy, 45);
  centerGraphAtOrigin(graph);
}

/**
 * 3. BloodHound Physics Layout (Physics Mode)
 * Matches BloodHound CE standardLayout (forceAtlas2 with scalingRatio: 1000):
 * - iterations: 128
 * - scalingRatio: 1000
 * - barnesHutOptimize: true
 */
export function applyBloodHoundPhysicsLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 2) {
    applyCircular(graph);
    return;
  }

  // Initialize in circular dispersion
  let i = 0;
  const initR = Math.max(600, nodeCount * 45);
  graph.forEachNode(node => {
    const angle = (2 * Math.PI * i) / nodeCount;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * initR);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * initR * 0.72);
    i++;
  });

  try {
    forceAtlas2.assign(graph, {
      iterations: 128,
      settings: {
        gravity: 0.0005,
        scalingRatio: 1000,
        barnesHutOptimize: true,
        adjustSizes: true
      }
    });
  } catch (err) {
    console.warn('[BloodHound Layout] Physics error, falling back to Star:', err);
    applyBloodHoundStarLayout(graph);
    return;
  }

  preventEllipticalCollisions(graph, 240, 120, 25);
  centerGraphAtOrigin(graph);
}

/**
 * BloodHound Open Constellation Layout (Default Simulation Mode)
 * Checks if known preset coordinates match >= 5 nodes.
 * If yes, uses preset coordinates. If not, delegates to Star Layout.
 */
export function applyBloodHoundClusterLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 2) {
    applyCircular(graph);
    return;
  }

  const placed = new Set();
  let matchedCount = 0;

  // Step 1: Check preset matches
  graph.forEachNode((node, attrs) => {
    const rawLabel = (attrs.label || node).replace(/^[mi]:/, '').toUpperCase();
    const preset = PRESET_COORDINATES.find(p => p.match(rawLabel));

    if (preset) {
      graph.setNodeAttribute(node, 'x', preset.x);
      graph.setNodeAttribute(node, 'y', preset.y);
      placed.add(node);
      matchedCount++;
    }
  });

  // If fewer than 5 presets matched (e.g. AD sample file), use Star layout
  if (matchedCount < 5) {
    applyBloodHoundStarLayout(graph);
    return;
  }

  // For matched preset network: place remaining nodes near neighbors
  const unplaced = graph.nodes().filter(n => !placed.has(n));
  if (unplaced.length > 0) {
    unplaced.forEach((node, idx) => {
      const neighbors = graph.neighbors(node);
      const placedNeighbor = neighbors.find(n => placed.has(n));

      if (placedNeighbor) {
        const px = graph.getNodeAttribute(placedNeighbor, 'x') || 0;
        const py = graph.getNodeAttribute(placedNeighbor, 'y') || 0;
        const outwardAngle = Math.atan2(py, px);
        const spokeAngle = outwardAngle + ((idx % 2 === 0 ? 1 : -1) * (0.6 + idx * 0.4));
        const spokeR = 250;
        graph.setNodeAttribute(node, 'x', px + Math.cos(spokeAngle) * spokeR);
        graph.setNodeAttribute(node, 'y', py + Math.sin(spokeAngle) * spokeR);
      } else {
        const angle = (2 * Math.PI * idx) / unplaced.length;
        graph.setNodeAttribute(node, 'x', Math.cos(angle) * 950);
        graph.setNodeAttribute(node, 'y', Math.sin(angle) * 650);
      }
      placed.add(node);
    });
  }

  preventEllipticalCollisions(graph, 240, 140, 45);
  centerGraphAtOrigin(graph);
}

/**
 * Backward compatibility alias for Tree layout
 */
export const applyDagreLayout = applyBloodHoundTreeLayout;

/**
 * Backward compatibility alias for Physics layout
 */
export const applyForceAtlas2 = applyBloodHoundPhysicsLayout;

/**
 * Circular layout fallback
 */
export function applyCircular(graph) {
  if (!graph || graph.order === 0) return;
  const count = graph.order;
  const radius = Math.max(350, count * 65);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius * 0.72);
    idx++;
  });
  preventEllipticalCollisions(graph, 220, 130, 25);
  centerGraphAtOrigin(graph);
}

/**
 * Centers graph bounding box symmetrically at origin (0, 0)
 */
export function centerGraphAtOrigin(graph) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  graph.forEachNode((node, attrs) => {
    if (attrs.x < minX) minX = attrs.x;
    if (attrs.x > maxX) maxX = attrs.x;
    if (attrs.y < minY) minY = attrs.y;
    if (attrs.y > maxY) maxY = attrs.y;
  });

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  graph.forEachNode((node, attrs) => {
    graph.setNodeAttribute(node, 'x', attrs.x - midX);
    graph.setNodeAttribute(node, 'y', attrs.y - midY);
  });
}

/**
 * Robust elliptical pair-wise collision prevention
 * Handles rectangular label widths (wide horizontally, compact vertically)
 */
export function preventEllipticalCollisions(graph, minDx = 240, minDy = 140, iterations = 45) {
  const nodes = graph.nodes();
  const n = nodes.length;
  if (n <= 1) return;

  for (let pass = 0; pass < iterations; pass++) {
    let hadCollision = false;

    for (let i = 0; i < n; i++) {
      const u = nodes[i];
      let ux = graph.getNodeAttribute(u, 'x') || 0;
      let uy = graph.getNodeAttribute(u, 'y') || 0;

      for (let j = i + 1; j < n; j++) {
        const v = nodes[j];
        let vx = graph.getNodeAttribute(v, 'x') || 0;
        let vy = graph.getNodeAttribute(v, 'y') || 0;

        let dx = ux - vx;
        let dy = uy - vy;

        if (dx === 0 && dy === 0) {
          dx = (Math.random() - 0.5) * 20;
          dy = (Math.random() - 0.5) * 20;
        }

        // Elliptical normalized distance: (dx / minDx)^2 + (dy / minDy)^2
        const normDistSq = (dx * dx) / (minDx * minDx) + (dy * dy) / (minDy * minDy);

        if (normDistSq < 1.0) {
          hadCollision = true;
          const normDist = Math.sqrt(normDistSq) || 0.001;
          const factor = ((1.0 - normDist) / normDist) * 0.5;

          const pushX = dx * factor;
          const pushY = dy * factor;

          ux += pushX;
          uy += pushY;
          vx -= pushX;
          vy -= pushY;

          graph.setNodeAttribute(u, 'x', ux);
          graph.setNodeAttribute(u, 'y', uy);
          graph.setNodeAttribute(v, 'x', vx);
          graph.setNodeAttribute(v, 'y', vy);
        }
      }
    }

    if (!hadCollision) break;
  }
}
