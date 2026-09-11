import forceAtlas2 from 'graphology-layout-forceatlas2';
import dagre from '@dagrejs/dagre';

/**
 * Ensures all nodes in graph have valid initial (x, y) coordinates
 */
export function initializePositions(graph) {
  const nodeCount = graph.order;
  if (nodeCount === 0) return;

  const radius = Math.max(160, nodeCount * 30);
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
 * BloodHound Clustered Star Layout (Matching Reference Image 3)
 * Hubs (Groups, Domain Controllers, Critical Servers) are placed in well-spaced clusters,
 * with member nodes fanning out in clean radial orbits around their respective hub.
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

  // 2. Identify Hubs, Leaves, and Isolated Nodes
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

  // Fallback: if few hubs, pick highest-degree nodes
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
      // Connects to non-hub, assign or promote
      if (neighbors.length > 0 && hubSet.has(neighbors[0])) {
        leavesByHub.get(neighbors[0])?.push(node);
      } else {
        hubs.push(node);
        leavesByHub.set(node, []);
        hubSet.add(node);
      }
    }
  });

  // 4. Position Hub Centers in a spacious constellation (at least 360-600px radius)
  const hubCount = hubs.length;
  const hubRadius = Math.max(340, hubCount * 80);

  hubs.forEach((hub, idx) => {
    const angle = (2 * Math.PI * idx) / hubCount;
    const hx = Math.cos(angle) * hubRadius;
    const hy = Math.sin(angle) * hubRadius;
    graph.setNodeAttribute(hub, 'x', hx);
    graph.setNodeAttribute(hub, 'y', hy);

    // 5. Position Leaf Nodes symmetrically in a clean radial arc around this Hub
    const leaves = leavesByHub.get(hub) || [];
    const leafCount = leaves.length;
    if (leafCount > 0) {
      const outwardAngle = Math.atan2(hy, hx);
      const orbitRadius = Math.max(130, 110 + leafCount * 6);
      const spread = Math.min(Math.PI * 1.8, Math.max(Math.PI * 0.9, leafCount * 0.38));
      const startAngle = outwardAngle - spread / 2;

      leaves.forEach((leaf, lIdx) => {
        const leafAngle = leafCount === 1 ? outwardAngle : startAngle + (spread * lIdx) / (leafCount - 1);
        const lx = hx + Math.cos(leafAngle) * orbitRadius;
        const ly = hy + Math.sin(leafAngle) * orbitRadius;
        graph.setNodeAttribute(leaf, 'x', lx);
        graph.setNodeAttribute(leaf, 'y', ly);
      });
    }
  });

  // 6. Position multi-hub bridge nodes centrally between their connected hubs (like OPIERCE in Image 3)
  multiHubNodes.forEach(({ node, hubs: connectedHubs }) => {
    let avgX = 0;
    let avgY = 0;
    connectedHubs.forEach(h => {
      avgX += graph.getNodeAttribute(h, 'x') || 0;
      avgY += graph.getNodeAttribute(h, 'y') || 0;
    });
    graph.setNodeAttribute(node, 'x', avgX / connectedHubs.length);
    graph.setNodeAttribute(node, 'y', avgY / connectedHubs.length);
  });

  // 7. Orderly position any isolated nodes along an outer boundary arc
  if (isolated.length > 0) {
    const isoRadius = hubRadius + 240;
    isolated.forEach((isoNode, iIdx) => {
      const angle = (2 * Math.PI * iIdx) / isolated.length;
      graph.setNodeAttribute(isoNode, 'x', Math.cos(angle) * isoRadius);
      graph.setNodeAttribute(isoNode, 'y', Math.sin(angle) * isoRadius);
    });
  }

  // 8. Controlled relaxation pass with collision prevention
  try {
    forceAtlas2.assign(graph, {
      iterations: 80,
      settings: {
        gravity: 0.02,
        scalingRatio: 130,
        slowDown: 3,
        barnesHutOptimize: false,
        adjustSizes: true,
        strongGravityMode: false
      }
    });
  } catch (err) {
    console.warn('[BloodHound Layout] Relaxation pass error:', err);
  }
}

/**
 * Runs ForceAtlas2 layout with low gravity & high repulsion
 * Prevents clustering nodes into a tight messy ball
 */
export function applyForceAtlas2(graph, iterations = 250) {
  if (!graph || graph.order === 0) return;
  initializePositions(graph);

  try {
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        gravity: 0.04,        // Was 0.8! 0.04 allows clusters to naturally breathe
        scalingRatio: 140,    // Strong repulsion gives at least 100px-140px spacing
        slowDown: 2.5,
        barnesHutOptimize: false,
        adjustSizes: true,    // CRITICAL: prevents nodes and labels from colliding
        strongGravityMode: false
      }
    });
  } catch (err) {
    console.warn('[BloodHound Layout] ForceAtlas2 error, fallback to cluster:', err);
    applyBloodHoundClusterLayout(graph);
  }
}

/**
 * Runs Dagre hierarchical tree layout (ideal for attack progression: Actor -> Host -> Domain)
 */
export function applyDagreLayout(graph, direction = 'LR') {
  if (!graph || graph.order === 0) return;

  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: direction,
      nodesep: 110,
      ranksep: 180,
      marginx: 60,
      marginy: 60
    });
    g.setDefaultEdgeLabel(() => ({}));

    graph.forEachNode((node, attrs) => {
      const size = (attrs.size || 16) * 2;
      g.setNode(node, { width: size + 80, height: size + 50 });
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
  const radius = Math.max(160, count * 35);
  let idx = 0;
  graph.forEachNode((node) => {
    const angle = (2 * Math.PI * idx) / count;
    graph.setNodeAttribute(node, 'x', Math.cos(angle) * radius);
    graph.setNodeAttribute(node, 'y', Math.sin(angle) * radius);
    idx++;
  });
}
