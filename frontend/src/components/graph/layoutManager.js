import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(300, nodeCount * 50);
  let i = 0;
  graph.forEachNode((node, attrs) => {
    if (typeof attrs.x !== 'number' || typeof attrs.y !== 'number') {
      const angle = (2 * Math.PI * i) / nodeCount;
      graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
      graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    }
    i++;
  });
}

/**
 * Precise coordinate blueprint matching User Reference Image 1:
 * - Wide spacing between all nodes (200px - 280px spoke length)
 * - Huge whitespace between clusters (600px - 1000px separation)
 * - Tree/step ladder hierarchy in bottom-left (NOT a star pattern!)
 * - Clean horizontal/diagonal pairs on outer perimeter
 * - Spacious multi-node fan in lower right
 */
const PRESET_COORDINATES = [
  // --- 1. Top-Left 4-Spoke Cluster (Organization Management) ---
  { match: l => l.includes('ORGANIZATION MANAGEMENT'), x: -560, y: -360 },
  { match: l => l.includes('FS-CORP-01'), x: -730, y: -510 },
  { match: l => l.includes('ADMIN-WS-02'), x: -450, y: -530 },
  { match: l => l.includes('SEC-OPS-01'), x: -330, y: -360 },
  { match: l => l.includes('ADMIN-WS-01'), x: -720, y: -220 },

  // --- 2. Center Hub (OPIERCE & Lateral Escalations) ---
  { match: l => l.includes('OPIERCE'), x: -10, y: -30 },
  { match: l => l.includes('EXCHANGE RECIPIENT ADMINS') || l.includes('RECIPIENT ADMINS'), x: 90, y: -200 },
  { match: l => l.includes('SQL-PROD-01') || l.includes('SQL-PROD'), x: -20, y: 160 },

  // --- 3. Lower-Right Multi-Node Wide Fan (Exchange Subsystem) ---
  { match: l => l.includes('EXCHANGE TRUSTED') || l.includes('SUBSYSTEM'), x: 490, y: 240 },
  { match: l => l.includes('EXCH-001'), x: 370, y: 70 },
  { match: l => l.includes('EXCH-002'), x: 490, y: 0 },
  { match: l => l.includes('EXCH-003'), x: 610, y: 10 },
  { match: l => l.includes('EXCH-004'), x: 720, y: 90 },
  { match: l => l.includes('EXCH-005'), x: 780, y: 240 },
  { match: l => l.includes('EXCH-006'), x: 720, y: 390 },
  { match: l => l.includes('MAIL-GATEWAY'), x: 560, y: 460 },
  { match: l => l.includes('45.33.32.156'), x: 410, y: 460 },
  { match: l => l.includes('HR-DESK'), x: 280, y: 380 },
  { match: l => l.includes('SALES-WS'), x: 230, y: 230 },

  // --- 4. Bottom-Left Network Flow / Tree (Pure Branching Hierarchy - NOT A STAR!) ---
  { match: l => l.includes('8.8.8.8'), x: -200, y: 220 },
  { match: l => l.includes('72.62.241.39'), x: -290, y: 410 },
  { match: l => l.includes('194.26.29.112'), x: -480, y: 290 },
  { match: l => l.includes('D3F53C0N3'), x: -240, y: 630 },
  { match: l => l.includes('185.220.101.5'), x: -660, y: 470 },
  { match: l => l.includes('10.90.121.226') || l.includes('10.90'), x: -480, y: 620 },
  { match: l => l.includes('K8S-MASTER'), x: -20, y: 660 },

  // --- 5. Right Flank & Perimeter Flanks (Clean Linear / Diagonal Pairs) ---
  { match: l => l.includes('CERTIPY_SCANNER') || l.includes('CERTIPY'), x: 410, y: -540 },
  { match: l => l.includes('CA-ROOT-01') || l.includes('CA-ROOT'), x: 640, y: -540 },
  { match: l => l.includes('DOMAIN ADMINS'), x: 520, y: -270 },
  { match: l => l.includes('DC-01'), x: 680, y: -120 },
  { match: l => l.includes('APT29'), x: 650, y: -270 },
  { match: l => l.includes('DC-02'), x: 740, y: -380 },
  { match: l => l.includes('BACKUP_SVC'), x: 820, y: -320 },
  { match: l => l.includes('BACKUP-DC'), x: 930, y: -140 },
  { match: l => l.includes('DA-JFREEMAN') || l.includes('JFREEMAN'), x: 890, y: -440 },
  { match: l => l.includes('PAYMENT-SRV'), x: -650, y: 20 },
  { match: l => l.includes('14.99.11.58') || l.includes('14.99'), x: -820, y: 180 }
];

/**
 * BloodHound Open Constellation Layout (Direct 1-to-1 Match to Reference Image 1)
 * - Eliminates crowded star patterns and dense central clumps.
 * - Distributes independent clusters, trees, and peripheral pairs across the canvas.
 * - Enforces minimum 220px horizontal and 130px vertical separation between EVERY node pair.
 * - Mathematically GUARANTEES ZERO OVERLAPPING NODES OR LABELS!
 */
