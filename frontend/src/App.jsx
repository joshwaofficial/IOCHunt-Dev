import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FilterProvider } from './context/FilterContext';
import { InstanceProvider, useInstance } from './context/InstanceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

export const queryClient = new QueryClient();

// Pages
import SetupWizard from './pages/SetupWizard';
import Login from './pages/Login';
import MfaChallenge from './pages/MfaChallenge';
import Dashboard from './pages/Dashboard';
import AdAttacks from './pages/AdAttacks';
import MaliciousActivity from './pages/MaliciousActivity';
import UserAccounts from './pages/UserAccounts';
import Users from './pages/Users';
import MfaSetup from './pages/MfaSetup';
import UsbEvents from './pages/UsbEvents';
import Clients from './pages/Clients';
import AllLogs from './pages/AllLogs';
import Policy from './pages/Policy';
import Incidents from './pages/Incidents';
import Reports from './pages/Reports';
import EmailReports from './pages/EmailReports';
import Firewall from './pages/Firewall';
import Aggregators from './pages/Aggregators';
import AggregatorSettings from './pages/AggregatorSettings';
import Layout from './components/Layout';

// Protected Route Wrapper with Setup Check
const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading: authLoading } = useAuth();
  const { instanceInfo, loading: instanceLoading } = useInstance();
  
  if (authLoading || instanceLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground" style={{ background: '#090d16', color: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>Loading Security Platform...</p>
        </div>
      </div>
    );
  }

  // If instance is not setup yet, redirect to /setup
  if (instanceInfo && instanceInfo.setup_complete === false) {
    return <Navigate to="/setup" replace />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !user.role?.toLowerCase().includes(requiredRole.toLowerCase())) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Setup Route Wrapper
const SetupRoute = () => {
  const { instanceInfo, loading } = useInstance();
  if (loading) return null;
  // If already setup, redirect to dashboard or login
  if (instanceInfo?.setup_complete) {
    return <Navigate to="/login" replace />;
  }
  return <SetupWizard />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <InstanceProvider>
          <AuthProvider>
            <FilterProvider>
              <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />
              <Router>
                <Routes>
                  {/* Setup Wizard Route */}
                  <Route path="/setup" element={<SetupRoute />} />

                  {/* Auth Routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/mfa-challenge" element={<MfaChallenge />} />
                  <Route path="/mfa-setup" element={
                    <ProtectedRoute>
                      <MfaSetup />
                    </ProtectedRoute>
                  } />
                  
                  {/* Authenticated Platform Routes */}
                  <Route path="/" element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="aggregators" element={<Aggregators />} />
                    <Route path="aggregator-settings" element={<AggregatorSettings />} />
                    <Route path="ad-attacks" element={<AdAttacks />} />
                    <Route path="malicious-activity" element={<MaliciousActivity />} />
                    <Route path="user-accounts" element={<UserAccounts />} />
                    <Route path="usb-events" element={<UsbEvents />} />
                    <Route path="firewall" element={<Firewall />} />
                    <Route path="clients" element={<Clients />} />
                    <Route path="all-logs" element={<AllLogs />} />
                    <Route path="policy" element={
                      <ProtectedRoute requiredRole="admin">
                        <Policy />
                      </ProtectedRoute>
                    } />
                    <Route path="users" element={
                      <ProtectedRoute requiredRole="admin">
                        <Users />
                      </ProtectedRoute>
                    } />
                    <Route path="incidents" element={<Incidents />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="email-reports" element={<EmailReports />} />
                  </Route>
                  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Router>
            </FilterProvider>
          </AuthProvider>
        </InstanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
