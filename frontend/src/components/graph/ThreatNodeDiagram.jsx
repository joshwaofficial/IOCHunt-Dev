import React, { useEffect, useRef, useState, useCallback } from 'react';
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

const getCytoscapeStylesheet = (theme, showLabels = true) => {
  const isLight = theme === 'light';
  return [
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
        'background-width': '58%',
        'background-height': '58%',
        'background-position-x': '50%',
        'background-position-y': '50%',
        'background-clip': 'node',
        'overlay-opacity': 0,
        'label': showLabels ? 'data(shortLabel)' : '',
        'text-opacity': showLabels ? 1.0 : 0,
        'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size': '12px',
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        'color': isLight ? '#0f172a' : '#f8fafc',
        'text-background-color': isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        'text-background-opacity': showLabels ? 0.95 : 0,
        'text-background-padding': '3px 6px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.12)',
        'text-border-width': showLabels ? 1 : 0,
        'z-index': 10,
        'transition-property': 'opacity, border-color, border-width, text-opacity, outline-width, outline-color',
        'transition-duration': '0.2s'
      }
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 4.5,
        'border-color': '#2563eb',
        'outline-width': 5,
        'outline-color': 'rgba(37, 99, 235, 0.35)',
        'outline-opacity': 1,
        'z-index': 99
      }
    },
    {
      selector: 'node.patient_zero',
      style: {
        'border-color': '#f97316',
        'border-width': 5,
        'outline-width': 6,
        'outline-color': 'rgba(249, 115, 22, 0.35)',
        'outline-opacity': 1
      }
    },
    {
      selector: 'node.ghosted',
      style: {
        'opacity': 0.18,
        'text-opacity': 0
      }
    },
    {
      selector: 'node.active-timeline',
      style: {
        'border-width': 6,
        'border-color': '#ef4444',
        'outline-width': 8,
        'outline-color': 'rgba(239, 68, 68, 0.45)',
        'outline-opacity': 1,
        'z-index': 100
      }
    },
    // Edges
    {
      selector: 'edge',
      style: {
        'width': 2.5,
        'curve-style': 'bezier',
        'line-color': 'data(color)',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 1.1,
        'opacity': 0.75,
        'label': 'data(label)',
        'font-family': 'var(--mono)',
        'font-size': '10px',
        'font-weight': 600,
        'color': isLight ? '#475569' : '#94a3b8',
        'text-background-color': isLight ? '#ffffff' : '#0f172a',
        'text-background-opacity': 0.9,
        'text-background-padding': '2px 4px',
        'text-background-shape': 'roundrectangle',
        'text-rotation': 'autorotate',
        'transition-property': 'opacity, width, line-color',
        'transition-duration': '0.2s'
      }
    },
    {
      selector: 'edge.highlighted',
      style: {
        'width': 4.5,
        'opacity': 1,
        'z-index': 90
      }
    },
    {
      selector: 'edge.ghosted',
      style: {
        'opacity': 0.1,
        'text-opacity': 0
      }
    },
    {
      selector: 'edge.active-timeline',
      style: {
        'width': 5,
        'opacity': 1,
        'line-color': '#ef4444',
        'target-arrow-color': '#ef4444',
        'z-index': 100
      }
    }
  ];
};

