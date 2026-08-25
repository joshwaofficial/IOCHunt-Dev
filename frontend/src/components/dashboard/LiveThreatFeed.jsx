import React, { useMemo, useState } from 'react';
import { List } from 'react-window';
import EventDetailModal from './EventDetailModal';

const LiveThreatFeed = ({ events }) => {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const safeEvents = Array.isArray(events) ? events : [];
  const rowCount = safeEvents.length;

  const Row = ({ index, style }) => {
    const ev = safeEvents[index];
    if (!ev) return <div style={style}></div>;

    let sevBg = 'var(--surface2)';
    let sevColor = 'var(--muted)';
    let sevLabel = (ev.severity || 'UNKNOWN').toUpperCase();

    // The reference image shows an 'AD' badge for AD events, and 'HIGH'/'CRITICAL' for others
    if (ev.category === 'DOMAIN' || ev.category === 'ADCS') {
      sevBg = 'rgba(168,85,247,0.1)';
      sevColor = '#a855f7';
      sevLabel = 'AD';
    } else if (ev.severity === 'critical') {
      sevBg = 'rgba(239,68,68,0.1)';
      sevColor = '#ef4444';
    } else if (ev.severity === 'high') {
      sevBg = 'rgba(249,115,22,0.1)';
      sevColor = '#f97316';
    } else if (ev.severity === 'medium') {
      sevBg = 'rgba(234,179,8,0.1)';
      sevColor = '#eab308';
    }

    const timeStr = ev.ts ? new Date(ev.ts).toLocaleTimeString('en-GB') : '';
    const machineStr = ev.machine || ev.target_machine || 'Unknown';
    const msgStr = ev.message || ev.description || ev.tag || 'Event logged';

    return (
      <div className="hover-row" onClick={() => setSelectedEvent(ev)} style={{ ...style, display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ flex: '0 0 80px', fontSize: '12px', color: '#64748b', fontFamily: 'var(--mono)' }}>
          {timeStr}
        </div>
        <div style={{ flex: '0 0 100px', fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>
          <span style={{ background: 'rgba(37,99,235,0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '4px' }}>
            {ev.aggregator_name || 'Unknown'}
          </span>
        </div>
        <div style={{ flex: '0 0 120px', fontSize: '12px', color: '#3b82f6', fontWeight: 600 }}>
          {machineStr}
        </div>
        <div style={{ flex: '0 0 80px' }}>
          <span style={{
            background: sevBg,
            color: sevColor,
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {sevLabel}
          </span>
        </div>
        <div style={{ flex: 1, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {msgStr}
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '400px' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>description</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
            Live Event Feed
          </h3>
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', background: 'var(--surface2)', padding: '4px 10px', borderRadius: '6px' }}>
          {rowCount} events
        </div>
      </div>
      
      <div style={{ display: 'flex', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ flex: '0 0 80px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>TIME</div>
        <div style={{ flex: '0 0 100px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>BRANCH</div>
        <div style={{ flex: '0 0 120px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>MACHINE</div>
        <div style={{ flex: '0 0 80px', fontFamily: 'var(--mono)', fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>SEV</div>
        <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>EVENT</div>
      </div>
      
      <div style={{ flex: 1, minHeight: 0 }}>
        {rowCount === 0 ? (
          <div className="empty" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No live events in buffer</div>
        ) : (
          <List
            height={315}
            rowCount={rowCount}
            rowHeight={48}
            width="100%"
            rowProps={{}}
            rowComponent={Row}
          />
        )}
      </div>

      <EventDetailModal 
        event={selectedEvent} 
        onClose={() => setSelectedEvent(null)} 
      />
    </div>
  );
};

export default React.memo(LiveThreatFeed);
