import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function AssignDropdown({ incidentId, currentAssignee, allowedAssignees, onSuccess, showDisplayName = true }) {
  const [selected, setSelected] = useState(currentAssignee || '');
  const [isSaving, setIsSaving] = useState(false);

  // Sync if currentAssignee changes externally (e.g. Escalate button clicked)
  React.useEffect(() => {
    setSelected(currentAssignee || '');
  }, [currentAssignee]);

  // Ensure the current assignee always appears in the dropdown so the value is never misleading
  const options = useMemo(() => {
    if (!currentAssignee) return allowedAssignees;
    const exists = allowedAssignees.some(u => u.username === currentAssignee);
    if (exists) return allowedAssignees;
    return [{ username: currentAssignee, role: '—' }, ...allowedAssignees];
  }, [allowedAssignees, currentAssignee]);

  const handleChange = async (e) => {
    e.stopPropagation();
    const newValue = e.target.value;
    setSelected(newValue);
    
    setIsSaving(true);
    try {
      await axios.post(`/api/incidents/${incidentId}/assign`, { assignee: newValue });
      toast.success(`Assigned to ${newValue}`);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to assign incident');
      setSelected(currentAssignee || ''); // revert on error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
      <select 
        value={selected} 
        onChange={handleChange}
        disabled={isSaving}
        style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '4px 8px',
          fontSize: '11px',
          color: 'var(--text)',
          fontFamily: 'var(--sans)',
          outline: 'none',
          cursor: 'pointer',
          minWidth: '120px',
          opacity: isSaving ? 0.7 : 1
        }}
      >
        <option value="" disabled>Unassigned</option>
        {options.map(u => (
          <option key={u.username} value={u.username}>
            {`${u.username} (${u.role})`}
          </option>
        ))}
      </select>
    </div>
  );
}
