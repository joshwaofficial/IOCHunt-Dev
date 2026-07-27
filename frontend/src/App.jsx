import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FilterProvider } from './context/FilterContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

export const queryClient = new QueryClient();

// Pages
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
import Layout from './components/Layout';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <AuthProvider>
        <FilterProvider>
          <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/mfa-challenge" element={<MfaChallenge />} />
              <Route path="/mfa-setup" element={
                <ProtectedRoute>
                  <MfaSetup />
                </ProtectedRoute>
              } />
              
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="aggregators" element={<Aggregators />} />
                <Route path="ad-attacks" element={<AdAttacks />} />
                <Route path="malicious-activity" element={<MaliciousActivity />} />
                <Route path="user-accounts" element={<UserAccounts />} />
                <Route path="usb-events" element={<UsbEvents />} />
                <Route path="firewall" element={<Firewall />} />
                <Route path="clients" element={<Clients />} />
                <Route path="all-logs" element={<AllLogs />} />
                <Route path="policy" element={<Policy />} />
                <Route path="users" element={<Users />} />
                <Route path="incidents" element={<Incidents />} />
                <Route path="reports" element={<Reports />} />
                <Route path="email-reports" element={<EmailReports />} />
              </Route>
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </FilterProvider>
      </AuthProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
