import forceAtlas2 from 'graphology-layout-forceatlas2';

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
export const PRESET_COORDINATES = [
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
 * Adaptive density curve.
 * - Small graphs (<40): loose, roomy
 * - Medium (40–80): comfortable
 * - Large (80–150): moderate
 * - Dense (150–300): compact
 * - Huge (300–500): very compact
 * - Ultra (>500): ultra tight
 */
export function getDensityFactors(nodeCount) {
  if (nodeCount <= 40) {
    return { colWidth: 340, rowHeight: 150, rankSep: 520, collisionDx: 300, collisionDy: 140 };
  }
  if (nodeCount <= 80) {
    return { colWidth: 300, rowHeight: 130, rankSep: 460, collisionDx: 260, collisionDy: 120 };
  }
  if (nodeCount <= 150) {
    return { colWidth: 240, rowHeight: 110, rankSep: 380, collisionDx: 200, collisionDy: 100 };
  }
  if (nodeCount <= 300) {
    return { colWidth: 160, rowHeight: 85,  rankSep: 280, collisionDx: 140, collisionDy: 75 };  // ← CHANGED
  }
  if (nodeCount <= 500) {
    return { colWidth: 120, rowHeight: 70,  rankSep: 220, collisionDx: 105, collisionDy: 60 };  // ← CHANGED
  }
  if (nodeCount <= 1000) {
    return { colWidth: 90, rowHeight: 55, rankSep: 170, collisionDx: 80, collisionDy: 45 };  // ← NEW
  }
  return { colWidth: 70, rowHeight: 45, rankSep: 140, collisionDx: 65, collisionDy: 38 };  // ← CHANGED
}

/**
 * Auto-Layout Optimization for Large Graphs
 */
export function optimizeLayoutForLargeGraph(graph, nodeCount) {
  if (nodeCount < 100) return;

  // For large graphs, apply additional spreading
  const spreadFactor = nodeCount > 300 ? 2.2 :
                       nodeCount > 200 ? 1.9 :
                       nodeCount > 150 ? 1.6 : 1.4;

  graph.forEachNode(node => {
    const x = graph.getNodeAttribute(node, 'x') || 0;
    const y = graph.getNodeAttribute(node, 'y') || 0;
    graph.setNodeAttribute(node, 'x', x * spreadFactor);
    graph.setNodeAttribute(node, 'y', y * spreadFactor);
  });
}

/**
 * 1. BloodHound Hierarchical Tree Layout — compression-aware
 */
export function applyBloodHoundTreeLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodes = graph.nodes();
  if (nodes.length <= 2) {
    applyCircular(graph);
    return;
  }

  const nodeCount = graph.order;
  const F = getDensityFactors(nodeCount);
  const { colWidth, rowHeight, rankSep, collisionDx, collisionDy } = F;

  // Connected components
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

  components.sort((a, b) => b.length - a.length);

  let currentOffsetY = 0;

  components.forEach(comp => {
    const compSet = new Set(comp);

    let roots = comp.filter(n => graph.inDegree(n) === 0);
    if (roots.length === 0) {
      const domainRoots = comp.filter(n => {
        const u = n.toUpperCase();
        return u.includes('.CORP') || u.includes('.LOCAL') || u.includes('DOMAIN');
      });
      roots = domainRoots.length > 0
        ? domainRoots
        : [comp.slice().sort((a, b) => graph.inDegree(a) - graph.inDegree(b))[0]];
    }

    const ranks = new Map();
    roots.forEach(r => ranks.set(r, 0));
    const q = roots.map(r => ({ node: r, rank: 0 }));
    const visited = new Set(roots);

    while (q.length > 0) {
      const { node, rank } = q.shift();
      graph.forEachOutNeighbor(node, nbr => {
        if (compSet.has(nbr)) {
          const curR = ranks.get(nbr) || 0;
          const nextR = Math.max(curR, rank + 1);
          ranks.set(nbr, nextR);
          if (!visited.has(nbr)) {
            visited.add(nbr);
            q.push({ node: nbr, rank: nextR });
          }
        }
      });
    }

    comp.forEach(n => { if (!ranks.has(n)) ranks.set(n, 0); });

    const byRank = new Map();
    comp.forEach(n => {
      const r = ranks.get(n);
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(n);
    });

    let compMinY = Infinity, compMaxY = -Infinity;
    let currentBaseX = 0;

    const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);

    sortedRanks.forEach(r => {
      const rNodes = byRank.get(r);
      const count = rNodes.length;

      // Wider wrap for large ranks → fewer rows, better aspect ratio
      let colCount = 1;
      if (count > 4) {
        colCount = Math.min(20, Math.max(2, Math.ceil(Math.sqrt(count * 1.5))));
      }
      const rowCount = Math.ceil(count / colCount);

      rNodes.forEach((node, idx) => {
        const col = idx % colCount;
        const row = Math.floor(idx / colCount);

        const x = currentBaseX + col * colWidth;
        const stagger = (col % 2 === 1) ? rowHeight * 0.28 : 0;
        const y = currentOffsetY + (row - (rowCount - 1) / 2) * rowHeight + stagger;

        graph.setNodeAttribute(node, 'x', x);
        graph.setNodeAttribute(node, 'y', y);
        if (y < compMinY) compMinY = y;
        if (y > compMaxY) compMaxY = y;
      });

      currentBaseX += (colCount - 1) * colWidth + rankSep;
    });

    const compH = (compMaxY - compMinY) || 300;
    currentOffsetY += compH + Math.max(200, nodeCount * 0.8);
  });

  preventEllipticalCollisions(graph, collisionDx, collisionDy, nodeCount > 150 ? 12 : 25);
  centerGraphAtOrigin(graph);
  if (nodeCount > 80) {
    optimizeLayoutForLargeGraph(graph, nodeCount);
  }
}