export default function ThreatNodeDiagram({
  nodes = [],
  edges = [],
  theme = 'dark',
  focusIndicator = null,
  activeTimelineEvent = null,
  algorithm = 'none',
  onSelectNode,
  onSelectEdge,
  onClearSelection
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [layoutMode, setLayoutMode] = useState('fcose');
  const [showLabels, setShowLabels] = useState(true);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isAlgoMenuOpen, setIsAlgoMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isLight = theme === 'light';

  // Floating controls styling
  const controlBg = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)';
  const controlBorder = isLight ? 'rgba(203, 213, 225, 0.8)' : 'rgba(255, 255, 255, 0.12)';
  const controlColor = isLight ? '#0f172a' : '#f8fafc';
  const controlHoverBg = isLight ? 'rgba(241, 245, 249, 0.8)' : 'rgba(255, 255, 255, 0.08)';

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    // Prepare elements with SVG icons
    const elements = [
      ...nodes.map(n => {
        const svgIcon = getNodeSvgDataUri(n.data.kind || 'machine', n.data.borderColor || '#3b82f6', '#ffffff');
        return {
          group: 'nodes',
          data: {
            ...n.data,
            svgIcon
          },
          classes: n.data.isPatientZero ? 'patient_zero' : ''
        };
      }),
      ...edges.map(e => ({
        group: 'edges',
        data: {
          ...e.data,
          color: e.data.color || '#3b82f6'
        }
      }))
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet(theme, showLabels),
      boxSelectionEnabled: false,
      autounselectify: false,
      wheelSensitivity: 0.25,
      minZoom: 0.15,
      maxZoom: 3.5
    });

    cyRef.current = cy;

    // Run layout
    runLayout(cy, layoutMode);

    // Event Listeners
    cy.on('tap', 'node', (e) => {
      const nodeData = e.target.data();
      if (onSelectNode) onSelectNode(nodeData);

      // Highlight immediate neighbors
      cy.elements().removeClass('highlighted ghosted');
      const neighborhood = e.target.neighborhood().add(e.target);
      cy.elements().not(neighborhood).addClass('ghosted');
      neighborhood.addClass('highlighted');
    });

    cy.on('tap', 'edge', (e) => {
      const edgeData = e.target.data();
      if (onSelectEdge) onSelectEdge(edgeData);

      cy.elements().removeClass('highlighted ghosted');
      const conn = e.target.connectedNodes().add(e.target);
      cy.elements().not(conn).addClass('ghosted');
      conn.addClass('highlighted');
    });

    cy.on('tap', (e) => {
      if (e.target === cy) {
        cy.elements().removeClass('highlighted ghosted active-timeline');
        if (onClearSelection) onClearSelection();
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [nodes, edges, theme]);

  // Layout Runner Helper
  const runLayout = (cy, mode) => {
    if (!cy) return;
    let layoutConfig = {
      name: 'fcose',
      quality: 'proof',
      randomize: false,
      animate: true,
      animationDuration: 400,
      fit: true,
      padding: 60,
      nodeSeparation: 120,
      nodeRepulsion: 7500,
      idealEdgeLength: 140
    };

    if (mode === 'dagre') {
      layoutConfig = {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 60,
        rankSep: 90,
        animate: true,
        animationDuration: 400,
        fit: true,
        padding: 60
      };
    } else if (mode === 'concentric') {
      layoutConfig = {
        name: 'concentric',
        concentric: (node) => (node.data('isPatientZero') ? 3 : node.data('kind') === 'threat_ioc' ? 2 : 1),
        levelWidth: () => 1,
        animate: true,
        animationDuration: 400,
        fit: true,
        padding: 60
      };
    }

    const layout = cy.layout(layoutConfig);
    layout.run();
  };

  // Re-run layout on mode change
  useEffect(() => {
    if (cyRef.current) {
      runLayout(cyRef.current, layoutMode);
    }
  }, [layoutMode]);

  // Handle Label Visibility Toggle
  useEffect(() => {
    if (cyRef.current) {
      cyRef.current.style(getCytoscapeStylesheet(theme, showLabels));
    }
  }, [showLabels, theme]);

  // Focus on specific indicator if requested from parent table
  useEffect(() => {
    if (!cyRef.current || !focusIndicator) return;
    const cy = cyRef.current;
    const targetNode = cy.nodes().filter(n =>
      n.data('label') === focusIndicator || n.data('fullLabel') === focusIndicator || n.id().includes(focusIndicator)
    ).first();

    if (targetNode.nonempty()) {
      cy.elements().removeClass('highlighted ghosted');
      const neighborhood = targetNode.neighborhood().add(targetNode);
      cy.elements().not(neighborhood).addClass('ghosted');
      neighborhood.addClass('highlighted');
      cy.animate({
        center: { eles: targetNode },
        zoom: 1.3,
        duration: 500
      });
      if (onSelectNode) onSelectNode(targetNode.data());
    }
  }, [focusIndicator]);

  // Handle Timeline Scrubber Event Sync (Attack Replay)
  useEffect(() => {
    if (!cyRef.current || !activeTimelineEvent) return;
    const cy = cyRef.current;

    cy.elements().removeClass('active-timeline');

    const srcNode = cy.getElementById(activeTimelineEvent.sourceId);
    const dstNode = cy.getElementById(activeTimelineEvent.targetId);

    const activeElements = cy.collection();
    if (srcNode.nonempty()) activeElements.merge(srcNode);
    if (dstNode.nonempty()) activeElements.merge(dstNode);

    const connectingEdge = cy.edges().filter(e =>
      (e.source().id() === activeTimelineEvent.sourceId && e.target().id() === activeTimelineEvent.targetId) ||
      (e.source().id() === activeTimelineEvent.targetId && e.target().id() === activeTimelineEvent.sourceId)
    );
    if (connectingEdge.nonempty()) activeElements.merge(connectingEdge);

    activeElements.addClass('active-timeline');

    // Smoothly pan camera to track the current active attack node
    if (srcNode.nonempty() || dstNode.nonempty()) {
      const focusTarget = srcNode.nonempty() ? srcNode : dstNode;
      cy.animate({
        center: { eles: focusTarget },
        duration: 300
      });
    }
  }, [activeTimelineEvent]);

  // Graph Theory Algorithms Execution (BFS, DFS, A*)
  const executeAlgorithm = (algoType) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    cy.elements().removeClass('highlighted ghosted active-timeline');

    // Find root (Patient Zero or primary C2)
    let rootNode = cy.nodes('.patient_zero').first();
    if (rootNode.empty()) rootNode = cy.nodes('[kind = "threat_ioc"]').first();
    if (rootNode.empty()) rootNode = cy.nodes().first();
    if (rootNode.empty()) return;

    if (algoType === 'bfs') {
      // Breadth-First Search (Blast Radius Wave)
      let currentDepth = 0;
      cy.elements().bfs({
        roots: rootNode,
        visit: (v, edge, u, depth) => {
          setTimeout(() => {
            v.addClass('highlighted');
            if (edge) edge.addClass('highlighted');
          }, depth * 400);
          currentDepth = depth;
        },
        directed: false
      });
    } else if (algoType === 'dfs') {
      // Depth-First Search (Kill Chain Trace)
      let step = 0;
      cy.elements().dfs({
        roots: rootNode,
        visit: (v, edge) => {
          setTimeout(() => {
            v.addClass('highlighted');
            if (edge) edge.addClass('highlighted');
          }, step * 300);
          step++;
        },
        directed: false
      });
    } else if (algoType === 'astar') {
      // A* Shortest Attack Path to Crown Jewel
      const targetServer = cy.nodes('[kind = "server"], [kind = "firewall"]').last();
      if (targetServer.nonempty() && targetServer.id() !== rootNode.id()) {
        const astar = cy.elements().aStar({
          root: rootNode,
          goal: targetServer,
          directed: false
        });
        if (astar.found) {
          cy.elements().addClass('ghosted');
          astar.path.removeClass('ghosted').addClass('highlighted');
        }
      }
    }
  };

  // Search Node Handler
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!cyRef.current || !searchQuery.trim()) return;
    const cy = cyRef.current;
    const q = searchQuery.toLowerCase().trim();

    const matched = cy.nodes().filter(n =>
      (n.data('label') || '').toLowerCase().includes(q) ||
      (n.data('fullLabel') || '').toLowerCase().includes(q)
    );

    if (matched.nonempty()) {
      cy.elements().removeClass('highlighted ghosted');
      cy.elements().not(matched).addClass('ghosted');
      matched.addClass('highlighted');
      cy.animate({
        center: { eles: matched.first() },
        zoom: 1.4,
        duration: 400
      });
      if (onSelectNode) onSelectNode(matched.first().data());
    }
  };

  // PNG Export Handler
  const handleExportPng = () => {
    if (!cyRef.current) return;
    const png64 = cyRef.current.png({ full: true, scale: 2, bg: isLight ? '#ffffff' : '#0a0f1d' });
    const a = document.createElement('a');
    a.href = png64;
    a.download = `threat-investigation-graph-${Date.now()}.png`;
    a.click();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Cytoscape Canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Bottom Toolbar (Matched to FirewallNodeDiagram) */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          background: controlBg,
          border: `1px solid ${controlBorder}`,
          borderRadius: '8px',
          padding: '4px',
          boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.1)' : '0 8px 24px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)'
        }}
      >
        {/* Zoom In */}
        <button
          onClick={() => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 1.25)}
          title="Zoom In"
          style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
        </button>

        {/* Zoom Out */}
        <button
          onClick={() => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 0.8)}
          title="Zoom Out"
          style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>remove</span>
        </button>

        {/* Fit to View */}
        <button
          onClick={() => cyRef.current && cyRef.current.fit(undefined, 50)}
          title="Fit Graph to View"
          style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>crop_free</span>
        </button>

        <div style={{ width: '1px', height: '18px', background: controlBorder, margin: '0 2px' }} />

        {/* Layout Mode Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setIsLayoutMenuOpen(!isLayoutMenuOpen); setIsAlgoMenuOpen(false); }}
            title="Switch Graph Layout"
            style={{ width: '32px', height: '32px', background: isLayoutMenuOpen ? controlHoverBg : 'transparent', border: 'none', borderRadius: '6px', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>schema</span>
          </button>

          {isLayoutMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '0',
                minWidth: '210px',
                background: isLight ? '#ffffff' : '#0f172a',
                border: `1px solid ${controlBorder}`,
                borderRadius: '8px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                padding: '6px 0',
                zIndex: 999
              }}
            >
              <button
                onClick={() => { setLayoutMode('fcose'); setIsLayoutMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: layoutMode === 'fcose' ? 'rgba(37,99,235,0.1)' : 'transparent', border: 'none', color: layoutMode === 'fcose' ? '#2563eb' : controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>scatter_plot</span>
                Organic Spring (fCoSE)
              </button>
              <button
                onClick={() => { setLayoutMode('dagre'); setIsLayoutMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: layoutMode === 'dagre' ? 'rgba(37,99,235,0.1)' : 'transparent', border: 'none', color: layoutMode === 'dagre' ? '#2563eb' : controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_tree</span>
                Hierarchical Kill-Chain (Tree)
              </button>
              <button
                onClick={() => { setLayoutMode('concentric'); setIsLayoutMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: layoutMode === 'concentric' ? 'rgba(37,99,235,0.1)' : 'transparent', border: 'none', color: layoutMode === 'concentric' ? '#2563eb' : controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>adjust</span>
                Concentric Blast Radius Rings
              </button>
            </div>
          )}
        </div>

        {/* Algorithm Runner Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setIsAlgoMenuOpen(!isAlgoMenuOpen); setIsLayoutMenuOpen(false); }}
            title="Run Graph Theory Analysis (BFS / DFS / A*)"
            style={{ width: '32px', height: '32px', background: isAlgoMenuOpen ? controlHoverBg : 'transparent', border: 'none', borderRadius: '6px', color: '#a855f7', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hub</span>
          </button>

          {isAlgoMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '42px',
                left: '0',
                minWidth: '220px',
                background: isLight ? '#ffffff' : '#0f172a',
                border: `1px solid ${controlBorder}`,
                borderRadius: '8px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                padding: '6px 0',
                zIndex: 999
              }}
            >
              <div style={{ padding: '4px 14px 6px', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--mono)' }}>
                Graph Theory Analysis
              </div>
              <button
                onClick={() => { executeAlgorithm('bfs'); setIsAlgoMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#f97316' }}>waves</span>
                Run BFS (Blast Radius Wave)
              </button>
              <button
                onClick={() => { executeAlgorithm('dfs'); setIsAlgoMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ef4444' }}>alt_route</span>
                Run DFS (Deepest Kill-Chain)
              </button>
              <button
                onClick={() => { executeAlgorithm('astar'); setIsAlgoMenuOpen(false); }}
                style={{ width: '100%', textAlign: 'left', padding: '8px 14px', background: 'transparent', border: 'none', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#2563eb' }}>navigation</span>
                Run A* (Path to Crown Jewel)
              </button>
            </div>
          )}
        </div>

        {/* Toggle Labels */}
        <button
          onClick={() => setShowLabels(!showLabels)}
          title={showLabels ? "Hide Node Labels" : "Show Node Labels"}
          style={{ width: '32px', height: '32px', background: showLabels ? 'rgba(37,99,235,0.15)' : 'transparent', border: 'none', borderRadius: '6px', color: showLabels ? '#2563eb' : controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>label</span>
        </button>

        {/* Export PNG */}
        <button
          onClick={handleExportPng}
          title="Download High-Res Graph Image"
          style={{ width: '32px', height: '32px', background: 'transparent', border: 'none', borderRadius: '6px', color: controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span>
        </button>

        {/* Search Toggle */}
        <button
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          title="Search Node on Graph"
          style={{ width: '32px', height: '32px', background: isSearchOpen ? 'rgba(37,99,235,0.15)' : 'transparent', border: 'none', borderRadius: '6px', color: isSearchOpen ? '#2563eb' : controlColor, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
        </button>
      </div>

      {/* Search Input Floating Overlay */}
      {isSearchOpen && (
        <form
          onSubmit={handleSearchSubmit}
          style={{
            position: 'absolute',
            bottom: '68px',
            left: '20px',
            zIndex: 45,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: controlBg,
            border: `1px solid ${controlBorder}`,
            borderRadius: '8px',
            padding: '6px 10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(12px)'
          }}
        >
          <input
            type="text"
            placeholder="Search IP, Hash, Host..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            style={{
              background: 'transparent',
              border: 'none',
              color: controlColor,
              fontSize: '12px',
              fontFamily: 'var(--mono)',
              outline: 'none',
              width: '180px'
            }}
          />
          <button type="submit" style={{ background: '#2563eb', border: 'none', color: '#fff', borderRadius: '4px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer' }}>
            Find
          </button>
          <button type="button" onClick={() => setIsSearchOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px' }}>
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
