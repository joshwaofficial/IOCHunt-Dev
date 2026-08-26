import { useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstance } from '../context/InstanceContext';

export default function Sidebar({ collapsed, toggle }) {
  const { user, logout } = useAuth();
  const { instanceInfo, isCentral, isAggregator } = useInstance();
  const location = useLocation();
  const scrollRef = useRef(null);

  const isAdmin = user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('superadmin');

  useEffect(() => {
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
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#logo-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="logo-text">
            <h1>IOC <span className="font-light">{(isAggregator() || user?.aggregator_name) ? 'AGGREGATOR' : 'CENTRAL'}</span></h1>
            <p>{(isAggregator() || user?.aggregator_name) ? `BRANCH NODE [${user?.aggregator_name || instanceInfo?.tenant_id || 'DEFAULT'}]` : 'GLOBAL COMMAND HUB'}</p>
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
          {/* Only Central Master Admin manages all aggregators */}
          {isCentral() && !user?.aggregator_name && (
            <NavLink to="/aggregators" className={navClass}><span className="icon material-symbols-outlined">network_node</span> Aggregators</NavLink>
          )}

          {/* In Aggregator mode or Branch Admin view */}
          {(isAggregator() || user?.aggregator_name) && (
            <NavLink to="/aggregator-settings" className={navClass}><span className="icon material-symbols-outlined">sync</span> Node Sync & Pair</NavLink>
          )}

          <NavLink to="/incidents" className={navClass}><span className="icon material-symbols-outlined">emergency</span> Incidents</NavLink>
          <NavLink to="/reports" className={navClass}><span className="icon material-symbols-outlined">bar_chart</span> Reports</NavLink>
          <NavLink to="/email-reports" className={navClass}><span className="icon material-symbols-outlined">mail</span> Email Reports</NavLink>
          <NavLink to="/users" className={navClass}><span className="icon material-symbols-outlined">group</span> User Accounts</NavLink>
          
          {/* Admin only routes */}
          {isAdmin && (
            <>
              <NavLink to="/policy" className={navClass}><span className="icon material-symbols-outlined">settings</span> Policy</NavLink>
            </>
          )}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar" id="sidebar-avatar">
            {user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="user-info">
            <div className="user-name" id="sidebar-username">{user?.username || 'Loading...'}</div>
            <div className="user-role" id="sidebar-role">{user?.role || '—'} {user?.tenant_id ? `(${user.tenant_id})` : ''}</div>
          </div>
        </div>
        
        <button onClick={handleLogout} className="sidebar-footer-btn sidebar-footer-btn-danger">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>logout</span> Sign Out
        </button>
      </div>
    </div>
  );
}
