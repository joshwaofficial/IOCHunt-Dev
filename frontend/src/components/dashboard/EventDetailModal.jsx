import React from 'react';
import ReactDOM from 'react-dom';

export default function EventDetailModal({ event, onClose }) {
  if (!event) return null;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '92vw', maxWidth: '800px', maxHeight: '88vh', background: 'var(--surface-solid)',
        border: '1px solid var(--border)', borderRadius: '12px', zIndex: 10000,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(90deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0) 100%)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Event Details
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>
            &#x2715;
          </button>
        </div>
        
        <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0 24px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
          {Object.keys(event).map((key) => {
            let val = event[key];
            if (val === null || val === undefined) val = '';
            let color = 'var(--text)';
            
            if (key === 'severity') {
               const sev = String(val).toLowerCase();
               if (sev === 'critical') color = '#ef4444';
               else if (sev === 'high') color = '#f97316';
               else if (sev === 'medium') color = '#eab308';
               else if (sev === 'low') color = '#3b82f6';
               val = String(val).toUpperCase();
            }
            
            return (
              <React.Fragment key={key}>
                <div style={{ fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 0', borderBottom: '1px solid var(--surface3)', display: 'flex', alignItems: 'center' }}>
                  {key}
                </div>
                <div style={{ padding: '12px 0', borderBottom: '1px solid var(--surface3)', color: color, wordBreak: 'break-all', display: 'flex', alignItems: 'center' }}>
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </div>
              </React.Fragment>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}
