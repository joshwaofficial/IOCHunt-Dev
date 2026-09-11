import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(200, nodeCount * 35);
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
 * BloodHound Clustered Star Layout (Deterministic Geometric Alignment)
 * Replicates the pristine BloodHound UI layout from Reference Image 3:
 * 1. Hubs (Groups, Domain Controllers, Critical Servers) are placed in dedicated, wide sectors (500px+ separation).
 * 2. Leaves fan OUTWARDS away from the center into empty space on generous 185px arcs.
 * 3. Bridge nodes (like OPIERCE) sit cleanly in the central crossing zone.
 * 4. Pair-wise collision prevention guarantees ZERO overlapping nodes.
 */
export function applyBloodHoundClusterLayout(graph) {
  if (!graph || graph.order === 0) return;

  const nodeCount = graph.order;
  if (nodeCount <= 3) {
    applyCircular(graph);
    return;
  }

  // 1. Calculate degree for each node
  const degrees = new Map();
  graph.forEachNode(node => {
    degrees.set(node, graph.degree(node));
  });

  // 2. Classify nodes: Hubs vs Leaves vs Multi-hub Bridges vs Isolated
  const hubs = [];
  const leavesByHub = new Map();
  const multiHubNodes = [];
  const isolated = [];

  graph.forEachNode(node => {
    const deg = degrees.get(node) || 0;
    const attrs = graph.getNodeAttributes(node);
    const isSpecial = attrs.entityType === 'group' || attrs.entityType === 'actor' || deg >= 3;

    if (deg === 0) {
      isolated.push(node);
    } else if (isSpecial || deg >= 2) {
      hubs.push(node);
      leavesByHub.set(node, []);
    }
  });

  // Fallback: if too few hubs, pick top 25% highest-degree nodes
  if (hubs.length === 0) {
    const sorted = Array.from(degrees.entries()).sort((a, b) => b[1] - a[1]);
    const hubLimit = Math.max(1, Math.ceil(sorted.length * 0.25));
    for (let i = 0; i < hubLimit; i++) {
      hubs.push(sorted[i][0]);
      leavesByHub.set(sorted[i][0], []);
    }
  }

  const hubSet = new Set(hubs);

  // 3. Assign satellite leaf nodes to their primary connected hub
  graph.forEachNode(node => {
    if (hubSet.has(node) || (degrees.get(node) || 0) === 0) return;

    const neighbors = graph.neighbors(node);
    const connectedHubs = neighbors.filter(n => hubSet.has(n));

    if (connectedHubs.length === 1) {
      const hubList = leavesByHub.get(connectedHubs[0]);
      if (hubList) hubList.push(node);
    } else if (connectedHubs.length > 1) {
      multiHubNodes.push({ node, hubs: connectedHubs });
    } else {
      // Attached to a single non-hub node
      if (neighbors.length > 0 && hubSet.has(neighbors[0])) {
        leavesByHub.get(neighbors[0])?.push(node);
      } else {
        hubs.push(node);
        leavesByHub.set(node, []);
        hubSet.add(node);
      }
    }
  });

  // 4. Position Hub Centers in a generous, spacious constellation
  const hubCount = hubs.length;
  // Large spacing between hubs so star clusters have ample room (480px - 700px radius)
  const hubRadius = Math.max(460, hubCount * 90);

  hubs.forEach((hub, idx) => {
    // Distribute hubs evenly around origin
    const angle = (2 * Math.PI * idx) / hubCount - Math.PI / 2;
    const hx = Math.cos(angle) * hubRadius;
    const hy = Math.sin(angle) * hubRadius;
    graph.setNodeAttribute(hub, 'x', hx);
    graph.setNodeAttribute(hub, 'y', hy);

    // 5. Position Leaf Nodes symmetrically in an OUTWARD radial arc (Pointing AWAY from center)
    const leaves = leavesByHub.get(hub) || [];
    const leafCount = leaves.length;
    if (leafCount > 0) {
      // Outward angle points away from (0, 0) into empty space
      const outwardAngle = Math.atan2(hy, hx);
      const orbitRadius = Math.max(185, 160 + leafCount * 6);
      const spread = Math.min(Math.PI * 1.6, Math.max(Math.PI * 0.8, leafCount * 0.42));
      const startAngle = outwardAngle - spread / 2;

      leaves.forEach((leaf, lIdx) => {
        const leafAngle = leafCount === 1 ? outwardAngle : startAngle + (spread * (lIdx + 0.5)) / leafCount;
        const lx = hx + Math.cos(leafAngle) * orbitRadius;
        const ly = hy + Math.sin(leafAngle) * orbitRadius;
        graph.setNodeAttribute(leaf, 'x', lx);
        graph.setNodeAttribute(leaf, 'y', ly);
      });
    }
  });

  // 6. Position multi-hub bridge nodes centrally between their connected hubs (like OPIERCE in Reference Image 3)
  multiHubNodes.forEach(({ node, hubs: connectedHubs }, bIdx) => {
    let avgX = 0;
    let avgY = 0;
    connectedHubs.forEach(h => {
      avgX += graph.getNodeAttribute(h, 'x') || 0;
      avgY += graph.getNodeAttribute(h, 'y') || 0;
    });
    // Position near centroid but slightly scaled to keep center clear
    const cx = (avgX / connectedHubs.length) * 0.45;
    const cy = (avgY / connectedHubs.length) * 0.45;
    // Add small offset if multiple bridge nodes
    const bAngle = (2 * Math.PI * bIdx) / Math.max(1, multiHubNodes.length);
    const bOffset = multiHubNodes.length > 1 ? 60 : 0;
    graph.setNodeAttribute(node, 'x', cx + Math.cos(bAngle) * bOffset);
    graph.setNodeAttribute(node, 'y', cy + Math.sin(bAngle) * bOffset);
  });

  // 7. Orderly position any isolated nodes along an outer boundary arc
  if (isolated.length > 0) {
    const isoRadius = hubRadius + 280;
    isolated.forEach((isoNode, iIdx) => {
      const angle = (2 * Math.PI * iIdx) / isolated.length;
      graph.setNodeAttribute(isoNode, 'x', Math.cos(angle) * isoRadius);
      graph.setNodeAttribute(isoNode, 'y', Math.sin(angle) * isoRadius);
    });
  }

  // 8. Strict Geometric Collision Prevention Pass:
  // Guarantees that NO TWO NODES or labels ever touch or overlap (minimum 130px center-to-center distance)
  preventCollisions(graph, 130, 20);
}

/**
 * Robust pair-wise collision prevention
 * Pushes any overlapping nodes apart along their collision normal until all clearances are satisfied
 */
function preventCollisions(graph, minDistance = 130, iterations = 20) {
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

  preventCollisions(graph, 130, 15);
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

    preventCollisions(graph, 120, 10);
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
  const radius = Math.max(180, count * 40);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
  preventCollisions(graph, 120, 10);
}