/**
 * 2. Star Layout — compression-aware
 */
export function applyBloodHoundStarLayout(graph) {
  if (!graph || graph.order === 0) return;
  const nodeCount = graph.order;
  if (nodeCount <= 2) { applyCircular(graph); return; }

  const F = getDensityFactors(nodeCount);
  const placed = new Set();
  const sorted = graph.nodes().slice().sort((a, b) => graph.degree(b) - graph.degree(a));
  const hubLimit = Math.min(24, Math.max(4, Math.round(nodeCount * 0.05)));
  const hubs = sorted.filter(n => graph.degree(n) >= 2).slice(0, hubLimit);

  // Hub spread also compresses with node count
  const hubSpreadR = Math.max(600, Math.sqrt(nodeCount) * (nodeCount > 150 ? 120 : 220));

  hubs.forEach((hub, idx) => {
    const angle = idx * 2.399963;
    const r = hubSpreadR * Math.sqrt((idx + 1) / Math.max(hubs.length, 1));
    graph.setNodeAttribute(hub, 'x', Math.cos(angle) * r);
    graph.setNodeAttribute(hub, 'y', Math.sin(angle) * r * 0.72);
    placed.add(hub);
  });

  const spokeBase = F.colWidth * 1.2;
  hubs.forEach(hub => {
    const hx = graph.getNodeAttribute(hub, 'x') || 0;
    const hy = graph.getNodeAttribute(hub, 'y') || 0;
    const nbrs = graph.neighbors(hub).filter(n => !placed.has(n));

    nbrs.forEach((nbr, nIdx) => {
      const spokeAngle = (2 * Math.PI * nIdx) / (nbrs.length || 1);
      const spokeR = spokeBase + (nIdx % 3) * spokeBase * 0.55 + Math.floor(nIdx / 6) * spokeBase * 0.4;
      graph.setNodeAttribute(nbr, 'x', hx + Math.cos(spokeAngle) * spokeR);
      graph.setNodeAttribute(nbr, 'y', hy + Math.sin(spokeAngle) * spokeR * 0.85);
      placed.add(nbr);
    });
  });

  const unplaced = graph.nodes().filter(n => !placed.has(n));
  const perimR = hubSpreadR * 1.5;
  unplaced.forEach((n, idx) => {
    const a = (2 * Math.PI * idx) / (unplaced.length || 1);
    graph.setNodeAttribute(n, 'x', Math.cos(a) * perimR);
    graph.setNodeAttribute(n, 'y', Math.sin(a) * perimR * 0.68);
    placed.add(n);
  });

  preventEllipticalCollisions(graph, F.collisionDx, F.collisionDy, nodeCount > 150 ? 12 : 25);
  centerGraphAtOrigin(graph);
  if (nodeCount > 80) {
    optimizeLayoutForLargeGraph(graph, nodeCount);
  }
}

/**
 * 3. Physics Layout — compression-aware
 */
