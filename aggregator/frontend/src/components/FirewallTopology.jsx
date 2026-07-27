import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import axios from 'axios';

function isPrivateIp(ip) {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const p = parseInt(ip.split('.')[1], 10);
    return p >= 16 && p <= 31;
  }
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('127.')) return true;
  return false;
}

export default function FirewallTopology({ from, to, action, service, ip, device, onFlowSelect }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState(null);

  useEffect(() => {
    fetchTopology();
  }, [from, to, action, service, ip, device]);

  const fetchTopology = async () => {
    try {
      const res = await axios.get('/api/firewall/topology', {
        params: { from, to, action, service, ip, device }
      });
      renderGraph(res.data.devices, res.data.connections);
    } catch (err) {
      console.error('Failed to load firewall topology', err);
    }
  };

  const renderGraph = (devices, connections) => {
    if (!containerRef.current) return;

    if (!devices.length && !connections.length) {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
      containerRef.current.innerHTML = '<div class="empty" style="padding-top:80px; text-align:center; color:var(--muted)">No topology data matches filter</div>';
      setCounts({ nodes: 0, edges: 0 });
      return;
    } else {
      containerRef.current.innerHTML = '';
    }

    const nodesData = new DataSet();
    const edgesData = new DataSet();
    const seen = new Set();
    const intIps = new Set();

    devices.forEach(d => { if (d.is_internal) intIps.add(d.ip); });
    if (!intIps.size) {
      connections.forEach(c => {
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(c.src_ip)) intIps.add(c.src_ip);
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(c.dst_ip)) intIps.add(c.dst_ip);
      });
    }

    const addNode = (ip) => {
      if (seen.has(ip)) return;
      seen.add(ip);
      const isInt = intIps.has(ip);
      nodesData.add(isInt
        ? { id: ip, label: ip, shape: 'box', margin: 10, color: { background: '#ffffff', border: '#06b6d4', highlight: { background: '#ecfeff', border: '#22d3ee' } }, font: { color: '#06b6d4', size: 12, face: 'monospace', bold: true }, title: 'Internal: ' + ip, _filterIp: ip }
        : { id: ip, label: ip, shape: 'ellipse', margin: 7, color: { background: '#ffffff', border: '#4a5578', highlight: { background: '#f8fafc', border: '#6b7a9f' } }, font: { color: '#4a5578', size: 11, face: 'monospace', bold: true }, title: 'External: ' + ip, _filterIp: ip }
      );
    };

    const em = {};
    const pc = {};
    connections.forEach(c => {
      addNode(c.src_ip);
      addNode(c.dst_ip);
      const svc = c.service || ('p' + c.dst_port);
      const k = c.src_ip + '|' + c.dst_ip + '|' + svc + '|' + c.action;
      if (!em[k]) em[k] = { src: c.src_ip, dst: c.dst_ip, svc: svc, action: c.action, count: 0, sev: c.severity, dst_port: c.dst_port };
      em[k].count += (c.count || 1);
      if (c.severity === 'critical') em[k].sev = 'critical';
      else if (c.severity === 'high' && em[k].sev !== 'critical') em[k].sev = 'high';
    });

    const rS = [0, 0.25, -0.25, 0.5, -0.5];
    Object.values(em).forEach(e => {
      const ac = (e.action || '').toLowerCase();
      const col = (ac === 'accept' || ac === 'allow') ? '#22c55e' : (ac === 'deny' || ac === 'drop' || ac === 'close') ? '#ef4444' : '#f97316';
      const pk = [e.src, e.dst].sort().join('|');
      if (pc[pk] === undefined) pc[pk] = 0;
      const round = rS[pc[pk] % rS.length];
      pc[pk]++;
      edgesData.add({
        from: e.src, to: e.dst,
        label: e.svc + (e.count > 1 ? ' ×' + e.count : ''),
        width: Math.min(1 + Math.log(e.count + 1), 7),
        dashes: (ac === 'deny' || ac === 'drop' || ac === 'close'),
        color: { color: col + 'bb', highlight: col },
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        smooth: { type: 'curvedCW', roundness: round },
        font: { size: 9, color: '#e2e8f0', strokeWidth: 3, strokeColor: '#0b0e14', align: 'middle' },
        title: ac.toUpperCase() + ' | ' + e.src + ' → ' + e.dst + ' | ' + e.svc + ' | x' + e.count + ' | ' + (e.sev || 'info'),
        _detail: e
      });
    });

    setCounts({ nodes: seen.size, edges: Object.keys(em).length });

    const options = {
      physics: { solver: 'repulsion', repulsion: { nodeDistance: 200, springLength: 200 }, stabilization: { iterations: 150 } },
      interaction: { hover: true, tooltipDelay: 60 },
      edges: { smooth: { enabled: true } }
    };

    if (networkRef.current) networkRef.current.destroy();

    networkRef.current = new Network(containerRef.current, { nodes: nodesData, edges: edgesData }, options);

    document.fonts.ready.then(() => {
      if (networkRef.current) {
        networkRef.current.redraw();
      }
    });

    networkRef.current.once('stabilizationIterationsDone', () => {
      setTimeout(() => {
        if (networkRef.current) {
          networkRef.current.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
        }
      }, 100);
    });

    // Also force a fit after a slight delay just in case stabilization is skipped or immediate
    setTimeout(() => {
      if (networkRef.current) {
        networkRef.current.fit({ animation: { duration: 800, easingFunction: 'easeInOutQuad' } });
      }
    }, 500);    networkRef.current.on('click', (p) => {
      if (p.edges.length) {
        const edgeId = p.edges[0];
        const e = edgesData.get(edgeId);
        if (!e) return;
        if (e._detail && onFlowSelect) {
          const flow = { src: e._detail.src, dst: e._detail.dst, svc: e._detail.svc, action: e._detail.action };
          setSelectedFilter({ type: 'flow', ...flow });
          onFlowSelect(flow);
        }
      } else if (p.nodes.length) {
        const nodeId = p.nodes[0];
        const n = nodesData.get(nodeId);
        if (!n) return;
        if (n._filterIp && onFlowSelect) {
          setSelectedFilter({ type: 'ip', ip: n._filterIp });
          onFlowSelect({ ip: n._filterIp });
        }
      } else {
        setSelectedFilter(null);
        if (onFlowSelect) onFlowSelect(null);
      }
    });
  };

  const topoZoom = (d) => {
    if (!networkRef.current) return;
    const s = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: Math.max(0.1, Math.min(s + d, 5)), animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
  };

  const topoFit = () => {
    if (!networkRef.current) return;
    networkRef.current.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      if (networkRef.current && containerRef.current) {
        networkRef.current.setSize(containerRef.current.clientWidth + 'px', containerRef.current.clientHeight + 'px');
        networkRef.current.redraw();
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      if (networkRef.current) {
        topoFit();
      }
    }, 50);
  };

  useEffect(() => {
    if (isFullscreen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  const content = (
    <>
      {isFullscreen && <div id="fwTopoOverlay" onClick={toggleFullscreen} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999 }}></div>}
      
      <div id="fwTopoContainer" className={isFullscreen ? "fullscreen-panel" : ""} style={isFullscreen ? { 
        position: 'fixed', top: '16px', left: '16px', right: '16px', bottom: '16px', 
        zIndex: 10000, borderRadius: '12px', border: '1px solid var(--border)', 
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', background: 'var(--surface-solid)', 
        margin: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' 
      } : { 
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', 
        overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 0.3s' 
      }}>
        
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <h3 style={{ fontWeight: 700, fontSize: '14px', color: '#06b6d4', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>account_tree</span> Firewall Topology
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginRight: '5px' }}>{counts.nodes} IPs • {counts.edges} Flows</span>
            <button onClick={() => topoZoom(0.3)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>+</button>
            <button onClick={() => topoZoom(-0.3)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>-</button>
            <button onClick={topoFit} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>Fit</button>
            {!isFullscreen && <button onClick={toggleFullscreen} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}>Full Screen</button>}
            {isFullscreen && <button onClick={toggleFullscreen} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '24px', cursor: 'pointer', lineHeight: 1, marginLeft: '12px' }}>&times;</button>}
          </div>
        </div>

        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
           <div id="fwGraph" ref={containerRef} style={{ flex: isFullscreen ? 1 : 'none', height: isFullscreen ? 0 : '350px', minHeight: isFullscreen ? 0 : '350px', borderRadius: '8px', background: 'var(--surface2)' }} />

             <div id="fwTopoInfo" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', padding: '6px 0 2px', textAlign: 'center' }}>
               {selectedFilter ? (
                 selectedFilter.type === 'flow' ? (
                   <span style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                     &#9660; Flow: <b style={{ color: '#f97316' }}>{selectedFilter.src}</b>
                     &#8594; <b style={{ color: '#60a5fa' }}>{selectedFilter.dst}</b>
                     | <b style={{ color: '#22d3ee' }}>{(selectedFilter.svc||'').toUpperCase()}</b>
                     | <span style={{ 
                         color: (selectedFilter.action||'').toLowerCase() === 'accept' ? '#22c55e' : ((selectedFilter.action||'').toLowerCase() === 'deny' || (selectedFilter.action||'').toLowerCase() === 'drop') ? '#ef4444' : '#f97316', 
                         background: (selectedFilter.action||'').toLowerCase() === 'accept' ? 'rgba(34,197,94,0.1)' : ((selectedFilter.action||'').toLowerCase() === 'deny' || (selectedFilter.action||'').toLowerCase() === 'drop') ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)', 
                         padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700 
                       }}>{selectedFilter.action}</span>
                     <button onClick={() => { setSelectedFilter(null); if(onFlowSelect) onFlowSelect(null); }} style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#f87171', padding: '1px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', marginLeft: '6px' }}>&#x2715; Clear</button>
                   </span>
                 ) : (
                   <span style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                     &#9660; IP: <b style={{ color: '#f97316' }}>{selectedFilter.ip}</b>
                     <button onClick={() => { setSelectedFilter(null); if(onFlowSelect) onFlowSelect(null); }} style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#f87171', padding: '1px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', marginLeft: '6px' }}>&#x2715; Clear</button>
                   </span>
                 )
               ) : 'Click a node or edge to inspect'}
             </div>
             
             <div className="tleg" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', padding: '6px 0', fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--muted)' }}>
               <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '10px', height: '8px', background: '#ffffff', border: '2px solid #06b6d4', borderRadius: '2px', display: 'inline-block' }}></span>Internal</span>
               <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: '9px', height: '9px', background: '#ffffff', border: '2px solid #4a5578', borderRadius: '50%', display: 'inline-block' }}></span>External</span>
               <span style={{ color: '#22c55e' }}>&#8594; Accept</span>
               <span style={{ color: '#ef4444' }}>&#8594; Deny/Drop</span>
               <span style={{ color: '#f97316' }}>&#8594; RST/Timeout</span>
             </div>

          </div>
        </div>
    </>
  );

  return content;
}
