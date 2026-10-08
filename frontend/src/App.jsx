import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FilterProvider } from './context/FilterContext';
import { InstanceProvider, useInstance } from './context/InstanceContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,      // 30 seconds fresh cache (instant tab switching)
      gcTime: 5 * 60 * 1000,     // 5 minutes in-memory retention
      refetchOnWindowFocus: false, // Prevent jarring refetches on window switch
      retry: 1
    }
  }
});

// Lazy-Loaded Pages for high performance & minimal initial bundle
const ForcePasswordReset = lazy(() => import('./pages/ForcePasswordReset'));
const Login = lazy(() => import('./pages/Login'));
const MfaChallenge = lazy(() => import('./pages/MfaChallenge'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdAttacks = lazy(() => import('./pages/AdAttacks'));
const MaliciousActivity = lazy(() => import('./pages/MaliciousActivity'));
const UserAccounts = lazy(() => import('./pages/UserAccounts'));
const Users = lazy(() => import('./pages/Users'));
const MfaSetup = lazy(() => import('./pages/MfaSetup'));
const UsbEvents = lazy(() => import('./pages/UsbEvents'));
const Clients = lazy(() => import('./pages/Clients'));
const AllLogs = lazy(() => import('./pages/AllLogs'));
const Policy = lazy(() => import('./pages/Policy'));
const AgentKeys = lazy(() => import('./pages/AgentKeys'));
const Incidents = lazy(() => import('./pages/Incidents'));
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'));
const Reports = lazy(() => import('./pages/Reports'));
const EmailReports = lazy(() => import('./pages/EmailReports'));
const Firewall = lazy(() => import('./pages/Firewall'));
const Aggregators = lazy(() => import('./pages/Aggregators'));
const AggregatorSettings = lazy(() => import('./pages/AggregatorSettings'));
const StandaloneTopologyPage = lazy(() => import('./pages/StandaloneTopologyPage'));
const StandaloneFirewallTopologyPage = lazy(() => import('./pages/StandaloneFirewallTopologyPage'));

import Layout from './components/Layout';
import IdleTimerManager from './components/IdleTimerManager';
import ErrorBoundary from './components/ErrorBoundary';

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', width: '100%' }}>
    <div style={{ width: '32px', height: '32px', border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  </div>
);

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

  // If the user's password must be changed, and they aren't already on that page, redirect them.
  if (user && user.force_password_change) {
    if (window.location.pathname !== '/force-password-reset') {
      return <Navigate to="/force-password-reset" replace />;
    }
  }

  // If the user's password does not need to be changed, do not allow staying on /force-password-reset
  if (user && !user.force_password_change && window.location.pathname === '/force-password-reset') {
    return <Navigate to="/dashboard" replace />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !user.role?.toLowerCase().includes(requiredRole.toLowerCase())) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Central Server Only Route Wrapper
const CentralOnlyRoute = ({ children }) => {
  const { isCentral, isAggregator, loading: instanceLoading } = useInstance();
  const { user, loading: authLoading } = useAuth();

  if (authLoading || instanceLoading) {
    return null;
  }

  if (!isCentral() || isAggregator() || user?.aggregator_name || user?.role === 'AGGREGATOR_ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};



function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <InstanceProvider>
          <AuthProvider>
            <FilterProvider>
              <IdleTimerManager />
              <Toaster position="top-right" toastOptions={{ style: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' } }} />
              <Router>
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      {/* Auth Routes */}
                      <Route path="/login" element={<Login />} />
                      <Route path="/force-password-reset" element={
                        <ProtectedRoute>
                          <ForcePasswordReset />
                        </ProtectedRoute>
                      } />
                      <Route path="/mfa-challenge" element={<MfaChallenge />} />
                      <Route path="/mfa-setup" element={
                        <ProtectedRoute>
                          <MfaSetup />
                        </ProtectedRoute>
                      } />

                      {/* Dedicated Fullscreen Network Topology Route (Zero sidebar/navbar) */}
                      <Route path="/network-topology" element={
                        <ProtectedRoute>
                          <StandaloneTopologyPage />
                        </ProtectedRoute>
                      } />
                      
                      {/* Dedicated Fullscreen Firewall Topology Route (Zero sidebar/navbar) */}
                      <Route path="/firewall-topology" element={
                        <ProtectedRoute>
                          <StandaloneFirewallTopologyPage />
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
                        <Route path="aggregators" element={
                          <ProtectedRoute requiredRole="admin">
                            <Aggregators />
                          </ProtectedRoute>
                        } />
                        <Route path="aggregator-settings" element={<AggregatorSettings />} />
                        <Route path="ad-attacks" element={<AdAttacks />} />
                        <Route path="malicious-activity" element={<MaliciousActivity />} />
                        <Route path="user-accounts" element={<UserAccounts />} />
                        <Route path="usb-events" element={<UsbEvents />} />
                        <Route path="firewall" element={<Firewall />} />
                        <Route path="clients" element={<Clients />} />
                        <Route path="all-logs" element={<AllLogs />} />
                        <Route path="policy" element={
                          <ProtectedRoute>
                            <Policy />
                          </ProtectedRoute>
                        } />
                        <Route path="agent-keys" element={
                          <ProtectedRoute requiredRole="admin">
                            <AgentKeys />
                          </ProtectedRoute>
                        } />
                        <Route path="users" element={
                          <ProtectedRoute>
                            <Users />
                          </ProtectedRoute>
                        } />
                        <Route path="incidents" element={
                          <CentralOnlyRoute>
                            <Incidents />
                          </CentralOnlyRoute>
                        } />
                        <Route path="incidents/:id" element={
                          <CentralOnlyRoute>
                            <IncidentDetail />
                          </CentralOnlyRoute>
                        } />
                        <Route path="reports" element={<Reports />} />
                        <Route path="email-reports" element={
                          <CentralOnlyRoute>
                            <EmailReports />
                          </CentralOnlyRoute>
                        } />
                      </Route>
                      
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </Router>
            </FilterProvider>
          </AuthProvider>
        </InstanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
