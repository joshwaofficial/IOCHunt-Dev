const fs = require('fs');

const cardComponent = `
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
            background: \\\`\\\${\\color}1A\\\`, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', 
            color: color
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
          </div>
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'var(--mono)', marginTop: '4px' }}>{label}</span>
        </div>
        
        <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--text)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: 'auto' }}>
          <span style={{ 
            width: '6px', height: '6px', 
            borderRadius: '50%', 
            background: color
          }}></span>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.2px' }}>{subtitle}</span>
        </div>
      </div>
    );
  };
`;

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const processFile = (path, gridHtml, findString) => {
  let content = fs.readFileSync(path, 'utf8');
  if (!content.includes('PremiumCard =')) {
    content = content.replace("export default function", cardComponent.replace(/\\\\color/g, "color") + "\nexport default function");
  }
  
  if (!content.includes('<PremiumCard value={serverStats.total || 0}')) {
    content = content.replace(new RegExp(escapeRegExp(findString)), findString + "\\n" + gridHtml);
  }
  fs.writeFileSync(path, content);
};

// MaliciousActivity
const malGrid = \`
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard value={serverStats.total || 0} label="Total Events" color="#3b82f6" icon="shield" subtitle="Active tracking" />
        <PremiumCard value={serverStats.critical || 0} label="Critical" color="#f04f5a" icon="warning" subtitle="Action required" />
        <PremiumCard value={serverStats.high || 0} label="High" color="#f97316" icon="error" subtitle="Elevated risk" />
        <PremiumCard value={[...new Set(displayedData.map(d => d.category))].filter(Boolean).length} label="Categories" color="#eab308" icon="category" subtitle="Unique vectors" />
        <PremiumCard value={availableMachines.length || [...new Set(displayedData.map(d => d.target_machine || d.machine))].filter(Boolean).length} label="Machines" color="#a855f7" icon="computer" subtitle="Affected hosts" />
      </div>
\`;
processFile('src/pages/MaliciousActivity.jsx', malGrid, "<div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }}></div>\\n              </div>");

// AdAttacks
const adGrid = \`
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard value={serverStats.total || 0} label="Total Events" color="#3b82f6" icon="shield" subtitle="Active tracking" />
        <PremiumCard value={serverStats.critical || 0} label="Critical" color="#f04f5a" icon="warning" subtitle="Action required" />
        <PremiumCard value={serverStats.high || 0} label="High" color="#f97316" icon="error" subtitle="Elevated risk" />
        <PremiumCard value={[...new Set(displayedData.map(d => d.type))].filter(Boolean).length} label="Attack Types" color="#eab308" icon="key" subtitle="Unique vectors" />
        <PremiumCard value={availableMachines.length || [...new Set(displayedData.map(d => d.target_machine || d.machine))].filter(Boolean).length} label="Machines" color="#a855f7" icon="computer" subtitle="Affected hosts" />
      </div>
\`;
processFile('src/pages/AdAttacks.jsx', adGrid, "        </select>\\n      </div>");

// UserAccounts
const usrGrid = \`
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <PremiumCard value={serverStats.total || 0} label="Total Events" color="#3b82f6" icon="group" subtitle="Active tracking" />
        <PremiumCard value={serverStats.critical || 0} label="Critical" color="#f04f5a" icon="warning" subtitle="Action required" />
        <PremiumCard value={serverStats.high || 0} label="High" color="#f97316" icon="error" subtitle="Elevated risk" />
        <PremiumCard value={[...new Set(displayedData.map(d => d.actor))].filter(Boolean).length} label="Actors" color="#f97316" icon="person_search" subtitle="Unique actors" />
        <PremiumCard value={availableMachines.length || [...new Set(displayedData.map(d => d.target_machine || d.machine))].filter(Boolean).length} label="Machines" color="#a855f7" icon="computer" subtitle="Affected hosts" />
      </div>
\`;
processFile('src/pages/UserAccounts.jsx', usrGrid, "        </select>\\n      </div>");
