// ════════════════════════════════════════════════════════════════
// IOC Hunt — Threat Hunting & Threat Intelligence Controller
// ════════════════════════════════════════════════════════════════
// Handles Abuse.ch API key validation & AES-256 encryption,
// threat feed synchronization, indicator searches, and real-time
// matched threat logs across all 500+ endpoints and branch firewalls.
// ════════════════════════════════════════════════════════════════

const https = require('https');
const db = require('../config/db');
const { encryptText, decryptText } = require('../utils/cryptoHelper');
const { syncAllFeeds } = require('../workers/threatFeedWorker');
const { parseSafeInt } = require('../utils/inputValidator');

// Helper to query Abuse.ch ThreatFox API to verify key validity
function verifyThreatFoxKey(apiKey) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ query: 'tag_info', tag: 'cobaltstrike', limit: 1 });
    const options = {
      hostname: 'threatfox-api.abuse.ch',
      port: 443,
      path: '/api/v1/',
      method: 'POST',
      headers: {
        'User-Agent': 'IOCHunt-ThreatEngine/2.0',
        'Auth-Key': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          // ThreatFox returns query_status: 'ok' or 'no_result' on valid keys.
          // Invalid key returns query_status: 'illegal_api_key' or HTTP 403.
          if (res.statusCode === 200 && json.query_status !== 'illegal_api_key') {
            resolve({ valid: true });
          } else {
            resolve({ valid: false, error: json.query_status || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ valid: res.statusCode === 200, error: e.message });
        }
      });
    });

    req.on('error', (err) => resolve({ valid: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ valid: false, error: 'Connection to ThreatFox timed out' });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * GET /api/threat-hunting/status
 * Returns API key status, active feed counts, indicator stats, and matches today.
 */
exports.getStatus = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const qTenant = req.queryTenant || db.query.bind(db);

    // 1. Check settings table for ThreatFox key & config
    const settingsRes = await qControl('SELECT threat_intel_config FROM settings LIMIT 1');
    let config = {};
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].threat_intel_config) {
      try {
        config = JSON.parse(settingsRes.rows[0].threat_intel_config);
      } catch (_) {}
    }

    const hasKey = Boolean(config.encryptedApiKey || process.env.THREATFOX_API_KEY);
    const feeds = config.feeds || {
      threatfox: true,
      malwarebazaar: true,
      urlhaus: true
    };

    // 2. Indicator counts from threat_intel_iocs
    let totalIocs = 0;
    let ipCount = 0;
    let domainCount = 0;
    let hashCount = 0;
    let lastSeenMax = null;

    try {
      const statsRes = await qControl(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN ioc_type = 'ip' THEN 1 END) as ips,
          COUNT(CASE WHEN ioc_type = 'domain' THEN 1 END) as domains,
          COUNT(CASE WHEN ioc_type = 'sha256' THEN 1 END) as hashes,
          MAX(last_seen) as latest
        FROM threat_intel_iocs;
      `);
      if (statsRes.rows.length > 0) {
        totalIocs = parseInt(statsRes.rows[0].total, 10) || 0;
        ipCount = parseInt(statsRes.rows[0].ips, 10) || 0;
        domainCount = parseInt(statsRes.rows[0].domains, 10) || 0;
        hashCount = parseInt(statsRes.rows[0].hashes, 10) || 0;
        lastSeenMax = statsRes.rows[0].latest;
      }
    } catch (err) {
      console.warn('[ThreatHunting] Indicator stats query warning:', err.message);
    }

    // 3. Matched threats in the last 24 hours (fw_events + events)
    let matchesToday = 0;
    try {
      const [fwMatchRes, eventMatchRes] = await Promise.all([
        qTenant(`
          SELECT COUNT(*) as cnt FROM fw_events 
          WHERE ts >= NOW() - INTERVAL '24 hours' 
            AND (logdesc LIKE '%[THREAT DANGER]%' OR msg LIKE '%[THREAT DANGER]%')
        `),
        qTenant(`
          SELECT COUNT(*) as cnt FROM events 
          WHERE ts >= NOW() - INTERVAL '24 hours' 
            AND (tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')
        `)
      ]);
      matchesToday = (parseInt(fwMatchRes.rows[0]?.cnt, 10) || 0) + (parseInt(eventMatchRes.rows[0]?.cnt, 10) || 0);
    } catch (err) {
      console.warn('[ThreatHunting] Matches count warning:', err.message);
    }

    res.json({
      configured: hasKey,
      feeds,
      stats: {
        total_iocs: totalIocs,
        ips: ipCount,
        domains: domainCount,
        hashes: hashCount,
        matches_today: matchesToday
      },
      last_sync: lastSeenMax || config.lastSync || null
    });
  } catch (err) {
    console.error('[ThreatHunting] getStatus error:', err);
    res.status(500).json({ error: 'Failed to retrieve Threat Hunting status' });
  }
};

/**
 * POST /api/threat-hunting/config
 * Validates, encrypts with AES-256-GCM, and saves ThreatFox API key and feed settings.
 */
exports.saveConfig = async (req, res) => {
  try {
    const { apiKey, feeds } = req.body;
    const qControl = req.queryControlPlane || db.query.bind(db);

    const settingsRes = await qControl('SELECT threat_intel_config FROM settings LIMIT 1');
    let currentConfig = {};
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].threat_intel_config) {
      try {
        currentConfig = JSON.parse(settingsRes.rows[0].threat_intel_config);
      } catch (_) {}
    }

    let encryptedApiKey = currentConfig.encryptedApiKey || null;

    if (apiKey && apiKey.trim()) {
      const cleanKey = apiKey.trim();
      // Test key validity against ThreatFox API
      const verifyRes = await verifyThreatFoxKey(cleanKey);
      if (!verifyRes.valid) {
        return res.status(400).json({ 
          error: 'ThreatFox API Key validation failed. Please check your key at abuse.ch',
          details: verifyRes.error
        });
      }
      encryptedApiKey = encryptText(cleanKey);
    }

    if (!encryptedApiKey && !process.env.THREATFOX_API_KEY) {
      return res.status(400).json({ error: 'An Abuse.ch ThreatFox Auth-Key is required.' });
    }

    const updatedConfig = {
      ...currentConfig,
      encryptedApiKey,
      hasApiKey: true,
      feeds: feeds || currentConfig.feeds || { threatfox: true, malwarebazaar: true, urlhaus: true },
      updatedAt: new Date()
    };

    if (settingsRes.rows.length > 0) {
      await qControl('UPDATE settings SET threat_intel_config = $1', [JSON.stringify(updatedConfig)]);
    } else {
      await qControl('INSERT INTO settings (threat_intel_config) VALUES ($1)', [JSON.stringify(updatedConfig)]);
    }

    // Trigger immediate background sync
    syncAllFeeds().catch(err => console.error('[ThreatHunting] Triggered sync error:', err.message));

    res.json({
      ok: true,
      message: 'Threat Intelligence settings verified, encrypted, and saved. Feed synchronization started!'
    });
  } catch (err) {
    console.error('[ThreatHunting] saveConfig error:', err);
    res.status(500).json({ error: 'Failed to save Threat Hunting configuration' });
  }
};

/**
 * POST /api/threat-hunting/sync-now
 * Manually trigger full Threat Feed download, caching, and purge.
 */
exports.syncNow = async (req, res) => {
  try {
    syncAllFeeds().catch(err => console.error('[ThreatHunting] Manual sync error:', err.message));
    res.json({ ok: true, message: 'Threat Intelligence synchronization triggered successfully.' });
  } catch (err) {
    console.error('[ThreatHunting] syncNow error:', err);
    res.status(500).json({ error: 'Failed to start manual sync' });
  }
};

/**
 * GET /api/threat-hunting/matches
 * Fetches real-time threat detection events (from both fw_events and events)
 * where known malicious C2 IPs, domains, or malware hashes were matched.
 */
exports.getMatches = async (req, res) => {
  try {
    const qTenant = req.queryTenant || db.query.bind(db);
    const {
      search = '',
      type = 'all',
      aggregator = '',
      timeRange = '24h',
      page = 1,
      limit = 25
    } = req.query;

    const pageNum = Math.max(1, parseSafeInt(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseSafeInt(limit, 25)));
    const offset = (pageNum - 1) * limitNum;

    // Time boundary
    let intervalClause = "INTERVAL '24 hours'";
    if (timeRange === '7d') intervalClause = "INTERVAL '7 days'";
    if (timeRange === '30d') intervalClause = "INTERVAL '30 days'";
    if (timeRange === '60d') intervalClause = "INTERVAL '60 days'";

    // Build unified UNION query across fw_events and events
    // Columns: id, source_type, ts, aggregator_name, endpoint, src_ip, indicator, indicator_type, severity, details
    const params = [];
    let pIdx = 1;

    let fwConds = [
      `ts >= NOW() - ${intervalClause}`,
      `(logdesc LIKE '%[THREAT DANGER]%' OR msg LIKE '%[THREAT DANGER]%')`
    ];

    let evConds = [
      `ts >= NOW() - ${intervalClause}`,
      `(tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')`
    ];

    if (aggregator && aggregator.trim()) {
      fwConds.push(`aggregator_name = $${pIdx}`);
      evConds.push(`aggregator_name = $${pIdx}`);
      params.push(aggregator.trim());
      pIdx++;
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      fwConds.push(`(src_ip ILIKE $${pIdx} OR dst_ip ILIKE $${pIdx} OR cfgobj ILIKE $${pIdx} OR devname ILIKE $${pIdx} OR msg ILIKE $${pIdx})`);
      evConds.push(`(machine ILIKE $${pIdx} OR message ILIKE $${pIdx} OR tag ILIKE $${pIdx})`);
      params.push(term);
      pIdx++;
    }

    const fwQuery = `
      SELECT 
        id, 
        'firewall' AS source_type, 
        ts, 
        aggregator_name, 
        COALESCE(NULLIF(devname, ''), 'Firewall') AS endpoint, 
        src_ip, 
        COALESCE(NULLIF(dst_ip, ''), cfgobj) AS indicator, 
        CASE 
          WHEN cfgobj IS NOT NULL AND cfgobj != '' THEN 'domain'
          ELSE 'ip'
        END AS indicator_type, 
        severity, 
        COALESCE(NULLIF(logdesc, ''), msg) AS details
      FROM fw_events
      WHERE ${fwConds.join(' AND ')}
    `;

    const evQuery = `
      SELECT 
        id, 
        'endpoint' AS source_type, 
        ts, 
        aggregator_name, 
        COALESCE(NULLIF(machine, ''), 'Endpoint') AS endpoint, 
        'local' AS src_ip, 
        COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator, 
        'sha256' AS indicator_type, 
        severity, 
        message AS details
      FROM events
      WHERE ${evConds.join(' AND ')}
    `;

    // Filter by type if requested
    let combinedQuery = '';
    if (type === 'ip' || type === 'domain') {
      combinedQuery = fwQuery;
    } else if (type === 'sha256') {
      combinedQuery = evQuery;
    } else {
      combinedQuery = `(${fwQuery}) UNION ALL (${evQuery})`;
    }

    // Total Count
    const countSql = `SELECT COUNT(*) AS total FROM (${combinedQuery}) AS combined`;
    const countRes = await qTenant(countSql, params);
    const total = parseInt(countRes.rows[0]?.total, 10) || 0;

    // Data query with ordering & pagination
    const dataSql = `
      SELECT * FROM (${combinedQuery}) AS combined 
      ORDER BY ts DESC 
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limitNum, offset);

    const dataRes = await qTenant(dataSql, params);

    res.json({
      matches: dataRes.rows,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('[ThreatHunting] getMatches error:', err);
    res.status(500).json({ error: 'Failed to retrieve threat matches' });
  }
};

/**
 * GET /api/threat-hunting/indicators
 * Paginated list of threat indicators ingested into the platform database.
 */
exports.getIndicators = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const {
      search = '',
      type = 'all',
      source = 'all',
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseSafeInt(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseSafeInt(limit, 50)));
    const offset = (pageNum - 1) * limitNum;

    const conds = ['1=1'];
    const params = [];
    let pIdx = 1;

    if (search && search.trim()) {
      conds.push(`(ioc_value ILIKE $${pIdx} OR malware_family ILIKE $${pIdx})`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    if (type && type !== 'all') {
      conds.push(`ioc_type = $${pIdx++}`);
      params.push(type.trim());
    }

    if (source && source !== 'all') {
      conds.push(`source_feed = $${pIdx++}`);
      params.push(source.trim());
    }

    const whereClause = conds.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM threat_intel_iocs WHERE ${whereClause}`;
    const countRes = await qControl(countSql, params);
    const total = parseInt(countRes.rows[0]?.total, 10) || 0;

    const dataSql = `
      SELECT id, ioc_type, ioc_value, malware_family, source_feed, source_feed AS source, 100 AS confidence_level, first_seen, last_seen
      FROM threat_intel_iocs
      WHERE ${whereClause}
      ORDER BY last_seen DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limitNum, offset);

    const dataRes = await qControl(dataSql, params);

    res.json({
      indicators: dataRes.rows,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('[ThreatHunting] getIndicators error:', err);
    res.status(500).json({ error: 'Failed to retrieve threat indicators' });
  }
};
