import { useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ collapsed, toggle }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const scrollRef = useRef(null);

  useEffect(() => {
    // Small timeout ensures the active class has been applied by React Router
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        const activeEl = scrollRef.current.querySelector('.snb.active');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const handleLogout = async (e) => {
    e.preventDefault();
    await logout();
  };

  const navClass = ({ isActive }) => `snb ${isActive ? 'active' : ''}`;

  return (
    <div id="sidebar" className={collapsed ? 'collapsed' : ''}>
      <div className="sidebar-logo" style={{ justifyContent: 'space-between' }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textDecoration: 'none', color: 'inherit' }}>
          <div className="logo-icon">
            <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 4 L30 11 L18 18 L6 11 Z" fill="url(#top-grad)"/>
              <path d="M6 11 L18 18 V32 L6 25 Z" fill="url(#left-grad)"/>
              <path d="M30 11 L18 18 V32 L30 25 Z" fill="url(#right-grad)"/>
              <path d="M18 4 L30 11 V25 L18 32 L6 25 V11 Z" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.3"/>
              <path d="M18 18 V32 M18 18 L30 11 M18 18 L6 11" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.6"/>
              <defs>
                <linearGradient id="top-grad" x1="18" y1="4" x2="18" y2="18" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#60A5FA"/>
                  <stop offset="1" stopColor="#3B82F6"/>
                </linearGradient>
                <linearGradient id="left-grad" x1="6" y1="11" x2="18" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563EB"/>
                  <stop offset="1" stopColor="#1D4ED8"/>
                </linearGradient>
                <linearGradient id="right-grad" x1="30" y1="11" x2="18" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#A855F7"/>
                  <stop offset="1" stopColor="#7E22CE"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="logo-text">
            <h1>IOC <span className="font-light">Hunt</span></h1>
            <p>VIGILANT ACTIVE</p>
          </div>
        </Link>
        <button onClick={toggle} className="tb-icon-btn" style={{ width: '28px', height: '28px', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            {collapsed ? 'menu' : 'menu_open'}
          </span>
        </button>
      </div>

      <div id="sidebar-scroll" ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '16px' }}>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Overview</div>
          <NavLink to="/dashboard" className={navClass}><span className="icon material-symbols-outlined">dashboard</span> Command Center</NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Detection</div>
          <NavLink to="/ad-attacks" className={navClass}><span className="icon material-symbols-outlined">key</span> AD Attacks</NavLink>
          <NavLink to="/malicious-activity" className={navClass}><span className="icon material-symbols-outlined">warning</span> Malicious Activity</NavLink>
          <NavLink to="/user-accounts" className={navClass}><span className="icon material-symbols-outlined">person</span> User Accounts</NavLink>
          <NavLink to="/usb-events" className={navClass}><span className="icon material-symbols-outlined">usb</span> USB Events</NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Network</div>
          <NavLink to="/firewall" className={navClass}><span className="icon material-symbols-outlined">local_fire_department</span> Firewall</NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Infrastructure</div>
          <NavLink to="/clients" className={navClass}><span className="icon material-symbols-outlined">computer</span> Clients</NavLink>
          <NavLink to="/all-logs" className={navClass}><span className="icon material-symbols-outlined">list_alt</span> All Logs</NavLink>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Management</div>
          <NavLink to="/central-server" className={navClass}><span className="icon material-symbols-outlined" style={{ color: '#3b82f6' }}>hub</span> Central Server</NavLink>
          <NavLink to="/policy" className={navClass}><span className="icon material-symbols-outlined">settings</span> Policy</NavLink>
          <NavLink to="/users" className={navClass}><span className="icon material-symbols-outlined">group</span> Users</NavLink>
          <NavLink to="/incidents" className={navClass}><span className="icon material-symbols-outlined">emergency</span> Incidents</NavLink>
          <NavLink to="/reports" className={navClass}><span className="icon material-symbols-outlined">bar_chart</span> Reports</NavLink>
          <NavLink to="/email-reports" className={navClass}><span className="icon material-symbols-outlined">mail</span> Email Reports</NavLink>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar" id="sidebar-avatar">
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="user-info">
            <div className="user-name" id="sidebar-username">{user?.username || 'Loading...'}</div>
            <div className="user-role" id="sidebar-role">{user?.role || '—'}</div>
          </div>
        </div>
        
        <button onClick={handleLogout} className="sidebar-footer-btn sidebar-footer-btn-danger">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>logout</span> Sign Out
        </button>
      </div>
    </div>
  );
}
