import React, { useEffect, useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useFilter } from '../context/FilterContext';
import { useThreatStore } from '../store/useThreatStore';

// Lazy loaded widgets to reduce initial bundle size
const ThreatSummaryCards = React.lazy(() => import('../components/dashboard/ThreatSummaryCards'));
const EventTimeline = React.lazy(() => import('../components/dashboard/EventTimeline'));
const SeverityChart = React.lazy(() => import('../components/dashboard/SeverityChart'));
const EventsByCategory = React.lazy(() => import('../components/dashboard/EventsByCategory'));
const Heatmap24h = React.lazy(() => import('../components/dashboard/Heatmap24h'));
const LiveThreatFeed = React.lazy(() => import('../components/dashboard/LiveThreatFeed'));
const MachineStatusTable = React.lazy(() => import('../components/dashboard/MachineStatusTable'));
const ADAttackSummary = React.lazy(() => import('../components/dashboard/ADAttackSummary'));
const NetworkTopology = React.lazy(() => import('../components/NetworkTopology'));
const AllEventsModal = React.lazy(() => import('../components/dashboard/AllEventsModal'));

import NewIncidentModal from '../components/incidents/NewIncidentModal';

import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { range, machine, setMachine, aggregator } = useFilter();
  const navigate = useNavigate();
  const [showCriticalModal, setShowCriticalModal] = useState(false);

  // Attach the global function so AllEventsModal can trigger it
  React.useEffect(() => {
    window.handlePromoteChainFromModal = (chain) => {
      navigate('/incidents', { state: { prefillChain: chain, action: 'openNewModal' } });
    };
    return () => {
      delete window.handlePromoteChainFromModal;
    };
  }, [navigate]);

  // Zustand SSE Store
  const { events, connectSSE, disconnectSSE, fetchInitialEvents } = useThreatStore();

  // Connect to SSE for real-time live events
  useEffect(() => {
    fetchInitialEvents(range, machine, aggregator);
    connectSSE(machine, range, aggregator);
    return () => disconnectSSE();
  }, [range, machine, aggregator, connectSSE, disconnectSSE, fetchInitialEvents]);

  // React Query for aggregate backend stats
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['stats', range, machine, aggregator],
    queryFn: async () => {
      const res = await axios.get(`/api/events/stats?range=${range}&machine=${machine}&aggregator=${aggregator}`);
      return res.data;
    }
  });

  // React Query for topology data
  const { data: topoData } = useQuery({
    queryKey: ['topology', range, machine, aggregator],
    queryFn: async () => {
      const res = await axios.get(`/api/events/network/topology?hours=${range}&machine=${machine}&aggregator=${aggregator}`);
      return res.data;
    }
  });

  // Loading Overlay
  const LoadingOverlay = () => (
    <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}>
      <div style={{ color: 'var(--muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}></span>
        Loading widget...
      </div>
    </div>
  );

  // Determine Top Active Threat
  let topThreat = null;
  if (stats && stats.critical && stats.critical.length > 0) {
    let topMachineName = '';
    let topCount = 0;
    
    if (stats.byMachineSev && stats.byMachineSev.length > 0) {
      const critRows = stats.byMachineSev.filter(r => r.severity === 'critical');
      if (critRows.length > 0) {
        const topRow = critRows.reduce((prev, curr) => parseInt(prev.n, 10) > parseInt(curr.n, 10) ? prev : curr);
        topMachineName = topRow.machine;
        topCount = parseInt(topRow.n, 10);
      }
    }
    
    let event = null;
    if (topMachineName) {
      event = stats.critical.find(e => e.machine === topMachineName || e.target_machine === topMachineName);
    }
    
    if (!event) {
      event = stats.critical[0];
      topMachineName = event.machine || event.target_machine || 'Unknown';
      
      // Look up the actual count for this machine instead of using global total
      if (stats.byMachineSev) {
        const row = stats.byMachineSev.find(r => r.severity === 'critical' && r.machine === topMachineName);
        topCount = row ? parseInt(row.n, 10) : 1;
      } else {
        topCount = 1;
      }
    }

    topThreat = { machine: topMachineName, count: topCount, event };
  }

  return (
    <div id="tab-overview" className="tab-panel active animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Command Center</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Global threat landscape, alerts, and system health overview.</p>
        </div>
      </div>

      {statsError && (
        <div className="ab" style={{ background: 'rgba(240,79,90,.07)', border: '1px solid rgba(240,79,90,.25)', borderRadius: '10px', padding: '12px 16px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '22px', color: 'var(--critical)' }}>emergency</span>
          <div className="at" style={{ fontSize: '13px', flex: 1 }}>Failed to load aggregate statistics.</div>
        </div>
      )}

      {stats && stats.critical && stats.critical.length > 0 && topThreat && (
        <div className="ab" style={{ background: 'rgba(240,79,90,.07)', border: '1px solid rgba(240,79,90,.25)', borderRadius: '10px', padding: '16px 20px', marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: '300px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '26px', color: 'var(--critical)', marginTop: '2px' }}>warning</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--critical)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontFamily: 'var(--mono)' }}>
                Active Threat Detected
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                Machine <strong style={{ color: '#3b82f6', fontFamily: 'var(--mono)', padding: '2px 6px', background: 'rgba(59,130,246,0.1)', borderRadius: '4px' }}>{topThreat.machine}</strong> is currently under heavy attack ({topThreat.count} critical events).
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                <em>Most recent activity: {(topThreat.event.category || topThreat.event.attack_type || topThreat.event.tag || 'Suspicious').toUpperCase()} - {topThreat.event.description || topThreat.event.message || 'Unknown activity detected.'}</em>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              onClick={() => {
                setMachine(topThreat.machine);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              style={{
                background: 'var(--critical)',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity 0.2s',
                textTransform: 'uppercase',
                fontFamily: 'var(--mono)',
                letterSpacing: '0.5px'
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>policy</span>
              Investigate Host
            </button>
            <button 
              onClick={() => setShowCriticalModal(true)}
              style={{
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
                fontFamily: 'var(--sans)'
              }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--muted)'; }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--critical)' }}>list_alt</span>
              View All Critical ({stats.totalCritical || stats.critical.length})
            </button>
          </div>
        </div>
      )}

      <Suspense fallback={<LoadingOverlay />}>
        {/* KPI Cards */}
        <ThreatSummaryCards stats={stats} />

        {/* Top Charts */}
        <div style={{ marginBottom: '32px' }}>
          <EventTimeline data={stats} />
        </div>

        {/* Secondary Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '32px' }}>
          <EventsByCategory data={stats} />
          <SeverityChart data={stats} />
        </div>

        {/* Network Topology & AD Attacks */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', marginBottom: '32px' }}>
          <div style={{ flex: '1.5 1 500px', minWidth: 0 }}>
            <NetworkTopology initialData={topoData} />
          </div>
          <div style={{ flex: '1 1 350px', minWidth: 0 }}>
            <ADAttackSummary topoData={topoData} range={range} />
          </div>
        </div>

        {/* Live Event Feed */}
        <div id="live-feed-section" style={{ marginBottom: '32px', scrollMarginTop: '90px' }}>
          <LiveThreatFeed events={events} />
        </div>

        {/* 24h Heatmap - Last Full Row */}
        <div style={{ marginBottom: '32px' }}>
          <Heatmap24h data={stats} />
        </div>

        {/* Machine Status */}
        <div style={{ marginBottom: '40px' }}>
          <MachineStatusTable stats={stats} topoData={topoData} range={range} />
        </div>
      </Suspense>

      <AllEventsModal 
        isOpen={showCriticalModal} 
        onClose={() => setShowCriticalModal(false)} 
        filterType="critical" 
      />
    </div>
  );
}
