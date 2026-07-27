const fs = require('fs');

// 1. Update firewallController.js
let fwCode = fs.readFileSync('src/controllers/firewallController.js', 'utf8');

// Update getFirewallStats action
fwCode = fwCode.replace(/if \(action\) \{ conds\.push\(\`action=\\$\$\{pIdx\+\+\}\`\); p\.push\(action\); \}/, 
`if (action) {
      if (action === 'block') {
        conds.push(\`(action='block' OR action='deny' OR action='drop')\`);
      } else if (action === 'accept') {
        conds.push(\`(action='accept' OR action='allow' OR action='permit')\`);
      } else {
        conds.push(\`action=$${pIdx++}\`); p.push(action); 
      }
    }`);

// Update getTopology action and severity
fwCode = fwCode.replace(/const \{ \n      from =[^,]+,\n      to =[^,]+,\n      action, service, ip, device, aggregator\n    \} = req\.query;/,
`const { 
      from = new Date(Date.now() - 3600000).toISOString().slice(0, 19).replace('T', ' '),
      to = new Date().toISOString().slice(0, 19).replace('T', ' '),
      action, service, ip, device, severity, aggregator
    } = req.query;`);

fwCode = fwCode.replace(/if \(action\) \{ conds\.push\(\`action=\\$\$\{pIdx\+\+\}\`\); p\.push\(action\); \}/,
`if (action) {
      if (action === 'block') {
        conds.push(\`(action='block' OR action='deny' OR action='drop')\`);
      } else if (action === 'accept') {
        conds.push(\`(action='accept' OR action='allow' OR action='permit')\`);
      } else {
        conds.push(\`action=$${pIdx++}\`); p.push(action); 
      }
    }`);

fwCode = fwCode.replace(/if \(device\) \{ conds\.push\(\`devname=\\$\$\{pIdx\+\+\}\`\); p\.push\(device\); \}\n    if \(aggregator\) \{ conds\.push\(\`aggregator_name=\\$\$\{pIdx\+\+\}\`\); p\.push\(aggregator\); \}/,
`if (device) { conds.push(\`devname=$${pIdx++}\`); p.push(device); }
    if (severity) { conds.push(\`severity=$${pIdx++}\`); p.push(severity); }
    if (aggregator) { conds.push(\`aggregator_name=$${pIdx++}\`); p.push(aggregator); }`);

fs.writeFileSync('src/controllers/firewallController.js', fwCode);

// 2. Update FirewallTopology.jsx
let topCode = fs.readFileSync('../frontend/src/components/FirewallTopology.jsx', 'utf8');
topCode = topCode.replace(/export default function FirewallTopology\(\{ from, to, action, service, ip, device, onFlowSelect \}\)/, 
'export default function FirewallTopology({ from, to, action, service, ip, device, severity, aggregator, onFlowSelect })');
topCode = topCode.replace(/\} = req\.query;/, '} = req.query;'); // just a mock op if needed, but not in frontend

topCode = topCode.replace(/\[from, to, action, service, ip, device\]\);/, '[from, to, action, service, ip, device, severity, aggregator]);');
topCode = topCode.replace(/params: \{ from, to, action, service, ip, device \}/, 'params: { from, to, action, service, ip, device, severity, aggregator }');

fs.writeFileSync('../frontend/src/components/FirewallTopology.jsx', topCode);

console.log("Fixed!");
