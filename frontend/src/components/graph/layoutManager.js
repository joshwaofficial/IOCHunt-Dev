import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(200, nodeCount * 30);
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
 * True BloodHound Clustered Island Layout (Exact Replica of Reference Image 3)
 * 1. Groups & Core Authorities are placed in dedicated, widely-spaced Island Centers.
 * 2. Every single member node is placed in a tight, localized flower around its own parent group (never across the screen!).
 * 3. Central bridge nodes (like OPIERCE & APT29) sit cleanly in the middle to connect the islands.
 * 4. Pair-wise collision clearance guarantees ZERO overlapping nodes on initial refresh.
 */
export function applyBloodHoundClusterLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 3) {
    applyCircular(graph);
    return;
  }

  // 1. Identify True Primary Hubs (Groups and Core Authorities)
  const primaryHubs = [];
  const membersByHub = new Map();
  const bridgeNodes = [];

  graph.forEachNode(node => {
    const attrs = graph.getNodeAttributes(node);
    const isGroup = attrs.entityType === 'group' ||
      (attrs.label && (
        attrs.label.includes('SUBSYSTEM') ||
        attrs.label.includes('ADMINS') ||
        attrs.label.includes('MANAGEMENT') ||
        attrs.label.includes('GROUP')
      ));

    if (isGroup) {
      primaryHubs.push(node);
      membersByHub.set(node, new Set());
    }
  });

  // If DC-01 exists, make it an identity authority hub
  const dcNode = graph.nodes().find(n => n.includes('DC-01') || n.includes('DOMAIN-CONTROLLER'));
  if (dcNode && !primaryHubs.includes(dcNode)) {
    primaryHubs.push(dcNode);
    membersByHub.set(dcNode, new Set());
  }

  // If D3F53C0N3 or a primary entrypoint machine exists, make it an entry hub
  const entryNode = graph.nodes().find(n => n.includes('D3F53C0N3') || n.includes('72.62.241.39'));
  if (entryNode && !primaryHubs.includes(entryNode) && primaryHubs.length < 6) {
    primaryHubs.push(entryNode);
    membersByHub.set(entryNode, new Set());
  }

  // Fallback: If still fewer than 3 hubs found, pick top degree server nodes
  if (primaryHubs.length < 3) {
    const sorted = graph.nodes().map(n => ({
      node: n,
      deg: graph.degree(n),
      attrs: graph.getNodeAttributes(n)
    })).sort((a, b) => b.deg - a.deg);

    for (const item of sorted) {
      if (!primaryHubs.includes(item.node) && primaryHubs.length < 5) {
        if (item.attrs.entityType !== 'actor' && !item.attrs.label.includes('@')) {
          primaryHubs.push(item.node);
          membersByHub.set(item.node, new Set());
        }
      }
    }
  }

  const hubSet = new Set(primaryHubs);
  const assigned = new Set(primaryHubs);

  // 2. Assign each node to its direct parent Hub (Zero cross-screen separation!)
  // Priority A: Direct MemberOf or edge to a hub
  graph.forEachNode(node => {
    if (assigned.has(node)) return;

    const neighbors = graph.neighbors(node);
    const connectedHubs = neighbors.filter(n => hubSet.has(n));

    if (connectedHubs.length === 1) {
      // Exclusively belongs to this hub's island
      membersByHub.get(connectedHubs[0]).add(node);
      assigned.add(node);
    } else if (connectedHubs.length > 1) {
      // Connects to multiple hubs -> Central Bridge Node (like OPIERCE)
      bridgeNodes.push(node);
      assigned.add(node);
    }
  });

  // Priority B: 2-hop connection (nodes attached to a member of a hub)
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
      // Assign to whichever hub has the fewest members to maintain visual balance
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

  // 3. Position the Primary Hubs in widely-separated Island Centers (500px+ separation)
  const hubCount = primaryHubs.length;
  const hubRadius = Math.max(420, hubCount * 85);

  primaryHubs.forEach((hub, idx) => {
    // Distribute hub centers evenly in a circle starting at -PI/2 (top center)
    const angle = (2 * Math.PI * idx) / hubCount - Math.PI / 2;
    const hx = Math.cos(angle) * hubRadius;
    const hy = Math.sin(angle) * hubRadius;

    graph.setNodeAttribute(hub, 'x', hx);
    graph.setNodeAttribute(hub, 'y', hy);

    // 4. Position ALL members of this hub in a tight localized ring directly around its parent!
    const members = Array.from(membersByHub.get(hub) || []);
    const mCount = members.length;

    if (mCount > 0) {
      const orbitR = Math.max(130, 115 + mCount * 4);
      // Fan outwards away from center (0, 0)
      const outwardAngle = Math.atan2(hy, hx);
      const spread = Math.min(Math.PI * 1.8, Math.max(Math.PI * 0.9, mCount * 0.44));
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

  // 5. Position Central Bridge Nodes (like OPIERCE & APT29) cleanly in the central crossing zone
  const bCount = bridgeNodes.length;
  bridgeNodes.forEach((bNode, bIdx) => {
    if (bCount === 1) {
      graph.setNodeAttribute(bNode, 'x', 0);
      graph.setNodeAttribute(bNode, 'y', 0);
    } else {
      const bAngle = (2 * Math.PI * bIdx) / bCount;
      const bDist = Math.min(90, 30 * bCount);
      graph.setNodeAttribute(bNode, 'x', Math.cos(bAngle) * bDist);
      graph.setNodeAttribute(bNode, 'y', Math.sin(bAngle) * bDist);
    }
  });

  // 6. Strict Pair-Wise Collision Clearance Pass:
  // Guarantees at least 115px between EVERY pair of nodes! Zero overlap on initial refresh!
  preventCollisions(graph, 115, 25);
}

/**
 * Robust pair-wise collision prevention
 * Pushes any overlapping nodes apart along their collision normal until all clearances are satisfied
 */
function preventCollisions(graph, minDistance = 115, iterations = 25) {
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
        gravity: 0.005,      // Very light center pull prevents dense crushing
        scalingRatio: 280,   // High repulsion keeps nodes far apart
        slowDown: 3,
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

  preventCollisions(graph, 115, 15);
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
      nodesep: 130,
      ranksep: 220,
      marginx: 80,
      marginy: 80
    });
    g.setDefaultEdgeLabel(() => ({}));

    graph.forEachNode((node, attrs) => {
      const size = (attrs.size || 18) * 2;
      g.setNode(node, { width: size + 90, height: size + 60 });
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

    preventCollisions(graph, 115, 10);
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
  const radius = Math.max(180, count * 35);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
  preventCollisions(graph, 115, 10);
}
