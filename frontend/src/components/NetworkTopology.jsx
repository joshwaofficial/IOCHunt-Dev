import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useFilter } from '../context/FilterContext';
import { useTheme } from '../context/ThemeContext';
import { getTodayStartAndEnd } from '../utils/dateUtils';
import BloodHoundNodeDiagram from './graph/BloodHoundNodeDiagram';
import BloodHoundEntityPanel from './graph/BloodHoundEntityPanel';

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
}

export default function NetworkTopology({ initialData, standalone = false, onExit } = {}) {
  const navigate = useNavigate();
  const rawDataRef = useRef({ inbound: [], outbound: [], lateral: [], ad_attacks: [], machines: [] });

  const { theme } = useTheme();

  const { machine } = useFilter();
  const [counts, setCounts] = useState({ in: 0, out: 0, lat: 0, ad: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [focusedCategory, setFocusedCategory] = useState('all');
  const [focusNodeTarget, setFocusNodeTarget] = useState(null);
  const [infoText, setInfoText] = useState('Click a node or edge to inspect');

  // Filter state
  const [filterSrc, setFilterSrc] = useState('');
  const [filterDst, setFilterDst] = useState('');
  const [filterPort, setFilterPort] = useState('');
  const [filterProto, setFilterProto] = useState('');
  const [filterDir, setFilterDir] = useState('');
  const [filterCountMsg, setFilterCountMsg] = useState('');

  // Active filtered datasets passed to BloodHound diagram
  const [filteredData, setFilteredData] = useState({
    inbound: [],
    outbound: [],
    lateral: [],
    ad_attacks: [],
    machines: []
  });

  const [localRange, setLocalRange] = useState(() => {
    const saved = localStorage.getItem('topoRange');
    if (saved === 'today') return 'today';
    return Number(saved) || 24;
  });

  const updateActiveDatasets = useCallback((inbound, outbound, adAttacks, lateral, machines) => {
    setFilteredData({
      inbound: inbound || [],
      outbound: outbound || [],
      lateral: lateral || [],
      ad_attacks: adAttacks || [],
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
    const dir = filterDir.trim();

    const noFilter = !src && !dst && !port && !proto && !dir;
    if (noFilter) {
      setFilterCountMsg('');
      updateActiveDatasets(raw.inbound, raw.outbound, raw.ad_attacks, raw.lateral, raw.machines);
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

    updateActiveDatasets(ib, ob, ad, lat, raw.machines);
  }, [filterSrc, filterDst, filterPort, filterProto, filterDir, updateActiveDatasets]);

  const fetchTopology = useCallback(async () => {
    try {
      const params = { machine: machine || undefined };
      let f, t;

      if (localRange === 'today') {
        const today = getTodayStartAndEnd();
        f = today.from;
        t = today.to;
        params.hours = 'today';
      } else if (localRange) {
        const hours = Number(localRange) || 24;
        f = new Date(Date.now() - hours * 3600000).toISOString().slice(0, 19).replace('T', ' ');
        t = new Date().toISOString().slice(0, 19).replace('T', ' ');
        params.hours = hours;
      }

      if (f) params.from = f;
      if (t) params.to = t;

      const res = await axios.get('/api/events/network/topology', { params });
      rawDataRef.current = res.data || { inbound: [], outbound: [], lateral: [], ad_attacks: [], machines: [] };

      const { inbound = [], outbound = [], lateral = [], ad_attacks = [] } = rawDataRef.current;
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
  }, [localRange, machine, applyFilter]);

  const isFirstMountRef = useRef(true);

  useEffect(() => {
    if (isFirstMountRef.current && initialData && (initialData.inbound?.length || initialData.lateral?.length || initialData.ad_attacks?.length)) {
      isFirstMountRef.current = false;
      rawDataRef.current = initialData;
      const { inbound = [], outbound = [], lateral = [], ad_attacks = [] } = initialData;
      setCounts({
        in: inbound.length,
        out: outbound.length,
        lat: lateral.length,
        ad: ad_attacks.length
      });
      applyFilter();
      return;
    }
    isFirstMountRef.current = false;
    localStorage.setItem('topoRange', localRange);
    fetchTopology();
  }, [localRange, machine, initialData, applyFilter, fetchTopology]);

  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    applyFilter();
  }, [filterSrc, filterDst, filterPort, filterProto, filterDir, applyFilter]);

  const clearFilter = () => {
    setFilterSrc('');
    setFilterDst('');
    setFilterPort('');
    setFilterProto('');
    setFilterDir('');
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
      id="networkTopoContainer"
      style={{
        background: theme === 'light' ? '#ffffff' : '#0a0f1d',
        border: standalone || isFullscreen ? 'none' : '1px solid var(--border)',
        borderRadius: standalone || isFullscreen ? '0px' : '12px',
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
          : { flex: 1 })
      }}
    >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: theme === 'light' ? '1px solid #cbd5e1' : '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: theme === 'light' ? '#ffffff' : '#0f172a',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(59,130,246,0.05))',
                border: '1px solid rgba(59,130,246,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>hub</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.3px' }}>
              Network Topology
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--mono)', fontSize: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={localRange}
              onChange={(e) => {
                const val = e.target.value === 'today' ? 'today' : Number(e.target.value);
                setLocalRange(val);
                localStorage.setItem('topoRange', val);
              }}
              style={{
                fontSize: '11px',
                padding: '5px 10px',
                borderRadius: '6px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
                marginRight: '8px'
              }}
            >
              <option value="today">Today</option>
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

            <button
              onClick={() => {
                if (standalone) {
                  if (onExit) onExit();
                  else navigate('/dashboard');
                } else {
                  navigate('/network-topology');
                }
              }}
              style={{
                background: standalone ? 'rgba(59, 130, 246, 0.2)' : 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(59,130,246,0.06))',
                border: standalone ? '1px solid #3b82f6' : '1px solid rgba(59,130,246,0.35)',
                color: '#60a5fa',
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
              title={standalone ? "Exit full-screen standalone view" : "Open full-screen page"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                {standalone ? 'arrow_back' : 'fullscreen'}
              </span>
              {standalone ? 'Exit to Dashboard' : 'Full Screen'}
            </button>
          </div>
        </div>

        <div className="pb" style={{ padding: '12px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              marginBottom: '10px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: '7px',
              padding: '8px 12px',
              alignItems: 'center'
            }}
          >
            <input
              placeholder="Source IP…"
              value={filterSrc}
              onChange={e => setFilterSrc(e.target.value)}
              style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '120px' }}
            />
            <input
              placeholder="Dest IP…"
              value={filterDst}
              onChange={e => setFilterDst(e.target.value)}
              style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '120px' }}
            />
            <input
              placeholder="Port…"
              value={filterPort}
              onChange={e => setFilterPort(e.target.value)}
              style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px', width: '72px' }}
            />

            <select
              value={filterProto}
              onChange={e => setFilterProto(e.target.value)}
              style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}
            >
              <option value="">All protocols</option>
              <option value="rdp">RDP</option>
              <option value="smb">SMB</option>
              <option value="winrm">WinRM</option>
              <option value="winrm-s">WinRM-S</option>
              <option value="ssh">SSH</option>
              <option value="kerberos">Kerberos</option>
              <option value="ldap">LDAP</option>
              <option value="ldaps">LDAPS</option>
              <option value="rpc">RPC</option>
              <option value="meterpreter">Meterpreter</option>
              <option value="http">HTTP</option>
              <option value="https">HTTPS</option>
            </select>

            <select
              value={filterDir}
              onChange={e => setFilterDir(e.target.value)}
              style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '4px 8px', borderRadius: '5px' }}
            >
              <option value="">All directions</option>
              <option value="in">Inbound</option>
              <option value="out">Outbound</option>
              <option value="ad">AD Attacks</option>
            </select>

            <button
              onClick={clearFilter}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '11px' }}
            >
              ✕ Clear
            </button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>
              {filterCountMsg}
            </span>
          </div>

          {/* Visualization Container (BloodHound WebGL Graph or Flow) */}
          <div
            style={{
              flex: 1,
              minHeight: isFullscreen ? 0 : '520px',
              position: 'relative',
              background: theme === 'light' ? '#f8fafc' : '#0b1326',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* BloodHound WebGL Node Diagram View */}
            <BloodHoundEntityPanel
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
            <BloodHoundNodeDiagram
              inbound={filteredData.inbound}
              outbound={filteredData.outbound}
              lateral={filteredData.lateral}
              adAttacks={filteredData.ad_attacks}
              machines={filteredData.machines}
              theme={theme}
              focusedCategory={focusedCategory}
              focusNodeTarget={focusNodeTarget}
              isPanelOpen={Boolean(selectedNode || selectedEdge)}
              onSelectNode={(n) => {
                setSelectedNode(n);
                setSelectedEdge(null);
                setFocusedCategory(prev => (prev && prev !== 'all' ? 'isolated' : 'all'));
                setInfoText(`HOST / NODE: ${n.label} (${n.subLabel || ''}) — ${n.rows.length} connection(s)`);
              }}
              onSelectEdge={(e) => {
                setSelectedEdge(e);
                setSelectedNode(null);
                const edgeCount = e.count
                  || (e.rows && e.rows.length > 0
                      ? e.rows.reduce((sum, r) => sum + (Number(r.count) || 1), 0)
                      : (e.detail?.count || 1));
                setInfoText(`${e.label} | ${e.detail?.src || ''} → ${e.detail?.dst || ''} (x${edgeCount})`);
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
              }}
            />
          </div>

          {/* Info Status Bar */}
          <div
            style={{
              marginTop: '10px',
              fontSize: '11px',
              color: 'var(--text)',
              fontFamily: 'var(--mono)',
              textAlign: 'center',
              padding: '6px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '4px',
              border: '1px solid var(--border)'
            }}
          >
            {infoText}
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
