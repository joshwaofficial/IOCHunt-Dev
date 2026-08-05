import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { useFilter } from '../context/FilterContext';
import { useInstance } from '../context/InstanceContext';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { range, setRange, machine, setMachine, aggregator, setAggregator } = useFilter();
  const { instanceInfo, isCentral, isAggregator } = useInstance();
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [aggregators, setAggregators] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [latency, setLatency] = useState('--');

  const isBranchAdmin = Boolean(user?.aggregator_name);
  const activeBranchName = user?.aggregator_name || instanceInfo?.tenant_id || 'default';

  useEffect(() => {
    if (isBranchAdmin && user?.aggregator_name) {
      setAggregator(user.aggregator_name);
    }
  }, [isBranchAdmin, user?.aggregator_name, setAggregator]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const aggPromise = isCentral() ? axios.get('/api/aggregators').catch(() => ({ data: [] })) : Promise.resolve({ data: [] });
        const [macRes, aggRes] = await Promise.all([
          axios.get('/api/machines'),
          aggPromise
        ]);
        setMachines(Array.isArray(macRes.data) ? macRes.data : (macRes.data.data || []));
        setAggregators(Array.isArray(aggRes.data) ? aggRes.data : []);
      } catch (err) {
        console.error("Failed to fetch data for navbar:", err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const checkPing = async () => {
      try {
        const start = Date.now();
        await axios.get('/api/ping', { timeout: 5000 });
        const end = Date.now();
        setLatency(end - start);
        setIsOnline(true);
      } catch (err) {
        setIsOnline(false);
        setLatency('--');
      }
    };

    checkPing();
    const interval = setInterval(checkPing, 10000); // Ping every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const filteredMachines = (aggregator || (isBranchAdmin ? user.aggregator_name : ''))
    ? machines.filter(m => m.aggregator_name === (aggregator || user?.aggregator_name))
    : machines;

  useEffect(() => {
    if (machine && machines.length > 0) {
      const isValid = filteredMachines.some(m => (m.name || m) === machine);
      if (!isValid) {
        setMachine('');
      }
    }
  }, [aggregator, machine, filteredMachines, setMachine, machines]);

  return (
    <div id="topbar">
      
      {/* Left: Branding + Status */}
      <div className="tb-left">
        <div className="tb-status-pill" id="topbar-status-pill">
          <span style={{ 
            background: (isAggregator() || isBranchAdmin) ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.3))' : 'rgba(59, 130, 246, 0.2)', 
            color: (isAggregator() || isBranchAdmin) ? '#e879f9' : '#60a5fa', 
            padding: '2px 10px', 
            borderRadius: '6px', 
            fontWeight: 800,
            fontSize: '11px',
            marginRight: '8px',
            border: (isAggregator() || isBranchAdmin) ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)'
          }}>
            {(isAggregator() || isBranchAdmin) ? 'BRANCH AGGREGATOR' : 'CENTRAL SERVER'}
          </span>
          BRANCH / TENANT: <span style={{ color: (isAggregator() || isBranchAdmin) ? '#f472b6' : '#a78bfa', fontWeight: 800 }}>{activeBranchName}</span>
          <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
          SHIELD: <span id="tb-shield-status" style={{ color: isOnline ? '#22d47a' : '#ff4444', fontWeight: 800 }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span> 
          <span style={{ margin: '0 8px', opacity: 0.4 }}>|</span>
          LATENCY: <span id="tb-latency">{latency}{latency !== '--' ? 'ms' : ''}</span>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="topbar-controls">
        
        {/* Aggregator Filter (Only show for Master Central Admin with multiple aggregators) */}
        {!isBranchAdmin && isCentral() && aggregators.length > 0 && (
          <select className="ctl" id="aggregatorFilter" value={aggregator} onChange={(e) => setAggregator(e.target.value)}>
            <option value="">All Aggregators</option>
            {aggregators.map(agg => (
              <option key={agg.id} value={agg.name}>{agg.display_name || agg.name}</option>
            ))}
          </select>
        )}

        {/* Machine + Range filters */}
        <select className="ctl" id="machineFilter" value={machine} onChange={(e) => setMachine(e.target.value)}>
          <option value="">All Machines</option>
          {filteredMachines.map(m => (
            <option key={m.name || m.id || m} value={m.name || m.id || m}>{m.name || m.id || m}</option>
          ))}
        </select>
        
        <select className="ctl" id="rangeFilter" value={range} onChange={(e) => setRange(Number(e.target.value))}>
          <option value="1">Last 1h</option>
          <option value="24">Last 24h</option>
          <option value="168">Last 7d</option>
          <option value="720">Last 30d</option>
        </select>

        {/* Icon group */}
        <div className="tb-icon-group">
          
          <button 
            className="tb-icon-btn" 
            title="Toggle Dark/Light Mode" 
            onClick={toggleTheme}
          >
            <span className="material-symbols-outlined">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          
          <button className="tb-icon-btn tb-notif-btn" title="Notifications">
            <span className="material-symbols-outlined">notifications</span>
            <span className="tb-notif-dot" id="statusDot"></span>
          </button>
          
        </div>

        {/* Refresh */}
        <button className="rbtn" onClick={() => window.location.reload()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span> Refresh
        </button>

      </div>
    </div>
  );
}