export function applyBloodHoundPhysicsLayout(graph) {
  if (!graph || graph.order === 0) return;
  const nodeCount = graph.order;
  if (nodeCount <= 2) { applyCircular(graph); return; }

  const F = getDensityFactors(nodeCount);

  let i = 0;
  const initR = Math.max(300, Math.sqrt(nodeCount) * 40);
  graph.forEachNode(node => {
    const angle = (2 * Math.PI * i) / nodeCount;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * initR);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * initR * 0.75);
    i++;
  });

  try {
    forceAtlas2.assign(graph, {
      iterations: nodeCount > 200 ? 200 : 300,
      settings: {
        gravity: 0.0005,
        scalingRatio: Math.max(800, nodeCount * 30),
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

  // Compression, not expansion, for large graphs
  const expansion = nodeCount <= 60 ? 1.6
                  : nodeCount <= 150 ? 1.2
                  : nodeCount <= 300 ? 0.9
                  : 0.75;

  graph.forEachNode(n => {
    const cx = graph.getNodeAttribute(n, 'x') || 0;
    const cy = graph.getNodeAttribute(n, 'y') || 0;
    graph.setNodeAttribute(n, 'x', cx * expansion);
    graph.setNodeAttribute(n, 'y', cy * expansion);
  });

  preventEllipticalCollisions(graph, F.collisionDx, F.collisionDy, nodeCount > 150 ? 12 : 25);
  centerGraphAtOrigin(graph);
  if (nodeCount > 80) {
    optimizeLayoutForLargeGraph(graph, nodeCount);
  }
}

/**
 * BloodHound Open Constellation Layout (Default Simulation Mode)
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
 * Circular layout fallback
 */
export function applyCircular(graph) {
  if (!graph || graph.order === 0) return;
  const count = graph.order;
  const radius = Math.max(220, count * 40);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius * 0.72);
    idx++;
  });
  preventEllipticalCollisions(graph, 200, 110, 25);
  centerGraphAtOrigin(graph);
}

/**
 * Center the graph at origin (0,0)
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
 * Spatial-hash collision prevention — O(n) instead of O(n²).
 * Handles 500+ nodes without stalling the main thread.
 */
export function preventEllipticalCollisions(graph, minDx = 240, minDy = 140, iterations = 25) {
  const nodes = graph.nodes();
  const n = nodes.length;
  if (n <= 1) return;

  const cellW = Math.max(minDx, 1);
  const cellH = Math.max(minDy, 1);

  for (let pass = 0; pass < iterations; pass++) {
    let hadCollision = false;

    // Build spatial hash
    const grid = new Map();
    for (const u of nodes) {
      const ux = graph.getNodeAttribute(u, 'x') || 0;
      const uy = graph.getNodeAttribute(u, 'y') || 0;
      const k = `${Math.floor(ux / cellW)},${Math.floor(uy / cellH)}`;
      let bucket = grid.get(k);
      if (!bucket) { bucket = []; grid.set(k, bucket); }
      bucket.push(u);
    }

    // Only check neighbors in the 3×3 cell block
    for (const u of nodes) {
      const ux = graph.getNodeAttribute(u, 'x') || 0;
      const uy = graph.getNodeAttribute(u, 'y') || 0;
      const cx = Math.floor(ux / cellW);
      const cy = Math.floor(uy / cellH);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${cx + dx},${cy + dy}`);
          if (!bucket) continue;
          for (const v of bucket) {
            if (u === v) continue;
            if (u > v) continue; // avoid double-processing pairs

            let ux2 = graph.getNodeAttribute(u, 'x') || 0;
            let uy2 = graph.getNodeAttribute(u, 'y') || 0;
            let vx = graph.getNodeAttribute(v, 'x') || 0;
            let vy = graph.getNodeAttribute(v, 'y') || 0;

            let ddx = ux2 - vx;
            let ddy = uy2 - vy;
            if (ddx === 0 && ddy === 0) {
              ddx = (Math.random() - 0.5) * 20;
              ddy = (Math.random() - 0.5) * 20;
            }

            const normSq = (ddx * ddx) / (minDx * minDx) + (ddy * ddy) / (minDy * minDy);
            if (normSq < 1.0) {
              hadCollision = true;
              const norm = Math.sqrt(normSq) || 0.001;
              const f = ((1.0 - norm) / norm) * 0.5;
              const pushX = ddx * f;
              const pushY = ddy * f;

              graph.setNodeAttribute(u, 'x', ux2 + pushX);
              graph.setNodeAttribute(u, 'y', uy2 + pushY);
              graph.setNodeAttribute(v, 'x', vx - pushX);
              graph.setNodeAttribute(v, 'y', vy - pushY);
            }
          }
        }
      }
    }

    if (!hadCollision) break;
  }
}

/**
 * Backward compatibility alias for Tree layout
 */
export const applyDagreLayout = applyBloodHoundTreeLayout;

/**
 * Backward compatibility alias for Physics layout
 */
export const applyForceAtlas2 = applyBloodHoundPhysicsLayout;
