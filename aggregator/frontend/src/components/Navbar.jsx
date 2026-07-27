import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTheme } from '../context/ThemeContext';
import { useFilter } from '../context/FilterContext';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { range, setRange, machine, setMachine } = useFilter();
  const [machines, setMachines] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [latency, setLatency] = useState('--');

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const res = await axios.get('/api/machines');
        setMachines(Array.isArray(res.data) ? res.data : (res.data.data || []));
      } catch (err) {
        console.error("Failed to fetch machines for navbar:", err);
      }
    };
    fetchMachines();
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
        
        {/* Machine + Range filters */}
        <select className="ctl" id="machineFilter" value={machine} onChange={(e) => setMachine(e.target.value)}>
          <option value="">All Machines</option>
          {machines.map(m => (
            <option key={m.id || m} value={m.id || m}>{m.id || m}</option>
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
