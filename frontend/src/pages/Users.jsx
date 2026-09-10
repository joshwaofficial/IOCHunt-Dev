import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const esc = (s) => (s || '').toString().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");

const formatLocalDate = (val) => {
  if (!val) return '—';
  const num = Number(val);
  const d = !isNaN(num) && num > 0
    ? new Date(num > 1e11 ? num : num * 1000)
    : new Date(val);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatLocalTime = (val) => {
  if (!val) return '—';
  const num = Number(val);
  const d = !isNaN(num) && num > 0
    ? new Date(num > 1e11 ? num : num * 1000)
    : new Date(val);
  if (isNaN(d.getTime())) return '—';
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

export default function Users() {
  const { user: currentUser, setUser, logout } = useAuth();
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'sessions' | 'policies' | 'audit'

  // Users State
  const [data, setData] = useState([]);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Inline expanded rows
  const [expandedEditId, setExpandedEditId] = useState(null);
  const [expandedPwId, setExpandedPwId] = useState(null);

  // Edit/PW forms state mapped by ID
  const [editForms, setEditForms] = useState({});
  const [pwForms, setPwForms] = useState({});
  const [editErrors, setEditErrors] = useState({});
  const [pwErrors, setPwErrors] = useState({});

  // Confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'primary' });
  const [alertDialog, setAlertDialog] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  // Add User Form
  const [newForm, setNewForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'L1_ANALYST',
    force_password_change: true,
    session_policy: 'inherit',
    custom_session_hours: 8,
    custom_idle_mins: 0
  });
  const [newError, setNewError] = useState('');

  // Tenant-wide Session Security Policy
  const [tenantSessionSettings, setTenantSessionSettings] = useState({
    session_policy: 'soc_shift_8h',
    session_lifetime_hours: 8,
    idle_timeout_mins: 0
  });
  const [savingTenantPolicy, setSavingTenantPolicy] = useState(false);

  // Live Sessions State (Tab 2)
  const [sessionsData, setSessionsData] = useState([]);
  const [sessionsSummary, setSessionsSummary] = useState({ total_sessions: 0, online_count: 0, idle_count: 0 });
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsAutoRefresh, setSessionsAutoRefresh] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');

  // Audit Logs State (Tab 4)
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState('all');

  // Fetch Users & Tenant Policy
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, keyRes, sessionSettingsRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/auth/api-key').catch(() => ({ data: { api_key: null } })),
        axios.get('/api/users/session-settings').catch(() => ({ data: { settings: null } }))
      ]);
      setData(usersRes.data.users || []);
      setApiKey(keyRes.data.api_key);
      if (sessionSettingsRes.data?.settings) {
        setTenantSessionSettings(sessionSettingsRes.data.settings);
      }
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Active Sessions
  const fetchSessions = async (showLoading = true) => {
    if (showLoading) setSessionsLoading(true);
    try {
      const res = await axios.get('/api/users/active-sessions');
      if (res.data?.success) {
        setSessionsData(res.data.sessions || []);
        setSessionsSummary({
          total_sessions: res.data.total_sessions || 0,
          online_count: res.data.online_count || 0,
          idle_count: res.data.idle_count || 0
        });
      }
    } catch (e) {
      console.error('Failed to fetch active sessions:', e);
    } finally {
      if (showLoading) setSessionsLoading(false);
    }
  };

  // Fetch Session Audit Logs
  const fetchAuditLogs = async (showLoading = true) => {
    if (showLoading) setAuditLoading(true);
    try {
      const res = await axios.get('/api/users/session-audit-logs', {
        params: { search: auditSearch, limit: 50 }
      });
      if (res.data?.success) {
        setAuditLogs(res.data.logs || []);
      }
    } catch (e) {
      console.error('Failed to fetch session audit logs:', e);
    } finally {
      if (showLoading) setAuditLoading(false);
    }
  };

  const handleSaveTenantSessionSettings = async () => {
    setSavingTenantPolicy(true);
    try {
      const res = await axios.put('/api/users/session-settings', tenantSessionSettings);
      toast.success(res.data?.message || 'Tenant session policy updated successfully');
      if (res.data?.settings) {
        setTenantSessionSettings(res.data.settings);
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update tenant session policy');
    } finally {
      setSavingTenantPolicy(false);
    }
  };

  // Terminate a single session
  const handleTerminateSession = (token, username) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Revoke Active Session',
      message: `Are you sure you want to terminate the active session for "${username}"? They will be immediately disconnected and returned to the login screen.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await axios.delete(`/api/users/sessions/${encodeURIComponent(token)}`);
          toast.success(res.data?.message || `Session for "${username}" revoked`);
          fetchSessions(false);
          fetchData();
        } catch (e) {
          toast.error(e.response?.data?.error || 'Failed to terminate session');
        }
      }
    });
  };

  // Terminate all other sessions
  const handleTerminateAllOthers = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Terminate All Other Sessions',
      message: 'Are you sure you want to immediately terminate ALL active sessions across this workspace except your own? All other users will be forced to log in again.',
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await axios.post('/api/users/sessions/terminate-all-others');
          toast.success(res.data?.message || 'All other active sessions revoked');
          fetchSessions(false);
          fetchData();
        } catch (e) {
          toast.error(e.response?.data?.error || 'Failed to terminate sessions');
        }
      }
    });
  };

  // Initial load
  useEffect(() => {
    fetchData();
    fetchSessions(false);
  }, []);

  // Tab change triggers
  useEffect(() => {
    if (activeTab === 'sessions') {
      fetchSessions();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  // Live auto-refresh for Sessions tab
  useEffect(() => {
    if (activeTab === 'sessions' && sessionsAutoRefresh) {
      const timer = setInterval(() => {
        fetchSessions(false);
      }, 15000);
      return () => clearInterval(timer);
    }
  }, [activeTab, sessionsAutoRefresh]);

  // Build active user status map: username -> session info
  const activeUserMap = useMemo(() => {
    const map = {};
    for (const s of sessionsData) {
      if (!map[s.username] || s.is_online) {
        map[s.username] = s;
      }
    }
    return map;
  }, [sessionsData]);

  // Existing Create User Handler
  const handleCreate = async () => {
    setNewError('');
    if (!newForm.username || !newForm.password) {
      setNewError('Username and password required.');
      return;
    }
    if (newForm.password.length < 8) {
      setNewError('Password must be at least 8 characters.');
      return;
    }
    try {
      await axios.post('/api/users', newForm);
      setNewForm({
        username: '',
        email: '',
        password: '',
        role: 'L1_ANALYST',
        force_password_change: true,
        session_policy: 'inherit',
        custom_session_hours: 8,
        custom_idle_mins: 0
      });
      fetchData();
      fetchSessions(false);
      toast.success('User created successfully');
    } catch (e) {
      setNewError(e.response?.data?.error || 'Failed to create user');
    }
  };

  // Existing Save Edit Handler
  const handleSaveEdit = async (id) => {
    const form = editForms[id];
    setEditErrors(prev => ({ ...prev, [id]: '' }));
    try {
      await axios.patch(`/api/users/${id}`, {
        username: form.username,
        email: form.email,
        role: form.role,
        session_policy: form.session_policy || 'inherit',
        custom_session_hours: form.custom_session_hours ? Number(form.custom_session_hours) : null,
        custom_idle_mins: form.custom_idle_mins !== '' && form.custom_idle_mins !== null ? Number(form.custom_idle_mins) : null
      });
      setExpandedEditId(null);
      fetchData();
      fetchSessions(false);
      toast.success('User updated successfully');
    } catch (e) {
      setEditErrors(prev => ({ ...prev, [id]: e.response?.data?.error || 'Failed to update user' }));
    }
  };

  // Existing Save Password Handler
  const handleSavePw = async (id) => {
    const form = pwForms[id];
    setPwErrors(prev => ({ ...prev, [id]: '' }));
    if (!form.newPw) {
      setPwErrors(prev => ({ ...prev, [id]: 'New password is required' }));
      return;
    }
    if (form.newPw.length < 8) {
      setPwErrors(prev => ({ ...prev, [id]: 'Password must be at least 8 characters' }));
      return;
    }
    if (form.newPw !== form.confirmPw) {
      setPwErrors(prev => ({ ...prev, [id]: 'Passwords do not match' }));
      return;
    }
    try {
      await axios.patch(`/api/users/${id}`, { password: form.newPw });
      setExpandedPwId(null);
      fetchData();
      toast.success('Password updated successfully');
    } catch (e) {
      setPwErrors(prev => ({ ...prev, [id]: e.response?.data?.error || 'Failed to update password' }));
    }
  };

  // Existing Delete User Handler
  const handleDelete = (id, username) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to permanently delete user "${username}"?`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/users/${id}`);
          fetchData();
          fetchSessions(false);
          toast.success('User deleted successfully');
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.response?.data?.error || 'Failed to delete user', type: 'danger' });
        }
      }
    });
  };

  // Existing Disable MFA Handler
  const handleDisableMfa = (user) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Disable MFA',
      message: `Are you sure you want to disable Multi-Factor Authentication for "${user.username}"?`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`/api/users/${user.id}/mfa-disable`);
          fetchData();
          toast.success('MFA disabled successfully');
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.response?.data?.error || 'Failed to disable MFA', type: 'danger' });
        }
      }
    });
  };

  // Existing Toggle Role Handler
  const toggleRole = (user) => {
    const roleHierarchy = ['VIEWER', 'L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN'];
    const currentIdx = roleHierarchy.indexOf(user.role);
    const nextIdx = (currentIdx + 1) % roleHierarchy.length;
    const newRole = roleHierarchy[nextIdx];
    setConfirmDialog({
      isOpen: true,
      title: 'Change Role',
      message: `Change "${user.username}" role to ${newRole}?`,
      type: 'primary',
      onConfirm: async () => {
        try {
          await axios.patch(`/api/users/${user.id}`, { role: newRole });
          fetchData();
          toast.success(`Role updated to ${newRole}`);
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.response?.data?.error || 'Failed to update role', type: 'danger' });
        }
      }
    });
  };

  const openEdit = (u) => {
    setExpandedPwId(null);
    if (expandedEditId === u.id) {
      setExpandedEditId(null);
    } else {
      setEditForms(prev => ({
        ...prev,
        [u.id]: {
          username: u.username,
          email: u.email || '',
          role: u.role,
          session_policy: u.session_policy || 'inherit',
          custom_session_hours: u.custom_session_hours || 8,
          custom_idle_mins: u.custom_idle_mins !== null && u.custom_idle_mins !== undefined ? u.custom_idle_mins : 0
        }
      }));
      setExpandedEditId(u.id);
    }
  };

  const openPw = (u) => {
    setExpandedEditId(null);
    if (expandedPwId === u.id) {
      setExpandedPwId(null);
    } else {
      setPwForms(prev => ({ ...prev, [u.id]: { currentPw: '', newPw: '', confirmPw: '' }}));
      setExpandedPwId(u.id);
    }
  };

  const filteredData = data.filter(u => {
    if (currentUser?.role === 'L1_ANALYST' || currentUser?.role === 'L2_ANALYST') {
      if (String(u.id) !== String(currentUser?.id)) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!u.username.toLowerCase().includes(term) && !(u.email || '').toLowerCase().includes(term)) return false;
    }
    if (roleFilter !== 'all' && (u.role || '').toLowerCase() !== roleFilter.toLowerCase()) return false;
    return true;
  });

  const total = filteredData.length;
  const admins = filteredData.filter(u => u.role === 'ADMIN').length;
  const l1Analysts = filteredData.filter(u => u.role === 'L1_ANALYST').length;
  const l2Analysts = filteredData.filter(u => u.role === 'L2_ANALYST').length;
  const l3Analysts = filteredData.filter(u => u.role === 'L3_ANALYST').length;
  const viewers = filteredData.filter(u => u.role === 'VIEWER').length;
  const mfaEnabled = filteredData.filter(u => u.mfa_enabled).length;

  // Filtered sessions in Tab 2
  const filteredSessions = sessionsData.filter(s => {
    if (!sessionSearch) return true;
    const term = sessionSearch.toLowerCase();
    return (
      s.username.toLowerCase().includes(term) ||
      s.ip_address.toLowerCase().includes(term) ||
      s.browser.toLowerCase().includes(term) ||
      s.os.toLowerCase().includes(term)
    );
  });

  // Filtered audit logs in Tab 4
  const filteredAuditLogs = auditLogs.filter(l => {
    if (auditFilterAction !== 'all') {
      if (auditFilterAction === 'IDLE') {
        if (!l.action.includes('IDLE') && l.result !== 'IDLE') return false;
      } else if (!l.action.toLowerCase().includes(auditFilterAction.toLowerCase())) {
        return false;
      }
    }
    if (!auditSearch) return true;
    const term = auditSearch.toLowerCase();
    return (
      (l.username || '').toLowerCase().includes(term) ||
      (l.action || '').toLowerCase().includes(term) ||
      (l.detail || '').toLowerCase().includes(term) ||
      (l.ip_address || '').toLowerCase().includes(term)
    );
  });

  // Reusable Premium KPI Card
  const PremiumCard = ({ value, label, color, icon, subtitle }) => (
    <div 
      style={{ 
        background: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: '12px', 
        padding: '16px 20px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ 
          width: '32px', height: '32px', 
          borderRadius: '8px', 
          background: `${color}1A`, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          color: color 
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
        </div>
        {subtitle && (
          <span style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            color: 'var(--muted)', 
            background: 'var(--background)', 
            padding: '2px 8px', 
            borderRadius: '12px',
            border: '1px solid var(--border)',
            fontFamily: 'var(--mono)'
          }}>
            {subtitle}
          </span>
        )}
      </div>
      <div>
        <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px', lineHeight: 1.2, fontFamily: 'var(--mono)' }}>
          {value}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#3b82f6' }}>admin_panel_settings</span>
            User Accounts & Security Hub
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
            Manage analyst credentials, monitor live active sessions, and enforce session security policies
          </p>
        </div>

        {/* Live System Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#4ade80' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            {sessionsSummary.online_count} Online Now
          </div>

          {sessionsSummary.idle_count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
              {sessionsSummary.idle_count} Idle
            </div>
          )}

          {currentUser?.role === 'ADMIN' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#2563eb' }}>vpn_key</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>API Key:</span>
              <span style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>••••••••</span>
              {apiKey && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(apiKey);
                    setApiKeyCopied(true);
                    setTimeout(() => setApiKeyCopied(false), 2000);
                  }}
                  style={{ background: 'transparent', border: 'none', color: apiKeyCopied ? '#10b981' : 'var(--muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                  title="Copy full API Key"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{apiKeyCopied ? 'check' : 'content_copy'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border)', marginBottom: '20px', paddingBottom: '2px', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          style={{
            background: activeTab === 'users' ? 'rgba(37,99,235,0.15)' : 'transparent',
            color: activeTab === 'users' ? '#60a5fa' : 'var(--muted)',
            border: activeTab === 'users' ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
            padding: '9px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>group</span>
          Users & Roles ({data.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          style={{
            background: activeTab === 'sessions' ? 'rgba(37,99,235,0.15)' : 'transparent',
            color: activeTab === 'sessions' ? '#60a5fa' : 'var(--muted)',
            border: activeTab === 'sessions' ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
            padding: '9px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: sessionsSummary.online_count > 0 ? '#10b981' : 'var(--muted)' }}>
            sensors
          </span>
          Live Sessions ({sessionsSummary.total_sessions})
          {sessionsSummary.online_count > 0 && (
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policies')}
          style={{
            background: activeTab === 'policies' ? 'rgba(37,99,235,0.15)' : 'transparent',
            color: activeTab === 'policies' ? '#60a5fa' : 'var(--muted)',
            border: activeTab === 'policies' ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
            padding: '9px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>security</span>
          Security Policies
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          style={{
            background: activeTab === 'audit' ? 'rgba(37,99,235,0.15)' : 'transparent',
            color: activeTab === 'audit' ? '#60a5fa' : 'var(--muted)',
            border: activeTab === 'audit' ? '1px solid rgba(37,99,235,0.4)' : '1px solid transparent',
            padding: '9px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>history</span>
          Session Audit Logs
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 1: USERS & ROLES                                                        */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <>
          {currentUser?.role === 'ADMIN' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <PremiumCard value={total} label="Total Users" color="#2563eb" icon="group" subtitle="Active" />
              <PremiumCard value={admins} label="Admins" color="#7c3aed" icon="admin_panel_settings" subtitle="Active" />
              <PremiumCard value={l1Analysts} label="L1 Analysts" color="#16a34a" icon="visibility" subtitle="Active" />
              <PremiumCard value={l2Analysts} label="L2 Analysts" color="#ec4899" icon="shield" subtitle="Active" />
              <PremiumCard value={l3Analysts} label="L3 Analysts" color="#f59e0b" icon="policy" subtitle="Active" />
              <PremiumCard value={viewers} label="Viewers" color="#06b6d4" icon="tv" subtitle="Wallboard" />
              <PremiumCard value={mfaEnabled} label="MFA Active" color="#0891b2" icon="security" subtitle="Active" />
            </div>
          )}

          {currentUser?.role === 'ADMIN' && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '12px', marginBottom: '14px', justifyContent: 'space-between', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div className="tb-search-wrap" style={{ flex: 1, minWidth: '160px' }}>
                <span className="material-symbols-outlined tb-search-icon">search</span>
                <input 
                  type="text" 
                  className="tb-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search username, email..." 
                  style={{ width: '100%' }}
                />
              </div>
              
              <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px', fontFamily: 'var(--mono)' }}>Role:</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setRoleFilter('ADMIN')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'ADMIN' ? 1 : 0.4 }}>ADMINS</button>
                  <button onClick={() => setRoleFilter('L1_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L1_ANALYST' ? 1 : 0.4 }}>L1</button>
                  <button onClick={() => setRoleFilter('L2_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(236,72,153,0.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L2_ANALYST' ? 1 : 0.4 }}>L2</button>
                  <button onClick={() => setRoleFilter('L3_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L3_ANALYST' ? 1 : 0.4 }}>L3</button>
                  <button onClick={() => setRoleFilter('VIEWER')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'VIEWER' ? 1 : 0.4 }}>VIEWERS</button>
                  <button onClick={() => setRoleFilter('all')} style={{ padding: '4px 10px', borderRadius: '4px', background: roleFilter === 'all' ? '#2563eb' : 'transparent', color: roleFilter === 'all' ? '#fff' : 'var(--text)', border: '1px solid ' + (roleFilter === 'all' ? '#2563eb' : 'var(--border)'), fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s' }}>ALL</button>
                </div>
              </div>
            </div>
          )}

          {/* Users Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.01)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined text-muted" style={{ fontSize: '16px', color: 'var(--muted)' }}>group</span>
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: 0 }}>
                  User Accounts ({filteredData.length})
                </span>
              </div>
              <a
                href="#create-user-section"
                style={{ fontSize: '11px', color: '#3b82f6', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                Create User
              </a>
            </div>
            
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading users...</div>
            ) : error ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>Error: {error}</div>
            ) : total === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No users found</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>User</th>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Live Status</th>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Role</th>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Policy</th>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Last Login</th>
                      <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((u) => {
                      const isSelf = String(u.id) === String(currentUser?.id);
                      const hasMFA = u.mfa_enabled;
                      const sessionInfo = activeUserMap[u.username];
                      const isOnline = sessionInfo?.is_online;
                      const isIdle = sessionInfo?.is_idle;

                      const roleColors = {
                        'ADMIN': { bg: 'rgba(139,92,246,.2)', color: '#a78bfa', badge: { bg: 'rgba(139,92,246,.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.3)' } },
                        'L1_ANALYST': { bg: 'rgba(34,197,94,.2)', color: '#4ade80', badge: { bg: 'rgba(34,197,94,.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,.25)' } },
                        'L2_ANALYST': { bg: 'rgba(236,72,153,.2)', color: '#ec4899', badge: { bg: 'rgba(236,72,153,.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,.25)' } },
                        'L3_ANALYST': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b', badge: { bg: 'rgba(245,158,11,.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.25)' } },
                        'VIEWER': { bg: 'rgba(6,182,212,.2)', color: '#22d3ee', badge: { bg: 'rgba(6,182,212,.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,.25)' } },
                      };
                      const rc = roleColors[u.role] || { bg: 'rgba(100,116,139,.2)', color: '#94a3b8', badge: { bg: 'rgba(100,116,139,.12)', color: '#94a3b8', border: '1px solid rgba(100,116,139,.25)' } };

                      return (
                        <React.Fragment key={u.id}>
                          <tr style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ position: 'relative' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: rc.bg, color: rc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                                    {u.username[0]?.toUpperCase()}
                                  </div>
                                  {isOnline ? (
                                    <span title="Online (Active)" style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', border: '2px solid var(--surface)', boxShadow: '0 0 6px #22c55e' }} />
                                  ) : isIdle ? (
                                    <span title="Idle (Away)" style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', border: '2px solid var(--surface)' }} />
                                  ) : (
                                    <span title="Offline" style={{ position: 'absolute', bottom: 0, right: 0, width: '9px', height: '9px', borderRadius: '50%', background: '#64748b', border: '2px solid var(--surface)' }} />
                                  )}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{esc(u.username)}</span>
                                    {isSelf && <span style={{ fontSize: '10px', background: 'rgba(37,99,235,0.15)', color: '#3b82f6', border: '1px solid rgba(37,99,235,0.3)', padding: '2px 7px', borderRadius: '20px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>YOU</span>}
                                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', ...rc.badge }}>{esc(u.role)}</span>
                                    {Boolean(u.force_password_change) && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>key</span>
                                        Reset Required
                                      </span>
                                    )}
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', ...(hasMFA ? { background: 'rgba(6,182,212,.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,.25)' } : { background: 'rgba(148,163,184,.08)', color: '#8d90a0', border: '1px solid rgba(148,163,184,.2)' }) }}>
                                      <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>{hasMFA ? 'lock' : 'lock_open'}</span>
                                      {hasMFA ? 'MFA' : 'NO MFA'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontFamily: 'var(--mono)' }}>{u.email || 'No email specified'}</div>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              {isOnline ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '3px 9px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                                  Online
                                </span>
                              ) : isIdle ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 9px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                                  Idle ({formatDuration(sessionInfo.idle_seconds)})
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#64748b' }} />
                                  Offline
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <span 
                                onClick={() => currentUser?.role === 'ADMIN' && !isSelf && toggleRole(u)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: currentUser?.role === 'ADMIN' && !isSelf ? 'pointer' : 'default',
                                  ...rc.badge
                                }}
                                title={currentUser?.role === 'ADMIN' && !isSelf ? 'Click to cycle role' : ''}
                              >
                                {u.role}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text)', background: 'var(--background)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontFamily: 'var(--mono)' }}>
                                {u.session_policy === 'inherit' ? 'Default' : u.session_policy}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                              {formatLocalTime(u.last_login)}
                            </td>

                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {sessionInfo && (
                                  <button
                                    onClick={() => {
                                      setSessionSearch(u.username);
                                      setActiveTab('sessions');
                                    }}
                                    style={{ background: 'rgba(37,99,235,0.1)', color: '#60a5fa', border: '1px solid rgba(37,99,235,0.25)', padding: '5px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    title="View active session in Live Sessions tab"
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>sensors</span>
                                    Session
                                  </button>
                                )}

                                <button
                                  onClick={() => openEdit(u)}
                                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>edit</span> Edit
                                </button>

                                <button
                                  onClick={() => openPw(u)}
                                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>key</span> Password
                                </button>

                                {currentUser?.role === 'ADMIN' && !isSelf && (
                                  <button
                                    onClick={() => toggleRole(u)}
                                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>swap_vert</span> Switch Role
                                  </button>
                                )}

                                {hasMFA > 0 ? (
                                  (currentUser?.role === 'ADMIN' || isSelf) ? (
                                    <button
                                      onClick={() => handleDisableMfa(u)}
                                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lock_open</span> Revoke MFA
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '11px', padding: '0 6px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>—</span>
                                  )
                                ) : isSelf ? (
                                  <a
                                    href="/mfa-setup"
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lock</span> Enable MFA
                                  </a>
                                ) : (
                                  !(currentUser?.role === 'ADMIN' || isSelf) ? null : <span style={{ fontSize: '11px', padding: '0 6px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>—</span>
                                )}

                                {currentUser?.role === 'ADMIN' && !isSelf && (
                                  <button
                                    onClick={() => handleDelete(u.id, u.username)}
                                    title="Delete user"
                                    style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Inline Edit Form */}
                          {expandedEditId === u.id && (
                            <tr>
                              <td colSpan={6} style={{ padding: '16px 20px', background: 'rgba(37,99,235,0.03)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Username</label>
                                    <input 
                                      type="text" 
                                      className="input-field" 
                                      value={editForms[u.id]?.username || ''} 
                                      onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], username: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Email</label>
                                    <input 
                                      type="email" 
                                      className="input-field" 
                                      value={editForms[u.id]?.email || ''} 
                                      onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], email: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Role</label>
                                    <select 
                                      className="input-field" 
                                      value={editForms[u.id]?.role || 'L1_ANALYST'} 
                                      onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], role: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    >
                                      <option value="VIEWER">Viewer (Read-Only / Wallboard)</option>
                                      <option value="L1_ANALYST">L1 Analyst</option>
                                      <option value="L2_ANALYST">L2 Analyst</option>
                                      <option value="L3_ANALYST">L3 Analyst</option>
                                      <option value="ADMIN">Admin</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Session Policy</label>
                                    <select 
                                      className="input-field" 
                                      value={editForms[u.id]?.session_policy || 'inherit'} 
                                      onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], session_policy: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    >
                                      <option value="inherit">Default (Inherit)</option>
                                      <option value="soc_shift_8h">SOC Shift (8h)</option>
                                      <option value="wallboard_24h">Wallboard (24h)</option>
                                      <option value="strict_30m">Strict (30m Idle)</option>
                                      <option value="custom">Custom Policy</option>
                                    </select>
                                  </div>
                                  {editForms[u.id]?.session_policy === 'custom' && (
                                    <>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Lifetime (Hours)</label>
                                        <input 
                                          type="number" 
                                          min="1" 
                                          max="168" 
                                          className="input-field" 
                                          value={editForms[u.id]?.custom_session_hours ?? 8} 
                                          onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], custom_session_hours: e.target.value } }))} 
                                          style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} 
                                        />
                                      </div>
                                      <div>
                                        <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Idle Timeout (Mins, 0=None)</label>
                                        <input 
                                          type="number" 
                                          min="0" 
                                          max="1440" 
                                          className="input-field" 
                                          value={editForms[u.id]?.custom_idle_mins ?? 0} 
                                          onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], custom_idle_mins: e.target.value } }))} 
                                          style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} 
                                        />
                                      </div>
                                    </>
                                  )}
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleSaveEdit(u.id)} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                      Save
                                    </button>
                                    <button onClick={() => setExpandedEditId(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                                {editErrors[u.id] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', fontWeight: 600 }}>{editErrors[u.id]}</div>}
                              </td>
                            </tr>
                          )}

                          {/* Inline Password Form */}
                          {expandedPwId === u.id && (
                            <tr>
                              <td colSpan={6} style={{ padding: '16px 20px', background: 'rgba(37,99,235,0.03)', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>New Password</label>
                                    <input 
                                      type="password" 
                                      placeholder="Min 8 chars"
                                      className="input-field" 
                                      value={pwForms[u.id]?.newPw || ''} 
                                      onChange={(e) => setPwForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], newPw: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)' }}>Confirm Password</label>
                                    <input 
                                      type="password" 
                                      placeholder="Repeat password"
                                      className="input-field" 
                                      value={pwForms[u.id]?.confirmPw || ''} 
                                      onChange={(e) => setPwForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], confirmPw: e.target.value } }))}
                                      style={{ width: '100%', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleSavePw(u.id)} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                      Update Password
                                    </button>
                                    <button onClick={() => setExpandedPwId(null)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                                {pwErrors[u.id] && <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', fontWeight: 600 }}>{pwErrors[u.id]}</div>}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create User Section (Directly under the table) */}
          {currentUser?.role === 'ADMIN' && (
            <div id="create-user-section" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.01)' }}>
                <span className="material-symbols-outlined text-muted" style={{ fontSize: '16px', color: '#3b82f6' }}>person_add</span>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)', fontFamily: 'var(--mono)', margin: 0 }}>
                  Create New User Account
                </span>
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Username</label>
                    <input 
                      type="text" 
                      placeholder="analyst1" 
                      className="input-field" 
                      value={newForm.username} 
                      onChange={(e) => setNewForm(prev => ({ ...prev, username: e.target.value }))} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Email (optional)</label>
                    <input 
                      type="email" 
                      placeholder="user@company.com" 
                      className="input-field" 
                      value={newForm.email} 
                      onChange={(e) => setNewForm(prev => ({ ...prev, email: e.target.value }))} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Password</label>
                    <input 
                      type="password" 
                      placeholder="Min 8 characters" 
                      className="input-field" 
                      value={newForm.password} 
                      onChange={(e) => setNewForm(prev => ({ ...prev, password: e.target.value }))} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Role</label>
                    <select 
                      className="input-field" 
                      value={newForm.role} 
                      onChange={(e) => setNewForm(prev => ({ ...prev, role: e.target.value }))} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none' }}
                    >
                      <option value="VIEWER">Viewer (Read-Only / Wallboard)</option>
                      <option value="L1_ANALYST">L1 Analyst</option>
                      <option value="L2_ANALYST">L2 Analyst</option>
                      <option value="L3_ANALYST">L3 Analyst</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Session Policy</label>
                    <select 
                      className="input-field" 
                      value={newForm.session_policy} 
                      onChange={(e) => setNewForm(prev => ({ ...prev, session_policy: e.target.value }))} 
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%', outline: 'none' }}
                    >
                      <option value="inherit">Default (Inherit Tenant)</option>
                      <option value="soc_shift_8h">SOC Shift (8h)</option>
                      <option value="wallboard_24h">Wallboard (24h)</option>
                      <option value="strict_30m">Strict (30m Idle)</option>
                      <option value="custom">Custom Policy</option>
                    </select>
                  </div>
                  <div>
                    <button 
                      onClick={handleCreate} 
                      style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', height: '37px', width: '100%', justifyContent: 'center' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>person_add</span> Create
                    </button>
                  </div>
                </div>

                {newForm.session_policy === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px', maxWidth: '420px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Lifetime (Hours)</label>
                      <input 
                        type="number" min="1" max="168" className="input-field" 
                        value={newForm.custom_session_hours} 
                        onChange={(e) => setNewForm(prev => ({ ...prev, custom_session_hours: e.target.value }))} 
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', width: '100%' }} 
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Idle Timeout (Mins, 0=None)</label>
                      <input 
                        type="number" min="0" max="1440" className="input-field" 
                        value={newForm.custom_idle_mins} 
                        onChange={(e) => setNewForm(prev => ({ ...prev, custom_idle_mins: e.target.value }))} 
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', width: '100%' }} 
                      />
                    </div>
                  </div>
                )}
                {newError && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>{newError}</div>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 2: LIVE SESSIONS & MONITORING                                           */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <>
          {/* Top Session Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            <PremiumCard 
              value={sessionsSummary.total_sessions} 
              label="Total Active Sessions" 
              color="#2563eb" 
              icon="desktop_windows" 
              subtitle="Authenticated" 
            />
            <PremiumCard 
              value={sessionsSummary.online_count} 
              label="Currently Online" 
              color="#16a34a" 
              icon="sensors" 
              subtitle="< 2m Activity" 
            />
            <PremiumCard 
              value={sessionsSummary.idle_count} 
              label="Idle Sessions" 
              color="#f59e0b" 
              icon="hourglass_empty" 
              subtitle="Inactivity" 
            />
            <PremiumCard 
              value={tenantSessionSettings.session_policy === 'inherit' ? 'Default' : tenantSessionSettings.session_policy} 
              label="Enforced Policy" 
              color="#8b5cf6" 
              icon="policy" 
              subtitle={`${tenantSessionSettings.session_lifetime_hours || 8}h Shift`} 
            />
          </div>

          {/* Controls Bar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '16px', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div className="tb-search-wrap" style={{ flex: 1, minWidth: '220px' }}>
              <span className="material-symbols-outlined tb-search-icon">search</span>
              <input 
                type="text" 
                className="tb-search"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder="Search by user, IP address, OS, browser..." 
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setSessionsAutoRefresh(prev => !prev)}
                style={{
                  background: sessionsAutoRefresh ? 'rgba(34,197,94,0.12)' : 'transparent',
                  color: sessionsAutoRefresh ? '#4ade80' : 'var(--muted)',
                  border: '1px solid ' + (sessionsAutoRefresh ? 'rgba(34,197,94,0.3)' : 'var(--border)'),
                  padding: '7px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Toggle live auto-refresh every 15s"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>sync</span>
                Auto-Refresh: {sessionsAutoRefresh ? 'ON' : 'OFF'}
              </button>

              <button
                onClick={() => fetchSessions(true)}
                disabled={sessionsLoading}
                style={{
                  background: 'var(--background)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', animation: sessionsLoading ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                Refresh
              </button>

              {currentUser?.role === 'ADMIN' && sessionsSummary.total_sessions > 1 && (
                <button
                  onClick={handleTerminateAllOthers}
                  style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)',
                    padding: '7px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>power_settings_new</span>
                  Terminate All Others
                </button>
              )}
            </div>
          </div>

          {/* Active Sessions Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.01)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#10b981' }}>sensors</span>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  Active User Sessions ({filteredSessions.length})
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Real-time active tokens registered in control-plane database
              </span>
            </div>

            {sessionsLoading && sessionsData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Scanning active sessions...</div>
            ) : filteredSessions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No matching active sessions found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>User & Account</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Activity Status</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Device & Location</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Started At</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Expires In</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSessions.map((s) => (
                      <tr key={s.token} style={{ borderBottom: '1px solid var(--border)', background: s.is_current ? 'rgba(37,99,235,0.03)' : 'transparent' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(37,99,235,0.15)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                              {s.username[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {s.username}
                                {s.is_current && (
                                  <span style={{ fontSize: '10px', background: 'rgba(37,99,235,0.2)', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    THIS DEVICE
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Role: {s.role}</div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          {s.is_online ? (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.12)', padding: '3px 9px', borderRadius: '20px', border: '1px solid rgba(34,197,94,0.3)' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                                Active Now
                              </span>
                              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                                Interacted {formatDuration(s.idle_seconds)} ago
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '3px 9px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                                Idle ({formatDuration(s.idle_seconds)})
                              </span>
                              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
                                Away from keyboard
                              </div>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                              {s.device_type === 'Mobile' ? 'smartphone' : 'laptop_mac'}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
                                {s.browser} on {s.os}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                                IP: {s.ip_address}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {formatLocalTime(s.created_at)}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: s.expires_in_seconds < 1800 ? '#ef4444' : 'var(--text)', fontFamily: 'var(--mono)' }}>
                            {formatDuration(s.expires_in_seconds)}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            Max {Math.round((s.expires_at - s.created_at) / 3600)}h session
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {currentUser?.role === 'ADMIN' ? (
                            s.is_current ? (
                              <button
                                onClick={logout}
                                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Sign Out
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTerminateSession(s.token, s.username)}
                                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>block</span>
                                Revoke Session
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 3: SECURITY POLICIES                                                    */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'policies' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: '20px' }}>security</span>
                  Tenant Session Security Policy
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                  Configure organizational session duration, idle inactivity timeouts, and device integrity guards
                </p>
              </div>

              {currentUser?.role === 'ADMIN' && (
                <button
                  onClick={handleSaveTenantSessionSettings}
                  disabled={savingTenantPolicy}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: savingTenantPolicy ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
                  {savingTenantPolicy ? 'Saving...' : 'Save Policy Settings'}
                </button>
              )}
            </div>

            <div style={{ padding: '24px' }}>
              {/* Policy Preset Cards */}
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                Baseline Policy Mode
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                
                {/* Preset 1: SOC Shift */}
                <div 
                  onClick={() => setTenantSessionSettings(prev => ({ ...prev, session_policy: 'soc_shift_8h', session_lifetime_hours: 8, idle_timeout_mins: 0 }))}
                  style={{
                    border: tenantSessionSettings.session_policy === 'soc_shift_8h' ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: tenantSessionSettings.session_policy === 'soc_shift_8h' ? 'rgba(37,99,235,0.06)' : 'var(--background)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: '20px' }}>work</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>SOC Shift Mode</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    8 Hours max lifetime. Zero idle disconnects. Ideal for continuous analyst shifts.
                  </div>
                </div>

                {/* Preset 2: Wallboard */}
                <div 
                  onClick={() => setTenantSessionSettings(prev => ({ ...prev, session_policy: 'wallboard_24h', session_lifetime_hours: 24, idle_timeout_mins: 0 }))}
                  style={{
                    border: tenantSessionSettings.session_policy === 'wallboard_24h' ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: tenantSessionSettings.session_policy === 'wallboard_24h' ? 'rgba(37,99,235,0.06)' : 'var(--background)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ color: '#06b6d4', fontSize: '20px' }}>tv</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>24/7 Wallboard Mode</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    24 Hours lifetime. Zero idle timeouts. Designed for unattended big-screen monitors.
                  </div>
                </div>

                {/* Preset 3: Strict */}
                <div 
                  onClick={() => setTenantSessionSettings(prev => ({ ...prev, session_policy: 'strict_30m', session_lifetime_hours: 8, idle_timeout_mins: 30 }))}
                  style={{
                    border: tenantSessionSettings.session_policy === 'strict_30m' ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: tenantSessionSettings.session_policy === 'strict_30m' ? 'rgba(37,99,235,0.06)' : 'var(--background)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ color: '#f59e0b', fontSize: '20px' }}>lock</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Strict Security</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    8 Hours max lifetime + 30-minute idle inactivity auto-lock. High compliance.
                  </div>
                </div>

                {/* Preset 4: Custom */}
                <div 
                  onClick={() => setTenantSessionSettings(prev => ({ ...prev, session_policy: 'custom' }))}
                  style={{
                    border: tenantSessionSettings.session_policy === 'custom' ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: tenantSessionSettings.session_policy === 'custom' ? 'rgba(37,99,235,0.06)' : 'var(--background)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span className="material-symbols-outlined" style={{ color: '#a855f7', fontSize: '20px' }}>tune</span>
                    <strong style={{ fontSize: '14px', color: 'var(--text)' }}>Custom Parameters</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                    Manually define session hours and idle timeouts suited for your team.
                  </div>
                </div>
              </div>

              {/* Custom Settings Inputs */}
              {tenantSessionSettings.session_policy === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', padding: '18px', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '24px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                      Max Session Lifetime (Hours)
                    </label>
                    <input 
                      type="number" min="1" max="168" className="input-field" 
                      value={tenantSessionSettings.session_lifetime_hours || 8}
                      onChange={(e) => setTenantSessionSettings(prev => ({ ...prev, session_lifetime_hours: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>Sessions are hard-terminated once this duration is reached.</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                      Idle Inactivity Timeout (Minutes)
                    </label>
                    <input 
                      type="number" min="0" max="1440" className="input-field" 
                      value={tenantSessionSettings.idle_timeout_mins ?? 0}
                      onChange={(e) => setTenantSessionSettings(prev => ({ ...prev, idle_timeout_mins: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', width: '100%' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>Set to 0 to disable idle disconnects.</span>
                  </div>
                </div>
              )}

              {/* Policy Explanation Note */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(37,99,235,0.06)', borderLeft: '3px solid #2563eb', padding: '12px 16px', borderRadius: '6px' }}>
                <span className="material-symbols-outlined" style={{ color: '#2563eb', fontSize: '20px', flexShrink: 0 }}>info</span>
                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.6 }}>
                  <strong>How Policy Enforcement Operates:</strong><br />
                  All user accounts set to <code>Default (Inherit)</code> adhere to this baseline configuration. If you need special exceptions (e.g. an unattended display screen that must never log out), assign that user account to <code>Wallboard (24h)</code> in Tab 1 without weakening your general organizational policy.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {/* TAB 4: SESSION AUDIT LOGS                                                   */}
      {/* ─────────────────────────────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '14px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '16px', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div className="tb-search-wrap" style={{ flex: 1, minWidth: '220px' }}>
              <span className="material-symbols-outlined tb-search-icon">search</span>
              <input 
                type="text" 
                className="tb-search"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail by user, event, details, IP..." 
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                className="input-field"
                value={auditFilterAction}
                onChange={(e) => setAuditFilterAction(e.target.value)}
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}
              >
                <option value="all">All Security Events</option>
                <option value="LOGIN">Login Events</option>
                <option value="LOGOUT">Logout Events</option>
                <option value="IDLE">Idle & Inactivity Events</option>
                <option value="TERMINATED">Session Revocations</option>
                <option value="MFA">MFA Verification</option>
              </select>

              <button
                onClick={() => fetchAuditLogs(true)}
                disabled={auditLoading}
                style={{
                  background: 'var(--background)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', animation: auditLoading ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                Refresh
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.01)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>history</span>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  Session & Authentication Audit Trail ({filteredAuditLogs.length})
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Immutable SIEM-grade security log entries
              </span>
            </div>

            {auditLoading && auditLogs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading audit records...</div>
            ) : filteredAuditLogs.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No audit events recorded yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)' }}>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Timestamp</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>User</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Event Action</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Client IP</th>
                      <th style={{ padding: '10px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Detail / Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((l) => {
                      const isSuccess = l.result === 'SUCCESS';
                      let badgeColor = { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' };
                      if (l.action.includes('FAILED') || l.action.includes('LOCKED') || l.result === 'FAILURE') {
                        badgeColor = { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' };
                      } else if (l.action.includes('IDLE') || l.result === 'IDLE') {
                        badgeColor = { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
                      } else if (l.action.includes('TERMINATED') || l.action.includes('TAKEOVER')) {
                        badgeColor = { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
                      } else if (l.action.includes('LOGOUT')) {
                        badgeColor = { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' };
                      }

                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                            {formatLocalTime(l.created_at)}
                          </td>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: 'var(--text)' }}>
                            {l.username || 'System'}
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)', background: badgeColor.bg, color: badgeColor.color, border: `1px solid ${badgeColor.border}` }}>
                              {l.action}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                            {l.ip_address || '—'}
                          </td>
                          <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text)' }}>
                            {l.detail || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{confirmDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setConfirmDialog({ isOpen: false })} 
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                  setConfirmDialog({ isOpen: false });
                }} 
                style={{ background: confirmDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {alertDialog.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(3px)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '420px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{alertDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{alertDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setAlertDialog({ isOpen: false })} 
                style={{ background: alertDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
