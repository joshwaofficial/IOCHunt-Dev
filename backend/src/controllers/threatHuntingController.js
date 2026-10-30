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

    // 3. Matched threats in specified telemetry window (fw_events + events)
    const timeRange = req.query.timeRange || '7d';
    let intervalClause = "INTERVAL '7 days'";
    if (timeRange === '24h') intervalClause = "INTERVAL '24 hours'";
    if (timeRange === '14d') intervalClause = "INTERVAL '14 days'";
    if (timeRange === '30d') intervalClause = "INTERVAL '30 days'";
    if (timeRange === '60d') intervalClause = "INTERVAL '60 days'";

    let matchesCount = 0;
    try {
      const [fwMatchRes, eventMatchRes] = await Promise.all([
        qTenant(`
          SELECT COUNT(*) as cnt FROM fw_events 
          WHERE ts >= NOW() - ${intervalClause} 
            AND (logdesc LIKE '%[THREAT DANGER]%' OR msg LIKE '%[THREAT DANGER]%')
        `),
        qTenant(`
          SELECT COUNT(*) as cnt FROM events 
          WHERE ts >= NOW() - ${intervalClause} 
            AND (tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')
        `)
      ]);
      matchesCount = (parseInt(fwMatchRes.rows[0]?.cnt, 10) || 0) + (parseInt(eventMatchRes.rows[0]?.cnt, 10) || 0);
    } catch (err) {
      console.warn('[ThreatHunting] Matches count warning:', err.message);
    }

    // 4. Retrohunt back-tested matches persisted in database
    let retrohuntMatchesCount = 0;
    let lastRetrohuntAt = null;
    try {
      const retroCountRes = await qTenant('SELECT COUNT(*) as cnt, MAX(discovered_at) as latest FROM threat_retrohunt_matches');
      if (retroCountRes.rows.length > 0) {
        retrohuntMatchesCount = parseInt(retroCountRes.rows[0]?.cnt, 10) || 0;
        lastRetrohuntAt = retroCountRes.rows[0]?.latest || null;
      }
    } catch (_) {}

    const retrohuntSchedule = config.retrohunt_schedule || {
      enabled: true,
      frequency: 'daily',
      runTime: '08:00',
      lookbackWindow: '7d',
      lastRunAt: lastRetrohuntAt
    };

    res.json({
      configured: hasKey,
      feeds,
      stats: {
        total_iocs: totalIocs,
        ips: ipCount,
        domains: domainCount,
        hashes: hashCount,
        matches_today: matchesCount,
        matches_count: matchesCount,
        time_range: timeRange,
        retrohunt_matches: retrohuntMatchesCount,
        last_retrohunt_at: lastRetrohuntAt
      },
      retrohunt_schedule: retrohuntSchedule,
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
    const qControl = req.queryControlPlane || db.query.bind(db);
    const {
      search = '',
      type = 'all',
      aggregator = '',
      severity = 'all',
      sourceType = 'all',
      timeRange = '24h',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseSafeInt(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseSafeInt(limit, 20)));
    const offset = (pageNum - 1) * limitNum;

    // Time boundary
    let intervalClause = "INTERVAL '24 hours'";
    if (timeRange === '7d') intervalClause = "INTERVAL '7 days'";
    if (timeRange === '30d') intervalClause = "INTERVAL '30 days'";
    if (timeRange === '60d') intervalClause = "INTERVAL '60 days'";

    const fwConds = [
      `ts >= NOW() - ${intervalClause}`,
      `(logdesc LIKE '%[THREAT DANGER]%' OR msg LIKE '%[THREAT DANGER]%')`
    ];
    const evConds = [
      `ts >= NOW() - ${intervalClause}`,
      `(tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')`
    ];

    const fwParams = [];
    const evParams = [];
    let fwIdx = 1;
    let evIdx = 1;

    // Safely load whitelist entries in memory without breaking queries if table is empty or does not exist
    try {
      const wlRes = await qControl('SELECT ioc_type, ioc_value FROM threat_intel_whitelist');
      const whitelistedIps = [];
      const whitelistedDomains = [];
      for (const row of (wlRes.rows || [])) {
        if (row.ioc_type === 'ip' && row.ioc_value) whitelistedIps.push(row.ioc_value.trim());
        if (row.ioc_type === 'domain' && row.ioc_value) whitelistedDomains.push(row.ioc_value.trim().toLowerCase());
      }
      if (whitelistedIps.length > 0) {
        fwConds.push(`NOT (dst_ip = ANY($${fwIdx++}::varchar[]))`);
        fwParams.push(whitelistedIps);
      }
      if (whitelistedDomains.length > 0) {
        fwConds.push(`NOT (LOWER(cfgobj) = ANY($${fwIdx++}::varchar[]))`);
        fwParams.push(whitelistedDomains);
      }
    } catch (_) {
      // Safe fallback if whitelist table does not exist yet
    }

    if (severity && severity !== 'all') {
      fwConds.push(`severity ILIKE $${fwIdx++}`);
      fwParams.push(`%${severity.trim()}%`);
      evConds.push(`severity ILIKE $${evIdx++}`);
      evParams.push(`%${severity.trim()}%`);
    }

    if (aggregator && aggregator.trim()) {
      fwConds.push(`aggregator_name = $${fwIdx++}`);
      fwParams.push(aggregator.trim());
      evConds.push(`aggregator_name = $${evIdx++}`);
      evParams.push(aggregator.trim());
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      fwConds.push(`(src_ip ILIKE $${fwIdx} OR dst_ip ILIKE $${fwIdx} OR cfgobj ILIKE $${fwIdx} OR devname ILIKE $${fwIdx} OR msg ILIKE $${fwIdx})`);
      fwParams.push(term);
      fwIdx++;

      evConds.push(`(machine ILIKE $${evIdx} OR message ILIKE $${evIdx} OR tag ILIKE $${evIdx})`);
      evParams.push(term);
      evIdx++;
    }

    let allMatches = [];
    let total = 0;

    if (type === 'sha256' || sourceType === 'endpoint') {
      // Query events only
      const countRes = await qTenant(`SELECT COUNT(*) AS total FROM events WHERE ${evConds.join(' AND ')}`, evParams).catch(() => ({ rows: [{ total: 0 }] }));
      total = parseInt(countRes.rows[0]?.total, 10) || 0;

      const dataQuery = `
        SELECT 
          id, 'endpoint' AS source_type, ts, aggregator_name,
          COALESCE(NULLIF(machine, ''), 'Endpoint') AS endpoint,
          'local' AS src_ip,
          COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator,
          'sha256' AS indicator_type,
          severity,
          message AS details,
          'blocked' AS action,
          '' AS proto,
          'Execution' AS service,
          0 AS dst_port,
          0 AS src_port,
          tag AS policy
        FROM events
        WHERE ${evConds.join(' AND ')}
        ORDER BY ts DESC
        LIMIT $${evIdx++} OFFSET $${evIdx++}
      `;
      const dataRes = await qTenant(dataQuery, [...evParams, limitNum, offset]).catch(() => ({ rows: [] }));
      allMatches = dataRes.rows || [];
    } else if (type === 'ip' || type === 'domain' || sourceType === 'firewall') {
      // Query fw_events only
      let typeCond = '';
      if (type === 'domain') {
        typeCond = " AND ((cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$') OR (logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' AND SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)') ~* '[a-zA-Z]'))";
      } else if (type === 'ip') {
        typeCond = " AND NOT ((cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$') OR (logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' AND SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)') ~* '[a-zA-Z]'))";
      }

      const countRes = await qTenant(`SELECT COUNT(*) AS total FROM fw_events WHERE ${fwConds.join(' AND ')}${typeCond}`, fwParams).catch(() => ({ rows: [{ total: 0 }] }));
      total = parseInt(countRes.rows[0]?.total, 10) || 0;

      const dataQuery = `
        SELECT 
          id, 'firewall' AS source_type, ts, aggregator_name,
          COALESCE(NULLIF(devname, ''), 'Firewall') AS endpoint,
          src_ip,
          dst_ip,
          CASE 
            WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
              THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
            WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
            ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
          END AS indicator,
          CASE 
            WHEN (
              CASE 
                WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
                  THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
                WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
                ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
              END
            ) ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?$' THEN 'ip'
            WHEN (
              CASE 
                WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
                  THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
                WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
                ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
              END
            ) ~* '[a-zA-Z]' THEN 'domain'
            ELSE 'ip'
          END AS indicator_type,
          severity,
          COALESCE(NULLIF(logdesc, ''), msg, 'Threat connection detected') AS details,
          COALESCE(NULLIF(action, ''), 'blocked') AS action,
          COALESCE(NULLIF(proto, ''), 'TCP') AS proto,
          COALESCE(NULLIF(service, ''), '') AS service,
          COALESCE(dst_port, 0) AS dst_port,
          COALESCE(src_port, 0) AS src_port,
          COALESCE(NULLIF(policy, ''), '') AS policy
        FROM fw_events
        WHERE ${fwConds.join(' AND ')}${typeCond}
        ORDER BY ts DESC
        LIMIT $${fwIdx++} OFFSET $${fwIdx++}
      `;
      const dataRes = await qTenant(dataQuery, [...fwParams, limitNum, offset]).catch(() => ({ rows: [] }));
      allMatches = dataRes.rows || [];
    } else {
      // 'all': Query both safely and combine
      const [fwCountRes, evCountRes] = await Promise.all([
        qTenant(`SELECT COUNT(*) AS total FROM fw_events WHERE ${fwConds.join(' AND ')}`, fwParams).catch(() => ({ rows: [{ total: 0 }] })),
        qTenant(`SELECT COUNT(*) AS total FROM events WHERE ${evConds.join(' AND ')}`, evParams).catch(() => ({ rows: [{ total: 0 }] }))
      ]);

      const fwTotal = parseInt(fwCountRes.rows[0]?.total, 10) || 0;
      const evTotal = parseInt(evCountRes.rows[0]?.total, 10) || 0;
      total = fwTotal + evTotal;

      const [fwDataRes, evDataRes] = await Promise.all([
        qTenant(`
          SELECT 
            id, 'firewall' AS source_type, ts, aggregator_name,
            COALESCE(NULLIF(devname, ''), 'Firewall') AS endpoint,
            src_ip,
            dst_ip,
            CASE 
              WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
                THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
              WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
              ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
            END AS indicator,
            CASE 
              WHEN (
                CASE 
                  WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
                    THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
                  WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
                  ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
                END
              ) ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?$' THEN 'ip'
              WHEN (
                CASE 
                  WHEN logdesc LIKE '%[THREAT DANGER] Matched Known Threat: %' 
                    THEN SUBSTRING(logdesc FROM '\\[THREAT DANGER\\] Matched Known Threat: ([^ ]+)')
                  WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj
                  ELSE COALESCE(NULLIF(dst_ip, ''), 'THREAT')
                END
              ) ~* '[a-zA-Z]' THEN 'domain'
              ELSE 'ip'
            END AS indicator_type,
            severity,
            COALESCE(NULLIF(logdesc, ''), msg, 'Threat connection detected') AS details,
            COALESCE(NULLIF(action, ''), 'blocked') AS action,
            COALESCE(NULLIF(proto, ''), 'TCP') AS proto,
            COALESCE(NULLIF(service, ''), '') AS service,
            COALESCE(dst_port, 0) AS dst_port,
            COALESCE(src_port, 0) AS src_port,
            COALESCE(NULLIF(policy, ''), '') AS policy
          FROM fw_events
          WHERE ${fwConds.join(' AND ')}
          ORDER BY ts DESC
          LIMIT $${fwIdx++} OFFSET $${fwIdx++}
        `, [...fwParams, limitNum, offset]).catch(e => { console.warn('[ThreatHunting] fw_events query err:', e.message); return { rows: [] }; }),
        qTenant(`
          SELECT 
            id, 'endpoint' AS source_type, ts, aggregator_name,
            COALESCE(NULLIF(machine, ''), 'Endpoint') AS endpoint,
            'local' AS src_ip,
            '' AS dst_ip,
            COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator,
            'sha256' AS indicator_type,
            severity,
            message AS details,
            'blocked' AS action,
            '' AS proto,
            'Execution' AS service,
            0 AS dst_port,
            0 AS src_port,
            tag AS policy
          FROM events
          WHERE ${evConds.join(' AND ')}
          ORDER BY ts DESC
          LIMIT $${evIdx++} OFFSET $${evIdx++}
        `, [...evParams, limitNum, offset]).catch(e => { console.warn('[ThreatHunting] events query err:', e.message); return { rows: [] }; })
      ]);

      const combined = [...(fwDataRes.rows || []), ...(evDataRes.rows || [])];
      combined.sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
      allMatches = combined.slice(0, limitNum);
    }

    // Enrich all matches with threat intelligence metadata (malware_family, source_feed, confidence)
    const indicatorsList = Array.from(new Set(allMatches.map(m => (m.indicator || '').trim().toLowerCase()).filter(Boolean)));
    let intelMap = new Map();
    if (indicatorsList.length > 0) {
      try {
        const intelRes = await qControl(`
          SELECT LOWER(ioc_value) as ioc_value, threat_type, malware_family, source_feed, confidence_level 
          FROM threat_intel_iocs 
          WHERE LOWER(ioc_value) = ANY($1::varchar[])
        `, [indicatorsList]);
        for (const row of (intelRes.rows || [])) {
          intelMap.set(row.ioc_value, row);
        }
      } catch (_) {}
    }

    allMatches = allMatches.map(m => {
      const intel = intelMap.get((m.indicator || '').trim().toLowerCase()) || {};
      return {
        ...m,
        malware_family: intel.malware_family || (m.indicator_type === 'domain' ? 'Malicious Domain' : m.indicator_type === 'sha256' ? 'Malware Binary' : 'Malicious C2'),
        source_feed: intel.source_feed || (m.indicator_type === 'domain' ? 'URLhaus' : m.indicator_type === 'sha256' ? 'MalwareBazaar' : 'ThreatFox'),
        confidence_level: intel.confidence_level || 100
      };
    });

    res.json({
      matches: allMatches,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('[ThreatHunting] getMatches fatal error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to retrieve threat matches', details: err.message });
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
      status = 'all',
      confidence = 'all',
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseSafeInt(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseSafeInt(limit, 50)));
    const offset = (pageNum - 1) * limitNum;

    const conds = ['1=1'];
    const params = [];
    let pIdx = 1;

    const cleanSearch = (search || '').trim().replace(/%/g, '');
    let isNumericSearch = false;
    let numericSearchVal = null;
    if (cleanSearch && /^\d+$/.test(cleanSearch)) {
      const num = parseInt(cleanSearch, 10);
      if (num >= 0 && num <= 100) {
        isNumericSearch = true;
        numericSearchVal = num;
      }
    }

    if (cleanSearch) {
      if (isNumericSearch) {
        conds.push(`(ioc_value ILIKE $${pIdx} OR malware_family ILIKE $${pIdx} OR COALESCE(confidence_level, 100) = $${pIdx + 1})`);
        params.push(`%${cleanSearch}%`, numericSearchVal);
        pIdx += 2;
      } else {
        conds.push(`(ioc_value ILIKE $${pIdx} OR malware_family ILIKE $${pIdx})`);
        params.push(`%${cleanSearch}%`);
        pIdx++;
      }
    }

    if (type && type !== 'all') {
      conds.push(`ioc_type = $${pIdx++}`);
      params.push(type.trim());
    }

    if (source && source !== 'all') {
      conds.push(`source_feed = $${pIdx++}`);
      params.push(source.trim());
    }

    if (status && status !== 'all') {
      if (status === 'online') {
        conds.push(`status IN ('online', 'active')`);
      } else if (status === 'offline') {
        conds.push(`status = 'offline'`);
      } else {
        conds.push(`status = $${pIdx++}`);
        params.push(status.trim());
      }
    }

    if (confidence === '100') {
      conds.push(`COALESCE(confidence_level, 100) = 100`);
    } else if (confidence === 'high') {
      conds.push(`COALESCE(confidence_level, 100) >= 90`);
    } else if (confidence === 'medium' || confidence === '75') {
      conds.push(`COALESCE(confidence_level, 100) >= 70 AND COALESCE(confidence_level, 100) < 90`);
    } else if (confidence === 'low' || confidence === '50') {
      conds.push(`COALESCE(confidence_level, 100) <= 50`);
    }

    const whereClause = conds.join(' AND ');

    const countSql = `SELECT COUNT(*) AS total FROM threat_intel_iocs WHERE ${whereClause}`;
    const countRes = await qControl(countSql, params);
    const total = parseInt(countRes.rows[0]?.total, 10) || 0;

    const dataSql = `
      SELECT id, ioc_type, ioc_value, malware_family, source_feed, source_feed AS source, 
             COALESCE(confidence_level, 100) AS confidence_level,
             COALESCE(status, 'online') AS status,
             first_seen, last_seen
      FROM threat_intel_iocs
      WHERE ${whereClause}
      ORDER BY 
        ${isNumericSearch ? `(CASE WHEN COALESCE(confidence_level, 100) = ${numericSearchVal} THEN 0 ELSE 1 END) ASC,` : ''}
        (CASE WHEN status IN ('online', 'active') THEN 0 ELSE 1 END) ASC,
        id DESC
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

/**
 * Helper to execute retroactive threat hunting logic across all threat intelligence indicators.
 * Scans ALL indicators (online, active, and offline indicators — 17,386+).
 * Automatically persists discovered hits permanently into threat_retrohunt_matches table.
 */
async function performRetrohunt({ qControl, qTenant, timeRange = '7d', limit = 100000 }) {
  // Lookback window: ONLY 7d, 14d, 30d, all (24h is intentionally omitted)
  let intervalClause = "INTERVAL '7 days'";
  if (timeRange === '14d') intervalClause = "INTERVAL '14 days'";
  if (timeRange === '30d') intervalClause = "INTERVAL '30 days'";
  if (timeRange === 'all') intervalClause = "INTERVAL '90 days'";

  // Safely collect whitelisted IOCs in memory
  const whitelistedSet = new Set();
  try {
    const wlRes = await qControl('SELECT ioc_type, ioc_value FROM threat_intel_whitelist');
    for (const row of (wlRes.rows || [])) {
      whitelistedSet.add(`${row.ioc_type}:${(row.ioc_value || '').toLowerCase().trim()}`);
    }
  } catch (_) {}

  // 1. Fetch threat indicators — scans ALL indicators (online, active, and offline C2s up to 100,000)
  const scanLimit = Math.min(100000, Math.max(100, parseInt(limit, 10) || 100000));
  const iocRes = await qControl(`
    SELECT ioc_type, ioc_value, malware_family, source_feed, confidence_level
    FROM threat_intel_iocs
    ORDER BY last_seen DESC
    LIMIT $1
  `, [scanLimit]);

  const allIocs = iocRes.rows || [];
  const iocs = allIocs.filter(ioc => !whitelistedSet.has(`${ioc.ioc_type}:${ioc.ioc_value.toLowerCase().trim()}`));

  if (iocs.length === 0) {
    return {
      scanned_iocs: 0,
      time_range: timeRange,
      new_hits_found: 0,
      total_persisted: 0,
      matches: []
    };
  }

  const ipList = iocs.filter(r => r.ioc_type === 'ip').map(r => r.ioc_value);
  const domainList = iocs.filter(r => r.ioc_type === 'domain').map(r => r.ioc_value.toLowerCase());
  const hashList = iocs.filter(r => r.ioc_type === 'sha256').map(r => r.ioc_value.toLowerCase());

  const iocLookup = new Map();
  for (const ioc of iocs) {
    iocLookup.set(`${ioc.ioc_type}:${ioc.ioc_value.toLowerCase()}`, ioc);
  }

  const retroHits = [];

  // 2. Query historical fw_events for matching IPs (Method 1: Unflagged stealth connections)
  if (ipList.length > 0) {
    const fwIpMatches = await qTenant(`
      SELECT id, ts, devname AS endpoint, src_ip, dst_ip, dst_ip AS indicator, 'ip' AS indicator_type,
             'firewall' AS source_type, aggregator_name, 
             COALESCE(NULLIF(logdesc, ''), msg, 'Historical C2 connection (Unflagged at time of event)') AS details,
             severity
      FROM fw_events
      WHERE ts >= NOW() - ${intervalClause}
        AND dst_ip = ANY($1::varchar[])
        AND (logdesc NOT LIKE '%[THREAT DANGER]%' AND msg NOT LIKE '%[THREAT DANGER]%')
      ORDER BY ts DESC
      LIMIT 250
    `, [ipList]).catch(() => ({ rows: [] }));

    for (const row of fwIpMatches.rows || []) {
      const intel = iocLookup.get(`ip:${row.indicator.toLowerCase()}`) || {};
      retroHits.push({
        ...row,
        malware_family: intel.malware_family || 'Malicious C2',
        source_feed: intel.source_feed || 'ThreatFox',
        confidence_level: intel.confidence_level || 100,
        is_retroactive: true
      });
    }
  }

  // 3. Query historical fw_events for matching Domains (Method 1: Unflagged stealth queries)
  if (domainList.length > 0) {
    const fwDomainMatches = await qTenant(`
      SELECT id, ts, devname AS endpoint, src_ip, dst_ip,
             COALESCE(
               NULLIF(CASE WHEN cfgobj IS NOT NULL AND cfgobj != '' AND cfgobj !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN cfgobj ELSE NULL END, ''),
               (
                 SELECT d FROM unnest($1::varchar[]) AS d 
                 WHERE msg ILIKE '%' || d || '%' 
                 LIMIT 1
               ),
               cfgobj,
               'unknown-domain'
             ) AS indicator, 
             'domain' AS indicator_type,
             'firewall' AS source_type, aggregator_name,
             COALESCE(NULLIF(logdesc, ''), msg, 'Historical domain query (Unflagged at time of event)') AS details,
             severity
      FROM fw_events
      WHERE ts >= NOW() - ${intervalClause}
        AND (
          LOWER(cfgobj) = ANY($1::varchar[])
          OR (
            dst_ip = '8.8.8.8' AND EXISTS (
              SELECT 1 FROM unnest($1::varchar[]) AS d 
              WHERE msg ILIKE '%' || d || '%'
            )
          )
        )
        AND (logdesc NOT LIKE '%[THREAT DANGER]%' AND msg NOT LIKE '%[THREAT DANGER]%')
      ORDER BY ts DESC
      LIMIT 250
    `, [domainList]).catch(() => ({ rows: [] }));

    for (const row of fwDomainMatches.rows || []) {
      const intel = iocLookup.get(`domain:${row.indicator.toLowerCase()}`) || {};
      retroHits.push({
        ...row,
        malware_family: intel.malware_family || 'Malicious Domain',
        source_feed: intel.source_feed || 'URLhaus',
        confidence_level: intel.confidence_level || 100,
        is_retroactive: true
      });
    }
  }

  // 4. Query historical endpoint events (Method 1: Unflagged stealth execution)
  if (hashList.length > 0) {
    const evMatches = await qTenant(`
      SELECT id, ts, COALESCE(NULLIF(machine, ''), 'Endpoint') AS endpoint, 'local' AS src_ip, '' AS dst_ip,
             COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator,
             'sha256' AS indicator_type, 'endpoint' AS source_type, aggregator_name,
             message AS details, severity
      FROM events
      WHERE ts >= NOW() - ${intervalClause}
        AND (tag != 'MALWARE-EXE-DETECTED' AND message NOT LIKE '%[THREAT DANGER]%')
        AND SUBSTRING(LOWER(message) FROM '([a-fA-F0-9]{64})') = ANY($1::varchar[])
      ORDER BY ts DESC
      LIMIT 250
    `, [hashList]).catch(() => ({ rows: [] }));

    for (const row of evMatches.rows || []) {
      const intel = iocLookup.get(`sha256:${row.indicator.toLowerCase()}`) || {};
      retroHits.push({
        ...row,
        malware_family: intel.malware_family || 'Malware Executable',
        source_feed: intel.source_feed || 'MalwareBazaar',
        confidence_level: intel.confidence_level || 100,
        is_retroactive: true
      });
    }
  }

  // Sort by timestamp descending
  retroHits.sort((a, b) => new Date(b.ts) - new Date(a.ts));

  // 5. Persist all discovered hits into threat_retrohunt_matches table permanently
  let newHitsCount = 0;
  if (retroHits.length > 0) {
    for (const hit of retroHits) {
      try {
        const insRes = await qTenant(`
          INSERT INTO threat_retrohunt_matches (
            ts, source_type, aggregator_name, endpoint, src_ip, dst_ip,
            indicator, indicator_type, malware_family, source_feed, confidence_level, severity, details, discovered_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
          ON CONFLICT (ts, endpoint, indicator) DO NOTHING
        `, [
          hit.ts,
          hit.source_type || 'firewall',
          hit.aggregator_name || 'syslog',
          hit.endpoint || 'Unknown Device',
          hit.src_ip || '',
          hit.dst_ip || '',
          hit.indicator,
          hit.indicator_type || 'ip',
          hit.malware_family || 'Malicious Threat',
          hit.source_feed || 'ThreatFox',
          hit.confidence_level || 100,
          hit.severity || 'critical',
          hit.details || ''
        ]);
        if (insRes && insRes.rowCount > 0) {
          newHitsCount++;
        }
      } catch (insErr) {
        // Safe skip on constraint warning
      }
    }
  }

  const countRes = await qTenant('SELECT COUNT(*) AS total FROM threat_retrohunt_matches').catch(() => ({ rows: [{ total: 0 }] }));
  const totalPersisted = parseInt(countRes.rows[0]?.total, 10) || 0;

  return {
    scanned_iocs: iocs.length,
    time_range: timeRange,
    new_hits_found: newHitsCount,
    total_persisted: totalPersisted,
    matches: retroHits
  };
}

/**
 * Background auto-retrohunt executed automatically after threat intelligence feed synchronization.
 */
exports.executeAutoRetrohunt = async (timeRange = '7d') => {
  try {
    const qControl = db.query.bind(db);
    const qTenant = db.query.bind(db);
    const result = await performRetrohunt({ qControl, qTenant, timeRange, limit: 100000 });
    console.log(`[ThreatIntel] Auto-Retrohunt complete: scanned ${result.scanned_iocs} indicators, identified ${result.new_hits_found} new historical hits (${result.total_persisted} total persisted).`);
    return result;
  } catch (err) {
    console.error('[ThreatIntel] Auto-Retrohunt error:', err.message);
  }
};

/**
 * POST /api/threat-hunting/retrohunt
 * Runs an on-demand retroactive scan back-testing past events against ALL threat intelligence indicators (17,386+).
 * Discovered hits are automatically saved permanently into threat_retrohunt_matches table.
 */
exports.runRetrohunt = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const qTenant = req.queryTenant || db.query.bind(db);
    const { timeRange = '7d', limit } = req.body;

    const result = await performRetrohunt({ qControl, qTenant, timeRange, limit });

    res.json({
      ok: true,
      scanned_iocs: result.scanned_iocs,
      time_range: result.time_range,
      new_hits_found: result.new_hits_found,
      total_persisted: result.total_persisted,
      matches_found: result.matches.length,
      matches: result.matches.slice(0, 100)
    });
  } catch (err) {
    console.error('[ThreatHunting] runRetrohunt error:', err);
    res.status(500).json({ error: 'Failed to run retroactive threat hunt', details: err.message });
  }
};

/**
 * GET /api/threat-hunting/schedule
 * Retrieves the current automated retroactive hunting schedule configuration.
 */
exports.getSchedule = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const settingsRes = await qControl('SELECT threat_intel_config FROM settings LIMIT 1');
    let config = {};
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].threat_intel_config) {
      try {
        config = JSON.parse(settingsRes.rows[0].threat_intel_config);
      } catch (_) {}
    }

    const schedule = config.retrohunt_schedule || {
      enabled: true,
      frequency: 'daily',
      runTime: '08:00',
      lookbackWindow: '7d',
      lastRunAt: null
    };

    res.json({ ok: true, schedule });
  } catch (err) {
    console.error('[ThreatHunting] getSchedule error:', err);
    res.status(500).json({ error: 'Failed to retrieve schedule configuration' });
  }
};

/**
 * POST /api/threat-hunting/schedule
 * Updates and persists the client's custom automated retroactive hunting schedule.
 */
exports.saveSchedule = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const {
      enabled = true,
      frequency = 'daily',
      runTime = '08:00',
      lookbackWindow = '7d'
    } = req.body || {};

    const validFrequencies = ['daily', '2days', '5days', 'every_6h', 'every_12h', 'on_sync', 'disabled'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ error: `Invalid frequency. Allowed: ${validFrequencies.join(', ')}` });
    }

    // Lookback window: ONLY 7d, 14d, 30d (24h is intentionally disallowed)
    const validLookbacks = ['7d', '14d', '30d'];
    const chosenLookback = validLookbacks.includes(lookbackWindow) ? lookbackWindow : '7d';

    const cleanTime = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(runTime) ? runTime : '08:00';

    const settingsRes = await qControl('SELECT threat_intel_config FROM settings LIMIT 1');
    let currentConfig = {};
    if (settingsRes.rows.length > 0 && settingsRes.rows[0].threat_intel_config) {
      try {
        currentConfig = JSON.parse(settingsRes.rows[0].threat_intel_config);
      } catch (_) {}
    }

    const updatedSchedule = {
      enabled: Boolean(enabled) && frequency !== 'disabled',
      frequency,
      runTime: cleanTime,
      lookbackWindow: chosenLookback,
      lastRunAt: currentConfig.retrohunt_schedule?.lastRunAt || null,
      updatedAt: new Date().toISOString()
    };

    const updatedConfig = {
      ...currentConfig,
      retrohunt_schedule: updatedSchedule
    };

    if (settingsRes.rows.length > 0) {
      await qControl('UPDATE settings SET threat_intel_config = $1', [JSON.stringify(updatedConfig)]);
    } else {
      await qControl('INSERT INTO settings (threat_intel_config) VALUES ($1)', [JSON.stringify(updatedConfig)]);
    }

    // Notify threatFeedWorker to reload schedule in memory immediately
    const threatFeedWorker = require('../workers/threatFeedWorker');
    if (typeof threatFeedWorker.reloadRetrohuntSchedule === 'function') {
      threatFeedWorker.reloadRetrohuntSchedule(updatedSchedule);
    }

    res.json({
      ok: true,
      message: 'Retroactive hunting schedule updated successfully',
      schedule: updatedSchedule
    });
  } catch (err) {
    console.error('[ThreatHunting] saveSchedule error:', err);
    res.status(500).json({ error: 'Failed to save schedule configuration', details: err.message });
  }
};

/**
 * GET /api/threat-hunting/retrohunt-matches
 * Retrieves persisted retroactive threat detections stored in threat_retrohunt_matches.
 * Follows system Data Retention & Expiration policy.
 */
exports.getRetrohuntMatches = async (req, res) => {
  try {
    const qTenant = req.queryTenant || db.query.bind(db);
    const {
      page = 1,
      limit = 20,
      search = '',
      type = 'all',
      timeRange = 'all'
    } = req.query;

    const pageNum = Math.max(1, parseSafeInt(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseSafeInt(limit, 20)));
    const offset = (pageNum - 1) * limitNum;

    const conds = ['1=1'];
    const params = [];
    let pIdx = 1;

    // Filter by indicator type
    if (type && type !== 'all') {
      conds.push(`indicator_type = $${pIdx++}`);
      params.push(type.toLowerCase());
    }

    // Filter by time range (ONLY 7d, 14d, 30d; 24h is intentionally omitted)
    if (timeRange === '7d') {
      conds.push(`ts >= NOW() - INTERVAL '7 days'`);
    } else if (timeRange === '14d') {
      conds.push(`ts >= NOW() - INTERVAL '14 days'`);
    } else if (timeRange === '30d') {
      conds.push(`ts >= NOW() - INTERVAL '30 days'`);
    }

    // Search filter
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conds.push(`(
        LOWER(indicator) LIKE $${pIdx} 
        OR LOWER(endpoint) LIKE $${pIdx} 
        OR LOWER(COALESCE(src_ip, '')) LIKE $${pIdx} 
        OR LOWER(COALESCE(malware_family, '')) LIKE $${pIdx}
        OR LOWER(COALESCE(details, '')) LIKE $${pIdx}
      )`);
      params.push(term);
      pIdx++;
    }

    const whereClause = conds.join(' AND ');

    // Total count
    const countSql = `SELECT COUNT(*) AS total FROM threat_retrohunt_matches WHERE ${whereClause}`;
    const countRes = await qTenant(countSql, params).catch(() => ({ rows: [{ total: 0 }] }));
    const total = parseInt(countRes.rows[0]?.total, 10) || 0;

    // Query rows
    const dataSql = `
      SELECT id, ts, source_type, aggregator_name, endpoint, src_ip, dst_ip,
             indicator, indicator_type, malware_family, source_feed, confidence_level,
             severity, details, discovered_at, created_at
      FROM threat_retrohunt_matches
      WHERE ${whereClause}
      ORDER BY ts DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    const dataRes = await qTenant(dataSql, [...params, limitNum, offset]).catch(() => ({ rows: [] }));

    res.json({
      matches: dataRes.rows || [],
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('[ThreatHunting] getRetrohuntMatches error:', err);
    res.status(500).json({ error: 'Failed to retrieve retroactive threat matches' });
  }
};

/**
 * DELETE /api/threat-hunting/retrohunt-matches/:id
 * Dismisses/deletes an individual retroactive detection.
 */
exports.deleteRetrohuntMatch = async (req, res) => {
  try {
    const qTenant = req.queryTenant || db.query.bind(db);
    const { id } = req.params;
    await qTenant('DELETE FROM threat_retrohunt_matches WHERE id = $1', [id]);
    res.json({ ok: true, message: 'Retroactive match dismissed' });
  } catch (err) {
    console.error('[ThreatHunting] deleteRetrohuntMatch error:', err);
    res.status(500).json({ error: 'Failed to delete retroactive match' });
  }
};

/**
 * GET /api/threat-hunting/blast-radius
 * Calculates the blast radius, affected endpoints, timeline, and Patient Zero for an indicator.
 */
exports.getBlastRadius = async (req, res) => {
  try {
    const qTenant = req.queryTenant || db.query.bind(db);
    const qControl = req.queryControlPlane || db.query.bind(db);
    const { indicator = '', type = '' } = req.query;

    const cleanVal = (indicator || '').trim();
    if (!cleanVal) {
      return res.status(400).json({ error: 'Indicator parameter is required' });
    }

    // Lookup metadata from threat_intel_iocs
    const intelRes = await qControl(`
      SELECT ioc_type, ioc_value, malware_family, source_feed, confidence_level, status, first_seen, last_seen
      FROM threat_intel_iocs
      WHERE ioc_value = $1 OR ioc_value = $2
      LIMIT 1
    `, [cleanVal, cleanVal.toLowerCase()]).catch(() => ({ rows: [] }));

    const intel = intelRes.rows[0] || {
      ioc_value: cleanVal,
      ioc_type: type || 'ip',
      malware_family: 'Generic Threat Indicator',
      confidence_level: 100
    };

    // Query firewall events for this indicator
    const fwRes = await qTenant(`
      SELECT id, ts, devname AS endpoint, src_ip, dst_ip, cfgobj, aggregator_name,
             COALESCE(NULLIF(logdesc, ''), msg, 'Connection Attempt') AS details,
             action, severity
      FROM fw_events
      WHERE dst_ip = $1 OR cfgobj = $1 OR cfgobj ILIKE $2
      ORDER BY ts ASC
      LIMIT 500
    `, [cleanVal, `%${cleanVal}%`]).catch(() => ({ rows: [] }));

    // Query endpoint events
    const evRes = await qTenant(`
      SELECT id, ts, machine AS endpoint, 'local' AS src_ip, aggregator_name,
             message AS details, tag, severity
      FROM events
      WHERE message ILIKE $1 OR tag ILIKE $1
      ORDER BY ts ASC
      LIMIT 500
    `, [`%${cleanVal}%`]).catch(() => ({ rows: [] }));

    const allEvents = [...(fwRes.rows || []), ...(evRes.rows || [])];
    allEvents.sort((a, b) => new Date(a.ts) - new Date(b.ts));

    const endpointMap = new Map();
    for (const ev of allEvents) {
      const epKey = ev.src_ip && ev.src_ip !== 'local' ? ev.src_ip : (ev.endpoint || 'unknown');
      if (!endpointMap.has(epKey)) {
        endpointMap.set(epKey, {
          key: epKey,
          endpoint: ev.endpoint || 'Unknown Device',
          src_ip: ev.src_ip || 'local',
          aggregator_name: ev.aggregator_name || 'Central',
          first_seen: ev.ts,
          last_seen: ev.ts,
          count: 0
        });
      }
      const record = endpointMap.get(epKey);
      record.count++;
      record.last_seen = ev.ts;
    }

    const uniqueEndpoints = Array.from(endpointMap.values());
    uniqueEndpoints.sort((a, b) => new Date(a.first_seen) - new Date(b.first_seen));

    // Patient zero is the earliest recorded endpoint
    const patientZero = uniqueEndpoints.length > 0 ? {
      ...uniqueEndpoints[0],
      is_patient_zero: true
    } : null;

    res.json({
      indicator: cleanVal,
      type: intel.ioc_type || type || 'ip',
      total_hits: allEvents.length,
      unique_endpoints_count: uniqueEndpoints.length,
      patient_zero: patientZero,
      last_seen: allEvents.length > 0 ? allEvents[allEvents.length - 1].ts : null,
      endpoints: uniqueEndpoints,
      timeline: allEvents.slice(0, 50),
      intel
    });
  } catch (err) {
    console.error('[ThreatHunting] getBlastRadius error:', err);
    res.status(500).json({ error: 'Failed to compute blast radius', details: err.message });
  }
};

/**
 * GET /api/threat-hunting/whitelist
 * Retrieves active false positive suppression rules.
 */
exports.getWhitelist = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    await qControl(`
      CREATE TABLE IF NOT EXISTS threat_intel_whitelist (
        id BIGSERIAL PRIMARY KEY,
        ioc_type VARCHAR(20) NOT NULL,
        ioc_value VARCHAR(255) NOT NULL,
        reason TEXT DEFAULT '',
        added_by VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_whitelist_type_value UNIQUE (ioc_type, ioc_value)
      );
    `).catch(() => {});
    const result = await qControl(`
      SELECT id, ioc_type, ioc_value, reason, added_by, created_at
      FROM threat_intel_whitelist
      ORDER BY id DESC
    `);
    res.json({ whitelist: result.rows || [] });
  } catch (err) {
    console.error('[ThreatHunting] getWhitelist error:', err);
    res.status(500).json({ error: 'Failed to load threat whitelist' });
  }
};

/**
 * POST /api/threat-hunting/whitelist
 * Adds an indicator to the whitelist to suppress false positive alerts.
 */
exports.addToWhitelist = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const { ioc_type, ioc_value, reason = 'False positive / benign infrastructure' } = req.body;

    const cleanType = (ioc_type || 'ip').toLowerCase().trim();
    const cleanVal = (ioc_value || '').trim();

    if (!cleanVal) {
      return res.status(400).json({ error: 'Indicator value is required' });
    }

    await qControl(`
      CREATE TABLE IF NOT EXISTS threat_intel_whitelist (
        id BIGSERIAL PRIMARY KEY,
        ioc_type VARCHAR(20) NOT NULL,
        ioc_value VARCHAR(255) NOT NULL,
        reason TEXT DEFAULT '',
        added_by VARCHAR(100) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_whitelist_type_value UNIQUE (ioc_type, ioc_value)
      );
    `).catch(() => {});

    const addedBy = req.user?.username || req.user?.email || 'admin';

    await qControl(`
      INSERT INTO threat_intel_whitelist (ioc_type, ioc_value, reason, added_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (ioc_type, ioc_value) DO UPDATE SET
        reason = EXCLUDED.reason,
        added_by = EXCLUDED.added_by,
        created_at = NOW()
    `, [cleanType, cleanVal, reason.trim(), addedBy]);

    // Remove from in-memory Redis cache so real-time alerts cease immediately
    try {
      const { getRedisClient } = require('../config/redisClient');
      const redis = getRedisClient();
      if (redis) {
        if (cleanType === 'ip') await redis.srem('threat:ips', cleanVal);
        if (cleanType === 'domain') await redis.srem('threat:domains', cleanVal);
        if (cleanType === 'sha256') await redis.srem('threat:hashes', cleanVal);
      }
    } catch (rErr) {
      console.warn('[ThreatHunting] Redis whitelist srem notice:', rErr.message);
    }

    res.json({ ok: true, message: `Indicator ${cleanVal} added to suppression whitelist.` });
  } catch (err) {
    console.error('[ThreatHunting] addToWhitelist error:', err);
    res.status(500).json({ error: 'Failed to whitelist indicator', details: err.message });
  }
};

