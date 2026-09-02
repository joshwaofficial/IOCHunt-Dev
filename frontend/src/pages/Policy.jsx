import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useInstance } from '../context/InstanceContext';

const CAT_NAMES = [
  "Process Monitoring", "Registry Run Keys", "Startup Folder", "Service Creation", "Scheduled Tasks",
  "Network / Admin Shares", "Config Changes", "Sensitive File Access", "Enumeration Commands", "Failed Login Attempts",
  "Non-Office Hours Access", "USB / Removable Media", "Webcam / Microphone"
];

const MODE_LABELS = ['Off', 'Log Only', 'Log + Alert', 'Log + Alert + Block'];
const MODE_COLORS = ['#64748b', '#3b82f6', '#f59e0b', '#ef4444'];
const DEFAULT_MODES = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Policy() {
  const { isAggregator } = useInstance();
  const readOnly = isAggregator();

  const [machines, setMachines] = useState([]);
  const [groups, setGroups] = useState([]);

  const [selectedMachine, setSelectedMachine] = useState('');
  const [machinePolicyData, setMachinePolicyData] = useState(null);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupPolicyData, setGroupPolicyData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasChangesState, setHasChangesState] = useState(false);
  const hasChangesRef = React.useRef(false);
  const hasChanges = hasChangesState;
  const setHasChanges = (val) => {
    hasChangesRef.current = val;
    setHasChangesState(val);
  };

  // Modals state
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger' });
  const [promptDialog, setPromptDialog] = useState({ isOpen: false, title: '', message: '', value: '', onConfirm: null });
  const [alertDialog, setAlertDialog] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    fetchMachines();
    fetchGroups();
  }, []);





  // Polling for policy sync status
  useEffect(() => {
    let interval;
    if (selectedMachine && !selectedMachine.startsWith('grp:')) {
      interval = setInterval(() => {
        fetchMachinePolicy(selectedMachine, true);
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedMachine]);

  const fetchMachines = async () => {
    try {
      const res = await axios.get('/api/machines');
      setMachines(Array.isArray(res.data) ? res.data : (res.data.data || []));
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await axios.get('/api/groups');
      setGroups(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMachinePolicy = async (machineName, isPolling = false) => {
    if (!isPolling) setLoading(true);
    setEditingGroupId(null);
    setSelectedMachine(machineName);
    try {
      const res = await axios.get(`/api/policy/${encodeURIComponent(machineName)}`);
      setMachinePolicyData(prev => {
        if (isPolling && prev && hasChangesRef.current) {
          return {
            ...res.data,
            effective_policy: prev.effective_policy
          };
        }
        return res.data;
      });
      if (!isPolling) setHasChanges(false);
    } catch (e) {
      console.error(e);
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  const createGroup = () => {
    setPromptDialog({
      isOpen: true,
      title: 'Create Group',
      message: 'Enter new group name:',
      value: '',
      onConfirm: async (name) => {
        if (!name) return;
        try {
          await axios.post('/api/groups', { name });
          fetchGroups();
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to create group: " + (e.response?.data?.error || e.message), type: 'danger' });
        }
      }
    });
  };

  const deleteGroup = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Group',
      message: 'Delete this group? Machines will fall back to individual policies.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/groups/${id}`);
          if (editingGroupId === id) setEditingGroupId(null);
          fetchGroups();
          if (selectedMachine) fetchMachinePolicy(selectedMachine);
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to delete group", type: 'danger' });
        }
      }
    });
  };

  const assignMachineToGroup = async (machine, groupId) => {
    try {
      // Remove from all groups first
      for (let g of groups) {
        if (g.machines.includes(machine)) {
          await axios.delete(`/api/groups/${g.id}/machines/${encodeURIComponent(machine)}`);
        }
      }
      if (groupId) {
        await axios.post(`/api/groups/${groupId}/machines`, { machines: [machine] });
      }
      fetchGroups();
      if (selectedMachine === machine) fetchMachinePolicy(machine);
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to assign machine", type: 'danger' });
    }
  };

  const startEditGroup = (g) => {
    setEditingGroupId(g.id);
    setSelectedMachine(`grp:${g.id}`);
    setHasChanges(false);
    setGroupPolicyData({
      ...g,
      policy: g.policy || {}
    });
  };

  const buildPolicyObj = (policyObj) => ({
    catModes: policyObj.catModes || DEFAULT_MODES,
    officeHoursStart: policyObj.officeHoursStart !== undefined ? policyObj.officeHoursStart : 9,
    officeHoursEnd: policyObj.officeHoursEnd !== undefined ? policyObj.officeHoursEnd : 18,
    officeHoursDays: policyObj.officeHoursDays !== undefined ? policyObj.officeHoursDays : 62,
    failedLogonThreshold: policyObj.failedLogonThreshold !== undefined ? policyObj.failedLogonThreshold : 5,
    failedLogonWindowMins: policyObj.failedLogonWindowMins !== undefined ? policyObj.failedLogonWindowMins : 10,
    learningMode: policyObj.learningMode !== undefined ? policyObj.learningMode : true
  });

  const handleSavePolicy = async () => {
    try {
      if (editingGroupId) {
        const pol = buildPolicyObj(groupPolicyData.policy || {});
        await axios.put(`/api/groups/${editingGroupId}/policy`, { policy: pol });
        setAlertDialog({ isOpen: true, title: 'Success', message: "Group policy saved!", type: 'success' });
        setHasChanges(false);
        fetchGroups();
      } else if (selectedMachine) {
        const pol = buildPolicyObj(machinePolicyData.effective_policy || {});
        await axios.post(`/api/policy/${encodeURIComponent(selectedMachine)}`, { policy: pol });
        setAlertDialog({ isOpen: true, title: 'Success', message: "Machine policy saved! It overrides group policy.", type: 'success' });
        setHasChanges(false);
        fetchMachinePolicy(selectedMachine);
      }
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to save policy: " + (e.response?.data?.error || e.message), type: 'danger' });
    }
  };

  const handleClearOverride = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Clear Machine Override',
      message: 'Are you sure you want to remove the machine-specific policy override? The machine will fall back to its group or default policy.',
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`/api/policy/${encodeURIComponent(selectedMachine)}`, { policy: {} });
          setAlertDialog({ isOpen: true, title: 'Success', message: "Machine override cleared.", type: 'success' });
          setHasChanges(false);
          fetchMachinePolicy(selectedMachine);
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to clear policy.", type: 'danger' });
        }
      }
    });
  };

  const updatePolicyField = (field, value) => {
    setHasChanges(true);
    if (editingGroupId) {
      setGroupPolicyData(prev => ({
        ...prev,
        policy: { ...prev.policy, [field]: value }
      }));
    } else if (selectedMachine && machinePolicyData) {
      setMachinePolicyData(prev => ({
        ...prev,
        effective_policy: { ...prev.effective_policy, [field]: value }
      }));
    }
  };

  const renderPolicyEditor = () => {
    let title = "";
    let subtitle = "";
    let policyObj = {};

    if (editingGroupId && groupPolicyData) {
      title = `GROUP: ${groupPolicyData.name}`;
      subtitle = `${groupPolicyData.machines.length} machine(s) will inherit this policy unless overridden.`;
      policyObj = groupPolicyData.policy || {};
    } else if (selectedMachine && machinePolicyData) {
      title = `MACHINE: ${selectedMachine}`;
      const source = machinePolicyData.policy_source;
      if (source === 'machine') subtitle = "Using machine-specific policy (overrides group).";
      else if (source === 'group') subtitle = `Inheriting policy from group: ${machinePolicyData.group.name}. Editing here will create a machine-specific override.`;
      else subtitle = "Using default policy. Editing here will create a machine-specific override.";
      policyObj = machinePolicyData.effective_policy || {};
    } else {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>

          <h3>Select a Machine or Group to Edit Policy</h3>
        </div>
      );
    }

    const modes = policyObj.catModes || DEFAULT_MODES;
    const ohStart = policyObj.officeHoursStart !== undefined ? policyObj.officeHoursStart : 9;
    const ohEnd = policyObj.officeHoursEnd !== undefined ? policyObj.officeHoursEnd : 18;
    const ohDays = policyObj.officeHoursDays !== undefined ? policyObj.officeHoursDays : 62; // Mon-Fri
    const flThreshold = policyObj.failedLogonThreshold !== undefined ? policyObj.failedLogonThreshold : 5;
    const flWindow = policyObj.failedLogonWindowMins !== undefined ? policyObj.failedLogonWindowMins : 10;
    const learning = policyObj.learningMode !== undefined ? policyObj.learningMode : true;
    const currentModes = (!editingGroupId && selectedMachine && machinePolicyData && machinePolicyData.current && machinePolicyData.current.catModes) ? machinePolicyData.current.catModes : null;

    return (
      <div>
        <div style={{ background: editingGroupId ? 'rgba(167,139,250,.08)' : 'rgba(59,130,246,.08)', border: `1px solid ${editingGroupId ? 'rgba(167,139,250,.3)' : 'rgba(59,130,246,.3)'}`, borderRadius: '8px', padding: '10px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: editingGroupId ? '#a78bfa' : '#60a5fa' }}>{title}</span>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{subtitle}</span>
          {editingGroupId && (
            <button onClick={() => { setEditingGroupId(null); setSelectedMachine(''); }} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>↩ Back</button>
          )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${editingGroupId ? 'rgba(167,139,250,0.1)' : 'rgba(59,130,246,0.1)'} 0%, rgba(0,0,0,0) 100%)` }}>
                  <th colSpan="2" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>monitoring</span>
                      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>Monitor Categories</div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>0=Off  1=Log  2=Alert  3=Alert+Block</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAT_NAMES.map((name, i) => {
                  const val = modes[i] !== undefined ? modes[i] : DEFAULT_MODES[i];
                  const clientVal = (currentModes && currentModes[i] !== undefined) ? currentModes[i] : null;
                  const differs = clientVal !== null && clientVal !== val;
                  let syncBadge = null;

                  if (clientVal !== null) {
                    if (differs) {
                      syncBadge = <span style={{ fontSize: '10px', color: '#f97316', marginLeft: '8px' }} title={`Client running: ${MODE_LABELS[clientVal]}`}> Client: {MODE_LABELS[clientVal]}</span>;
                    } else {
                      syncBadge = <span style={{ fontSize: '10px', color: '#22c55e', marginLeft: '8px' }}> in sync</span>;
                    }
                  }

                  return (
                    <tr key={i} style={{ borderBottom: i === CAT_NAMES.length - 1 ? 'none' : '1px solid var(--border2)', background: differs ? 'rgba(249,115,22,.05)' : 'transparent' }}>
                      <td style={{ padding: '10px 20px', verticalAlign: 'middle', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                        {name}
                      </td>
                      <td style={{ padding: '10px 20px', verticalAlign: 'middle', textAlign: 'right' }}>
                        <select
                          disabled={readOnly}
                          value={val}
                          onChange={(e) => {
                            const newModes = [...modes];
                            newModes[i] = parseInt(e.target.value, 10);
                            updatePolicyField('catModes', newModes);
                          }}
                          onFocus={(e) => e.target.style.boxShadow = `0 0 0 2px ${editingGroupId ? 'rgba(167,139,250,0.4)' : 'rgba(37,99,235,0.4)'}`}
                          onBlur={(e) => e.target.style.boxShadow = 'none'}
                          style={{ background: 'rgba(0,0,0,0.05)', border: 'none', color: MODE_COLORS[val], fontFamily: 'var(--sans)', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, outline: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          {MODE_LABELS.map((lbl, mi) => (
                            <option key={mi} value={mi}>{lbl}</option>
                          ))}
                        </select>
                        {syncBadge}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${editingGroupId ? 'rgba(167,139,250,0.1)' : 'rgba(59,130,246,0.1)'} 0%, rgba(0,0,0,0) 100%)` }}>
                  <th style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>schedule</span>
                      <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)' }}>Office Hours</div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '48px', flexWrap: 'wrap' }}>

                      <div style={{ display: 'flex', gap: '24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Start Time (HR)</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', height: '42px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>wb_sunny</span>
                            <input
                              type="text"
                              value={ohStart}
                              className="input-field no-focus-outline"
                              disabled={readOnly}
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val !== '') {
                                  val = parseInt(val, 10);
                                  if (val > 23) val = 23;
                                } else {
                                  val = 0;
                                }
                                updatePolicyField('officeHoursStart', val);
                              }}
                              style={{ width: '50px', background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '15px', outline: 'none', fontWeight: 600, padding: 0 }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>End Time (HR)</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', height: '42px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>dark_mode</span>
                            <input
                              type="text"
                              value={ohEnd}
                              className="input-field no-focus-outline"
                              disabled={readOnly}
                              onChange={(e) => {
                                let val = e.target.value.replace(/\D/g, '');
                                if (val !== '') {
                                  val = parseInt(val, 10);
                                  if (val > 23) val = 23;
                                } else {
                                  val = 0;
                                }
                                updatePolicyField('officeHoursEnd', val);
                              }}
                              style={{ width: '50px', background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '15px', outline: 'none', fontWeight: 600, padding: 0 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Active Days</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {DAYS.map((d, i) => {
                            const chk = (ohDays & (1 << i)) !== 0;
                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  if (readOnly) return;
                                  let newDays = ohDays;
                                  if (!chk) newDays |= (1 << i);
                                  else newDays &= ~(1 << i);
                                  updatePolicyField('officeHoursDays', newDays);
                                }}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '20px',
                                  border: chk ? '1px solid transparent' : '1px solid var(--border)',
                                  background: chk ? (editingGroupId ? 'linear-gradient(135deg, #a78bfa, #8b5cf6)' : 'linear-gradient(135deg, #60a5fa, #3b82f6)') : 'var(--surface2)',
                                  color: chk ? '#fff' : 'var(--muted)',
                                  fontWeight: chk ? 700 : 600,
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  boxShadow: chk ? `0 4px 12px ${editingGroupId ? 'rgba(167,139,250,0.3)' : 'rgba(59,130,246,0.3)'}` : 'none'
                                }}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Security / Thresholds */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${editingGroupId ? 'rgba(167,139,250,0.1)' : 'rgba(59,130,246,0.1)'} 0%, rgba(0,0,0,0) 100%)` }}>
                  <th style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>security</span>
                      <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text)' }}>Thresholds & Mode</div>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '48px', flexWrap: 'wrap' }}>

                      <div style={{ display: 'flex', gap: '24px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Failed Login Threshold</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', height: '42px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>login</span>
                            <input
                              type="number"
                              value={flThreshold}
                              className="input-field no-focus-outline"
                              disabled={readOnly}
                              onChange={(e) => updatePolicyField('failedLogonThreshold', parseInt(e.target.value, 10))}
                              style={{ width: '60px', background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '15px', outline: 'none', fontWeight: 600, padding: 0 }}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Time Window (Mins)</label>
                          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', height: '42px', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>timer</span>
                            <input
                              type="number"
                              value={flWindow}
                              className="input-field no-focus-outline"
                              disabled={readOnly}
                              onChange={(e) => updatePolicyField('failedLogonWindowMins', parseInt(e.target.value, 10))}
                              style={{ width: '60px', background: 'transparent', border: 'none', color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '15px', outline: 'none', fontWeight: 600, padding: 0 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--mono)' }}>Learning Mode</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', height: '42px' }}>
                          <input type="checkbox" disabled={readOnly} checked={learning} onChange={(e) => updatePolicyField('learningMode', e.target.checked)} />
                          <span style={{ fontSize: '13px', color: 'var(--text)' }}>Enable (Alerts only, no auto-block)</span>
                        </label>
                      </div>

                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          {!readOnly && !editingGroupId && selectedMachine && machinePolicyData?.policy_source === 'machine' && (
            <button
              onClick={handleClearOverride}
              style={{
                background: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Clear Override
            </button>
          )}
          {!readOnly && (
            <button
              onClick={handleSavePolicy}
            disabled={!hasChanges}
            style={{
              background: editingGroupId ? '#a78bfa' : 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              opacity: hasChanges ? 1 : 0.5,
              boxShadow: hasChanges ? `0 4px 12px ${editingGroupId ? 'rgba(167,139,250,0.25)' : 'rgba(37,99,235,0.25)'}` : 'none',
              transition: 'all 0.2s'
            }}
          >
            {editingGroupId ? 'Save Group Policy' : 'Save Machine Policy'}
          </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Policy Management</h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>Configure global and machine-specific security policies, rules, and exclusions.</p>
        </div>
      </div>
      {readOnly && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>lock</span> Policies are managed centrally. This Branch Aggregator is read-only.
        </div>
      )}

      {/* Machine/Group Selection Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', background: 'var(--surface)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <label style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Machine:</label>
        <select value={selectedMachine} onChange={(e) => {
          const val = e.target.value;
          setSelectedMachine(val);
          if (!val) {
            setMachinePolicyData(null);
            setEditingGroupId(null);
            return;
          }
          if (val.startsWith('grp:')) {
            const gid = val.split(':')[1];
            const g = groups.find(x => x.id === gid);
            if (g) startEditGroup(g);
          } else {
            fetchMachinePolicy(val);
          }
        }} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--text)', outline: 'none', minWidth: '220px', cursor: 'pointer' }}>
          <option value="">select machine or group</option>
          {groups.length > 0 && (
            <optgroup label="Groups">
              {groups.map(g => (
                <option key={`grp-${g.id}`} value={`grp:${g.id}`}>{g.name} ({g.machines.length} machines)</option>
              ))}
            </optgroup>
          )}
          {machines.length > 0 && (
            <optgroup label="Machines">
              {machines.map(m => (
                <option key={m.name || m} value={m.name || m}>{m.name || m}</option>
              ))}
            </optgroup>
          )}
        </select>



        {selectedMachine && !selectedMachine.startsWith('grp:') && machinePolicyData && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginLeft: 'auto' }}>
            {machinePolicyData?.policy_source === 'machine' ? 'Machine Override Active' : machinePolicyData?.policy_source === 'group' ? 'Group Policy Inherited' : 'Default Policy Active'}
          </span>
        )}
      </div>

      {/* Info Banner & Sync Status */}
      {selectedMachine && !selectedMachine.startsWith('grp:') && machinePolicyData && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '24px', display: 'flex', gap: '20px', fontSize: '13px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Sync Status</span>
            {machinePolicyData.applied_at && (!machinePolicyData.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at) ? (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>Applied by client: {new Date(machinePolicyData.applied_at * 1000).toLocaleString()}</span>
            ) : (
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>Pending client pickup (polls every 60s)</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Last Saved</span>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>
              {machinePolicyData.updated_at ? new Date(machinePolicyData.updated_at * 1000).toLocaleString() : 'Never'}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Client Reporting Status</span>
            <span style={{ fontWeight: 600, color: machinePolicyData.current_json !== '{}' && machinePolicyData.current_json ? '#22c55e' : 'var(--muted)' }}>
              {machinePolicyData.current_json !== '{}' && machinePolicyData.current_json ? 'Reporting' : 'No Data'}
            </span>
          </div>
        </div>
      )}

      <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>
        <span className="material-symbols-outlined" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '4px' }}>info</span> Pushing policy here overrides the client's local settings. The client will apply it within 60 seconds.
      </div>

      {/* Groups Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px', fontWeight: 700 }}>GROUPS</span>
          {!readOnly && <button onClick={createGroup} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.2)', transition: 'all 0.2s' }}>+ New Group</button>}
        </div>

        {groups.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 0 14px' }}>No groups yet. Create one to push policy to multiple machines at once.</div>
        ) : (
          groups.filter(g => {
            if (!selectedMachine) return true;
            if (selectedMachine.startsWith('grp:')) {
              return g.id === selectedMachine.split(':')[1];
            } else {
              return g.machines.includes(selectedMachine);
            }
          }).map(g => {
            const memberCount = g.machines.length;
            const hasPol = Object.keys(g.policy || {}).length > 0;
            return (
              <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px 20px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--sans)', fontSize: '14px', fontWeight: 800, color: 'var(--accent)' }}>{g.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{memberCount} machine(s)</span>
                  {hasPol ? (
                    <span style={{ fontSize: '10px', background: 'rgba(34,197,94,.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,.3)', padding: '3px 10px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.5px' }}>policy set</span>
                  ) : (
                    <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600 }}>no policy</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button onClick={() => startEditGroup(g)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>{readOnly ? 'View Policy' : 'Edit Policy'}</button>
                    {!readOnly && <button onClick={() => deleteGroup(g.id)} style={{ background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.3)', color: '#f87171', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>✕ Delete</button>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                  {g.machines.map(m => {
                    const machineObj = machines.find(x => x.name === m || String(x.id) === String(m) || x === m);
                    const mName = machineObj ? (machineObj.name || machineObj.hostname || machineObj.label || m) : m;
                    return (
                      <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', color: '#60a5fa', fontFamily: 'var(--mono)', fontSize: '11px', padding: '3px 10px', borderRadius: '6px', fontWeight: 600 }}>
                        {mName}
                        {!readOnly && <button onClick={() => assignMachineToGroup(m, '')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: '12px', lineHeight: 1 }}>✕</button>}
                      </span>
                    );
                  })}
                  {readOnly ? null : (
                  <select onChange={(e) => { if (e.target.value) assignMachineToGroup(e.target.value, g.id); e.target.value = ''; }} style={{ background: 'var(--surface2)', border: '1px dashed var(--border)', color: 'var(--muted)', fontFamily: 'var(--sans)', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', outline: 'none' }}>
                    <option value="">+ Add machine</option>
                    {machines.map(m => {
                      const mHost = m.name || m.hostname || m; // Use hostname for DB
                      const mName = m.name || m.hostname || m.label || mHost;
                      if (!g.machines.includes(mHost)) {
                        return <option key={mHost} value={mHost}>{mName}</option>;
                      }
                      return null;
                    })}
                  </select>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Policy Editor Section */}
      <div>
        {renderPolicyEditor()}
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

      {/* Prompt Dialog */}
      {promptDialog.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div style={{ background: 'var(--surface-solid)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>{promptDialog.title}</h3>
            <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5 }}>{promptDialog.message}</p>
            <input
              type="text"
              className="input-field"
              autoFocus
              value={promptDialog.value}
              onChange={(e) => setPromptDialog(prev => ({ ...prev, value: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (promptDialog.onConfirm) promptDialog.onConfirm(promptDialog.value);
                  setPromptDialog({ isOpen: false });
                }
              }}
              style={{ width: '100%', background: 'transparent', border: '2px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 12px', fontSize: '14px', outline: 'none', marginBottom: '24px', fontFamily: 'var(--sans)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setPromptDialog({ isOpen: false })}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (promptDialog.onConfirm) promptDialog.onConfirm(promptDialog.value);
                  setPromptDialog({ isOpen: false });
                }}
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
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
