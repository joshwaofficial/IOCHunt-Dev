import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { useFilter } from '../context/FilterContext';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { range, setRange, machine, setMachine, aggregator, setAggregator } = useFilter();
  const [machines, setMachines] = useState([]);
  const [aggregators, setAggregators] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [latency, setLatency] = useState('--');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [macRes, aggRes] = await Promise.all([
          axios.get('/api/machines'),
          axios.get('/api/aggregators').catch(() => ({ data: [] }))
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

  const filteredMachines = aggregator 
    ? machines.filter(m => m.aggregator_name === aggregator)
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
          SHIELD: <span id="tb-shield-status" style={{ color: isOnline ? '#22d47a' : '#ff4444', fontWeight: 800 }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span> | SYNC LATENCY: <span id="tb-latency">{latency}{latency !== '--' ? 'ms' : ''}</span>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="topbar-controls">
        
        {/* Aggregator Filter */}
        <select className="ctl" id="aggregatorFilter" value={aggregator} onChange={(e) => setAggregator(e.target.value)}>
          <option value="">All Aggregators</option>
          {aggregators.map(agg => (
            <option key={agg.id} value={agg.name}>{agg.name}</option>
          ))}
        </select>

        {/* Machine + Range filters */}
        <select className="ctl" id="machineFilter" value={machine} onChange={(e) => setMachine(e.target.value)}>
          <option value="">All Machines</option>
          {filteredMachines.map(m => (
            <option key={m.name || m} value={m.name || m}>{m.name || m}</option>
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
