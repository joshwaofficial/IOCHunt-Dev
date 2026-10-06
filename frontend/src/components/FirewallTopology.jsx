import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { getTodayStartAndEnd } from '../utils/dateUtils';
import FirewallNodeDiagram from './graph/FirewallNodeDiagram';
import FirewallEntityPanel from './graph/FirewallEntityPanel';

function isPrivate(ip) {
  if (!ip) return false;
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(ip);
}

export default function FirewallTopology({
  range,
  from,
  to,
  action,
  service,
  ip,
  device,
  severity,
  aggregator,
  onFlowSelect,
  standalone = false,
  onExit
} = {}) {
  const navigate = useNavigate();
  const rawDataRef = useRef({ inbound: [], outbound: [], lateral: [], machines: [], connections: [] });

  const { theme } = useTheme();

  const [counts, setCounts] = useState({ in: 0, out: 0, lat: 0, blocked: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [focusNodeTarget, setFocusNodeTarget] = useState(null);
  const [infoText, setInfoText] = useState('Click a node or edge to inspect');
  const [focusedCategory, setFocusedCategory] = useState('all');

  // Filter state
  const [filterSrc, setFilterSrc] = useState('');
  const [filterDst, setFilterDst] = useState('');
  const [filterPort, setFilterPort] = useState('');
  const [filterProto, setFilterProto] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterCountMsg, setFilterCountMsg] = useState('');

  // Active filtered datasets passed to Firewall diagram
  const [filteredData, setFilteredData] = useState({
    inbound: [],
    outbound: [],
    lateral: [],
    machines: []
  });

  const [localRange, setLocalRange] = useState(() => {
    if (range) return range === 'today' || range === 'custom' ? range : (Number(range) || 24);
    const saved = localStorage.getItem('fwTopoRange');
    if (saved === 'today' || saved === 'custom') return saved;
    return Number(saved) || 24;
  });

  // Sync with parent range if provided
  useEffect(() => {
    if (range !== undefined && range !== null) {
      setLocalRange(range === 'today' || range === 'custom' ? range : (Number(range) || 24));
    }
  }, [range]);

  const updateActiveDatasets = useCallback((inbound, outbound, lateral, machines) => {
    setFilteredData({
      inbound: inbound || [],
      outbound: outbound || [],
      lateral: lateral || [],
      machines: machines || []
    });
  }, []);

  const applyFilter = useCallback(() => {
    const raw = rawDataRef.current;
    if (!raw || !raw.inbound) return;

    const src = filterSrc.trim().toLowerCase();
    const dst = filterDst.trim().toLowerCase();
    const port = filterPort.trim();
    const proto = filterProto.trim().toLowerCase();
    const actFilter = filterAction.trim().toLowerCase();

    const noFilter = !src && !dst && !port && !proto && !actFilter;
    if (noFilter) {
      setFilterCountMsg('');
      updateActiveDatasets(raw.inbound, raw.outbound, raw.lateral, raw.machines);
      return;
    }

    const matchPort = (c) => !port || String(c.port || c.dst_port || '') === port;
    const matchProto = (p) => !proto || (p || '').toLowerCase().includes(proto);
    const matchAction = (c) => {
      if (!actFilter) return true;
      const a = (c.action || '').toLowerCase();
      if (actFilter === 'accept' || actFilter === 'allow') return a === 'accept' || a === 'allow' || a === 'permit';
      if (actFilter === 'deny' || actFilter === 'drop' || actFilter === 'block') return a === 'deny' || a === 'drop' || a === 'block';
      if (actFilter === 'rst' || actFilter === 'timeout') return a.includes('rst') || a.includes('timeout');
      if (actFilter === 'in') return c.dir === 'in';
      if (actFilter === 'out') return c.dir === 'out';
      if (actFilter === 'lat') return c.dir === 'lat';
      return a.includes(actFilter);
    };

    const ib = (actFilter === 'out' || actFilter === 'lat') ? [] : raw.inbound.filter(c =>
      (!src || (c.from_ip || c.from_machine || c.src_ip || '').toLowerCase().includes(src)) &&
      (!dst || (c.to_machine || c.to_ip || c.dst_ip || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol || c.service) && matchAction(c)
    );

    const ob = (actFilter === 'in' || actFilter === 'lat') ? [] : raw.outbound.filter(c =>
      (!src || (c.from_machine || c.src_ip || '').toLowerCase().includes(src)) &&
      (!dst || (c.to_ip || c.to_machine || c.dst_ip || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol || c.service) && matchAction(c)
    );

    const lat = (actFilter === 'in' || actFilter === 'out') ? [] : raw.lateral.filter(c =>
      (!src || (c.source || c.src_ip || '').toLowerCase().includes(src)) &&
      (!dst || (c.target || c.dst_ip || '').toLowerCase().includes(dst)) &&
      matchPort(c) && matchProto(c.protocol || c.service) && matchAction(c)
    );

    const total = ib.length + ob.length + lat.length;
    setFilterCountMsg(`${total} connection${total !== 1 ? 's' : ''} shown`);

    updateActiveDatasets(ib, ob, lat, raw.machines);
  }, [filterSrc, filterDst, filterPort, filterProto, filterAction, updateActiveDatasets]);

  // Fetch Live Firewall Topology from API
  const fetchTopology = useCallback(async () => {
    try {
      let params = { action, service, ip, device, severity, aggregator };

      let f = from;
      let t = to;

      if (localRange === 'today') {
        const today = getTodayStartAndEnd();
        f = today.from;
        t = today.to;
        params.hours = 'today';
      } else if (localRange === 'custom') {
        f = from;
        t = to;
        params.hours = 'custom';
      } else if (localRange) {
        const hours = Number(localRange) || 24;
        f = new Date(Date.now() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
        t = new Date().toISOString().slice(0, 19).replace('T', ' ');
        params.hours = hours;
      }

      if (f) params.from = f;
      if (t) params.to = t;

      const res = await axios.get('/api/firewall/topology', { params });
      const data = res.data || {};

      let inbound = data.inbound || [];
      let outbound = data.outbound || [];
      let lateral = data.lateral || [];
      let machines = data.machines || [];

      // Fallback: if server returned raw connections, categorize client-side
      if (!inbound.length && !outbound.length && !lateral.length && data.connections && data.connections.length) {
        const devMap = new Set((data.devices || []).filter(d => d.is_internal).map(d => d.ip));

        data.connections.forEach(c => {
          const isSrcPriv = devMap.has(c.src_ip) || isPrivate(c.src_ip);
          const isDstPriv = devMap.has(c.dst_ip) || isPrivate(c.dst_ip);
          const act = (c.action || '').toLowerCase();
          const bl = act === 'deny' || act === 'drop' || act === 'block' || act === 'close';
          const isAccept = act === 'accept' || act === 'allow' || act === 'permit';
          const col = bl ? '#ef4444' : isAccept ? '#22c55e' : '#f97316';

          const item = {
            ...c,
            protocol: c.service || (c.dst_port ? 'Port ' + c.dst_port : 'IP'),
            port: c.dst_port,
            count: Number(c.count) || 1,
            blocked: bl ? (Number(c.count) || 1) : 0,
            color: col,
            description: `Firewall ${act.toUpperCase()}: ${c.service || ''} (${c.src_ip} → ${c.dst_ip}:${c.dst_port || ''})`
          };

          if (!isSrcPriv && isDstPriv) {
            item.from_ip = c.src_ip;
            item.to_machine = c.dst_ip;
            item.dir = 'in';
            inbound.push(item);
          } else if (isSrcPriv && !isDstPriv) {
            item.from_machine = c.src_ip;
            item.to_ip = c.dst_ip;
            item.dir = 'out';
            outbound.push(item);
          } else if (isSrcPriv && isDstPriv) {
            item.source = c.src_ip;
            item.target = c.dst_ip;
            item.dir = 'lat';
            lateral.push(item);
          } else {
            item.from_ip = c.src_ip;
            item.to_machine = c.dst_ip;
            item.dir = 'in';
            inbound.push(item);
          }
        });

        machines = (data.devices || []).map(d => ({
          name: d.ip,
          ip: d.ip,
          entityType: d.is_internal ? 'server' : 'ip_external',
          is_internal: d.is_internal
        }));
      }

      rawDataRef.current = { inbound, outbound, lateral, machines };

      let blockedTotal = 0;
      [...inbound, ...outbound, ...lateral].forEach(c => {
        if (c.blocked > 0 || (c.action && ['deny', 'drop', 'block', 'close'].includes(c.action.toLowerCase()))) {
          blockedTotal++;
        }
      });

      setCounts({
        in: inbound.length,
        out: outbound.length,
        lat: lateral.length,
        blocked: blockedTotal
      });

      applyFilter();
    } catch (err) {
      console.error('Failed to load firewall topology', err);
    }
  }, [from, to, action, service, ip, device, severity, aggregator, localRange, applyFilter]);

  useEffect(() => {
    localStorage.setItem('fwTopoRange', localRange);
    fetchTopology();
  }, [from, to, action, service, ip, device, severity, aggregator, localRange, fetchTopology]);

  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    applyFilter();
  }, [filterSrc, filterDst, filterPort, filterProto, filterAction, applyFilter]);

  const clearFilter = () => {
    setFilterSrc('');
    setFilterDst('');
    setFilterPort('');
    setFilterProto('');
    setFilterAction('');
    if (onFlowSelect) onFlowSelect(null);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
    <div
      id="fwTopoContainer"
      style={{
        background: theme === 'light' ? '#ffffff' : '#0a0f1d',
        border: standalone || isFullscreen ? 'none' : '1px solid var(--border)',
        borderRadius: standalone || isFullscreen ? '0px' : '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s ease-out',
        ...(standalone || isFullscreen
          ? {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 999999,
              margin: 0,
              boxShadow: 'none',
              background: theme === 'light' ? '#ffffff' : '#0a0f1d'
            }
          : { flex: 1, minHeight: '520px' })
      }}
    >
      {/* Header Toolbar */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: theme === 'light' ? '#ffffff' : '#0f172a',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg,rgba(6,182,212,0.2),rgba(6,182,212,0.05))',
              border: '1px solid rgba(6,182,212,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#06b6d4'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shield</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.3px' }}>
            Firewall Topology
          </div>
        </div>

        {/* Right Header Stats & Controls */}
        <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--mono)', fontSize: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={localRange}
            onChange={(e) => {
              const val = e.target.value === 'today' || e.target.value === 'custom' ? e.target.value : Number(e.target.value);
              setLocalRange(val);
              localStorage.setItem('fwTopoRange', val);
            }}
            style={{
              fontSize: '11px',
              padding: '5px 10px',
              borderRadius: '6px',
              background: theme === 'light' ? '#f1f5f9' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              cursor: 'pointer',
              fontFamily: 'var(--sans)',
              marginRight: '6px'
            }}
          >
            <option value="today">Today</option>
            <option value="1">Last 1h</option>
            <option value="7">Last 7h</option>
            <option value="24">Last 24h</option>
            <option value="72">Last 3d</option>
            <option value="168">Last 7d</option>
            <option value="720">Last 30d</option>
            {localRange === 'custom' && <option value="custom">Custom Range</option>}
          </select>

          <span>
            <span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#f97316', marginRight: '4px', verticalAlign: 'middle' }}></span>
            {counts.in} inbound
          </span>
          <span>
            <span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#3b82f6', marginRight: '4px', verticalAlign: 'middle' }}></span>
            {counts.out} outbound
          </span>
          <span>
            <span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#06b6d4', marginRight: '4px', verticalAlign: 'middle' }}></span>
            {counts.lat} internal
          </span>
          <span style={{ color: '#ef4444' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '2px', background: '#ef4444', marginRight: '4px', verticalAlign: 'middle' }}></span>
            {counts.blocked} blocked
          </span>

          {/* Fullscreen Button */}
          <button
            onClick={() => {
              if (standalone) {
                if (onExit) onExit();
                else navigate('/firewall');
              } else {
                toggleFullscreen();
              }
            }}
            style={{
              background: standalone ? 'rgba(6, 182, 212, 0.2)' : 'linear-gradient(135deg, rgba(6,182,212,0.18), rgba(6,182,212,0.06))',
              border: standalone ? '1px solid #06b6d4' : '1px solid rgba(6,182,212,0.35)',
              color: '#22d3ee',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              marginLeft: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
            title={standalone ? 'Exit full-screen standalone view' : isFullscreen ? 'Exit Full Screen' : 'Open Full Screen'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              {standalone ? 'arrow_back' : isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
            {standalone ? 'Exit to Firewall' : isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="pb" style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column', background: theme === 'light' ? '#f8fafc' : '#0a0f1d' }}>
        {/* Filter Bar */}
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
            marginBottom: '10px',
            background: theme === 'light' ? '#f1f5f9' : '#0d1527',
            border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
            borderRadius: '7px',
            padding: '8px 12px',
            alignItems: 'center'
          }}
        >
          <input
            placeholder="Source IP…"
            value={filterSrc}
            onChange={e => setFilterSrc(e.target.value)}
            style={{
              background: theme === 'light' ? '#ffffff' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '5px',
              width: '120px'
            }}
          />
          <input
            placeholder="Dest IP…"
            value={filterDst}
            onChange={e => setFilterDst(e.target.value)}
            style={{
              background: theme === 'light' ? '#ffffff' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '5px',
              width: '120px'
            }}
          />
          <input
            placeholder="Port…"
            value={filterPort}
            onChange={e => setFilterPort(e.target.value)}
            style={{
              background: theme === 'light' ? '#ffffff' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '5px',
              width: '72px'
            }}
          />

          <select
            value={filterProto}
            onChange={e => setFilterProto(e.target.value)}
            style={{
              background: theme === 'light' ? '#ffffff' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              fontFamily: 'var(--sans)',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '5px'
            }}
          >
            <option value="">All services</option>
            <option value="https">HTTPS</option>
            <option value="http">HTTP</option>
            <option value="dns">DNS</option>
            <option value="ssh">SSH</option>
            <option value="rdp">RDP</option>
            <option value="smb">SMB</option>
            <option value="ipsec">IPsec</option>
            <option value="ms-sql">MS-SQL</option>
            <option value="kerberos">Kerberos</option>
            <option value="ntp">NTP</option>
            <option value="snmp">SNMP</option>
            <option value="modbus">Modbus</option>
          </select>

          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            style={{
              background: theme === 'light' ? '#ffffff' : '#141e33',
              border: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
              color: theme === 'light' ? '#0f172a' : '#f8fafc',
              fontFamily: 'var(--sans)',
              fontSize: '11px',
              padding: '4px 8px',
              borderRadius: '5px'
            }}
          >
            <option value="">All actions & directions</option>
            <option value="accept">Allow / Accept</option>
            <option value="deny">Deny / Drop</option>
            <option value="rst">RST / Timeout</option>
            <option value="in">Inbound Only</option>
            <option value="out">Outbound Only</option>
            <option value="lat">Internal Lateral Only</option>
          </select>

          <button
            onClick={clearFilter}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            ✕ Clear
          </button>

          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>
            {filterCountMsg}
          </span>
        </div>

        {/* Visualization Canvas Container */}
        <div
          style={{
            flex: 1,
            minHeight: isFullscreen ? 0 : '460px',
            position: 'relative',
            background: theme === 'light' ? '#f8fafc' : '#0b1326',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Cytoscape Graph Canvas View */}
          <FirewallEntityPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            activeCategory={focusedCategory}
            onClose={() => {
              setSelectedNode(null);
              setSelectedEdge(null);
              // Do NOT reset focusedCategory so background nodes remain hidden!
              setFocusNodeTarget(null);
              setInfoText('Click a node or edge to inspect');
            }}
            onFocusCategory={(cat) => setFocusedCategory(cat)}
            onSelectNodeById={(targetId) => {
              setFocusNodeTarget(targetId);
            }}
            theme={theme}
          />
          <FirewallNodeDiagram
            inbound={filteredData.inbound}
            outbound={filteredData.outbound}
            lateral={filteredData.lateral}
            machines={filteredData.machines}
            theme={theme}
            focusedCategory={focusedCategory}
            focusNodeTarget={focusNodeTarget}
            isPanelOpen={Boolean(selectedNode || selectedEdge)}
            onSelectNode={(n) => {
              setSelectedNode(n);
              setSelectedEdge(null);
              setFocusedCategory(prev => (prev && prev !== 'all' ? 'isolated' : 'all'));
              setInfoText(`HOST / IP: ${n.label} (${n.subLabel || ''}) — ${n.rows.length} connection(s)`);
              if (onFlowSelect) onFlowSelect({ ip: n.raw?.ip || n.label });
            }}
            onSelectEdge={(e) => {
              setSelectedEdge(e);
              setSelectedNode(null);
              const edgeCount = e.count
                || (e.rows && e.rows.length > 0
                    ? e.rows.reduce((sum, r) => sum + (Number(r.count) || 1), 0)
                    : (e.detail?.count || 1));
              setInfoText(`${e.label} | ${e.detail?.src || ''} → ${e.detail?.dst || ''} (x${edgeCount})`);
              if (onFlowSelect) onFlowSelect({
                src: e.detail?.src,
                dst: e.detail?.dst,
                svc: e.detail?.protocol,
                action: e.detail?.action
              });
            }}
            onClearSelection={(isFullReset) => {
              setSelectedNode(null);
              setSelectedEdge(null);
              if (isFullReset) {
                setFocusedCategory('all');
              } else {
                setFocusedCategory(prev => (prev && prev !== 'all' ? prev : 'all'));
              }
              setFocusNodeTarget(null);
              setInfoText('Click a node or edge to inspect');
              if (onFlowSelect) onFlowSelect(null);
            }}
          />
        </div>

        {/* Info Status Bar & Active Filter Bar */}
        <div
          style={{
            marginTop: '10px',
            fontSize: '11px',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            textAlign: 'center',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{infoText}</span>
          </div>

          {/* Color Legend */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              fontFamily: 'var(--mono)',
              fontSize: '10px',
              color: 'var(--muted)'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', display: 'inline-block' }}></span>
              Internal LAN
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', background: '#64748b', borderRadius: '50%', display: 'inline-block' }}></span>
              External WAN
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', background: '#06b6d4', borderRadius: '2px', display: 'inline-block' }}></span>
              Gateway / Server
            </span>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>→ Accept</span>
            <span style={{ color: '#ef4444', fontWeight: 700 }}>→ Deny/Drop</span>
            <span style={{ color: '#f97316', fontWeight: 700 }}>→ RST</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (isFullscreen || standalone) ? createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: theme === 'light' ? '#ffffff' : '#0a0f1d',
          zIndex: 999998
        }}
      />
      {content}
    </>,
    document.body
  ) : content;
}
