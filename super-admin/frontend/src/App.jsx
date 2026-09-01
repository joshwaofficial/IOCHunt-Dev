import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Shield,
  LayoutDashboard,
  Building2,
  Activity,
  Layers,
  LogOut
} from 'lucide-react';
import Login from './pages/Login';
import SetupPassword from './pages/SetupPassword';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import SystemHealth from './pages/SystemHealth';
import AuditLogs from './pages/AuditLogs';

function Sidebar({ tenantCount }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await axios.post('/api/super/logout'); } catch (e) {}
    document.cookie = "super_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    navigate('/login');
  };

  const navItems = [
    { name: 'Overview', icon: <LayoutDashboard size={16} />, path: '/' },
    { name: 'Managed Tenants', icon: <Building2 size={16} />, path: '/tenants', badge: tenantCount },
    { name: 'System Health', icon: <Activity size={16} />, path: '/system-health' },
    { name: 'Audit Logs', icon: <Layers size={16} />, path: '/audit-logs' },
  ];

  return (
    <aside className="sidebar-shell">
      {/* Brand Header */}
      <div style={{ padding: '20px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: '#151924',
          border: '1px solid #23293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#38bdf8'
        }}>
          <Shield size={18} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            IOC Hunt
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Control Plane
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ fontSize: '10px', fontWeight: '600', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>
          Management
        </div>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.name}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: 'none',
                background: isActive ? '#141824' : 'transparent',
                color: isActive ? '#f8fafc' : '#94a3b8',
                fontWeight: isActive ? '500' : '400',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.12s ease'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#0f121a';
                  e.currentTarget.style.color = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: isActive ? '#38bdf8' : '#64748b' }}>{item.icon}</span>
                <span>{item.name}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="badge-pill badge-neutral font-mono" style={{ fontSize: '10px', padding: '1px 6px' }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Cluster Status Footer */}
      <div style={{ padding: '14px', borderTop: '1px solid var(--border-subtle)', background: '#090b10' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
            <span className="status-dot active" />
            <span>SaaS Cluster Active</span>
          </div>
          <span className="badge-pill badge-neutral font-mono" style={{ fontSize: '10px' }}>
            :8080
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid #161a25' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#1c2232', border: '1px solid #283147', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: '600' }}>
              SA
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '500', color: '#f8fafc', lineHeight: 1.2 }}>Super Admin</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>Master Role</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn-danger-ghost"
            style={{ padding: '5px', borderRadius: '4px' }}
            title="Sign Out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function DashboardLayout({ children }) {
  const [tenantCount, setTenantCount] = useState(0);

  const fetchTenantCount = async () => {
    try {
      const res = await axios.get('/api/super/companies');
      setTenantCount(res.data?.length || 0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchTenantCount();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar tenantCount={tenantCount} />
      <div className="main-viewport">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>Control Plane</span>
            <span style={{ color: '#334155' }}>/</span>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#f8fafc' }}>
              Unified Multi-Tenant Manager
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge-pill badge-neutral font-mono" style={{ fontSize: '11px' }}>
              v2.0-SaaS
            </span>
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="content-scrollable">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          setIsAuthenticated(false);
          navigate('/login');
        }
        return Promise.reject(error);
      }
    );

    axios.get('/api/super/companies')
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false));

    return () => axios.interceptors.response.eject(interceptor);
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#08090d', color: '#94a3b8' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '12px' }}>Initializing Super Admin Session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<ProtectedRoute><SetupPassword /></ProtectedRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/tenants" element={<ProtectedRoute><Tenants /></ProtectedRoute>} />
        <Route path="/system-health" element={<ProtectedRoute><SystemHealth /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
