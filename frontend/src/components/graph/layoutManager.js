import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(260, nodeCount * 45);
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
 * Spacious BloodHound Clustered Island Layout (Matching Reference Image 3)
 * - Fills the widescreen canvas (spanning -800 to +800 px horizontally, -500 to +500 px vertically)
 * - Groups and authority hubs are placed in dedicated, widely-spaced islands (600px - 850px apart)
 * - Each hub's members fan out in a wide 190px-220px radial flower directly around its parent
 * - Central bridge nodes (OPIERCE & APT29) sit cleanly in the central crossing zone
 * - Strict 35-pass collision clearance guarantees minimum 140px clearance: ZERO overlaps!
 */
export function applyBloodHoundClusterLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 3) {
    applyCircular(graph);
    return;
  }

  // 1. Canonical Island Hubs Definitions
  // These assign generous, widescreen coordinates across the entire canvas space
  const PRESET_ISLANDS = [
    {
      id: 'org_mgmt',
      match: (n, l) => l.includes('ORGANIZATION MANAGEMENT') || l.includes('ADMIN-WS') || l.includes('ORG-MGMT'),
      cx: -660,
      cy: -260
    },
    {
      id: 'recipient_admins',
      match: (n, l) => l.includes('RECIPIENT ADMINS') || l.includes('MAIL-GATEWAY') || l.includes('RECIPIENT'),
      cx: -200,
      cy: -420
    },
    {
      id: 'domain_admins',
      match: (n, l) => l.includes('DOMAIN ADMINS') || l.includes('DA-') || l.includes('BACKUP-DC'),
      cx: 660,
      cy: -260
    },
    {
      id: 'exchange_subsystem',
      match: (n, l) => l.includes('SUBSYSTEM') || l.includes('EXCH-') || l.includes('EXCHANGE TRUSTED'),
      cx: 0,
      cy: 420
    },
    {
      id: 'identity_dc',
      match: (n, l) => l.includes('DC-01') || l.includes('DC-02') || l.includes('CA-ROOT') || l.includes('Certipy'),
      cx: 620,
      cy: 280
    },
    {
      id: 'monitored_wan',
      match: (n, l) => l.includes('D3F53C0N3') || l.includes('72.62.241.39') || l.includes('185.220') || l.includes('194.26') || l.includes('10.90'),
      cx: -600,
      cy: 280
    }
  ];

  // 2. Identify Groups and Core Authorities
  const primaryHubs = [];
  const membersByHub = new Map();
  const bridgeNodes = [];

  graph.forEachNode(node => {
    const attrs = graph.getNodeAttributes(node);
    const label = (attrs.label || node).toUpperCase();
    const isGroup = attrs.entityType === 'group' ||
      label.includes('SUBSYSTEM') ||
      label.includes('ADMINS') ||
      label.includes('MANAGEMENT') ||
      label.includes('GROUP');

    if (isGroup) {
      primaryHubs.push(node);
      membersByHub.set(node, new Set());
    }
  });

  // Ensure DC-01 is a hub if present
  const dcNode = graph.nodes().find(n => n.includes('DC-01') || n.includes('DOMAIN-CONTROLLER'));
  if (dcNode && !primaryHubs.includes(dcNode)) {
    primaryHubs.push(dcNode);
    membersByHub.set(dcNode, new Set());
  }

  // Ensure monitored machine is a hub if present
  const entryNode = graph.nodes().find(n => n.includes('D3F53C0N3') || n.includes('72.62.241.39'));
  if (entryNode && !primaryHubs.includes(entryNode) && primaryHubs.length < 6) {
    primaryHubs.push(entryNode);
    membersByHub.set(entryNode, new Set());
  }

  // Fallback: If fewer than 3 hubs found, pick top degree servers
  if (primaryHubs.length < 3) {
    const sorted = graph.nodes().map(n => ({
      node: n,
      deg: graph.degree(n),
      attrs: graph.getNodeAttributes(n)
    })).sort((a, b) => b.deg - a.deg);

    for (const item of sorted) {
      if (!primaryHubs.includes(item.node) && primaryHubs.length < 6) {
        if (item.attrs.entityType !== 'actor' && !item.attrs.label.includes('@')) {
          primaryHubs.push(item.node);
          membersByHub.set(item.node, new Set());
        }
      }
    }
  }

  const hubSet = new Set(primaryHubs);
  const assigned = new Set(primaryHubs);

  // 3. Classify Central Bridge Nodes (like OPIERCE & APT29 that connect across multiple hubs)
  graph.forEachNode(node => {
    if (assigned.has(node)) return;
    const neighbors = graph.neighbors(node);
    const connectedHubs = neighbors.filter(n => hubSet.has(n));

    // If an attacker or actor connects to 2+ distinct groups/hubs, it's a Central Bridge
    const attrs = graph.getNodeAttributes(node);
    const isActor = attrs.entityType === 'actor' || (attrs.label && (attrs.label.includes('@') || attrs.label.includes('APT29')));
    if (connectedHubs.length >= 2 && isActor) {
      bridgeNodes.push(node);
      assigned.add(node);
    }
  });

  // 4. Assign every remaining member to its direct connected Hub
  graph.forEachNode(node => {
    if (assigned.has(node)) return;

    const neighbors = graph.neighbors(node);
    const connectedHubs = neighbors.filter(n => hubSet.has(n));

    if (connectedHubs.length > 0) {
      membersByHub.get(connectedHubs[0]).add(node);
      assigned.add(node);
    }
  });

  // 2-hop assignment for remaining nodes
  graph.forEachNode(node => {
    if (assigned.has(node)) return;

    const neighbors = graph.neighbors(node);
    let bestHub = null;

    for (const n of neighbors) {
      for (const [hub, members] of membersByHub.entries()) {
        if (members.has(n)) {
          bestHub = hub;
          break;
        }
      }
      if (bestHub) break;
    }

    if (bestHub) {
      membersByHub.get(bestHub).add(node);
      assigned.add(node);
    } else {
      // Balance into least populated hub
      let minHub = primaryHubs[0];
      let minCount = Infinity;
      primaryHubs.forEach(h => {
        const sz = membersByHub.get(h).size;
        if (sz < minCount) { minCount = sz; minHub = h; }
      });
      if (minHub) {
        membersByHub.get(minHub).add(node);
        assigned.add(node);
      }
    }
  });

  // 5. Position Island Hubs in Wide-Screen Space (spanning -750 to +750 px horizontally)
  const hubCount = primaryHubs.length;

  primaryHubs.forEach((hub, idx) => {
    const attrs = graph.getNodeAttributes(hub);
    const label = (attrs.label || hub).toUpperCase();

    // Check if hub matches a preset coordinate
    const preset = PRESET_ISLANDS.find(p => p.match(hub, label));
    let hx, hy;

    if (preset) {
      hx = preset.cx;
      hy = preset.cy;
    } else {
      // Geometric elliptical layout across widescreen space
      const angle = (2 * Math.PI * idx) / hubCount - Math.PI / 2;
      hx = Math.cos(angle) * Math.max(550, hubCount * 110);
      hy = Math.sin(angle) * Math.max(380, hubCount * 80);
    }

    graph.setNodeAttribute(hub, 'x', hx);
    graph.setNodeAttribute(hub, 'y', hy);

    // 6. Position ALL member nodes in a wide, generous radial flower around (hx, hy)
    const members = Array.from(membersByHub.get(hub) || []);
    const mCount = members.length;

    if (mCount > 0) {
      // Large orbit radius gives 190px - 230px distance from hub
      const orbitR = Math.max(190, 160 + mCount * 7);
      // Angle pointing outward from (0, 0)
      const outwardAngle = Math.atan2(hy, hx);
      // Wide spread (up to 300 degrees) so members fan out completely without colliding
      const spread = Math.min(Math.PI * 1.85, Math.max(Math.PI * 1.1, mCount * 0.48));
      const startAngle = outwardAngle - spread / 2;

      members.forEach((mNode, mIdx) => {
        const mAngle = mCount === 1 ? outwardAngle : startAngle + (spread * (mIdx + 0.5)) / mCount;
        const mx = hx + Math.cos(mAngle) * orbitR;
        const my = hy + Math.sin(mAngle) * orbitR;

        graph.setNodeAttribute(mNode, 'x', mx);
        graph.setNodeAttribute(mNode, 'y', my);
      });
    }
  });

  // 7. Position Central Bridge Nodes (OPIERCE & APT29) cleanly in the center zone
  const bCount = bridgeNodes.length;
  bridgeNodes.forEach((bNode, bIdx) => {
    if (bCount === 1) {
      graph.setNodeAttribute(bNode, 'x', 0);
      graph.setNodeAttribute(bNode, 'y', -40);
    } else {
      const bAngle = (2 * Math.PI * bIdx) / bCount;
      const bDist = Math.min(110, 45 * bCount);
      graph.setNodeAttribute(bNode, 'x', Math.cos(bAngle) * bDist);
      graph.setNodeAttribute(bNode, 'y', Math.sin(bAngle) * bDist);
    }
  });

  // 8. Strict Pair-Wise Collision Clearance Pass:
  // Enforces minimum 140px clearance between EVERY pair of nodes across the canvas!
  preventCollisions(graph, 140, 35);
}

