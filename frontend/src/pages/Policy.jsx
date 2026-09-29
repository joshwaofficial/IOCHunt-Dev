import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useInstance } from '../context/InstanceContext';
import { useAuth } from '../context/AuthContext';

const CAT_NAMES = [
  "Process Monitoring", "Registry Run Keys", "Startup Folder", "Service Creation", "Scheduled Tasks",
  "Network / Admin Shares", "Config Changes", "Sensitive File Access", "Enumeration Commands", "Failed Login Attempts",
  "Non-Office Hours Access", "USB / Removable Media", "Webcam / Microphone", "DLP / Protected Folders"
];

const MODE_LABELS = ['Off', 'Log Only', 'Log + Alert', 'Log + Alert + Block'];
const MODE_COLORS = ['#64748b', '#3b82f6', '#f59e0b', '#ef4444'];
const DEFAULT_MODES = [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Policy() {
  const { isAggregator } = useInstance();
  const { user } = useAuth();
  const isAdmin = (user?.role?.toLowerCase().includes('admin') || user?.role?.toLowerCase().includes('superadmin')) && !user?.aggregator_name;
  const readOnly = isAggregator() || !isAdmin;

  const [machines, setMachines] = useState([]);
  const [groups, setGroups] = useState([]);

  const [selectedMachine, setSelectedMachine] = useState('');
  const [machinePolicyData, setMachinePolicyData] = useState(null);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupPolicyData, setGroupPolicyData] = useState(null);
  const [newDlpFolder, setNewDlpFolder] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [collapsedSections, setCollapsedSections] = useState({
    categories: false,
    officeHours: false,
    thresholds: false,
    dlp: false,
    usb: false
  });

  const toggleSection = (key) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
  const [groupSyncModal, setGroupSyncModal] = useState({ isOpen: false, groupId: null, groupName: '', overriddenMachines: [], totalMachines: 0, policy: null });

  useEffect(() => {
    fetchMachines();
    fetchGroups();
  }, []);

  // Auto-select first machine on load if nothing selected
  useEffect(() => {
    if (machines.length > 0 && !selectedMachine && !editingGroupId) {
      const firstMachine = machines[0];
      const firstName = firstMachine?.name || firstMachine?.hostname || firstMachine?.label || (typeof firstMachine === 'string' ? firstMachine : '');
      if (firstName) {
        fetchMachinePolicy(firstName);
      }
    }
  }, [machines]);





  // Polling for policy sync status and group fleet status
  useEffect(() => {
    const interval = setInterval(() => {
      fetchGroups();
      if (selectedMachine && !selectedMachine.startsWith('grp:') && !hasChangesRef.current) {
        fetchMachinePolicy(selectedMachine, true);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
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
            ...prev,
            applied_at: res.data.applied_at,
            agent_version: res.data.agent_version,
            status: res.data.status,
            last_seen: res.data.last_seen,
            group_sync_status: res.data.group_sync_status,
            applied_machine_names: res.data.applied_machine_names
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
    if (readOnly) return;
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
    if (readOnly) return;
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
    if (readOnly) return;
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

  const handleDiscardChanges = () => {
    if (editingGroupId) {
      const g = groups.find(x => x.id === editingGroupId);
      if (g) {
        startEditGroup(g);
      }
    } else if (selectedMachine) {
      fetchMachinePolicy(selectedMachine);
    }
    setHasChanges(false);
  };

  const buildPolicyObj = (policyObj) => {
    const res = {
      catModes: policyObj.catModes || DEFAULT_MODES,
      officeHoursStart: policyObj.officeHoursStart !== undefined ? policyObj.officeHoursStart : 9,
      officeHoursEnd: policyObj.officeHoursEnd !== undefined ? policyObj.officeHoursEnd : 18,
      officeHoursDays: policyObj.officeHoursDays !== undefined ? policyObj.officeHoursDays : 62,
      failedLogonThreshold: policyObj.failedLogonThreshold !== undefined ? policyObj.failedLogonThreshold : 5,
      failedLogonWindowMins: policyObj.failedLogonWindowMins !== undefined ? policyObj.failedLogonWindowMins : 10,
      dlpFolders: Array.isArray(policyObj.dlpFolders) ? policyObj.dlpFolders : [],
      usbLock: policyObj.usbLock === 'locked' ? 'locked' : 'unlocked'
    };
    delete res.learningMode;
    return res;
  };

  const handleAddDlpFolder = () => {
    if (readOnly) return;
    const path = newDlpFolder.trim();
    if (!path) return;

    if (editingGroupId) {
      const pol = groupPolicyData?.policy || {};
      const currentList = Array.isArray(pol.dlpFolders) ? pol.dlpFolders : [];
      if (currentList.includes(path)) {
        setAlertDialog({ isOpen: true, title: 'Duplicate Folder', message: 'This folder path is already in the Group DLP protected list.', type: 'danger' });
        return;
      }
      const updated = [...currentList, path];
      updatePolicyField('dlpFolders', updated);
      setNewDlpFolder('');
    } else if (selectedMachine && machinePolicyData) {
      const groupFolders = machinePolicyData.group_dlp_folders || [];
      const localFolders = machinePolicyData.machine_dlp_folders || [];
      if (groupFolders.includes(path)) {
        setAlertDialog({ isOpen: true, title: 'Folder Already Protected', message: 'This folder is already enforced via Group Policy inheritance.', type: 'info' });
        return;
      }
      if (localFolders.includes(path)) {
        setAlertDialog({ isOpen: true, title: 'Duplicate Folder', message: 'This folder path is already in the machine-specific DLP list.', type: 'danger' });
        return;
      }
      const updatedLocal = [...localFolders, path];
      const updatedEffective = Array.from(new Set([...groupFolders, ...updatedLocal]));
      setMachinePolicyData(prev => ({
        ...prev,
        machine_dlp_folders: updatedLocal,
        effective_policy: {
          ...prev.effective_policy,
          dlpFolders: updatedEffective
        }
      }));
      setHasChanges(true);
      setNewDlpFolder('');
    }
  };

  const handleRemoveDlpFolder = (folderToRemove, isGroupFolder = false) => {
    if (readOnly) return;
    if (isGroupFolder) {
      setAlertDialog({
        isOpen: true,
        title: 'Group Enforced Folder',
        message: 'This folder is enforced by group policy and cannot be removed individually from this endpoint. To remove it, edit the group policy or remove this machine from the group.',
        type: 'info'
      });
      return;
    }
    if (editingGroupId) {
      const pol = groupPolicyData?.policy || {};
      const currentList = Array.isArray(pol.dlpFolders) ? pol.dlpFolders : [];
      const updated = currentList.filter(f => f !== folderToRemove);
      updatePolicyField('dlpFolders', updated);
    } else if (selectedMachine && machinePolicyData) {
      const groupFolders = machinePolicyData.group_dlp_folders || [];
      const localFolders = machinePolicyData.machine_dlp_folders || [];
      const updatedLocal = localFolders.filter(f => f !== folderToRemove);
      const updatedEffective = Array.from(new Set([...groupFolders, ...updatedLocal]));
      setMachinePolicyData(prev => ({
        ...prev,
        machine_dlp_folders: updatedLocal,
        effective_policy: {
          ...prev.effective_policy,
          dlpFolders: updatedEffective
        }
      }));
      setHasChanges(true);
    }
  };

  const saveGroupPolicyWithStrategy = async (groupId, policy, forceSync) => {
    try {
      setLoading(true);
      await axios.put(`/api/groups/${groupId}/policy`, {
        policy,
        forceSync,
        preserveLocalDlp: true
      });
      setGroupSyncModal({ isOpen: false, groupId: null, groupName: '', overriddenMachines: [], totalMachines: 0, policy: null });
      setAlertDialog({
        isOpen: true,
        title: 'Group Policy Saved',
        message: forceSync
          ? 'Group policy updated and forced to all machines. Machine-specific DLP folders were safely preserved.'
          : 'Group policy updated. In-sync machines will receive updates, and overridden machines kept their custom settings while inheriting new DLP folders.',
        type: 'success'
      });
      setHasChanges(false);
      fetchGroups();
      if (selectedMachine && !selectedMachine.startsWith('grp:')) {
        fetchMachinePolicy(selectedMachine);
      }
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to save group policy: ' + (e.response?.data?.error || e.message), type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePolicy = async () => {
    if (readOnly || isSaving) return;
    try {
      setIsSaving(true);
      if (editingGroupId) {
        const pol = buildPolicyObj(groupPolicyData.policy || {});
        const currentGroup = groups.find(g => g.id === editingGroupId);
        const overriddenList = currentGroup?.overridden_machines || [];
        if (overriddenList.length > 0) {
          setGroupSyncModal({
            isOpen: true,
            groupId: editingGroupId,
            groupName: currentGroup.name,
            overriddenMachines: overriddenList,
            totalMachines: currentGroup.machines?.length || 0,
            policy: pol
          });
          return;
        }
        await saveGroupPolicyWithStrategy(editingGroupId, pol, false);
      } else if (selectedMachine) {
        const pol = buildPolicyObj(machinePolicyData.effective_policy || {});
        const localDlp = Array.isArray(machinePolicyData.machine_dlp_folders)
          ? machinePolicyData.machine_dlp_folders
          : [];
        await axios.post(`/api/policy/${encodeURIComponent(selectedMachine)}`, {
          policy: pol,
          machine_dlp_folders: localDlp
        });
        setAlertDialog({
          isOpen: true,
          title: 'Success',
          message: machinePolicyData?.group
            ? `Machine policy saved! Custom overrides applied for '${selectedMachine}', while inherited group DLP folders remain active.`
            : 'Machine policy saved successfully.',
          type: 'success'
        });
        setHasChanges(false);
        fetchMachinePolicy(selectedMachine);
        fetchGroups();
      }
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to save policy: " + (e.response?.data?.error || e.message), type: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMachineOverride = async (groupId, machineName) => {
    if (readOnly) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Reset Machine to Group Policy',
      message: `Reset Monitor Categories and USB Storage Control for '${machineName}' back to group settings? Machine Local Folders will NOT be removed.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const localDlp = (selectedMachine === machineName && machinePolicyData) ? (machinePolicyData.machine_dlp_folders || []) : undefined;
          await axios.post(`/api/groups/${groupId}/reset-override/${encodeURIComponent(machineName)}`, {
            preserveLocalDlp: true,
            ...(localDlp !== undefined ? { machine_dlp_folders: localDlp } : {})
          });
          setAlertDialog({ isOpen: true, title: 'Success', message: `Machine '${machineName}' Monitor Categories and USB Control are now in sync with group policy. Machine Local Folders were preserved.`, type: 'success' });
          fetchGroups();
          if (selectedMachine === machineName) {
            fetchMachinePolicy(machineName);
          }
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to reset machine override: ' + (e.response?.data?.error || e.message), type: 'danger' });
        }
      }
    });
  };

  const handleResetGroupOverrides = async (groupId, groupName, count) => {
    if (readOnly) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Reset All Group Overrides',
      message: `Reset all ${count} overridden machine(s) in group '${groupName}' back to the group policy? Machine-specific DLP folders will be preserved.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          await axios.post(`/api/groups/${groupId}/reset-overrides`);
          setAlertDialog({ isOpen: true, title: 'Success', message: `All machines in '${groupName}' are now aligned with group policy. Local DLP folders were preserved.`, type: 'success' });
          fetchGroups();
          if (selectedMachine && !selectedMachine.startsWith('grp:')) {
            fetchMachinePolicy(selectedMachine);
          }
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to reset overrides: ' + (e.response?.data?.error || e.message), type: 'danger' });
        }
      }
    });
  };

  const handleClearOverride = async () => {
    if (readOnly) return;
    setConfirmDialog({
      isOpen: true,
      title: 'Reset Machine to Group Policy',
      message: 'Reset Monitor Categories and USB Storage Control back to group settings? Machine Local Folders will NOT be removed.',
      type: 'danger',
      onConfirm: async () => {
        try {
          const localDlp = machinePolicyData?.machine_dlp_folders || [];
          if (machinePolicyData?.group?.id) {
            await axios.post(`/api/groups/${machinePolicyData.group.id}/reset-override/${encodeURIComponent(selectedMachine)}`, {
              preserveLocalDlp: true,
              machine_dlp_folders: localDlp
            });
          } else {
            await axios.post(`/api/policy/${encodeURIComponent(selectedMachine)}`, {
              policy: localDlp.length > 0 ? { dlpFolders: localDlp } : {},
              machine_dlp_folders: localDlp
            });
          }
          setAlertDialog({ isOpen: true, title: 'Success', message: "Machine policy reset to group settings. Machine Local Folders were preserved.", type: 'success' });
          setHasChanges(false);
          fetchMachinePolicy(selectedMachine);
          fetchGroups();
        } catch (e) {
          setAlertDialog({ isOpen: true, title: 'Error', message: "Failed to reset policy: " + (e.response?.data?.error || e.message), type: 'danger' });
        }
      }
    });
  };

  const updatePolicyField = (field, value) => {
    if (readOnly) return;
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
    const currentModes = (!editingGroupId && selectedMachine && machinePolicyData && machinePolicyData.current && machinePolicyData.current.catModes) ? machinePolicyData.current.catModes : null;
    const isCatInSync = isClientApplied || (
      currentModes !== null &&
      modes.every((m, i) => (currentModes[i] !== undefined ? currentModes[i] === m : true))
    );

    const clientThreshold = (!editingGroupId && selectedMachine && machinePolicyData?.current?.failedLogonThreshold !== undefined)
      ? machinePolicyData.current.failedLogonThreshold
      : null;
    const clientWindow = (!editingGroupId && selectedMachine && machinePolicyData?.current?.failedLogonWindowMins !== undefined)
      ? machinePolicyData.current.failedLogonWindowMins
      : null;
    const isThresholdInSync = isClientApplied || (
      clientThreshold !== null && clientWindow !== null &&
      clientThreshold === flThreshold && clientWindow === flWindow
    );

    const clientOhStart = (!editingGroupId && selectedMachine && machinePolicyData?.current?.officeHoursStart !== undefined)
      ? machinePolicyData.current.officeHoursStart
      : null;
    const clientOhEnd = (!editingGroupId && selectedMachine && machinePolicyData?.current?.officeHoursEnd !== undefined)
      ? machinePolicyData.current.officeHoursEnd
      : null;
    const clientOhDays = (!editingGroupId && selectedMachine && machinePolicyData?.current?.officeHoursDays !== undefined)
      ? machinePolicyData.current.officeHoursDays
      : null;
    const isOfficeHoursInSync = isClientApplied || (
      clientOhStart !== null && clientOhEnd !== null && clientOhDays !== null &&
      clientOhStart === ohStart && clientOhEnd === ohEnd && clientOhDays === ohDays
    );

    const dlpFoldersList = Array.isArray(policyObj.dlpFolders) ? policyObj.dlpFolders : [];
    const clientDlpFolders = (!editingGroupId && selectedMachine && machinePolicyData?.current && Array.isArray(machinePolicyData.current.dlpFolders))
      ? machinePolicyData.current.dlpFolders
      : null;
    const isClientApplied = Boolean(!editingGroupId && selectedMachine && machinePolicyData?.applied_at && (!machinePolicyData?.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at));
    const isDlpInSync = isClientApplied || (
      clientDlpFolders !== null &&
      dlpFoldersList.length === clientDlpFolders.length &&
      dlpFoldersList.every(f => clientDlpFolders.includes(f))
    );

    const currentUsbLock = policyObj.usbLock === 'locked' ? 'locked' : 'unlocked';
    const isUsbLocked = currentUsbLock === 'locked';
    const clientUsbLock = (!editingGroupId && selectedMachine && machinePolicyData?.current && machinePolicyData.current.usbLock)
      ? machinePolicyData.current.usbLock
      : null;
    const isUsbInSync = isClientApplied || (clientUsbLock !== null && (clientUsbLock === currentUsbLock));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Card 1: MONITOR CATEGORIES */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div
            onClick={() => toggleSection('categories')}
            style={{
              padding: '14px 20px',
              background: 'var(--surface2)',
              borderBottom: collapsedSections.categories ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>monitoring</span>
              <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                Monitor Categories
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {CAT_NAMES.length} Categories
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>
                0=Off  1=Log  2=Alert  3=Alert+Block
              </span>
              {currentModes !== null && (
                isCatInSync ? (
                  <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span> in sync
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }} title="Agent polls every 60s">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hourglass_top</span> Syncing
                  </span>
                )
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                {collapsedSections.categories ? 'expand_more' : 'expand_less'}
              </span>
            </div>
          </div>

          {!collapsedSections.categories && (
            <div style={{ overflowX: 'auto' }}>
              <table className="mt" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
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
          )}
        </div>

        {/* Card 2: OFFICE HOURS & SCHEDULING */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div
            onClick={() => toggleSection('officeHours')}
            style={{
              padding: '14px 20px',
              background: 'var(--surface2)',
              borderBottom: collapsedSections.officeHours ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>schedule</span>
              <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                Office Hours & Scheduling
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {String(ohStart).padStart(2, '0')}:00 — {String(ohEnd).padStart(2, '0')}:00
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {clientOhStart !== null && (
                isOfficeHoursInSync ? (
                  <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span> in sync
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }} title="Agent polls every 60s">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hourglass_top</span> Syncing
                  </span>
                )
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                {collapsedSections.officeHours ? 'expand_more' : 'expand_less'}
              </span>
            </div>
          </div>

          {!collapsedSections.officeHours && (
            <div style={{ padding: '20px 24px' }}>
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
            </div>
          )}
        </div>

        {/* Card 3: SECURITY THRESHOLDS */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div
            onClick={() => toggleSection('thresholds')}
            style={{
              padding: '14px 20px',
              background: 'var(--surface2)',
              borderBottom: collapsedSections.thresholds ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>security</span>
              <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                Security Thresholds
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                Max {flThreshold} attempts in {flWindow} min
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {clientThreshold !== null && (
                isThresholdInSync ? (
                  <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span> in sync
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }} title="Agent polls every 60s">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hourglass_top</span> Syncing
                  </span>
                )
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                {collapsedSections.thresholds ? 'expand_more' : 'expand_less'}
              </span>
            </div>
          </div>

          {!collapsedSections.thresholds && (
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
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
            </div>
          )}
        </div>

        {/* Card 4: DLP PROTECTED FOLDERS */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div
            onClick={() => toggleSection('dlp')}
            style={{
              padding: '14px 20px',
              background: 'var(--surface2)',
              borderBottom: collapsedSections.dlp ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#3b82f6' }}>folder_special</span>
              <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                {editingGroupId ? 'Group DLP Protected Folders' : 'DLP Protected Folders'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {dlpFoldersList.length} Active Folder(s)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {clientDlpFolders !== null && (
                isDlpInSync ? (
                  <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span> in sync ({dlpFoldersList.length} active)
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }} title="Agent polls every 60s">
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>hourglass_top</span> Syncing: {clientDlpFolders.length} of {dlpFoldersList.length} active
                  </span>
                )
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                {collapsedSections.dlp ? 'expand_more' : 'expand_less'}
              </span>
            </div>
          </div>

          {!collapsedSections.dlp && (
            <div style={{ padding: '20px 24px' }}>
              {editingGroupId ? (
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: '1.5' }}>
                    Folders configured here are automatically pushed to all machines in this group. They are additively merged with each machine's local folders so individual endpoint folders are never lost.
                  </p>

                  {/* Add Group Folder Input */}
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '650px' }}>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '0 14px',
                        height: '42px',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>create_new_folder</span>
                        <input
                          type="text"
                          className="input-field no-focus-outline"
                          placeholder="Enter group folder path (e.g. C:\ProtectedData or /var/secrets)..."
                          value={newDlpFolder}
                          onChange={(e) => setNewDlpFolder(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddDlpFolder(); }}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', padding: 0 }}
                        />
                      </div>
                      <button
                        onClick={handleAddDlpFolder}
                        disabled={!newDlpFolder.trim()}
                        style={{
                          background: '#a78bfa',
                          color: '#fff',
                          border: 'none',
                          padding: '0 20px',
                          height: '42px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: newDlpFolder.trim() ? 'pointer' : 'not-allowed',
                          opacity: newDlpFolder.trim() ? 1 : 0.6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                          boxShadow: newDlpFolder.trim() ? '0 2px 8px rgba(167,139,250,0.25)' : 'none'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add Group Folder
                      </button>
                    </div>
                  )}

                  {/* Group Folder List */}
                  <div style={{
                    background: 'var(--surface)',
                    border: (!dlpFoldersList || dlpFoldersList.length === 0) ? '1px dashed var(--border)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    maxWidth: '750px'
                  }}>
                    {(!dlpFoldersList || dlpFoldersList.length === 0) ? (
                      <div style={{ padding: '28px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--muted)', display: 'block', marginBottom: '8px', opacity: 0.5 }}>folder_off</span>
                        No group DLP folders configured. Add a path above to protect it across all group machines.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {dlpFoldersList.map((folderPath, idx) => (
                            <tr key={idx} style={{ borderBottom: idx === dlpFoldersList.length - 1 ? 'none' : '1px solid var(--border)' }}>
                              <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#a78bfa' }}>folder</span>
                                <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{folderPath}</span>
                                <span style={{ fontSize: '10px', color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700 }}>Group Enforced</span>
                              </td>
                              {!readOnly && (
                                <td style={{ padding: '12px 16px', textAlign: 'right', width: '90px' }}>
                                  <button
                                    onClick={() => handleRemoveDlpFolder(folderPath)}
                                    title="Remove Folder"
                                    style={{
                                      background: 'rgba(239,68,68,0.1)',
                                      border: '1px solid rgba(239,68,68,0.3)',
                                      color: '#ef4444',
                                      padding: '5px 12px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      transition: 'all 0.15s'
                                    }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span> Remove
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ) : selectedMachine && machinePolicyData?.group ? (
                /* Machine inside a Group: Layered DLP UI */
                <div>
                  <div style={{
                    background: 'rgba(59,130,246,0.06)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    fontSize: '12px',
                    color: 'var(--text)',
                    lineHeight: 1.5,
                    maxWidth: '750px'
                  }}>
                    <strong style={{ color: '#60a5fa' }}>Layered DLP Protection:</strong> This machine additively combines mandatory group folders from <strong style={{ color: '#a78bfa' }}>{machinePolicyData.group.name}</strong> with endpoint-specific local folders. Group policy updates will never wipe this endpoint's local folders.
                  </div>

                  {/* 1. Group Inherited Folders */}
                  <div style={{ marginBottom: '24px', maxWidth: '750px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#a78bfa' }}>folder_shared</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Inherited Group Folders ({(machinePolicyData.group_dlp_folders || []).length})
                      </span>
                      <span style={{ fontSize: '10px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        Group: {machinePolicyData.group.name}
                      </span>
                    </div>

                    <div style={{
                      background: 'var(--surface)',
                      border: '1px solid rgba(167,139,250,0.25)',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      {(!machinePolicyData.group_dlp_folders || machinePolicyData.group_dlp_folders.length === 0) ? (
                        <div style={{ padding: '16px 20px', color: 'var(--muted)', fontSize: '12px' }}>
                          No group folders defined in group "{machinePolicyData.group.name}".
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {machinePolicyData.group_dlp_folders.map((folderPath, idx) => (
                              <tr key={idx} style={{ borderBottom: idx === machinePolicyData.group_dlp_folders.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#a78bfa' }}>folder</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{folderPath}</span>
                                  <span style={{ fontSize: '10px', color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '2px 8px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>lock</span> Enforced by Group
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* 2. Machine Local Folders */}
                  <div style={{ maxWidth: '750px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>laptop_chromebook</span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Machine Local Folders ({(machinePolicyData.machine_dlp_folders || []).length})
                      </span>
                      <span style={{ fontSize: '10px', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        Local Endpoint Only
                      </span>
                    </div>

                    {/* Add Local Folder Input */}
                    {!readOnly && (
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '0 14px',
                          height: '42px',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>create_new_folder</span>
                          <input
                            type="text"
                            className="input-field no-focus-outline"
                            placeholder="Enter endpoint-specific folder path (e.g. D:\LocalDocs)..."
                            value={newDlpFolder}
                            onChange={(e) => setNewDlpFolder(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddDlpFolder(); }}
                            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', padding: 0 }}
                          />
                        </div>
                        <button
                          onClick={handleAddDlpFolder}
                          disabled={!newDlpFolder.trim()}
                          style={{
                            background: 'var(--accent)',
                            color: '#fff',
                            border: 'none',
                            padding: '0 20px',
                            height: '42px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: newDlpFolder.trim() ? 'pointer' : 'not-allowed',
                            opacity: newDlpFolder.trim() ? 1 : 0.6,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            boxShadow: newDlpFolder.trim() ? '0 2px 8px rgba(37,99,235,0.25)' : 'none'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add Local Folder
                        </button>
                      </div>
                    )}

                    <div style={{
                      background: 'var(--surface)',
                      border: (!machinePolicyData.machine_dlp_folders || machinePolicyData.machine_dlp_folders.length === 0) ? '1px dashed var(--border)' : '1px solid var(--border)',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}>
                      {(!machinePolicyData.machine_dlp_folders || machinePolicyData.machine_dlp_folders.length === 0) ? (
                        <div style={{ padding: '20px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                          No machine-specific local folders configured for this endpoint. Add one above to protect local directories.
                        </div>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <tbody>
                            {machinePolicyData.machine_dlp_folders.map((folderPath, idx) => (
                              <tr key={idx} style={{ borderBottom: idx === machinePolicyData.machine_dlp_folders.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>folder</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{folderPath}</span>
                                  <span style={{ fontSize: '10px', color: '#60a5fa', background: 'rgba(59,130,246,0.12)', padding: '2px 8px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700 }}>Local Folder</span>
                                </td>
                                {!readOnly && (
                                  <td style={{ padding: '10px 16px', textAlign: 'right', width: '90px' }}>
                                    <button
                                      onClick={() => handleRemoveDlpFolder(folderPath, false)}
                                      title="Remove Local Folder"
                                      style={{
                                        background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        color: '#ef4444',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'all 0.15s'
                                      }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span> Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {/* Combined Total Summary */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    maxWidth: '750px',
                    fontSize: '12px'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>verified_user</span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                      Total Active Folders Monitored by Agent: <strong style={{ color: 'var(--accent)' }}>{dlpFoldersList.length}</strong> ({(machinePolicyData.group_dlp_folders || []).length} Group + {(machinePolicyData.machine_dlp_folders || []).length} Local)
                    </span>
                  </div>
                </div>
              ) : (
                /* Standalone Machine (No Group) */
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: '1.5' }}>
                    Monitors protected folders for file writes, modifications, and deletions, flagging unauthorized or suspicious process access.
                  </p>

                  {/* Add Folder Input */}
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', maxWidth: '650px' }}>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '0 14px',
                        height: '42px',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)', marginRight: '8px' }}>create_new_folder</span>
                        <input
                          type="text"
                          className="input-field no-focus-outline"
                          placeholder="Enter folder path (e.g. D:\IOCHunt-Monitor or /data/secure)..."
                          value={newDlpFolder}
                          onChange={(e) => setNewDlpFolder(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddDlpFolder(); }}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'var(--sans)', padding: 0 }}
                        />
                      </div>
                      <button
                        onClick={handleAddDlpFolder}
                        disabled={!newDlpFolder.trim()}
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          border: 'none',
                          padding: '0 20px',
                          height: '42px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: newDlpFolder.trim() ? 'pointer' : 'not-allowed',
                          opacity: newDlpFolder.trim() ? 1 : 0.6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                          boxShadow: newDlpFolder.trim() ? '0 2px 8px rgba(37,99,235,0.25)' : 'none'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add Folder
                      </button>
                    </div>
                  )}

                  {/* Folder List */}
                  <div style={{
                    background: 'var(--surface)',
                    border: (!dlpFoldersList || dlpFoldersList.length === 0) ? '1px dashed var(--border)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    maxWidth: '750px'
                  }}>
                    {(!dlpFoldersList || dlpFoldersList.length === 0) ? (
                      <div style={{ padding: '28px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--muted)', display: 'block', marginBottom: '8px', opacity: 0.5 }}>folder_off</span>
                        No DLP protected folders configured. Add a folder path above to begin monitoring.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          {dlpFoldersList.map((folderPath, idx) => {
                            const isEnforcedByClient = clientDlpFolders && clientDlpFolders.includes(folderPath);
                            return (
                              <tr key={idx} style={{ borderBottom: idx === dlpFoldersList.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#3b82f6' }}>folder</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{folderPath}</span>
                                  {clientDlpFolders !== null && (
                                    isEnforcedByClient ? (
                                      <span style={{ fontSize: '10px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 600 }}>Active on client</span>
                                    ) : (
                                      <span style={{ fontSize: '10px', color: '#f97316', background: 'rgba(249,115,22,0.1)', padding: '2px 8px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 600 }}>Pending sync</span>
                                    )
                                  )}
                                </td>
                                {!readOnly && (
                                  <td style={{ padding: '12px 16px', textAlign: 'right', width: '90px' }}>
                                    <button
                                      onClick={() => handleRemoveDlpFolder(folderPath, false)}
                                      title="Remove Folder"
                                      style={{
                                        background: 'rgba(239,68,68,0.1)',
                                        border: '1px solid rgba(239,68,68,0.3)',
                                        color: '#ef4444',
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'all 0.15s'
                                      }}
                                    >
                                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span> Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 5: USB STORAGE CONTROL */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div
            onClick={() => toggleSection('usb')}
            style={{
              padding: '14px 20px',
              background: 'var(--surface2)',
              borderBottom: collapsedSections.usb ? 'none' : '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              userSelect: 'none',
              transition: 'background 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: isUsbLocked ? '#ef4444' : '#22c55e' }}>usb</span>
              <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                USB Storage Control
              </span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                background: isUsbLocked ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                color: isUsbLocked ? '#ef4444' : '#22c55e',
                border: `1px solid ${isUsbLocked ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`
              }}>
                {isUsbLocked ? 'BLOCKED' : 'ALLOWED'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {clientUsbLock !== null && (
                isUsbInSync ? (
                  <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check_circle</span> in sync
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: '#f97316', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>pending</span> Client: {clientUsbLock === 'locked' ? 'Disabled' : 'Enabled'}
                  </span>
                )
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--muted)' }}>
                {collapsedSections.usb ? 'expand_more' : 'expand_less'}
              </span>
            </div>
          </div>

          {!collapsedSections.usb && (
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 18px', lineHeight: '1.5' }}>
                Enforce operating system-level USB mass storage lockdown. When disabled, the agent blocks USB storage access on the endpoint.
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '20px',
                padding: '18px 24px',
                borderRadius: '10px',
                background: isUsbLocked ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
                border: `1px solid ${isUsbLocked ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                maxWidth: '750px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '32px', color: isUsbLocked ? '#ef4444' : '#22c55e' }}>
                    {isUsbLocked ? 'block' : 'usb'}
                  </span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: isUsbLocked ? '#ef4444' : '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isUsbLocked ? '#ef4444' : '#22c55e', display: 'inline-block' }}></span>
                      {isUsbLocked ? 'USB Storage is currently DISABLED on this machine' : 'USB Storage is currently ENABLED on this machine'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                      {isUsbLocked ? 'Endpoints will reject USB thumb drives and external disks.' : 'Endpoints are allowed to read and write to USB flash drives.'}
                    </div>
                  </div>
                </div>

                {!readOnly && (
                  <button
                    onClick={() => {
                      updatePolicyField('usbLock', isUsbLocked ? 'unlocked' : 'locked');
                    }}
                    style={{
                      background: isUsbLocked ? '#22c55e' : '#dc2626',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: isUsbLocked ? '0 4px 12px rgba(34,197,94,0.25)' : '0 4px 12px rgba(220,38,38,0.25)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                      {isUsbLocked ? 'lock_open' : 'lock'}
                    </span>
                    {isUsbLocked ? 'Enable USB Storage' : 'Disable USB Storage'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phase 4: Sticky Bottom Action Bar */}
        <div style={{
          position: 'sticky',
          bottom: '16px',
          zIndex: 30,
          background: 'var(--surface-solid, #111827)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 20px',
          marginTop: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          {/* Left: Active Target Context & Pending Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: editingGroupId ? '#a78bfa' : '#60a5fa' }}>
                {editingGroupId ? 'folder_special' : 'devices'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', fontFamily: editingGroupId ? 'var(--sans)' : 'var(--mono)' }}>
                {editingGroupId ? `Group: ${groupPolicyData?.name || 'Group Policy'}` : selectedMachine}
              </span>
            </div>

            <div style={{ height: '18px', width: '1px', background: 'var(--border)' }} />

            {hasChanges ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#f59e0b',
                  boxShadow: '0 0 10px #f59e0b',
                  display: 'inline-block'
                }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                  Unsaved Changes Pending
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--muted)', fontSize: '12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#22c55e' }}>check_circle</span>
                <span>All policy settings saved</span>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Discard Changes Button (Visible when has changes) */}
            {hasChanges && !readOnly && (
              <button
                onClick={handleDiscardChanges}
                style={{
                  background: 'var(--surface2)',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>undo</span>
                Discard Changes
              </button>
            )}

            {/* Reset to Group / Default Policy Button */}
            {!readOnly && !editingGroupId && selectedMachine && (machinePolicyData?.has_override || machinePolicyData?.policy_source === 'machine') && (
              <button
                onClick={handleClearOverride}
                style={{
                  background: 'rgba(245,158,11,0.1)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245,158,11,0.35)',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>restart_alt</span>
                {machinePolicyData?.group ? 'Reset to Group Policy' : 'Reset to Default'}
              </button>
            )}

            {/* Save Policy Button */}
            {!readOnly && (
              <button
                onClick={handleSavePolicy}
                disabled={!hasChanges || isSaving}
                style={{
                  background: editingGroupId
                    ? 'linear-gradient(135deg, #a78bfa, #8b5cf6)'
                    : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 24px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: (hasChanges && !isSaving) ? 'pointer' : 'not-allowed',
                  opacity: (hasChanges && !isSaving) ? 1 : 0.45,
                  boxShadow: (hasChanges && !isSaving)
                    ? `0 4px 16px ${editingGroupId ? 'rgba(167,139,250,0.4)' : 'rgba(37,99,235,0.4)'}`
                    : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {isSaving ? 'hourglass_top' : 'save'}
                </span>
                {isSaving
                  ? 'Saving...'
                  : (editingGroupId ? 'Save Group Policy' : 'Save Machine Policy')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getMachineName = (m) => m?.name || m?.hostname || m?.label || (typeof m === 'string' ? m : '');

  const getMachineGroup = (mName) => {
    return groups.find(g => Array.isArray(g.machines) && g.machines.includes(mName));
  };

  const searchLower = sidebarSearch.trim().toLowerCase();

  const filteredGroups = groups.filter(g => {
    if (!searchLower) return true;
    if (g.name && g.name.toLowerCase().includes(searchLower)) return true;
    if (Array.isArray(g.machines) && g.machines.some(m => String(m).toLowerCase().includes(searchLower))) return true;
    return false;
  });

  const filteredMachines = machines.filter(m => {
    const name = getMachineName(m);
    if (!searchLower) return true;
    if (name.toLowerCase().includes(searchLower)) return true;
    const grp = getMachineGroup(name);
    if (grp && grp.name.toLowerCase().includes(searchLower)) return true;
    return false;
  });

  const toggleGroupCollapse = (gid, e) => {
    if (e) e.stopPropagation();
    setCollapsedGroups(prev => ({ ...prev, [gid]: !prev[gid] }));
  };

  return (
    <div style={{ width: '100%', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', margin: 0 }}>Policy Management</h2>
            <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)', fontWeight: 700, letterSpacing: '0.5px' }}>
              EDR FLEET CONTROL
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', margin: '6px 0 0', fontFamily: 'var(--mono)' }}>
            Configure global and machine-specific security policies, rules, and exclusions.
          </p>
        </div>
      </div>

      {readOnly && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>lock</span>
          <span>{isAggregator() ? 'Policies are managed centrally. This Branch Aggregator is read-only.' : 'Policies are view-only. Modifications require Administrator privileges.'}</span>
        </div>
      )}

      {/* Main 2-Column Split: Center/Left Policy Editor (flex: 1) + Right Navigation Panel (fixed width) */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* LEFT / CENTER: Active Target Context & Policy Editor */}
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>

          {/* Context Header Card */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '18px 20px',
            marginBottom: '18px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            {/* Top Row: Target Icon + Name + Badge + Quick Switch Dropdown */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: (selectedMachine && !selectedMachine.startsWith('grp:') && machinePolicyData) || (editingGroupId && groupPolicyData) ? '16px' : 0
            }}>
              
              {/* Target info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: editingGroupId ? 'rgba(167,139,250,0.15)' : 'rgba(59,130,246,0.15)',
                  border: `1px solid ${editingGroupId ? 'rgba(167,139,250,0.3)' : 'rgba(59,130,246,0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: editingGroupId ? '#a78bfa' : '#60a5fa'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '26px' }}>
                    {editingGroupId ? 'folder_special' : 'devices'}
                  </span>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', fontFamily: editingGroupId ? 'var(--sans)' : 'var(--mono)' }}>
                      {editingGroupId ? (groupPolicyData?.name || 'Group Policy') : (selectedMachine || 'No Target Selected')}
                    </span>
                    {editingGroupId ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: 'rgba(167,139,250,0.18)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.35)', letterSpacing: '0.5px' }}>
                        GROUP POLICY TEMPLATE
                      </span>
                    ) : selectedMachine && machinePolicyData ? (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: machinePolicyData?.policy_source === 'machine' ? 'rgba(245,158,11,0.15)' : machinePolicyData?.policy_source === 'group' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                        color: machinePolicyData?.policy_source === 'machine' ? '#f59e0b' : machinePolicyData?.policy_source === 'group' ? '#60a5fa' : 'var(--muted)',
                        border: `1px solid ${machinePolicyData?.policy_source === 'machine' ? 'rgba(245,158,11,0.3)' : machinePolicyData?.policy_source === 'group' ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
                        letterSpacing: '0.5px'
                      }}>
                        {machinePolicyData?.policy_source === 'machine' ? 'Machine Override Active' : machinePolicyData?.policy_source === 'group' ? `Group Inherited: ${machinePolicyData?.group?.name}` : 'Default Policy Active'}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px' }}>
                    {editingGroupId ? (
                      <span>{groupPolicyData?.machines?.length || 0} machine(s) will inherit this baseline policy unless overridden</span>
                    ) : selectedMachine && machinePolicyData ? (
                      <span>
                        {machinePolicyData?.group ? `Enrolled in Group: ${machinePolicyData.group.name}` : 'Standalone Endpoint (Unassigned)'}
                      </span>
                    ) : (
                      <span>Select a machine or group from the right navigation panel</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right actions: Back to Endpoints button + Quick Switch Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {editingGroupId && (
                  <button
                    onClick={() => {
                      setEditingGroupId(null);
                      if (machines.length > 0) {
                        const first = getMachineName(machines[0]);
                        fetchMachinePolicy(first);
                      } else {
                        setSelectedMachine('');
                      }
                    }}
                    style={{
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>arrow_back</span>
                    Back to Endpoints
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Target:
                  </span>
                  <select
                    value={selectedMachine}
                    onChange={(e) => {
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
                    }}
                    style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      color: 'var(--text)',
                      outline: 'none',
                      cursor: 'pointer',
                      minWidth: '180px'
                    }}
                  >
                    <option value="">-- Switch Machine or Group --</option>
                    {groups.length > 0 && (
                      <optgroup label="Groups">
                        {groups.map(g => (
                          <option key={`grp-${g.id}`} value={`grp:${g.id}`}>{g.name} ({g.machines.length} machines)</option>
                        ))}
                      </optgroup>
                    )}
                    {machines.length > 0 && (
                      <optgroup label="Machines">
                        {machines.map(m => {
                          const mName = getMachineName(m);
                          return <option key={mName} value={mName}>{mName}</option>;
                        })}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

            </div>

            {/* Machine Sync Details Row */}
            {selectedMachine && !selectedMachine.startsWith('grp:') && machinePolicyData && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border)'
              }}>
                <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Sync Status</span>
                  {machinePolicyData.applied_at && (!machinePolicyData.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at) ? (
                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>check_circle</span>
                      Applied: {new Date(machinePolicyData.applied_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>hourglass_top</span>
                      Pending Pickup (60s poll)
                    </span>
                  )}
                </div>

                <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Last Saved</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
                    {machinePolicyData.updated_at ? new Date(machinePolicyData.updated_at * 1000).toLocaleString() : 'Never'}
                  </span>
                </div>

                <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Client Reporting</span>
                  <span style={{ fontWeight: 700, fontSize: '12px', color: machinePolicyData.current_json !== '{}' && machinePolicyData.current_json ? '#22c55e' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: machinePolicyData.current_json !== '{}' && machinePolicyData.current_json ? '#22c55e' : '#64748b', display: 'inline-block' }}></span>
                    {machinePolicyData.current_json !== '{}' && machinePolicyData.current_json ? 'Reporting Live' : 'No Agent Data'}
                  </span>
                </div>
              </div>
            )}

            {/* Machine Group Membership & Override Notice inside the Context Card */}
            {selectedMachine && !editingGroupId && machinePolicyData?.group && (
              <div style={{
                marginTop: '14px',
                background: machinePolicyData.has_override ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
                border: `1px solid ${machinePolicyData.has_override ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: '8px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px', color: machinePolicyData.has_override ? '#f59e0b' : '#22c55e' }}>
                    {machinePolicyData.has_override ? 'warning' : 'verified'}
                  </span>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                        Group Member: <span style={{ color: '#a78bfa' }}>{machinePolicyData.group.name}</span>
                      </span>
                      <span style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: machinePolicyData.has_override ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)',
                        color: machinePolicyData.has_override ? '#f59e0b' : '#22c55e',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase'
                      }}>
                        {machinePolicyData.has_override ? 'Custom Override Active' : 'In Sync with Group'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                      {machinePolicyData.has_override
                        ? `Endpoint overrides: ${machinePolicyData.overridden_fields?.join(', ') || 'custom settings'}. Machine Local Folders preserved.`
                        : `Endpoint adheres to all group policies and inherits group DLP folders.`}
                    </div>
                  </div>
                </div>

                {!readOnly && machinePolicyData.has_override && (
                  <button
                    onClick={() => handleResetMachineOverride(machinePolicyData.group.id, selectedMachine)}
                    title="Reset Monitor Categories and USB Storage Control back to group settings. Machine Local Folders will NOT be removed."
                    style={{
                      background: 'rgba(245,158,11,0.15)',
                      border: '1px solid rgba(245,158,11,0.4)',
                      color: '#f59e0b',
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>restart_alt</span>
                    Reset to Group Policy
                  </button>
                )}
              </div>
            )}

            {/* Group Status & Overrides Notice inside Context Card */}
            {editingGroupId && groupPolicyData && (() => {
              const curG = groups.find(g => g.id === editingGroupId) || groupPolicyData;
              const ovCount = curG.overridden_machines ? curG.overridden_machines.length : 0;
              const syncCount = curG.in_sync_machines ? curG.in_sync_machines.length : (curG.machines.length - ovCount);
              const overrides = curG.overridden_machines || [];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px'
                  }}>
                    <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Target Scope</span>
                      <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '12px' }}>
                        {groupPolicyData.machines.length} Member Endpoints
                      </span>
                    </div>

                    <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Fleet Alignment</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '12px' }}>
                        {syncCount} in sync, {ovCount} overridden
                      </span>
                    </div>

                    <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Inheritance Rules</span>
                      <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: '12px' }}>
                        Global Group Baseline
                      </span>
                    </div>
                  </div>

                  {overrides.length > 0 && (
                    <div style={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#f59e0b' }}>info</span>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                            {overrides.length} machine(s) have custom overrides:
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                            {overrides.join(', ')}
                          </div>
                        </div>
                      </div>

                      {!readOnly && (
                        <button
                          onClick={() => handleResetGroupOverrides(editingGroupId, curG.name, overrides.length)}
                          title="Reset all overridden machines back to group policy while preserving local DLP folders"
                          style={{
                            background: 'rgba(245,158,11,0.15)',
                            border: '1px solid rgba(245,158,11,0.4)',
                            color: '#f59e0b',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>restart_alt</span>
                          Reset All Overrides
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Info Banner */}
          <div style={{ background: 'rgba(59,130,246,.08)', border: '1px solid rgba(59,130,246,.25)', borderRadius: '8px', padding: '10px 16px', marginBottom: '18px', fontSize: '12px', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0 }}>info</span>
            <span>Pushing policy here overrides the client's local settings. The client will apply it within 60 seconds.</span>
          </div>

          {/* Policy Editor */}
          <div>
            {renderPolicyEditor()}
          </div>

        </div>

        {/* RIGHT PANEL: Navigation Panel (Groups & Endpoints) */}
        <aside style={{
          width: '360px',
          flexShrink: 0,
          position: 'sticky',
          top: '16px',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          background: 'var(--surface-solid, #111827)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: 'var(--shadow-sm)'
        }}>

          {/* Search Header */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', letterSpacing: '1px', fontWeight: 800, textTransform: 'uppercase' }}>
                Navigation Panel
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                {filteredMachines.length} endpoints • {filteredGroups.length} groups
              </span>
            </div>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', fontSize: '16px', color: 'var(--muted)', pointerEvents: 'none' }}>
                search
              </span>
              <input
                type="text"
                placeholder="Search endpoints or groups..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '7px 30px 7px 32px',
                  fontSize: '12px',
                  color: 'var(--text)',
                  outline: 'none',
                  fontFamily: 'var(--sans)',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
              {sidebarSearch && (
                <button
                  onClick={() => setSidebarSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0,
                    lineHeight: 1
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* GROUPS Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#a78bfa' }}>folder</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px', fontWeight: 800 }}>
                  GROUPS ({filteredGroups.length})
                </span>
              </div>
              {!readOnly && (
                <button
                  onClick={createGroup}
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  + New Group
                </button>
              )}
            </div>

            {filteredGroups.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px', textAlign: 'center', background: 'var(--surface2)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                {sidebarSearch ? 'No groups matching search' : 'No groups yet. Create one to organize endpoints.'}
              </div>
            ) : (
              filteredGroups.map(g => {
                const memberCount = g.machines.length;
                const hasPol = Object.keys(g.policy || {}).length > 0;
                const overriddenList = g.overridden_machines || [];
                const inSyncCount = g.in_sync_machines ? g.in_sync_machines.length : (memberCount - overriddenList.length);
                const isGroupSelected = editingGroupId === g.id || selectedMachine === `grp:${g.id}`;
                const isCollapsed = Boolean(collapsedGroups[g.id]);

                // Count applied/syncing for group
                let currentAppliedCount = 0;
                let currentPendingCount = 0;
                g.machines.forEach(mach => {
                  const isSel = (selectedMachine === mach || selectedMachine?.toLowerCase() === mach.toLowerCase()) && machinePolicyData;
                  const applied = isSel
                    ? Boolean(machinePolicyData.applied_at && (!machinePolicyData.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at))
                    : (g.machine_sync_details?.[mach]?.isApplied ?? false);
                  if (applied) currentAppliedCount++;
                  else currentPendingCount++;
                });

                return (
                  <div
                    key={g.id}
                    style={{
                      background: isGroupSelected ? 'rgba(167,139,250,0.08)' : 'var(--surface2)',
                      border: `1px solid ${isGroupSelected ? '#a78bfa' : 'var(--border)'}`,
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s',
                      boxShadow: isGroupSelected ? '0 0 12px rgba(167,139,250,0.15)' : 'none'
                    }}
                  >
                    {/* Group Title Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div
                        onClick={() => startEditGroup(g)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                        title="Click to view/edit group policy"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#a78bfa', flexShrink: 0 }}>folder_open</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.name}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>
                          ({memberCount})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {hasPol ? (
                          <span style={{ fontSize: '9px', background: 'rgba(34,197,94,.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,.3)', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            policy set
                          </span>
                        ) : (
                          <span style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 600 }}>
                            no policy
                          </span>
                        )}
                        <button
                          onClick={(e) => toggleGroupCollapse(g.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title={isCollapsed ? "Expand members" : "Collapse members"}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                            {isCollapsed ? 'expand_more' : 'expand_less'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Sync metrics tags */}
                    {memberCount > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        <span style={{ fontSize: '9px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          {inSyncCount} in sync
                        </span>
                        {overriddenList.length > 0 && (
                          <span style={{ fontSize: '9px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {overriddenList.length} overridden
                          </span>
                        )}
                        {currentAppliedCount > 0 && (
                          <span style={{ fontSize: '9px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>check_circle</span> {currentAppliedCount} applied
                          </span>
                        )}
                        {currentPendingCount > 0 && (
                          <span style={{ fontSize: '9px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>hourglass_top</span> {currentPendingCount} syncing
                          </span>
                        )}
                      </div>
                    )}

                    {/* Group Actions */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      <button
                        onClick={() => startEditGroup(g)}
                        style={{
                          background: isGroupSelected ? '#a78bfa' : 'var(--surface)',
                          color: isGroupSelected ? '#fff' : 'var(--text)',
                          border: '1px solid var(--border)',
                          padding: '3px 8px',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '10px',
                          fontWeight: 700,
                          flex: 1
                        }}
                      >
                        {readOnly ? 'View Policy' : (isGroupSelected ? 'Editing Now' : 'Edit Policy')}
                      </button>

                      {!readOnly && overriddenList.length > 0 && (
                        <button
                          onClick={() => handleResetGroupOverrides(g.id, g.name, overriddenList.length)}
                          title="Reset all overridden machines back to group policy while preserving local DLP folders"
                          style={{
                            background: 'rgba(245,158,11,0.1)',
                            border: '1px solid rgba(245,158,11,0.3)',
                            color: '#f59e0b',
                            padding: '3px 6px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>restart_alt</span>
                          Reset
                        </button>
                      )}

                      {!readOnly && (
                        <button
                          onClick={() => deleteGroup(g.id)}
                          title="Delete group"
                          style={{
                            background: 'rgba(239,68,68,.05)',
                            border: '1px solid rgba(239,68,68,.3)',
                            color: '#f87171',
                            padding: '3px 8px',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Group Members (Collapsible) */}
                    {!isCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                          {g.machines.map(m => {
                            const machineObj = machines.find(x => x.name === m || String(x.id) === String(m) || x === m);
                            const mName = machineObj ? (machineObj.name || machineObj.hostname || machineObj.label || m) : m;
                            const isOverridden = overriddenList.includes(m);
                            const isSel = (selectedMachine === m || selectedMachine?.toLowerCase() === m.toLowerCase()) && !editingGroupId;
                            const syncDetail = g.machine_sync_details ? g.machine_sync_details[m] : null;
                            const isClientApplied = (isSel && machinePolicyData)
                              ? Boolean(machinePolicyData.applied_at && (!machinePolicyData.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at))
                              : (syncDetail ? syncDetail.isApplied : false);

                            return (
                              <div
                                key={m}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: isSel ? 'rgba(59,130,246,0.2)' : isOverridden ? 'rgba(245,158,11,.08)' : 'rgba(255,255,255,0.04)',
                                  border: isSel ? '1px solid var(--accent)' : isOverridden ? '1px solid rgba(245,158,11,.3)' : '1px solid var(--border)',
                                  color: isOverridden ? '#f59e0b' : '#dae2fd',
                                  fontFamily: 'var(--mono)',
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  borderRadius: '5px',
                                  fontWeight: 600
                                }}
                              >
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isOverridden ? '#f59e0b' : '#22c55e', display: 'inline-block' }}></span>
                                <span
                                  onClick={() => fetchMachinePolicy(m)}
                                  style={{ cursor: 'pointer', textDecoration: isSel ? 'underline' : 'none' }}
                                  title={`Click to edit policy for ${mName}`}
                                >
                                  {mName}
                                </span>
                                <span style={{ fontSize: '8px', opacity: 0.85, textTransform: 'uppercase', background: isOverridden ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)', color: isOverridden ? '#f59e0b' : '#22c55e', padding: '1px 3px', borderRadius: '2px' }}>
                                  {isOverridden ? 'OVR' : 'SYNC'}
                                </span>
                                {isClientApplied ? (
                                  <span title="Applied by client" style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>check_circle</span>
                                  </span>
                                ) : (
                                  <span title="Syncing..." style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>hourglass_top</span>
                                  </span>
                                )}
                                {!readOnly && isOverridden && (
                                  <button
                                    onClick={() => handleResetMachineOverride(g.id, m)}
                                    title="Reset to group policy (preserves local DLP)"
                                    style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0, fontSize: '11px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>restart_alt</span>
                                  </button>
                                )}
                                {!readOnly && (
                                  <button
                                    onClick={() => assignMachineToGroup(m, '')}
                                    title="Remove from group"
                                    style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: '10px', lineHeight: 1 }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {!readOnly && (
                          <select
                            onChange={(e) => {
                              if (e.target.value) assignMachineToGroup(e.target.value, g.id);
                              e.target.value = '';
                            }}
                            style={{
                              background: 'var(--bg)',
                              border: '1px dashed var(--border)',
                              color: 'var(--muted)',
                              fontFamily: 'var(--sans)',
                              fontSize: '10px',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              outline: 'none',
                              width: '100%'
                            }}
                          >
                            <option value="">+ Add machine to {g.name}...</option>
                            {machines.map(m => {
                              const mHost = m.name || m.hostname || m;
                              const mName = m.name || m.hostname || m.label || mHost;
                              if (!g.machines.includes(mHost)) {
                                return <option key={mHost} value={mHost}>{mName}</option>;
                              }
                              return null;
                            })}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ENDPOINTS Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#60a5fa' }}>devices</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px', fontWeight: 800 }}>
                ENDPOINTS ({filteredMachines.length})
              </span>
            </div>

            {filteredMachines.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '12px', textAlign: 'center', background: 'var(--surface2)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                {sidebarSearch ? 'No endpoints matching search' : 'No endpoints registered yet.'}
              </div>
            ) : (
              filteredMachines.map(m => {
                const mName = getMachineName(m);
                const isSelected = selectedMachine === mName && !editingGroupId;
                const mGroup = getMachineGroup(mName);
                const isOverridden = mGroup?.overridden_machines ? mGroup.overridden_machines.includes(mName) : false;
                
                // Live sync status
                const isCurrentMachine = (selectedMachine === mName || selectedMachine?.toLowerCase() === mName?.toLowerCase()) && machinePolicyData;
                const syncDetail = mGroup?.machine_sync_details ? mGroup.machine_sync_details[mName] : null;
                const isApplied = isCurrentMachine
                  ? Boolean(machinePolicyData.applied_at && (!machinePolicyData.updated_at || machinePolicyData.applied_at >= machinePolicyData.updated_at))
                  : (syncDetail ? syncDetail.isApplied : false);

                return (
                  <div
                    key={mName}
                    onClick={() => fetchMachinePolicy(mName)}
                    style={{
                      background: isSelected ? 'rgba(37,99,235,0.12)' : 'var(--surface2)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                      boxShadow: isSelected ? '0 0 14px rgba(37,99,235,0.2)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    {/* Top Row: Machine Name + Sync dot + Applied badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: isApplied ? '#22c55e' : '#f59e0b',
                          flexShrink: 0,
                          boxShadow: isApplied ? '0 0 6px #22c55e' : '0 0 6px #f59e0b'
                        }}></span>
                        <span style={{
                          fontFamily: 'var(--mono)',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: isSelected ? '#fff' : 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {mName}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {isApplied ? (
                          <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(34,197,94,0.15)', color: '#22c55e', padding: '1px 5px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>check_circle</span> Applied
                          </span>
                        ) : (
                          <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '1px 5px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>hourglass_top</span> Syncing
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Group tag + Policy source */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      {mGroup ? (
                        <span style={{ fontSize: '9px', color: '#c4b5fd', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', padding: '1px 5px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>folder</span> {mGroup.name}
                        </span>
                      ) : (
                        <span style={{ fontSize: '9px', color: 'var(--muted)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: '3px' }}>
                          No Group
                        </span>
                      )}

                      <div>
                        {isOverridden ? (
                          <span style={{ fontSize: '9px', fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', borderRadius: '3px' }}>
                            ⚡ Override
                          </span>
                        ) : mGroup ? (
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#60a5fa' }}>
                            Inherited
                          </span>
                        ) : (
                          <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                            Default
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </aside>

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

      {/* Group Policy Sync Strategy Modal */}
      {groupSyncModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: '20px' }}>
          <div style={{ background: 'var(--surface-solid, #1e293b)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '580px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>tune</span>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Group Policy Sync Strategy</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  Target Group: <strong style={{ color: '#a78bfa' }}>{groupSyncModal.groupName}</strong>
                </p>
              </div>
            </div>

            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', fontSize: '12px', color: 'var(--text)', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: '#f59e0b', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>info</span>
                {groupSyncModal.overriddenMachines.length} of {groupSyncModal.totalMachines} machines have custom policy overrides:
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#f59e0b', wordBreak: 'break-all' }}>
                {groupSyncModal.overriddenMachines.join(', ')}
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text)', margin: '0 0 16px', fontWeight: 600 }}>
              How would you like to apply this group policy update?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {/* Option 1: Preserve Overrides */}
              <div
                onClick={() => saveGroupPolicyWithStrategy(groupSyncModal.groupId, groupSyncModal.policy, false)}
                style={{
                  border: '1px solid rgba(167,139,250,0.4)',
                  background: 'rgba(167,139,250,0.06)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#a78bfa'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)'}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>shield</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>Preserve Overrides</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>RECOMMENDED</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    Updates in-sync machines. Overridden machines retain their custom settings, but <strong>additively inherit</strong> all group DLP folders. Local folders are never wiped.
                  </p>
                </div>
                <button
                  style={{
                    background: '#a78bfa',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    alignSelf: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Apply & Preserve
                </button>
              </div>

              {/* Option 2: Force Sync */}
              <div
                onClick={() => saveGroupPolicyWithStrategy(groupSyncModal.groupId, groupSyncModal.policy, true)}
                style={{
                  border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.05)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'flex-start'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#ef4444'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>sync_problem</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>Force Sync All Machines</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>OVERWRITE OVERRIDES</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    Aligns all {groupSyncModal.totalMachines} machines to this group policy. <strong>Machine-specific DLP folders are safely kept</strong> so endpoint local directories remain monitored.
                  </p>
                </div>
                <button
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    alignSelf: 'center',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Force Sync All
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setGroupSyncModal({ isOpen: false, groupId: null, groupName: '', overriddenMachines: [], totalMachines: 0, policy: null })}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