/**
 * DELETE /api/threat-hunting/whitelist/:id
 * Removes an indicator from the whitelist, restoring real-time detection.
 */
exports.removeFromWhitelist = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const { id } = req.params;

    const selRes = await qControl('SELECT ioc_type, ioc_value FROM threat_intel_whitelist WHERE id = $1', [id]);
    if (selRes.rows.length === 0) {
      return res.status(404).json({ error: 'Whitelist entry not found' });
    }

    const { ioc_type, ioc_value } = selRes.rows[0];

    await qControl('DELETE FROM threat_intel_whitelist WHERE id = $1', [id]);

    // If this item was originally in threat_intel_iocs, restore it to Redis
    try {
      const chkRes = await qControl('SELECT id FROM threat_intel_iocs WHERE ioc_type = $1 AND ioc_value = $2 AND status = $3', [ioc_type, ioc_value, 'online']);
      if (chkRes.rows.length > 0) {
        const { getRedisClient } = require('../config/redisClient');
        const redis = getRedisClient();
        if (redis) {
          if (ioc_type === 'ip') await redis.sadd('threat:ips', ioc_value);
          if (ioc_type === 'domain') await redis.sadd('threat:domains', ioc_value);
          if (ioc_type === 'sha256') await redis.sadd('threat:hashes', ioc_value);
        }
      }
    } catch (_) {}

    res.json({ ok: true, message: `Indicator ${ioc_value} restored to active detection.` });
  } catch (err) {
    console.error('[ThreatHunting] removeFromWhitelist error:', err);
    res.status(500).json({ error: 'Failed to remove whitelist entry' });
  }
};
