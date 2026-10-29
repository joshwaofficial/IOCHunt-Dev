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
      `(logdesc LIKE '%[THREAT DANGER]%' OR msg LIKE '%[THREAT DANGER]%')`,
      `(dst_ip NOT IN (SELECT ioc_value FROM threat_intel_whitelist WHERE ioc_type = 'ip') OR dst_ip IS NULL)`,
      `(cfgobj NOT IN (SELECT ioc_value FROM threat_intel_whitelist WHERE ioc_type = 'domain') OR cfgobj IS NULL OR cfgobj = '')`
    ];
    const evConds = [
      `ts >= NOW() - ${intervalClause}`,
      `(tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')`
    ];

    const fwParams = [];
    const evParams = [];
    let fwIdx = 1;
    let evIdx = 1;

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
          message AS details
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
        typeCond = " AND (cfgobj IS NOT NULL AND cfgobj != '')";
      } else if (type === 'ip') {
        typeCond = " AND (cfgobj IS NULL OR cfgobj = '')";
      }

      const countRes = await qTenant(`SELECT COUNT(*) AS total FROM fw_events WHERE ${fwConds.join(' AND ')}${typeCond}`, fwParams).catch(() => ({ rows: [{ total: 0 }] }));
      total = parseInt(countRes.rows[0]?.total, 10) || 0;

      const dataQuery = `
        SELECT 
          id, 'firewall' AS source_type, ts, aggregator_name,
          COALESCE(NULLIF(devname, ''), 'Firewall') AS endpoint,
          src_ip,
          COALESCE(NULLIF(dst_ip, ''), cfgobj, 'THREAT') AS indicator,
          CASE WHEN cfgobj IS NOT NULL AND cfgobj != '' THEN 'domain' ELSE 'ip' END AS indicator_type,
          severity,
          COALESCE(NULLIF(logdesc, ''), msg, 'Threat connection detected') AS details
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
            COALESCE(NULLIF(dst_ip, ''), cfgobj, 'THREAT') AS indicator,
            CASE WHEN cfgobj IS NOT NULL AND cfgobj != '' THEN 'domain' ELSE 'ip' END AS indicator_type,
            severity,
            COALESCE(NULLIF(logdesc, ''), msg, 'Threat connection detected') AS details
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
            COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator,
            'sha256' AS indicator_type,
            severity,
            message AS details
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
 * POST /api/threat-hunting/retrohunt
 * Runs a retroactive scan back-testing past events (default 7 days) against active threat intelligence indicators.
 */
exports.runRetrohunt = async (req, res) => {
  try {
    const qControl = req.queryControlPlane || db.query.bind(db);
    const qTenant = req.queryTenant || db.query.bind(db);
    const { timeRange = '7d', limit = 500 } = req.body;

    let intervalClause = "INTERVAL '7 days'";
    if (timeRange === '14d') intervalClause = "INTERVAL '14 days'";
    if (timeRange === '30d') intervalClause = "INTERVAL '30 days'";
    if (timeRange === '24h') intervalClause = "INTERVAL '24 hours'";

    // 1. Fetch active threat indicators (excluding any whitelisted ones)
    const iocRes = await qControl(`
      SELECT ioc_type, ioc_value, malware_family, source_feed, confidence_level
      FROM threat_intel_iocs
      WHERE status IN ('online', 'active')
        AND (confidence_level IS NULL OR confidence_level >= 70)
        AND (ioc_type, ioc_value) NOT IN (SELECT ioc_type, ioc_value FROM threat_intel_whitelist)
      ORDER BY last_seen DESC
      LIMIT $1
    `, [Math.min(2000, Math.max(50, parseInt(limit, 10) || 500))]);

    const iocs = iocRes.rows || [];
    if (iocs.length === 0) {
      return res.json({
        ok: true,
        scanned_iocs: 0,
        time_range: timeRange,
        matches_found: 0,
        matches: []
      });
    }

    const ipList = iocs.filter(r => r.ioc_type === 'ip').map(r => r.ioc_value);
    const domainList = iocs.filter(r => r.ioc_type === 'domain').map(r => r.ioc_value.toLowerCase());
    const hashList = iocs.filter(r => r.ioc_type === 'sha256').map(r => r.ioc_value.toLowerCase());

    const iocLookup = new Map();
    for (const ioc of iocs) {
      iocLookup.set(`${ioc.ioc_type}:${ioc.ioc_value.toLowerCase()}`, ioc);
    }

    const retroHits = [];

    // 2. Query historical fw_events for matching IPs
    if (ipList.length > 0) {
      const fwIpMatches = await qTenant(`
        SELECT id, ts, devname AS endpoint, src_ip, dst_ip AS indicator, 'ip' AS indicator_type,
               'firewall' AS source_type, aggregator_name, 
               COALESCE(NULLIF(logdesc, ''), msg, 'Historical C2 connection detected') AS details,
               severity
        FROM fw_events
        WHERE ts >= NOW() - ${intervalClause}
          AND dst_ip = ANY($1::varchar[])
          AND (dst_ip NOT IN (SELECT ioc_value FROM threat_intel_whitelist WHERE ioc_type = 'ip') OR dst_ip IS NULL)
        ORDER BY ts DESC
        LIMIT 100
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

    // 3. Query historical fw_events for matching Domains
    if (domainList.length > 0) {
      const fwDomainMatches = await qTenant(`
        SELECT id, ts, devname AS endpoint, src_ip, cfgobj AS indicator, 'domain' AS indicator_type,
               'firewall' AS source_type, aggregator_name,
               COALESCE(NULLIF(logdesc, ''), msg, 'Historical malicious domain query detected') AS details,
               severity
        FROM fw_events
        WHERE ts >= NOW() - ${intervalClause}
          AND LOWER(cfgobj) = ANY($1::varchar[])
          AND (cfgobj NOT IN (SELECT ioc_value FROM threat_intel_whitelist WHERE ioc_type = 'domain') OR cfgobj IS NULL)
        ORDER BY ts DESC
        LIMIT 100
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

    // 4. Query historical endpoint events
    const evMatches = await qTenant(`
      SELECT id, ts, COALESCE(NULLIF(machine, ''), 'Endpoint') AS endpoint, 'local' AS src_ip,
             COALESCE(SUBSTRING(message FROM '([a-fA-F0-9]{64})'), 'MALWARE-EXE') AS indicator,
             'sha256' AS indicator_type, 'endpoint' AS source_type, aggregator_name,
             message AS details, severity
      FROM events
      WHERE ts >= NOW() - ${intervalClause}
        AND (tag = 'MALWARE-EXE-DETECTED' OR message LIKE '%[THREAT DANGER]%')
      ORDER BY ts DESC
      LIMIT 100
    `).catch(() => ({ rows: [] }));

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

    // Sort by timestamp descending
    retroHits.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    res.json({
      ok: true,
      scanned_iocs: iocs.length,
      time_range: timeRange,
      matches_found: retroHits.length,
      matches: retroHits.slice(0, 100)
    });
  } catch (err) {
    console.error('[ThreatHunting] runRetrohunt error:', err);
    res.status(500).json({ error: 'Failed to run retroactive threat hunt', details: err.message });
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