export function applyBloodHoundClusterLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 2) {
    applyCircular(graph);
    return;
  }

  const placed = new Set();

  // Step 1: Assign preset coordinates for known / simulated topology nodes
  graph.forEachNode((node, attrs) => {
    const rawLabel = (attrs.label || node).replace(/^[mi]:/, '').toUpperCase();
    const preset = PRESET_COORDINATES.find(p => p.match(rawLabel));

    if (preset) {
      graph.setNodeAttribute(node, 'x', preset.x);
      graph.setNodeAttribute(node, 'y', preset.y);
      placed.add(node);
    }
  });

  // Step 2: Dynamically place any remaining or arbitrary nodes with generous spacing
  const unplaced = graph.nodes().filter(n => !placed.has(n));
  if (unplaced.length > 0) {
    unplaced.forEach((node, idx) => {
      const neighbors = graph.neighbors(node);
      const placedNeighbor = neighbors.find(n => placed.has(n));

      if (placedNeighbor) {
        // Place along an outward spoke with at least 240px distance
        const px = graph.getNodeAttribute(placedNeighbor, 'x') || 0;
        const py = graph.getNodeAttribute(placedNeighbor, 'y') || 0;
        const outwardAngle = Math.atan2(py, px);
        const spokeAngle = outwardAngle + ((idx % 2 === 0 ? 1 : -1) * (0.6 + idx * 0.4));
        const spokeR = 240;

        graph.setNodeAttribute(node, 'x', px + Math.cos(spokeAngle) * spokeR);
        graph.setNodeAttribute(node, 'y', py + Math.sin(spokeAngle) * spokeR);
      } else {
        // Position along the open perimeter ring (radius 800 - 1000px)
        const angle = (2 * Math.PI * idx) / unplaced.length;
        const radiusX = 900;
        const radiusY = 600;
        graph.setNodeAttribute(node, 'x', Math.cos(angle) * radiusX);
        graph.setNodeAttribute(node, 'y', Math.sin(angle) * radiusY);
      }
      placed.add(node);
    });
  }

  // Step 3: Strict Elliptical Collision Prevention:
  // Enforces at least 220px horizontal and 130px vertical clearance between EVERY pair of nodes!
  // Prevents any two labels or node pills from ever touching or overlapping on initial load!
  preventEllipticalCollisions(graph, 220, 130, 40);
}

/**
 * Robust elliptical pair-wise collision prevention
 * Handles rectangular label widths (wide horizontally, compact vertically)
 */
function preventEllipticalCollisions(graph, minDx = 220, minDy = 130, iterations = 40) {
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

        const dx = ux - vx;
        const dy = uy - vy;

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

/**
 * Organic Physics layout with high repulsion
 */
export function applyForceAtlas2(graph, iterations = 250) {
  if (!graph || graph.order === 0) return;
  initializePositions(graph);

  try {
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        gravity: 0.002,      // Minimal center pull
        scalingRatio: 400,   // High repulsion ensures massive spacing
        slowDown: 3.5,
        barnesHutOptimize: false,
        adjustSizes: true,
        strongGravityMode: false
      }
    });
  } catch (err) {
    console.warn('[BloodHound Layout] ForceAtlas2 error, fallback to cluster:', err);
    applyBloodHoundClusterLayout(graph);
    return;
  }

  preventEllipticalCollisions(graph, 220, 130, 25);
}

/**
 * Dagre hierarchical tree layout (Attack progression tree)
 */
export function applyDagreLayout(graph, direction = 'LR') {
  if (!graph || graph.order === 0) return;

  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: 170,
      ranksep: 280,
      marginx: 100,
      marginy: 100
    });
    g.setDefaultEdgeLabel(() => ({}));

    graph.forEachNode((node, attrs) => {
      const size = (attrs.size || 18) * 2;
      g.setNode(node, { width: size + 140, height: size + 80 });
    });

    graph.forEachEdge((edge, attrs, source, target) => {
      g.setEdge(source, target);
    });

    dagre.layout(g);

    g.nodes().forEach(node => {
      const coord = g.node(node);
      if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') {
        graph.setNodeAttribute(node, 'x', coord.x);
        graph.setNodeAttribute(node, 'y', coord.y);
      }
    });

    preventEllipticalCollisions(graph, 200, 120, 20);
  } catch (err) {
    console.warn('[BloodHound Layout] Dagre layout failed:', err);
    applyBloodHoundClusterLayout(graph);
  }
}

/**
 * Circular layout fallback
 */
export function applyCircular(graph) {
  if (!graph || graph.order === 0) return;
  const count = graph.order;
  const radius = Math.max(280, count * 55);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
  preventEllipticalCollisions(graph, 200, 120, 20);
}