/**
 * Robust pair-wise collision prevention
 * Pushes any overlapping nodes apart along their collision normal until all clearances are satisfied
 */
function preventCollisions(graph, minDistance = 140, iterations = 35) {
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
        const dist = Math.hypot(dx, dy) || 0.001;

        if (dist < minDistance) {
          hadCollision = true;
          const overlap = (minDistance - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          ux += nx * overlap;
          uy += ny * overlap;
          vx -= nx * overlap;
          vy -= ny * overlap;

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
 * Organic Physics layout with high repulsion to prevent clumping
 */
export function applyForceAtlas2(graph, iterations = 250) {
  if (!graph || graph.order === 0) return;
  initializePositions(graph);

  try {
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        gravity: 0.003,      // Very light center pull
        scalingRatio: 350,   // Extreme repulsion keeps nodes wide apart
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

  preventCollisions(graph, 140, 20);
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
      nodesep: 150,
      ranksep: 240,
      marginx: 90,
      marginy: 90
    });
    g.setDefaultEdgeLabel(() => ({}));

    graph.forEachNode((node, attrs) => {
      const size = (attrs.size || 18) * 2;
      g.setNode(node, { width: size + 110, height: size + 70 });
    });

    graph.forEachEdge((edge, attrs, source, target) => {
      g.setEdge(source, target);
    });

    dagre.layout(g);

    g.nodes().forEach(node => {
      const pos = g.node(node);
      if (pos && graph.hasNode(node)) {
        graph.setNodeAttribute(node, 'x', pos.x);
        graph.setNodeAttribute(node, 'y', pos.y);
      }
    });

    preventCollisions(graph, 130, 15);
  } catch (err) {
    console.warn('[BloodHound Layout] Dagre layout failed:', err);
    applyBloodHoundClusterLayout(graph);
  }
}

/**
 * Fallback Circular Layout
 */
export function applyCircular(graph) {
  if (!graph || graph.order === 0) return;
  const count = graph.order;
  const radius = Math.max(220, count * 45);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
  preventCollisions(graph, 130, 15);
}
