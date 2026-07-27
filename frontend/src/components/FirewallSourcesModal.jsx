import React, { useState, useEffect } from 'react';
import { TIMEZONES } from '../utils/timezones';


export default function FirewallSourcesModal({ isOpen, onClose }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [tz, setTz] = useState('UTC');

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  const loadSources = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fw/sources');
      const data = await res.json();
      setSources(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Failed to load sources');
    }
    setLoading(false);
  };

  const addSource = async () => {
    setError('');
    if (!name.trim() || !path.trim()) {
      setError('Both name and file path are required.');
      return;
    }

    try {
      const res = await fetch('/api/fw/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, log_path: path, source_timezone: tz })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to add source.');
        return;
      }
      setName('');
      setPath('');
      loadSources();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleSource = async (id) => {
    try {
      await fetch(`/api/fw/sources/${id}/toggle`, { method: 'PATCH' });
      loadSources();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteSource = async (id) => {
    if (!window.confirm('Remove this log source?')) return;
    try {
      await fetch(`/api/fw/sources/${id}`, { method: 'DELETE' });
      loadSources();
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', 
          zIndex: 4000, backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} 
      />
      
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '800px', maxWidth: '95vw', background: 'var(--surface-solid)', border: '1px solid var(--border)',
        borderRadius: '12px', zIndex: 4001, overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
      }}>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', background: 'var(--surface-solid)', borderBottom: '1px solid var(--border)'
        }}>
          <div style={{ fontFamily: 'var(--sans)', fontSize: '16px', fontWeight: 700, color: 'var(--text)', letterSpacing: '0.5px' }}>
            Firewall Log Sources
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', transition: 'color 0.2s' }}
            onMouseOver={e => e.target.style.color = 'var(--text)'}
            onMouseOut={e => e.target.style.color = 'var(--muted)'}
          >
            &#x2715;
          </button>
        </div>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-solid)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '12px', fontWeight: 600 }}>
            ADD NEW SOURCE
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Firewall name  e.g. FortiGate-HQ"
              style={{
                flex: 1, minWidth: '160px', background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '13px',
                padding: '9px 12px', borderRadius: '8px', outline: 'none', transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <input 
              value={path} onChange={e => setPath(e.target.value)}
              placeholder="Log file path  e.g. /var/log/fortinet.log"
              style={{
                flex: 2, minWidth: '240px', background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '13px',
                padding: '9px 12px', borderRadius: '8px', outline: 'none', transition: 'border-color 0.2s'
              }}
              onFocus={e => e.target.style.borderColor = 'var(--accent)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <select 
              value={tz} onChange={e => setTz(e.target.value)}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                color: 'var(--text)', fontFamily: 'var(--sans)', fontSize: '13px',
                padding: '9px 12px', borderRadius: '8px', outline: 'none', transition: 'border-color 0.2s'
              }}
            >
              {Object.entries(TIMEZONES).map(([group, opts]) => (
                <optgroup key={group} label={group}>
                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))}
            </select>
            <button 
              onClick={addSource}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none', padding: '9px 20px',
                borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)', transition: 'all 0.2s'
              }}
              onMouseOver={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 16px rgba(37,99,235,0.4)'; }}
              onMouseOut={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 4px 12px rgba(37,99,235,0.3)'; }}
            >
              + Add &amp; Watch
            </button>
          </div>
          {error && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#f04f5a', fontWeight: 600, fontFamily: 'var(--mono)' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
          {loading ? (
            <div className="empty" style={{ padding: '24px' }}>Loading...</div>
          ) : sources.length === 0 ? (
            <div className="empty" style={{ padding: '28px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}></div>
              No sources yet. Add a firewall log file above.
            </div>
          ) : (
            <table className="mt" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface2)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}>Log File</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}>Ingested</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}>Last Read</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', textAlign: 'left' }}></th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => {
                  const age = s.last_read ? Math.floor((Date.now()/1000) - s.last_read) : null;
                  const ageStr = !age ? 'Never' : age < 60 ? age + 's ago' : age < 3600 ? Math.floor(age/60) + 'm ago' : Math.floor(age/3600) + 'h ago';
                  
                  return (
                    <tr 
                      key={s.id} 
                      style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(37,99,235,0.06)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text)', fontWeight: 700 }}>{s.name}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.log_path}>{s.log_path}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text)' }}>{(s.lines_ingested || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--muted)' }}>{ageStr}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span 
                          onClick={() => toggleSource(s.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                        >
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.enabled ? 'var(--low)' : 'var(--muted)' }} />
                          <span style={{ fontSize: '11px', color: s.enabled ? 'var(--low)' : 'var(--muted)' }}>
                            {s.enabled ? 'Watching' : 'Paused'}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button 
                          onClick={() => deleteSource(s.id)}
                          style={{
                            background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', color: '#f87171',
                            padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px'
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
