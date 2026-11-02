import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import ThreatNodeDiagram from './graph/ThreatNodeDiagram';
import ThreatEntityPanel from './graph/ThreatEntityPanel';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, ShieldAlert, Sparkles, Filter, Maximize2, Minimize2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ThreatTopology({
  initialFocusIndicator = null,
  onOpenSuppressModal,
  standalone = false,
  onExit
}) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [timeRange, setTimeRange] = useState('7d');
  const [minConfidence, setMinConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Graph Data State
  const [graphData, setGraphData] = useState({
    nodes: [],
    edges: [],
    timeline: [],
    stats: {
      total_nodes: 0,
      total_edges: 0,
      total_families: 0,
      total_iocs: 0,
      total_hosts: 0,
      patient_zero: null
    }
  });

  // Selected Elements
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [statusInfo, setStatusInfo] = useState('Click a node or edge to inspect attribution and blast radius');

  // Timeline Playback Slider State
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playTimerRef = useRef(null);

  // Fetch Graph Data from Backend
  const fetchGraphData = useCallback(async (range = timeRange, conf = minConfidence) => {
    try {
      setIsLoading(true);
      const res = await axios.get('/api/threat-hunting/topology-graph', {
        params: {
          timeRange: range,
          minConfidence: conf,
          indicator: initialFocusIndicator || undefined
        }
      });
      if (res.data && res.data.ok) {
        setGraphData(res.data);
        if (res.data.timeline && res.data.timeline.length > 0) {
          setTimelineIndex(0);
        }
      }
    } catch (err) {
      console.error('[ThreatTopology] Fetch error:', err);
      toast.error('Failed to load threat topology data');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, minConfidence, initialFocusIndicator]);

  useEffect(() => {
    fetchGraphData(timeRange, minConfidence);
  }, [fetchGraphData, timeRange, minConfidence]);

  // Timeline Playback Interval Logic
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(250, 1500 / playbackSpeed);
      playTimerRef.current = setInterval(() => {
        setTimelineIndex(prev => {
          if (!graphData.timeline || graphData.timeline.length === 0) return 0;
          if (prev >= graphData.timeline.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, graphData.timeline]);

  const activeTimelineEvent = graphData.timeline && graphData.timeline.length > 0
    ? graphData.timeline[timelineIndex]
    : null;

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isFullscreen || standalone ? '100vh' : '680px',
        width: '100%',
        background: isLight ? '#ffffff' : '#0b1326',
        borderRadius: isFullscreen || standalone ? 0 : '10px',
        border: isFullscreen || standalone ? 'none' : '1px solid var(--border)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* 1. TOP METRICS & FILTER HEADER */}
      <div
        style={{
          padding: '12px 18px',
          background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backdropFilter: 'blur(12px)',
          zIndex: 50
        }}
      >
        {/* Left: Title & Quick Stats Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#2563eb' }}>
              hub
            </span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', fontFamily: 'var(--mono)', letterSpacing: '0.5px' }}>
              Threat Link Analysis
            </span>
          </div>

          <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

          {/* Stat Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--mono)', fontWeight: 700 }}>
            <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.12)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              ● {graphData.stats.total_families || 0} Families
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              ● {graphData.stats.total_iocs || 0} Threat IOCs
            </span>
            <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              ● {graphData.stats.total_hosts || 0} Compromised Hosts
            </span>
            {graphData.stats.patient_zero && (
              <span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.35)' }}>
                ⭐ Patient Zero: {graphData.stats.patient_zero}
              </span>
            )}
          </div>
        </div>

        {/* Right: Controls & Range Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '12px',
              fontFamily: 'var(--mono)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days (SOC Standard)</option>
            <option value="14d">Last 14 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Available History</option>
          </select>

          <button
            onClick={() => fetchGraphData(timeRange, minConfidence)}
            disabled={isLoading}
            title="Refresh Graph Data"
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <RotateCcw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <button
            onClick={() => {
              if (standalone && onExit) onExit();
              else setIsFullscreen(!isFullscreen);
            }}
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              background: 'rgba(37,99,235,0.1)',
              border: '1px solid rgba(37,99,235,0.3)',
              color: '#2563eb',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* 2. MAIN CYTOSCAPE CANVAS & ENTITY PANEL */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ThreatEntityPanel
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          onClose={() => {
            setSelectedNode(null);
            setSelectedEdge(null);
            setStatusInfo('Click a node or edge to inspect attribution and blast radius');
          }}
          onOpenSuppressModal={onOpenSuppressModal}
          theme={theme}
        />

        <ThreatNodeDiagram
          nodes={graphData.nodes}
          edges={graphData.edges}
          theme={theme}
          focusIndicator={initialFocusIndicator}
          activeTimelineEvent={activeTimelineEvent}
          onSelectNode={(node) => {
            setSelectedNode(node);
            setSelectedEdge(null);
            setStatusInfo(`NODE: ${node.label} (${node.threatType || node.kind})`);
          }}
          onSelectEdge={(edge) => {
            setSelectedEdge(edge);
            setSelectedNode(null);
            setStatusInfo(`EDGE: ${edge.source} → ${edge.target} (${edge.label || 'Connection'})`);
          }}
          onClearSelection={() => {
            setSelectedNode(null);
            setSelectedEdge(null);
            setStatusInfo('Click a node or edge to inspect attribution and blast radius');
          }}
        />
      </div>

      {/* 3. ATTACK TIMELINE PLAYBACK SLIDER (TEMPORAL SCRUBBER) */}
      {graphData.timeline && graphData.timeline.length > 0 && (
        <div
          style={{
            background: isLight ? '#f8fafc' : 'rgba(15, 23, 42, 0.95)',
            borderTop: '1px solid var(--border)',
            padding: '10px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            backdropFilter: 'blur(12px)',
            zIndex: 50
          }}
        >
          {/* Controls & Active Narrative */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Play / Pause Button */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: isPlaying ? '#ef4444' : '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                {isPlaying ? 'Pause Replay' : 'Play Attack Replay'}
              </button>

              {/* Step Back */}
              <button
                onClick={() => setTimelineIndex(prev => Math.max(0, prev - 1))}
                disabled={timelineIndex <= 0}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '5px', cursor: 'pointer' }}
              >
                <SkipBack size={13} />
              </button>

              {/* Step Forward */}
              <button
                onClick={() => setTimelineIndex(prev => Math.min(graphData.timeline.length - 1, prev + 1))}
                disabled={timelineIndex >= graphData.timeline.length - 1}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '5px', cursor: 'pointer' }}
              >
                <SkipForward size={13} />
              </button>

              {/* Speed Multiplier */}
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '11px',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontFamily: 'var(--mono)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={1}>1x Speed</option>
                <option value={2}>2x Speed</option>
                <option value={4}>4x Speed</option>
              </select>
            </div>

            {/* Real-time Narrative Banner */}
            <div style={{ flex: 1, minWidth: '280px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
              <span style={{
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                fontWeight: 800,
                fontSize: '10px'
              }}>
                STEP {timelineIndex + 1}/{graphData.timeline.length}
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {activeTimelineEvent?.ts ? new Date(activeTimelineEvent.ts).toLocaleTimeString() : ''}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeTimelineEvent
                  ? `${activeTimelineEvent.sourceLabel} → ${activeTimelineEvent.targetLabel} (${activeTimelineEvent.malwareFamily})`
                  : 'Ready for chronological playback'}
              </span>
            </div>
          </div>

          {/* Interactive Range Scrubber */}
          <input
            type="range"
            min="0"
            max={graphData.timeline.length - 1}
            value={timelineIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setTimelineIndex(Number(e.target.value));
            }}
            style={{
              width: '100%',
              accentColor: '#2563eb',
              cursor: 'pointer',
              margin: '2px 0'
            }}
          />
        </div>
      )}

      {/* 4. FOOTER STATUS BAR */}
      <div
        style={{
          padding: '6px 16px',
          background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          fontFamily: 'var(--mono)',
          color: 'var(--muted)',
          textAlign: 'center'
        }}
      >
        {statusInfo}
      </div>
    </div>
  );

  return isFullscreen ? createPortal(content, document.body) : content;
}
