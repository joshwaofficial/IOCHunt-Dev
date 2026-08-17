import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const esc = (s) => (s || '').toString();

const formatLocalDate = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatLocalTime = (unixSeconds) => {
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Users() {
  const { user: currentUser, setUser } = useAuth();
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
  const [newForm, setNewForm] = useState({ username: '', email: '', password: '', role: 'L1_ANALYST', force_password_change: true });
  const [newError, setNewError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, keyRes] = await Promise.all([
        axios.get('/api/users'),
        axios.get('/api/auth/api-key').catch(() => ({ data: { api_key: null } }))
      ]);
      setData(usersRes.data.users || []);
      setApiKey(keyRes.data.api_key);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

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
      setNewForm({ username: '', email: '', password: '', role: 'L1_ANALYST', force_password_change: true });
      fetchData();
    } catch (e) {
      setNewError(e.response?.data?.error || 'Failed to create user');
    }
  };

  const saveEdit = async (id) => {
    setEditErrors(prev => ({ ...prev, [id]: null }));
    const form = editForms[id];
    if (!form?.username) {
      setEditErrors(prev => ({ ...prev, [id]: 'Username required.' }));
      return;
    }
    try {
      await axios.patch(`/api/users/${id}`, { username: form.username, email: form.email, role: form.role });
      
      // Update global context if user edited themselves
      if (currentUser && String(currentUser.id) === String(id)) {
        setUser(prev => ({ ...prev, username: form.username, email: form.email, role: form.role }));
      }
      
      setExpandedEditId(null);
      fetchData();
    } catch (e) {
      setEditErrors(prev => ({ ...prev, [id]: e.response?.data?.error || 'Failed to update user' }));
    }
  };

  const savePassword = async (id) => {
    setPwErrors(prev => ({ ...prev, [id]: null }));
    const form = pwForms[id];
    if (!form?.newPw || form.newPw.length < 8) {
      setPwErrors(prev => ({ ...prev, [id]: 'Min 8 characters required.' }));
      return;
    }
    if (form.newPw !== form.confirmPw) {
      setPwErrors(prev => ({ ...prev, [id]: 'Passwords do not match.' }));
      return;
    }
    try {
      await axios.patch(`/api/users/${id}`, { password: form.newPw });
      setExpandedPwId(null);
      // clear pw form securely
      setPwForms(prev => ({ ...prev, [id]: { newPw: '', confirmPw: '' }}));
    } catch (e) {
      setPwErrors(prev => ({ ...prev, [id]: e.response?.data?.error || 'Failed to update password' }));
    }
  };

  const handleDelete = (user) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete User',
      message: `Delete "${user.username}"? This cannot be undone.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/users/${user.id}`);
          fetchData();
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.response?.data?.error || 'Failed to delete user', type: 'danger' });
        }
      }
    });
  };

  const handleDisableMfa = (user) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Disable MFA',
      message: `Disable MFA for "${user.username}"? They will be logged out of all sessions.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`/api/users/${user.id}/mfa-disable`);
          fetchData();
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: e.response?.data?.error || 'Failed to disable MFA', type: 'danger' });
        }
      }
    });
  };

  const toggleRole = (user) => {
    const roleHierarchy = ['L1_ANALYST', 'L2_ANALYST', 'L3_ANALYST', 'ADMIN'];
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
      setEditForms(prev => ({ ...prev, [u.id]: { username: u.username, email: u.email || '', role: u.role }}));
      setExpandedEditId(u.id);
    }
  };

  const openPw = (u) => {
    setExpandedEditId(null);
    if (expandedPwId === u.id) {
      setExpandedPwId(null);
    } else {
      setPwForms(prev => ({ ...prev, [u.id]: { newPw: '', confirmPw: '' }}));
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
  const mfaEnabled = filteredData.filter(u => u.mfa_enabled).length;

  const PremiumCard = ({ value, label, color, icon, subtitle }) => {
    return (
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
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginTop: '4px' }}>{label}</span>
        </div>
        
        <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}></div>
          <span style={{ fontSize: '10px', color: color, fontWeight: 600 }}>{subtitle}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px', position: 'relative' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>User Management</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Manage dashboard users, roles, and access control.</p>
        </div>
        {currentUser?.role === 'ADMIN' && apiKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)' }}>AGENT API KEY</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.02)', padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text)', letterSpacing: '1px' }}>iochunt-••••••••</span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(apiKey);
                  setApiKeyCopied(true);
                  setTimeout(() => setApiKeyCopied(false), 2000);
                }}
                style={{ background: 'transparent', border: 'none', color: apiKeyCopied ? '#10b981' : 'var(--muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                title="Copy full API Key"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{apiKeyCopied ? 'check' : 'content_copy'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {currentUser?.role === 'ADMIN' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
          <PremiumCard value={total} label="Total Users" color="#2563eb" icon="group" subtitle="Active" />
          <PremiumCard value={admins} label="Admins" color="#7c3aed" icon="admin_panel_settings" subtitle="Active" />
          <PremiumCard value={l1Analysts} label="L1 Analysts" color="#16a34a" icon="visibility" subtitle="Active" />
          <PremiumCard value={l2Analysts} label="L2 Analysts" color="#ec4899" icon="shield" subtitle="Active" />
          <PremiumCard value={l3Analysts} label="L3 Analysts" color="#f59e0b" icon="policy" subtitle="Active" />
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
              <button onClick={() => setRoleFilter('L1_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L1_ANALYST' ? 1 : 0.4 }}>L1 ANALYSTS</button>
              <button onClick={() => setRoleFilter('L2_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(236,72,153,0.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L2_ANALYST' ? 1 : 0.4 }}>L2 ANALYSTS</button>
              <button onClick={() => setRoleFilter('L3_ANALYST')} style={{ padding: '4px 10px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s', opacity: roleFilter === 'all' || roleFilter === 'L3_ANALYST' ? 1 : 0.4 }}>L3 ANALYSTS</button>
              <button onClick={() => setRoleFilter('all')} style={{ padding: '4px 10px', borderRadius: '4px', background: roleFilter === 'all' ? '#2563eb' : 'transparent', color: roleFilter === 'all' ? '#fff' : 'var(--text)', border: '1px solid ' + (roleFilter === 'all' ? '#2563eb' : 'var(--border)'), fontSize: '10px', fontWeight: 700, fontFamily: 'var(--mono)', cursor: 'pointer', transition: 'all .2s' }}>ALL</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.01)' }}>
          <span className="material-symbols-outlined text-muted" style={{ fontSize: '16px', color: 'var(--muted)' }}>group</span>
          <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: 0 }}>Accounts ({data.length})</span>
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
                  <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Email</th>
                  <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Created</th>
                  <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>Last Login</th>
                  <th style={{ padding: '8px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--mono)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((u) => {
                  const isSelf = String(u.id) === String(currentUser?.id);
                  const hasMFA = u.mfa_enabled;
                  const roleColors = {
                    'ADMIN': { bg: 'rgba(139,92,246,.2)', color: '#a78bfa', badge: { bg: 'rgba(139,92,246,.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,.3)' } },
                    'L1_ANALYST': { bg: 'rgba(34,197,94,.2)', color: '#4ade80', badge: { bg: 'rgba(34,197,94,.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,.25)' } },
                    'L2_ANALYST': { bg: 'rgba(236,72,153,.2)', color: '#ec4899', badge: { bg: 'rgba(236,72,153,.12)', color: '#ec4899', border: '1px solid rgba(236,72,153,.25)' } },
                    'L3_ANALYST': { bg: 'rgba(245,158,11,.2)', color: '#f59e0b', badge: { bg: 'rgba(245,158,11,.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.25)' } },
                  };
                  const avatarBg = roleColors[u.role]?.bg || 'rgba(22,163,74,.15)';
                  const avatarColor = roleColors[u.role]?.color || '#4ade80';
                  const badgeRoleCls = roleColors[u.role]?.badge || { bg: 'rgba(34,197,94,.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,.25)' };
                  const badgeYouCls = { bg: 'rgba(37,99,235,.15)', color: '#b4c5ff', border: '1px solid rgba(37,99,235,.3)' };
                  const badgeMfaCls = hasMFA ? { bg: 'rgba(6,182,212,.12)', color: '#22d3ee', border: '1px solid rgba(6,182,212,.25)' } : { bg: 'rgba(148,163,184,.08)', color: '#8d90a0', border: '1px solid rgba(148,163,184,.2)' };
                  
                  return (
                    <React.Fragment key={u.id}>
                      <tr className="hover-row" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: avatarBg, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, fontFamily: 'var(--mono)' }}>
                              {(u.username[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--text)' }}>{esc(u.username)}</span>
                                {isSelf && <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', background: badgeYouCls.bg, color: badgeYouCls.color, border: badgeYouCls.border }}>YOU</span>}
                                <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', background: badgeRoleCls.bg, color: badgeRoleCls.color, border: badgeRoleCls.border }}>{esc(u.role)}</span>
                                {Boolean(u.force_password_change) && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>key</span>
                                    Reset Required
                                  </span>
                                )}
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '.05em', background: badgeMfaCls.bg, color: badgeMfaCls.color, border: badgeMfaCls.border }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '9px' }}>{hasMFA ? 'lock' : 'lock_open'}</span>
                                  {hasMFA ? 'MFA' : 'No MFA'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', verticalAlign: 'middle', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {u.email ? esc(u.email) : <em style={{ fontStyle: 'italic' }}>—</em>}
                        </td>
                        <td style={{ padding: '10px 16px', verticalAlign: 'middle', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {u.created_at ? formatLocalDate(u.created_at) : '—'}
                        </td>
                        <td style={{ padding: '10px 16px', verticalAlign: 'middle', fontSize: '12px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                          {u.last_login ? formatLocalTime(u.last_login) : 'Never'}
                        </td>
                        <td style={{ padding: '10px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {(currentUser?.role === 'ADMIN' || isSelf) && (
                              <>
                                <button onClick={() => openEdit(u)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>edit</span> Edit
                                </button>
                                
                                <button onClick={() => openPw(u)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>key</span> Password
                                </button>
                              </>
                            )}
                            
                            {currentUser?.role === 'ADMIN' && (
                              <button onClick={() => toggleRole(u)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>swap_vert</span>
                                Switch Role
                              </button>
                            )}
                            
                            {hasMFA > 0 ? (
                              (currentUser?.role === 'ADMIN' || isSelf) ? (
                                <button onClick={() => handleDisableMfa(u)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lock_open</span> Revoke MFA
                                </button>
                              ) : (
                                <span style={{ fontSize: '11px', padding: '0 6px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>—</span>
                              )
                            ) : isSelf ? (
                              <a href="/mfa-setup" target="_blank" rel="noreferrer" style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lock</span> Enable MFA
                              </a>
                            ) : (
                              !(currentUser?.role === 'ADMIN' || isSelf) ? null : <span style={{ fontSize: '11px', padding: '0 6px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>—</span>
                            )}
                            
                            {!isSelf && currentUser?.role === 'ADMIN' && (
                              <button onClick={() => handleDelete(u)} title="Delete user" style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>delete</span>
                              </button>
                            )}

                          </div>
                        </td>
                      </tr>

                      {/* Inline Edit Row */}
                      {expandedEditId === u.id && (
                        <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                          <td colSpan="5">
                            <div style={{ padding: '14px 20px 14px 56px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Editing — {u.username}</p>
                              <div style={{ display: 'grid', gridTemplateColumns: currentUser?.role === 'ADMIN' ? '1fr 1fr 120px' : '1fr 1fr', gap: '10px', maxWidth: currentUser?.role === 'ADMIN' ? '680px' : '550px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Username</label>
                                  <input type="text" className="input-field" value={editForms[u.id]?.username || ''} onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], username: e.target.value } }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Email</label>
                                  <input type="email" className="input-field" value={editForms[u.id]?.email || ''} onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], email: e.target.value } }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
                                </div>
                                {currentUser?.role === 'ADMIN' && (
                                  <div>
                                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Role</label>
                                    <select className="input-field" value={editForms[u.id]?.role || 'L1_ANALYST'} onChange={(e) => setEditForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], role: e.target.value } }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }}>
                                      <option value="L1_ANALYST">L1 Analyst</option>
                                      <option value="L2_ANALYST">L2 Analyst</option>
                                      <option value="L3_ANALYST">L3 Analyst</option>
                                      <option value="ADMIN">Admin</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                                <button onClick={() => saveEdit(u.id)} style={{ background: '#2563eb', color: '#fff', border: '1px solid #2563eb', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                                <button onClick={() => setExpandedEditId(null)} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                {editErrors[u.id] && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>{editErrors[u.id]}</span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Inline Password Row */}
                      {expandedPwId === u.id && (
                        <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                          <td colSpan="5">
                            <div style={{ padding: '14px 20px 14px 56px' }}>
                              <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Change Password — {u.username}</p>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '460px' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>New Password</label>
                                  <input type="password" placeholder="Min 8 chars" className="input-field" value={pwForms[u.id]?.newPw || ''} onChange={(e) => setPwForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], newPw: e.target.value } }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Confirm</label>
                                  <input type="password" placeholder="Repeat" className="input-field" value={pwForms[u.id]?.confirmPw || ''} onChange={(e) => setPwForms(prev => ({ ...prev, [u.id]: { ...prev[u.id], confirmPw: e.target.value } }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                                <button onClick={() => savePassword(u.id)} style={{ background: '#2563eb', color: '#fff', border: '1px solid #2563eb', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Update</button>
                                <button onClick={() => setExpandedPwId(null)} style={{ background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '5px 11px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                {pwErrors[u.id] && <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>{pwErrors[u.id]}</span>}
                              </div>
                            </div>
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

      {currentUser?.role === 'ADMIN' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.01)' }}>
            <span className="material-symbols-outlined text-muted" style={{ fontSize: '16px', color: 'var(--muted)' }}>person_add</span>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontFamily: 'var(--mono)', margin: 0 }}>Add New User</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px auto', gap: '16px', alignItems: 'end', width: '100%' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Username</label>
                <input type="text" placeholder="analyst1" className="input-field" value={newForm.username} onChange={(e) => setNewForm(prev => ({ ...prev, username: e.target.value }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Email (optional)</label>
                <input type="email" placeholder="user@company.com" className="input-field" value={newForm.email} onChange={(e) => setNewForm(prev => ({ ...prev, email: e.target.value }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Password</label>
                <input type="password" placeholder="Min 8 characters" className="input-field" value={newForm.password} onChange={(e) => setNewForm(prev => ({ ...prev, password: e.target.value }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>Role</label>
                <select className="input-field" value={newForm.role} onChange={(e) => setNewForm(prev => ({ ...prev, role: e.target.value }))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 11px', fontSize: '13px', outline: 'none', width: '100%', fontFamily: 'var(--sans)' }}>
                   <option value="L1_ANALYST">L1 Analyst</option>
                   <option value="L2_ANALYST">L2 Analyst</option>
                   <option value="L3_ANALYST">L3 Analyst</option>
                   <option value="ADMIN">Admin</option>
                 </select>
              </div>
              <div>
                <button onClick={handleCreate} style={{ height: '36px', background: '#2563eb', color: '#fff', border: 'none', padding: '0 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add</span> Create
                </button>
              </div>
            </div>
            {newError && <div style={{ marginTop: '12px', color: '#ef4444', fontSize: '12px', fontWeight: 600 }}>{newError}</div>}
          </div>
        </div>
      )}

      {/* API Key info */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid rgba(37,99,235,0.2)', borderLeft: '3px solid #2563eb', background: 'rgba(37,99,235,0.06)', borderRadius: '8px', padding: '13px 16px' }}>
        <span className="material-symbols-outlined" style={{ color: '#2563eb', flexShrink: 0, marginTop: '1px' }}>info</span>
        <div style={{ fontSize: '12px', lineHeight: 1.7, color: 'var(--text)' }}>
          <strong style={{ color: '#2563eb' }}>API Key Agent Authentication</strong><br />
          IOC Hunt agents authenticate using your unique Workspace API Key. This key was securely generated and provided to you by your administrator when your workspace was provisioned. Keep it secret. User accounts are for dashboard access only.
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
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
                style={{ background: confirmDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {alertDialog.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{alertDialog.title}</h3>
            <p style={{ margin: '0 0 24px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{alertDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setAlertDialog({ isOpen: false })} 
                style={{ background: alertDialog.type === 'danger' ? '#ef4444' : '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
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
