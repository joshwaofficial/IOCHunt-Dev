const fs = require('fs');

let code = fs.readFileSync('src/controllers/firewallController.js', 'utf8');

// Update getTopology
code = code.replace(/device \\n    \} = req\.query;/g, 'device, aggregator\n    } = req.query;');
code = code.replace(/if \(device\) \{ conds\.push\(\`devname=\\$\$\{pIdx\+\+\}\`\); p\.push\(device\); \}/g, "if (device) { conds.push(`devname=$${pIdx++}`); p.push(device); }\n    if (aggregator) { conds.push(`aggregator_name=$${pIdx++}`); p.push(aggregator); }");

// Update getDevices
code = code.replace(/exports\.getDevices = async \(req, res\) => \{\n  try \{\n    const rowsRes = await db\.query\(\n      'SELECT devname, COUNT\(\*\) AS c FROM fw_events GROUP BY devname ORDER BY c DESC LIMIT 50'\n    \);\n    res\.json\(rowsRes\.rows\.map\(r => r\.devname\)\);\n  \} catch \(e\) \{\n    res\.status\(500\)\.json\(\{ error: e\.message \}\);\n  \}\n\};/g, 
`exports.getDevices = async (req, res) => {
  try {
    const { aggregator } = req.query;
    let query = 'SELECT devname, COUNT(*) AS c FROM fw_events GROUP BY devname ORDER BY c DESC LIMIT 50';
    let p = [];
    if (aggregator) {
      query = 'SELECT devname, COUNT(*) AS c FROM fw_events WHERE aggregator_name=$1 GROUP BY devname ORDER BY c DESC LIMIT 50';
      p.push(aggregator);
    }
    const rowsRes = await db.query(query, p);
    res.json(rowsRes.rows.map(r => r.devname));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};`);

// Update getLiveEvents
code = code.replace(/const \{ last_id = 0, limit = 50 \} = req\.query;/g, 'const { last_id = 0, limit = 50, aggregator } = req.query;');
code = code.replace(/const rowsRes = await db\.query\(\`SELECT \* FROM fw_events WHERE id > \\\$1 ORDER BY id ASC LIMIT \\\$2\`, \[Number\(last_id\), Number\(limit\)\]\);/g, 
`let query = \`SELECT * FROM fw_events WHERE id > $1 ORDER BY id ASC LIMIT $2\`;
    let p = [Number(last_id), Number(limit)];
    if (aggregator) {
      query = \`SELECT * FROM fw_events WHERE id > $1 AND aggregator_name=$3 ORDER BY id ASC LIMIT $2\`;
      p.push(aggregator);
    }
    const rowsRes = await db.query(query, p);`);

// Update getSecurityAlerts
code = code.replace(/device, severity, limit = 50/g, 'device, severity, aggregator, limit = 50');
code = code.replace(/if \(severity\) \{ conds\.push\(\`severity=\\$\$\{pIdx\+\+\}\`\); p\.push\(severity\); \}/g, "if (severity) { conds.push(`severity=$${pIdx++}`); p.push(severity); }\n    if (aggregator) { conds.push(`aggregator_name=$${pIdx++}`); p.push(aggregator); }");


fs.writeFileSync('src/controllers/firewallController.js', code);
console.log("Backend updated.");
