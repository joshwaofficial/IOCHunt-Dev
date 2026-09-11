import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useFilter } from '../context/FilterContext';
import BloodHoundNodeDiagram from './graph/BloodHoundNodeDiagram';

function isPrivate(ip) {
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(ip);
}

export default function NetworkTopology({ initialData } = {}) {
  const rawDataRef = useRef({ inbound: [], outbound: [], lateral: [], ad_attacks: [], machines: [] });

  const { machine } = useFilter();
  const [counts, setCounts] = useState({ in: 0, out: 0, lat: 0, ad: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState('graph'); // 'graph' | 'flow'
  const [activeFlows, setActiveFlows] = useState([]);
  const [details, setDetails] = useState(null);
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
    return Number(localStorage.getItem('topoRange')) || 24;
  });

  const updateActiveDatasets = useCallback((inbound, outbound, adAttacks, lateral, machines) => {
    setFilteredData({
      inbound: inbound || [],
      outbound: outbound || [],
      lateral: lateral || [],
      ad_attacks: adAttacks || [],
      machines: machines || []
    });

    // Build flow rows for 3-Column Traffic Flow view
    const flowRows = [];
    let flowIndex = 0;

    (inbound || []).forEach(c => {
      const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
      const bl = c.blocked > 0;
      flowRows.push({
        id: `flow_in_${flowIndex++}`,
        src: c.from_machine || c.from_ip || '?',
        dst: c.to_machine || '?',
        proto,
        port: c.port || '',
        count: c.count || 1,
        blocked: c.blocked || 0,
        dir: 'in',
        severity: c.severity || 'info',
        color: bl ? '#ef4444' : '#f97316',
        detailRow: {
          first_seen: c.first_seen, last_seen: c.last_seen,
          src: c.from_machine || c.from_ip || '?', dst: c.to_machine || '?',
          protocol: c.protocol || '', port: c.port || '',
          count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
          extra: c.description || (bl ? 'BLOCKED' : '')
        }
      });
    });

    (outbound || []).forEach(c => {
      const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
      const bl = c.blocked > 0;
      flowRows.push({
        id: `flow_out_${flowIndex++}`,
        src: c.from_machine || '?',
        dst: c.to_machine || c.to_ip || '?',
        proto,
        port: c.port || '',
        count: c.count || 1,
        blocked: c.blocked || 0,
        dir: 'out',
        severity: c.severity || 'info',
        color: bl ? '#ef4444' : '#3b82f6',
        detailRow: {
          first_seen: c.first_seen, last_seen: c.last_seen,
          src: c.from_machine || '?', dst: c.to_machine || c.to_ip || '?',
          protocol: c.protocol || '', port: c.port || '',
          count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'info',
          extra: c.description || (bl ? 'BLOCKED' : '')
        }
      });
    });

    (lateral || []).forEach(c => {
      const proto = (c.protocol || '') + (c.port ? `:${c.port}` : '');
      const bl = c.blocked > 0;
      flowRows.push({
        id: `flow_lat_${flowIndex++}`,
        src: c.source,
        dst: c.target,
        proto,
        port: c.port || '',
        count: c.count || 1,
        blocked: c.blocked || 0,
        dir: 'lat',
        severity: c.severity || 'critical',
        color: '#ef4444',
        detailRow: {
          first_seen: c.first_seen, last_seen: c.last_seen,
          src: c.source, dst: c.target,
          protocol: c.protocol || '', port: c.port || '',
          count: c.count || 1, blocked: c.blocked || 0, severity: c.severity || 'critical',
          extra: c.description || (bl ? 'BLOCKED' : '')
        }
      });
    });

    (adAttacks || []).forEach(a => {
      flowRows.push({
        id: `flow_ad_${flowIndex++}`,
        src: a.actor || a.remote_ip || '?',
        dst: a.target_machine || '?',
        proto: a.attack_type || a.protocol || 'AD Attack',
        port: '-',
        count: a.count || 1,
        blocked: 0,
        dir: 'ad',
        severity: a.severity || 'critical',
        color: '#a855f7',
        detailRow: {
          first_seen: a.first_seen, last_seen: a.last_seen,
          src: a.actor || a.remote_ip || '?', dst: a.target_machine || '?',
          protocol: a.protocol || a.attack_type, port: '-',
          count: a.count || 1, blocked: 0, severity: a.severity || 'critical',
          extra: a.description || `AD Attack: ${a.attack_type}`
        }
      });
    });

    setActiveFlows(flowRows);
  }, []);

  const applyFilter = useCallback(() => {
    const raw = rawDataRef.current;
    if (!raw.inbound) return;

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
      const res = await axios.get(`/api/events/network/topology?hours=${localRange}&machine=${machine}`);
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

  useEffect(() => {
    if (initialData && (!rawDataRef.current.inbound || rawDataRef.current.inbound.length === 0)) {
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
    <>
      {isFullscreen && (
        <div
          id="networkTopoOverlay"
          onClick={toggleFullscreen}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 99998
          }}
        />
      )}
      <div
        id="networkTopoContainer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.2s ease-out',
          ...(isFullscreen
            ? {
                position: 'fixed',
                top: '2vh',
                left: '2vw',
                width: '96vw',
                height: '96vh',
                zIndex: 99999,
                margin: 0,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
              }
            : { flex: 1 })
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255,255,255,0.02)',
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

            {/* View Mode Switcher */}
            <div
              style={{
                display: 'flex',
                background: 'var(--surface2)',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                padding: '2px',
                gap: '2px',
                marginLeft: '6px'
              }}
            >
              <button
                onClick={() => setViewMode('graph')}
                style={{
                  background: viewMode === 'graph' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'graph' ? '#fff' : 'var(--muted)',
                  border: 'none',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hub</span>
                Graph
              </button>
              <button
                onClick={() => setViewMode('flow')}
                style={{
                  background: viewMode === 'flow' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'flow' ? '#fff' : 'var(--muted)',
                  border: 'none',
                  padding: '3px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>alt_route</span>
                Traffic Flow
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', fontFamily: 'var(--mono)', fontSize: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={localRange}
              onChange={(e) => setLocalRange(Number(e.target.value))}
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
              onClick={toggleFullscreen}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                borderRadius: '4px',
                padding: '3px 9px',
                cursor: 'pointer',
                fontSize: '11px',
                marginLeft: '8px'
              }}
            >
              {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
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
              background: '#0d111d',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* BloodHound WebGL Node Diagram View */}
            {viewMode === 'graph' && (
              <BloodHoundNodeDiagram
                inbound={filteredData.inbound}
                outbound={filteredData.outbound}
                lateral={filteredData.lateral}
                adAttacks={filteredData.ad_attacks}
                machines={filteredData.machines}
                onSelectNode={(n) => {
                  setInfoText(`HOST / NODE: ${n.label} (${n.subLabel || ''}) — ${n.rows.length} connection(s)`);
                  if (n.rows.length) {
                    setDetails({
                      title: `NODE: ${n.label} — ${n.rows.length} connection(s)`,
                      rows: n.rows
                    });
                  }
                }}
                onSelectEdge={(e) => {
                  setInfoText(`${e.label} | ${e.detail.src} → ${e.detail.dst} (x${e.detail.count || 1})`);
                  setDetails({
                    title: `${e.dir === 'ad' ? 'AD ATTACK' : e.dir === 'lat' ? 'LATERAL' : e.dir === 'in' ? 'INBOUND' : 'OUTBOUND'} — ${e.label} ${e.detail.src} → ${e.detail.dst}`,
                    rows: [e.detail]
                  });
                }}
                onClearSelection={() => {
                  setInfoText('Click a node or edge to inspect');
                  setDetails(null);
                }}
              />
            )}

            {/* 3-Column Traffic Flow View */}
            {viewMode === 'flow' && (
              <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr 1.2fr', gap: '16px', padding: '0 10px', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <div>Source Endpoint</div>
                  <div style={{ textAlign: 'center' }}>Traffic Stream / Protocol</div>
                  <div style={{ textAlign: 'right' }}>Destination Machine</div>
                </div>

                {activeFlows.length > 0 ? (
                  activeFlows.map(f => {
                    const isPriv = isPrivate(f.src);
                    const isAd = f.dir === 'ad';
                    const isLat = f.dir === 'lat';
                    const isIn = f.dir === 'in';

                    return (
                      <div
                        key={f.id}
                        onClick={() => {
                          if (f.detailRow) {
                            const dirLabel = f.dir === 'ad' ? 'AD ATTACK' : f.dir === 'lat' ? 'LATERAL' : f.dir === 'in' ? 'INBOUND' : 'OUTBOUND';
                            setDetails({ title: `${dirLabel} — ${f.proto} ${f.src} → ${f.dst}`, rows: [f.detailRow] });
                            setInfoText(`${dirLabel} | ${f.proto} | ${f.src} → ${f.dst} (x${f.count})`);
                          }
                        }}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1.2fr 1.6fr 1.2fr',
                          alignItems: 'center',
                          gap: '16px',
                          background: 'var(--surface2)',
                          border: `1px solid ${f.color}33`,
                          borderLeft: `4px solid ${f.color}`,
                          padding: '12px 16px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = 'var(--surface)';
                          e.currentTarget.style.boxShadow = `0 4px 16px ${f.color}22`;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'var(--surface2)';
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        {/* Source Box */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: isAd ? '#a855f7' : isPriv ? '#84cc16' : '#9aa5c0' }}>
                            {isAd ? 'person' : isPriv ? 'computer' : 'public'}
                          </span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{f.src}</div>
                            <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: isAd ? 'rgba(168,85,247,0.15)' : isPriv ? 'rgba(132,204,22,0.15)' : 'rgba(154,165,192,0.15)', color: isAd ? '#c084fc' : isPriv ? '#a3e635' : '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {isAd ? 'AD Actor' : isPriv ? 'Private IP' : 'External WAN'}
                            </span>
                          </div>
                        </div>

                        {/* Middle Flow Path */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '2px', background: `linear-gradient(90deg, ${f.color}22, ${f.color})` }}></div>
                            <span style={{
                              background: '#0b0f19',
                              border: `1px solid ${f.color}`,
                              color: f.color,
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '12px',
                              fontFamily: 'var(--mono)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: `0 0 10px ${f.color}33`
                            }}>
                              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                {isIn ? 'arrow_downward' : isLat ? 'swap_horiz' : isAd ? 'security' : 'arrow_upward'}
                              </span>
                              {f.proto}
                              <span style={{ background: `${f.color}33`, padding: '1px 6px', borderRadius: '8px', fontSize: '10px' }}>
                                x{f.count}
                              </span>
                            </span>
                            <div style={{ flex: 1, height: '2px', background: `linear-gradient(90deg, ${f.color}, ${f.color}22)` }}></div>
                          </div>
                          {f.blocked > 0 && (
                            <span style={{ fontSize: '9px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '1px' }}>
                              🛑 BLOCKED
                            </span>
                          )}
                        </div>

                        {/* Destination Box */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--mono)' }}>{f.dst}</div>
                            <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Monitored Host
                            </span>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>computer</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                    No traffic flows match the current filters.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details Inspection Table */}
          {details && (
            <div style={{ marginTop: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '7px', padding: '0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                  {details.title}
                </span>
                <button
                  onClick={() => setDetails(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '15px' }}
                >
                  &#x2715;
                </button>
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
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                          {r.first_seen ? new Date(r.first_seen).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}
                        </td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                          {r.last_seen ? new Date(r.last_seen).toLocaleString('sv-SE').slice(0, 16).replace('T', ' ') : '-'}
                        </td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#f97316' }}>{r.src || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#60a5fa' }}>{r.dst || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: '#22d3ee' }}>{r.protocol || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', color: 'var(--muted)' }}>{r.port || '-'}</td>
                        <td style={{ padding: '6px 12px', fontFamily: 'var(--mono)', fontWeight: 700 }}>{r.count || 1}</td>
                        <td style={{ padding: '6px 12px' }}>
                          {r.blocked ? <span className="badge sev-critical">{r.blocked}</span> : <span style={{ color: 'var(--muted)' }}>0</span>}
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          <span className={`badge sev-${r.severity || 'info'}`} style={{ textTransform: 'uppercase' }}>
                            {r.severity || 'info'}
                          </span>
                        </td>
                        <td style={{ padding: '6px 12px', minWidth: '300px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          {r.extra || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
    </>
  );

  return isFullscreen ? createPortal(content, document.body) : content;
}
