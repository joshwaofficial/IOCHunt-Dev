import React from 'react';

export default function PremiumCard({ value, label, color, icon, subtitle }) {
  const num = Number(value);
  const displayVal = !isNaN(num) && typeof value === 'number' ? num.toLocaleString() : (value ?? 0);

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
        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginTop: '4px' }}>
          {label}
        </span>
      </div>
      
      <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.5px' }}>
        {value}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
        <span style={{ 
          width: '6px', height: '6px', 
          borderRadius: '50%', 
          background: color
        }} />
        <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.2px' }}>
          {subtitle}
        </span>
      </div>
    </div>
  );
}
