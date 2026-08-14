import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { Shield, Grid, Server, Settings } from 'lucide-react';
import Login from './pages/Login';
import SetupPassword from './pages/SetupPassword';
import Dashboard from './pages/Dashboard';

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    document.cookie = "super_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    navigate('/login');
  };

  const menuItems = [
    { name: 'Overview', icon: <Grid size={18} />, path: '/' },
    { name: 'Tenants', icon: <Server size={18} />, path: '/' },
    { name: 'Settings', icon: <Settings size={18} />, path: '/' },
  ];

  return (
    <div className="sidebar">
      <div className="flex items-center gap-3 mb-8 px-2" style={{ marginTop: '8px' }}>
        <Shield size={24} color="#fafafa" />
        <span style={{ fontSize: '16px', fontWeight: '600', color: '#fafafa', letterSpacing: '0.02em' }}>SecureHub</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path && item.name === 'Overview';
          return (
            <div 
              key={item.name}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isActive ? '#111' : 'transparent',
                color: isActive ? '#fafafa' : 'var(--text-muted)',
                fontWeight: isActive ? '500' : '400',
              }}
            >
              {item.icon}
              <span style={{ fontSize: '14px' }}>{item.name}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <div 
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: '#111', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fafafa' }}>
            <Shield size={14} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '500', color: '#fafafa' }}>SecOps Team</div>
            <div style={{ fontSize: '12px' }}>Administrator</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardLayout({ children }) {
  return (
    <div className="layout-wrapper">
      <Sidebar />
      <div className="main-content">
        {children}
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
    return <div className="layout-wrapper flex items-center justify-center" style={{ width: '100vw' }}>Loading...</div>;
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
