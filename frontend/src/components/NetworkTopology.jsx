import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import axios from 'axios';
import { useFilter } from '../context/FilterContext';

const AD_COL = { DCSync: '#ef4444', DCShadow: '#ef4444', Kerberoasting: '#f97316', RBCD: '#ef4444', PasswordSpray: '#f97316', 'NTLM-Brute': '#f97316', ShadowCred: '#a855f7', ESC1: '#a855f7', ESC2: '#a855f7', ESC3: '#a855f7', ESC6: '#a855f7', CertipyEnum: '#8b5cf6', GoldenCert: '#ef4444', PassCert: '#a855f7', ExplicitCred: '#f97316', NewComputer: '#eab308', ASREPRoast: '#f97316', OverpassHash: '#ef4444', PassTheHash: '#ef4444', ForgedPAC: '#ef4444', SkeletonKey: '#ef4444' };

function adCol(t) { return AD_COL[t] || '#a855f7'; }

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export default function NetworkTopology() {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const rawDataRef = useRef({ inbound: [], outbound: [], lateral: [], ad_attacks: [], machines: [] });

  const { range, machine } = useFilter();
  const [counts, setCounts] = useState({ in: 0, out: 0, lat: 0, ad: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [details, setDetails] = useState(null);
  const [infoText, setInfoText] = useState('Click a node or edge to inspect');

  // Filter state
  const [filterSrc, setFilterSrc] = useState('');
  const [filterDst, setFilterDst] = useState('');
  const [filterPort, setFilterPort] = useState('');
  const [filterProto, setFilterProto] = useState('');
  const [filterDir, setFilterDir] = useState('');
  const [filterCountMsg, setFilterCountMsg] = useState('');

  const [localRange, setLocalRange] = useState(() => {
    return Number(localStorage.getItem('topoRange')) || 24;
  });

  useEffect(() => {
    localStorage.setItem('topoRange', localRange);
    fetchTopology();
  }, [localRange, machine]);

  useEffect(() => {
    applyFilter();
  }, [filterSrc, filterDst, filterPort, filterProto, filterDir]);

  const fetchTopology = async () => {
    try {
      const res = await axios.get(`/api/events/network/topology?hours=${localRange}&machine=${machine}`);
      rawDataRef.current = res.data;

      const { inbound = [], outbound = [], lateral = [], ad_attacks = [], machines = [] } = res.data;
      setCounts({
        in: inbound.length,
        out: outbound.length,
        lat: lateral.length,
        ad: ad_attacks.length
      });

      applyFilter();
    } catch (err) {
      console.error('Failed to load topology', err);
    }
  };

  const applyFilter = () => {
    const raw = rawDataRef.current;
    if (!raw.inbound) return; // not loaded yet

    const src = filterSrc.trim().toLowerCase();
    const dst = filterDst.trim().toLowerCase();
    const port = filterPort.trim();
    const proto = filterProto.trim().toLowerCase();
    const dir = filterDir.trim();

    const noFilter = !src && !dst && !port && !proto && !dir;
    if (noFilter) {
      setFilterCountMsg('');
      renderUnifiedGraph(raw.inbound, raw.outbound, raw.ad_attacks, raw.lateral, raw.machines);
      return;
    }

    const matchPort = (c) => !port || String(c.port || '') === port;
    const matchProto = (p) => !proto || (p || '').toLowerCase().includes(proto);

    const ib = (dir === 'out' || dir === 'ad') ? [] : raw.inbound.filter(c =>
      (!src || (c.from_ip || c.from_machine || '').toLowerCase().includes(src)) &&
      (!dst || (c.to_machine || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol)
    );

    const ob = (dir === 'in' || dir === 'ad') ? [] : raw.outbound.filter(c =>
      (!src || (c.from_machine || '').toLowerCase().includes(src)) &&
      (!dst || (c.to_ip || c.to_machine || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol)
    );

    const lat = (dir === 'in' || dir === 'out' || dir === 'ad') ? [] : raw.lateral.filter(c =>
      (!src || (c.source || '').toLowerCase().includes(src)) &&
      (!dst || (c.target || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol)
    );

    const ad = (dir === 'in' || dir === 'out') ? [] : raw.ad_attacks.filter(c =>
      (!src || (c.actor || c.remote_ip || '').toLowerCase().includes(src)) &&
      (!dst || (c.target_machine || '').toLowerCase().includes(dst)) &&
      matchProto(c.protocol)
    );

    const total = ib.length + ob.length + lat.length + ad.length;
    setFilterCountMsg(`${total} connection${total !== 1 ? 's' : ''} shown`);

    renderUnifiedGraph(ib, ob, ad, lat, raw.machines);
  };

  const clearFilter = () => {
    setFilterSrc('');
    setFilterDst('');
    setFilterPort('');
    setFilterProto('');
    setFilterDir('');
  };

  const renderUnifiedGraph = (inbound, outbound, adAttacks, lateral, machines) => {
    if (!containerRef.current) return;

    if (!inbound.length && !outbound.length && !adAttacks.length && !lateral.length) {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
      containerRef.current.innerHTML = '<div class="empty" style="padding-top:80px; text-align:center; color:var(--muted)">No connections match filter</div>';
      return;
    } else {
      containerRef.current.innerHTML = ''; // clear any empty msg
    }

    const nodesData = new DataSet();
    const edgesData = new DataSet();
    const nodeSet = new Set();
    const knownIds = new Set(machines.map(m => m.id || m.machine || m.ip));

    const ensureMachine = (id) => {
      if (!id) return;
      if (nodeSet.has('m:' + id)) return;
      nodeSet.add('m:' + id);
      nodesData.add({
        id: 'm:' + id, label: id, shape: 'box', margin: 12,
        color: { background: '#ffffff', border: '#3b82f6', highlight: { background: '#f8fafc', border: '#60a5fa' } },
        font: { color: '#3b82f6', size: 14, face: 'monospace', bold: true }, title: 'Monitored: ' + id
      });
    };

    const ensureIp = (ip) => {
      if (!ip) return;
      const nid = 'i:' + ip;
      if (nodeSet.has(nid)) return;
      nodeSet.add(nid);
      if (isPrivate(ip)) {
        nodesData.add({
          id: nid, label: ip, shape: 'box', margin: 9, borderDashes: [5, 3],
          color: { background: '#ffffff', border: '#84cc16', highlight: { background: '#f7fee7', border: '#bef264' } },
          font: { color: '#84cc16', size: 12, face: 'monospace', bold: true }, title: 'Private (unmonitored): ' + ip
        });
      } else {
        nodesData.add({
          id: nid, label: ip, shape: 'ellipse', margin: 7,
          color: { background: '#ffffff', border: '#4a5578', highlight: { background: '#f8fafc', border: '#6b7a9f' } },
          font: { color: '#4a5578', size: 12, face: 'monospace', bold: true }, title: 'External IP: ' + ip
        });
      }
    };

    const ensureActor = (key, label, type) => {
      if (!key) return;
      const nid = 'a:' + key;
      if (nodeSet.has(nid)) return;
      nodeSet.add(nid);
      const col = adCol(type);
      nodesData.add({
        id: nid, label: label + ' (' + type + ')', shape: 'box', margin: 11,
        color: { background: '#ffffff', border: col, highlight: { background: '#faf5ff', border: '#d8b4fe' } },
        font: { color: col, size: 13, face: 'monospace', bold: true }, title: 'AD Actor: ' + label + ' [' + type + ']'
      });
    };

    const pairCount = {};
    const rS = [0, 0.25, -0.25, 0.5, -0.5, 0.12, -0.12];
    const allE = [];

    inbound.forEach(c => {
      ensureMachine(c.to_machine);
      if (c.from_machine && knownIds.has(c.from_machine)) ensureMachine(c.from_machine);
      else ensureIp(c.from_ip);
      const fi = (c.from_machine && knownIds.has(c.from_machine)) ? 'm:' + c.from_machine : 'i:' + c.from_ip;
      if (fi && c.to_machine) allE.push({ fromId: fi, toId: 'm:' + c.to_machine, conn: c, dir: 'in' });
    });

    outbound.forEach(c => {
      ensureMachine(c.from_machine);
      if (c.to_machine && knownIds.has(c.to_machine)) ensureMachine(c.to_machine);
      else ensureIp(c.to_ip);
      const ti = (c.to_machine && knownIds.has(c.to_machine)) ? 'm:' + c.to_machine : 'i:' + c.to_ip;
      if (c.from_machine && ti) allE.push({ fromId: 'm:' + c.from_machine, toId: ti, conn: c, dir: 'out' });
    });

    lateral.forEach(c => {
      ensureMachine(c.source);
      ensureMachine(c.target);
      if (c.source && c.target) allE.push({ fromId: 'm:' + c.source, toId: 'm:' + c.target, conn: c, dir: 'lat' });
    });

    adAttacks.forEach(a => {
      ensureMachine(a.target_machine);
      let fromId;
      if (a.remote_ip && isPrivate(a.remote_ip)) {
        ensureIp(a.remote_ip);
        fromId = 'i:' + a.remote_ip;
      } else {
        const ak = (a.actor || '?') + '|' + a.attack_type;
        ensureActor(ak, a.actor || '?', a.attack_type);
        fromId = 'a:' + ak;
      }
      if (fromId && a.target_machine) allE.push({ fromId, toId: 'm:' + a.target_machine, conn: a, dir: 'ad' });
    });

    allE.forEach(d => {
      const pk = [d.fromId, d.toId].sort().join('|');
      if (pairCount[pk] === undefined) pairCount[pk] = 0;
      d.roundness = rS[pairCount[pk] % rS.length];
      pairCount[pk]++;
    });

    allE.forEach((d, index) => {
      const conn = d.conn;
      let col, proto, title, dashes = false;
      let detailRow;

      if (d.dir === 'ad') {
        col = adCol(conn.attack_type);
        proto = conn.attack_type;
        dashes = true;
        title = `AD: ${conn.attack_type} | ${conn.actor || '?'} → ${conn.target_machine || '?'} | ${conn.description || ''} | x${conn.count}`;
        detailRow = {
          first_seen: conn.first_seen, last_seen: conn.last_seen,
          src: conn.actor || conn.remote_ip || '?', dst: conn.target_machine || '?',
          protocol: conn.protocol || conn.attack_type, port: '-',
          count: conn.count, blocked: 0, severity: conn.severity, extra: conn.description
        };
      } else if (d.dir === 'lat') {
        const bl = conn.blocked > 0;
        col = bl ? '#ef4444' : '#ef4444'; // Lateral is red
        proto = (conn.protocol || '') + (conn.port ? ':' + conn.port : '');
        dashes = bl;
        title = `LATERAL | ${proto} | ${conn.source} → ${conn.target} | x${conn.count}${bl ? ' | BLOCKED' : ''}`;
        detailRow = {
          first_seen: conn.first_seen, last_seen: conn.last_seen,
          src: conn.source, dst: conn.target,
          protocol: conn.protocol || '', port: conn.port || '',
          count: conn.count, blocked: conn.blocked || 0, severity: conn.severity, extra: conn.description || (bl ? 'BLOCKED' : '')
        };
      } else {
        const bl = conn.blocked > 0;
        col = bl ? '#ef4444' : d.dir === 'in' ? '#f97316' : '#3b82f6';
        proto = (conn.protocol || '') + (conn.port ? ':' + conn.port : '');
        dashes = bl;
        const srcLabel = d.dir === 'in' ? (conn.from_machine || conn.from_ip) : conn.from_machine;
        const dstLabel = d.dir === 'in' ? conn.to_machine : (conn.to_machine || conn.to_ip);
        title = `${d.dir === 'in' ? 'INBOUND' : 'OUTBOUND'} | ${proto} | ${srcLabel} → ${dstLabel} | x${conn.count}${bl ? ' | BLOCKED' : ''}`;
        detailRow = {
          first_seen: conn.first_seen, last_seen: conn.last_seen,
          src: srcLabel, dst: dstLabel,
          protocol: conn.protocol || '', port: conn.port || '',
          count: conn.count, blocked: conn.blocked || 0, severity: conn.severity, extra: conn.description || (bl ? 'BLOCKED' : '')
        };
      }

      edgesData.add({
        id: `edge_${d.fromId}_${d.toId}_${proto}_${d.dir}_${index}`,
        from: d.fromId, to: d.toId,
        label: proto,
        width: d.dir === 'ad' ? Math.min(2 + Math.log(conn.count + 1), 6) : Math.min(1 + Math.log(conn.count + 1), 5),
        dashes: dashes,
        color: { color: col + 'cc', highlight: col },
        arrows: { to: { enabled: true, scaleFactor: d.dir === 'ad' ? 0.9 : 0.65 } },
        smooth: { type: 'curvedCW', roundness: d.roundness },
        font: { size: 10, color: '#e2e8f0', strokeWidth: 1, strokeColor: '#0b0e14', align: 'middle' },
        title: title,
        _detail: detailRow,
        _dir: d.dir
      });
    });

    const options = {
      physics: { solver: 'repulsion', repulsion: { nodeDistance: 300, springLength: 250 }, stabilization: { iterations: 200 } },
      interaction: { hover: true, tooltipDelay: 60 },
      edges: { smooth: { enabled: true } }
    };

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    networkRef.current = new Network(containerRef.current, { nodes: nodesData, edges: edgesData }, options);

    document.fonts.ready.then(() => {
      if (networkRef.current) {
        networkRef.current.redraw();
      }
    });

    // Automatically fit with buffer once initial physics simulation settles
    networkRef.current.once('stabilizationIterationsDone', () => {
      topoFit();
    });

    networkRef.current.on('click', (p) => {
      if (p.nodes.length) {
        const nodeId = p.nodes[0];
        const n = nodesData.get(nodeId);
        if (!n) return;
        setInfoText(n.title || n.label || '');
        const detailRows = [];
        edgesData.get().forEach(e2 => {
          if (e2.from !== nodeId && e2.to !== nodeId) return;
          if (e2._detail) {
            detailRows.push({ ...e2._detail, _dir: e2._dir });
          }
        });
        detailRows.sort((a, b) => (b.count || 1) - (a.count || 1));
        if (detailRows.length) {
          setDetails({ title: `NODE: ${n.label || ''} — ${detailRows.length} connection(s)`, rows: detailRows });
        }
      } else if (p.edges.length) {
        const edgeId = p.edges[0];
        const e = edgesData.get(edgeId);
        if (!e) return;
        setInfoText(e.title || '');
        if (e._detail) {
          const dirLabel = e._dir === 'ad' ? 'AD ATTACK' : e._dir === 'lat' ? 'LATERAL' : e._dir === 'in' ? 'INBOUND' : 'OUTBOUND';
          setDetails({ title: `${dirLabel} — ${e._detail.protocol || ''} ${e._detail.src || ''} → ${e._detail.dst || ''}`, rows: [e._detail] });
        }
      } else {
        setInfoText('Click a node or edge to inspect');
        setDetails(null);
      }
    });
  };

  const topoZoom = (d) => {
    if (!networkRef.current) return;
    const s = networkRef.current.getScale();
    networkRef.current.moveTo({ scale: Math.max(0.1, Math.min(s + d, 5)), animation: { duration: 200, easingFunction: 'easeInOutQuad' } });
  };

  const topoFit = () => {
    if (!networkRef.current || !containerRef.current) return;

    // Crucial: synchronize internal canvas size with flexbox container before fitting
    networkRef.current.setSize(containerRef.current.clientWidth + 'px', containerRef.current.clientHeight + 'px');
    networkRef.current.redraw();

    // Instantly calculate the perfect fit bounds
    networkRef.current.fit();

    // Smoothly zoom out 20% from that perfect center to ensure no nodes are clipped
    const s = networkRef.current.getScale();
    networkRef.current.moveTo({
      scale: s * 0.8,
      animation: { duration: 400, easingFunction: 'easeInOutQuad' }
    });
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
    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      applyFilter();
    }, 50);
  };

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  const content = (
    <>
      {isFullscreen && <div id="networkTopoOverlay" onClick={toggleFullscreen} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 99998 }}></div>}
      <div id="networkTopoContainer" style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 0.2s ease-out',
        ...(isFullscreen ? { position: 'fixed', top: '2vh', left: '2vw', width: '96vw', height: '96vh', zIndex: 99999, margin: 0, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' } : { flex: 1 })
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(59,130,246,0.05))', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hub</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.3px' }}>Network Topology</div>
          </div>

          <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--mono)', fontSize: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={localRange} onChange={(e) => setLocalRange(Number(e.target.value))} style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'var(--sans)', marginRight: '8px' }}>
              <option value="1">Last 1h</option>
              <option value="7">Last 7h</option>
              <option value="24">Last 24h</option>
              <option value="72">Last 3d</option>
              <option value="168">Last 7d</option>
              <option value="720">Last 30d</option>
            </select>
            <span><span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#f97316', marginRight: '4px', verticalAlign: 'middle' }}></span>{counts.in} inbound</span>
            <span><span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#3b82f6', marginRight: '4px', verticalAlign: 'middle' }}></span>{counts.out} outbound</span>
            <span><span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#ef4444', marginRight: '4px', verticalAlign: 'middle' }}></span>{counts.lat} lateral</span>
            <span style={{ color: '#a855f7' }}><span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#a855f7', marginRight: '4px', verticalAlign: 'middle' }}></span>{counts.ad} AD</span>

            <button onClick={() => topoZoom(0.3)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '3px 9px', cursor: 'pointer', marginLeft: '10px' }}>+</button>
            <button onClick={() => topoZoom(-0.3)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '3px 9px', cursor: 'pointer' }}>-</button>
            <button onClick={topoFit} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '3px 9px', cursor: 'pointer', fontSize: '11px' }}>Fit</button>
            {!isFullscreen && <button onClick={toggleFullscreen} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '3px 9px', cursor: 'pointer', fontSize: '11px' }}>Full Screen</button>}
            {isFullscreen && <button onClick={toggleFullscreen} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '24px', cursor: 'pointer', lineHeight: 1, marginLeft: '8px' }}>&times;</button>}
          </div>
        </div>

        <div className="pb" style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 12px', alignItems: 'center' }}>
            <input placeholder="Source IP…" value={filterSrc} onChange={e => setFilterSrc(e.target.value)} style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '120px' }} />
            <input placeholder="Dest IP…" value={filterDst} onChange={e => setFilterDst(e.target.value)} style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '120px' }} />
            <input placeholder="Port…" value={filterPort} onChange={e => setFilterPort(e.target.value)} style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '72px' }} />

            <select value={filterProto} onChange={e => setFilterProto(e.target.value)} style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>
              <option value="">All protocols</option>
              <option value="rdp">RDP</option><option value="smb">SMB</option><option value="winrm">WinRM</option>
              <option value="winrm-s">WinRM-S</option><option value="ssh">SSH</option><option value="kerberos">Kerberos</option>
              <option value="ldap">LDAP</option><option value="ldaps">LDAPS</option><option value="rpc">RPC</option>
              <option value="meterpreter">Meterpreter</option><option value="http">HTTP</option><option value="https">HTTPS</option>
            </select>

            <select value={filterDir} onChange={e => setFilterDir(e.target.value)} style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}>
              <option value="">All directions</option>
              <option value="in">Inbound</option>
              <option value="out">Outbound</option>
              <option value="ad">AD Attacks</option>
            </select>

            <button onClick={clearFilter} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}>✕ Clear</button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>{filterCountMsg}</span>
          </div>

          {/* Graph Container */}
          <div style={{ flex: 1, minHeight: isFullscreen ? 0 : '500px', position: 'relative', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div className="tg" ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}></div>
          </div>

          {/* Details Panel */}
          {details && (
            <div style={{ marginTop: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase' }}>{details.title}</span>
                <button onClick={() => setDetails(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '15px' }}>&#x2715;</button>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                <table className="mt" style={{ width: '100%', fontSize: '11px', textAlign: 'left', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>First Seen</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Last Seen</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Source</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Destination</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Protocol</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Port</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Count</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Blocked</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Severity</th>
                      <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-solid)', padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{r.first_seen ? new Date(r.first_seen).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{r.last_seen ? new Date(r.last_seen).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#f97316' }}>{r.src || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#60a5fa' }}>{r.dst || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#22d3ee' }}>{r.protocol || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{r.port || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.count || 1}</td>
                        <td style={{ padding: '6px 12px' }}>{r.blocked ? <span className="badge sev-critical">{r.blocked}</span> : <span style={{ color: 'var(--muted)' }}>0</span>}</td>
                        <td style={{ padding: '6px 12px' }}><span className={`badge sev-${r.severity || 'info'}`} style={{ textTransform: 'uppercase' }}>{r.severity || 'info'}</span></td>
                        <td style={{ padding: '6px 12px', minWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.extra || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Info & Legend */}
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text)', fontFamily: 'var(--mono)', textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid var(--border)' }}>
            {infoText}
          </div>
          <div className="tleg" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '12px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: '#1e3a5f', border: '2px solid #3b82f6', borderRadius: '3px' }}></div>Monitored</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: '#1f0a3a', border: '2px solid #a855f7', borderRadius: '3px' }}></div>AD Actor</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '14px', height: '14px', background: '#9aa5c0', borderRadius: '50%' }}></div>External IP</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#f97316', fontWeight: 'bold' }}>&#8592;</span> Inbound</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>&#8594;</span> Outbound</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#a855f7', fontWeight: 'bold' }}>&#8594;</span> AD Attack</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ color: '#ef4444', fontWeight: 'bold' }}>&#8594;</span> Blocked / Lateral</div>
          </div>

        </div>
      </div>
    </>
  );

  return isFullscreen ? createPortal(content, document.body) : content;
}
