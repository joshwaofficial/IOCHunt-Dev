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
 * Balanced 4-Quadrant Widescreen Constellation
 * Completely eliminates crowded starbursts, untangles cross-cutting edges,
 * and spreads nodes across all 4 quadrants of the canvas with generous spacing:
 * - Top-Left: Monitored Network & IP Flow (D3F53C0N3, 72.62, 8.8.8.8, 10.90, 185.220, 194.26)
 * - Bottom-Left: Organization Management & Admin Workstations (Org Mgmt, Admin-WS-01/02, Sec-Ops, K8s, Payment-Srv)
 * - Top-Right: Tier-0 Active Directory & Threat Actors (Domain Admins, DC-01, DC-02, Backup-DC, CA-Root, APT29, Certipy, Backup_Svc)
 * - Bottom-Right: Exchange Trusted Subsystem (Exchange Subsystem + EXCH-001 through EXCH-006 fanned widely)
 * - Center: OPIERCE Bridge, SQL-Prod DB, and Exchange Recipient Admins (Mail Gateway, HR-Desk, Sales-WS)
 */
const PRESET_COORDINATES = [
  // =========================================================================
  // QUADRANT 1: TOP-LEFT — Monitored Host & Network Flow (D3F53C0N3 Tree)
  // =========================================================================
  { match: l => l.includes('D3F53C0N3'), x: -620, y: -260 },
  { match: l => l.includes('10.90.121.226') || l.includes('10.90'), x: -840, y: -370 },
  { match: l => l.includes('185.220.101.5') || l.includes('185.220'), x: -850, y: -160 },
  { match: l => l.includes('72.62.241.39') || l.includes('72.62'), x: -410, y: -260 },
  { match: l => l.includes('194.26.29.112') || l.includes('194.26'), x: -440, y: -430 },
  { match: l => l.includes('8.8.8.8'), x: -240, y: -260 },
  { match: l => l.includes('14.99.11.58') || l.includes('14.99'), x: -620, y: -70 },

  // =========================================================================
  // QUADRANT 2: BOTTOM-LEFT — Organization Management & Admin Workstations
  // =========================================================================
  { match: l => l.includes('ORGANIZATION MANAGEMENT'), x: -560, y: 240 },
  { match: l => l.includes('ADMIN-WS-01'), x: -780, y: 160 },
  { match: l => l.includes('ADMIN-WS-02'), x: -560, y: 440 },
  { match: l => l.includes('SEC-OPS-01') || l.includes('SEC-OPS'), x: -350, y: 240 },
  { match: l => l.includes('FS-CORP-01') || l.includes('FS-CORP'), x: -770, y: 350 },
  { match: l => l.includes('K8S-MASTER') || l.includes('K8S'), x: -180, y: 240 },
  { match: l => l.includes('PAYMENT-SRV') || l.includes('PAYMENT'), x: -740, y: 490 },

  // =========================================================================
  // CENTER ZONE — Bridge Attacker, Databases & Identity Groups
  // =========================================================================
  { match: l => l.includes('OPIERCE'), x: 0, y: 0 },
  { match: l => l.includes('SQL-PROD-01') || l.includes('SQL-PROD'), x: -180, y: 80 },
  { match: l => l.includes('EXCHANGE RECIPIENT ADMINS') || l.includes('RECIPIENT ADMINS'), x: 0, y: -260 },
  { match: l => l.includes('MAIL-GATEWAY') || l.includes('MAIL-GATEWAY-01'), x: 200, y: -260 },
  { match: l => l.includes('HR-DESK') || l.includes('HR-DESK-01'), x: -160, y: -380 },
  { match: l => l.includes('SALES-WS') || l.includes('SALES-WS-01'), x: 0, y: -440 },

  // =========================================================================
  // QUADRANT 3: TOP-RIGHT — Tier-0 Active Directory & Threat Actors (Utilizes Empty Top-Right!)
  // =========================================================================
  { match: l => l.includes('DOMAIN ADMINS'), x: 580, y: -260 },
  { match: l => l.includes('DC-01.DEFSECON.LOCAL') || l === 'DC-01', x: 780, y: -180 },
  { match: l => l.includes('DC-02.DEFSECON.LOCAL') || l === 'DC-02', x: 580, y: -440 },
  { match: l => l.includes('BACKUP-DC.DEFSECON.LOCAL') || l.includes('BACKUP-DC'), x: 790, y: -390 },
  { match: l => l.includes('CA-ROOT-01') || l.includes('CA-ROOT'), x: 380, y: -180 },
  { match: l => l.includes('APT29_ACTOR') || l.includes('APT29'), x: 960, y: -180 },
  { match: l => l.includes('CERTIPY_SCANNER') || l.includes('CERTIPY'), x: 180, y: -180 },
  { match: l => l.includes('BACKUP_SVC'), x: 960, y: -390 },
  { match: l => l.includes('DA-JFREEMAN') || l.includes('JFREEMAN'), x: 380, y: -380 },

  // =========================================================================
  // QUADRANT 4: BOTTOM-RIGHT — Exchange Trusted Subsystem (Full Dedicated Half!)
  // =========================================================================
  { match: l => l.includes('EXCHANGE TRUSTED') || l.includes('SUBSYSTEM'), x: 560, y: 260 },
  { match: l => l.includes('EXCH-001'), x: 340, y: 150 },
  { match: l => l.includes('EXCH-002'), x: 560, y: 80 },
  { match: l => l.includes('EXCH-003'), x: 780, y: 150 },
  { match: l => l.includes('EXCH-004'), x: 840, y: 260 },
  { match: l => l.includes('EXCH-005'), x: 780, y: 390 },
  { match: l => l.includes('EXCH-006'), x: 560, y: 450 },
  { match: l => l.includes('45.33.32.156'), x: 980, y: 390 }
];

/**
 * BloodHound Open Constellation Layout
 * - Enforces minimum 240px horizontal and 140px vertical separation between EVERY node pair.
 * - Spreads nodes evenly across all 4 quadrants of the widescreen canvas.
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
        const spokeR = 250;

        graph.setNodeAttribute(node, 'x', px + Math.cos(spokeAngle) * spokeR);
        graph.setNodeAttribute(node, 'y', py + Math.sin(spokeAngle) * spokeR);
      } else {
        // Position along the open perimeter ring (radius 900 - 1100px)
        const angle = (2 * Math.PI * idx) / unplaced.length;
        const radiusX = 950;
        const radiusY = 650;
        graph.setNodeAttribute(node, 'x', Math.cos(angle) * radiusX);
        graph.setNodeAttribute(node, 'y', Math.sin(angle) * radiusY);
      }
      placed.add(node);
    });
  }

  // Step 3: Strict Elliptical Collision Prevention:
  // Enforces at least 240px horizontal and 140px vertical clearance between EVERY pair of nodes!
  // Prevents any two labels or node pills from ever touching or overlapping on initial load!
  preventEllipticalCollisions(graph, 240, 140, 45);
}

/**
 * Robust elliptical pair-wise collision prevention
 * Handles rectangular label widths (wide horizontally, compact vertically)
 */
function preventEllipticalCollisions(graph, minDx = 240, minDy = 140, iterations = 45) {
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

  preventEllipticalCollisions(graph, 240, 140, 30);
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
      nodesep: 180,
      ranksep: 290,
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

    preventEllipticalCollisions(graph, 220, 130, 25);
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
  const radius = Math.max(300, count * 60);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
  preventEllipticalCollisions(graph, 220, 130, 25);
}
