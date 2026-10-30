// ════════════════════════════════════════════════════════════════
// IOC Hunt — High-Performance Threat Feed Ingestion Worker
// ════════════════════════════════════════════════════════════════
// Fetches daily threat indicators from ThreatFox, MalwareBazaar,
// and URLhaus. Caches in Redis & PostgreSQL with 60-day auto-purge.
// ════════════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const readline = require('readline');
const db = require('../config/db');
const { getRedisClient } = require('../config/redisClient');
const { decryptText } = require('../utils/cryptoHelper');

const redis = getRedisClient();

let isSyncing = false;

// Robust CSV Line Parser that handles quoted commas, double quotes, and unquoted fields
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Helper to fetch JSON from HTTPS endpoints with automatic decompression & redirect support
function fetchJson(url, postData = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: postData ? 'POST' : 'GET',
      headers: {
        'User-Agent': 'IOCHunt-ThreatEngine/2.0',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, identity',
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      // Follow redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).href;
        res.resume();
        return fetchJson(nextUrl, postData, headers).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP error ${res.statusCode} fetching JSON from ${url}`));
      }

      let stream = res;
      const encoding = (res.headers['content-encoding'] || '').toLowerCase();
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      let body = '';
      stream.on('data', chunk => body += chunk);
      stream.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

// Helper to stream CSV lines from HTTPS/HTTP endpoints with automatic redirect & gzip decompression
function streamCsvLines(url, onLine, headers = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectsLeft) {
      if (redirectsLeft < 0) {
        return reject(new Error(`Too many redirects fetching ${url}`));
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(currentUrl);
      } catch (err) {
        return reject(new Error(`Invalid URL: ${currentUrl}`));
      }

      const client = parsedUrl.protocol === 'http:' ? http : https;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'IOCHunt-ThreatEngine/2.0',
          'Accept-Encoding': 'gzip, deflate, identity',
          ...headers
        },
        timeout: 60000
      };

      const req = client.get(options, (res) => {
        // Follow redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const nextUrl = new URL(res.headers.location, currentUrl).href;
          res.resume();
          return get(nextUrl, redirectsLeft - 1);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP error ${res.statusCode} fetching ${currentUrl}`));
        }

        // Automatic stream decompression if server returns gzip, deflate, or br
        let stream = res;
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        } else if (encoding === 'br') {
          stream = res.pipe(zlib.createBrotliDecompress());
        }

        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', (line) => {
          try {
            onLine(line);
          } catch (_) {}
        });
        rl.on('close', resolve);
        stream.on('error', reject);
        rl.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out fetching ${currentUrl}`));
      });
    }

    get(url, maxRedirects);
  });
}

// Retrieve Threat Intelligence Config & Decrypted Unified Abuse.ch API Key
async function getThreatIntelConfig() {
  try {
    const res = await db.query('SELECT threat_intel_config FROM settings LIMIT 1');
    if (res.rows.length > 0 && res.rows[0].threat_intel_config) {
      const cfg = typeof res.rows[0].threat_intel_config === 'string'
        ? JSON.parse(res.rows[0].threat_intel_config)
        : res.rows[0].threat_intel_config;
      let apiKey = null;
      if (cfg.encryptedApiKey) {
        apiKey = decryptText(cfg.encryptedApiKey);
      } else if (cfg.apiKey) {
        apiKey = cfg.apiKey;
      }
      return {
        apiKey: apiKey || process.env.THREATFOX_API_KEY || null,
        feeds: cfg.feeds || { threatfox: true, malwarebazaar: true, urlhaus: true }
      };
    }
  } catch (err) {
    console.warn('[ThreatIntel] DB config read warning:', err.message);
  }
  return {
    apiKey: process.env.THREATFOX_API_KEY || null,
    feeds: { threatfox: true, malwarebazaar: true, urlhaus: true }
  };
}

// Backwards-compatible helper to retrieve the decrypted API key
async function getThreatFoxApiKey() {
  const config = await getThreatIntelConfig();
  return config.apiKey;
}

// Helper for batch upserting indicators into PostgreSQL
async function bulkUpsertIocs(records) {
  if (!records || records.length === 0) return;

  // Deduplicate within the batch to prevent PostgreSQL "ON CONFLICT DO UPDATE cannot affect row a second time" error
  const uniqueMap = new Map();
  for (const r of records) {
    if (!r.ioc_type || !r.ioc_value) continue;
    const cleanVal = r.ioc_value.toLowerCase().trim();
    const key = `${r.ioc_type}:${cleanVal}`;
    // Prefer more descriptive malware family if duplicate
    const existing = uniqueMap.get(key);
    if (!existing || (existing.malware_family === 'Malware' && r.malware_family && r.malware_family !== 'Malware')) {
      uniqueMap.set(key, {
        ioc_type: r.ioc_type,
        ioc_value: cleanVal,
        malware_family: r.malware_family || '',
        source_feed: r.source_feed,
        confidence_level: r.confidence_level || 100,
        status: r.status || 'online'
      });
    }
  }

  const deduped = Array.from(uniqueMap.values());
  const CHUNK_SIZE = 100;
  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const r of chunk) {
      values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      params.push(r.ioc_type, r.ioc_value, r.malware_family || '', r.source_feed, r.confidence_level || 100, r.status || 'online');
    }

    const query = `
      INSERT INTO threat_intel_iocs (ioc_type, ioc_value, malware_family, source_feed, confidence_level, status)
      VALUES ${values.join(', ')}
      ON CONFLICT (ioc_type, ioc_value) DO UPDATE SET 
        malware_family = EXCLUDED.malware_family,
        source_feed = EXCLUDED.source_feed,
        confidence_level = EXCLUDED.confidence_level,
        status = EXCLUDED.status,
        last_seen = CURRENT_TIMESTAMP;
    `;
    await db.query(query, params).catch(e => console.warn('[ThreatIntel] Bulk upsert warning:', e.message));
  }
}

// ── 1. ThreatFox Ingestor (C2 IPs, Domains, Hashes) ───────────────
async function syncThreatFox() {
  const apiKey = await getThreatFoxApiKey();
  if (!apiKey) {
    console.log('[ThreatIntel] ThreatFox API key not configured yet. Skipping ThreatFox sync.');
    return { count: 0, skipped: true };
  }

  console.log('[ThreatIntel] Fetching ThreatFox recent indicators (last 3 days)...');
  try {
    const payload = JSON.stringify({ query: 'get_iocs', days: 3 });
    const response = await fetchJson('https://threatfox-api.abuse.ch/api/v1/', payload, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Auth-Key': apiKey.trim()
    });

    if (response.query_status !== 'ok' || !Array.isArray(response.data)) {
      console.warn('[ThreatIntel] ThreatFox response status:', response.query_status);
      return { count: 0, error: response.query_status };
    }

    const pipe = redis.pipeline();
    const records = [];
    let count = 0;

    for (const item of response.data) {
      const type = item.ioc_type;
      const val = item.ioc;
      const malware = item.malware_printable || 'Malware';
      const conf = parseInt(item.confidence_level, 10) || 100;
      if (!val) continue;

      if (type === 'ip:port') {
        const ip = val.split(':')[0].trim();
        if (ip) {
          pipe.sadd('threat:ips', ip);
          records.push({ ioc_type: 'ip', ioc_value: ip, malware_family: malware, source_feed: 'threatfox', confidence_level: conf, status: 'online' });
          count++;
        }
      } else if (type === 'domain') {
        const domain = val.toLowerCase().trim();
        if (domain && domain.includes('.')) {
          pipe.sadd('threat:domains', domain);
          records.push({ ioc_type: 'domain', ioc_value: domain, malware_family: malware, source_feed: 'threatfox', confidence_level: conf, status: 'online' });
          count++;
        }
      } else if (type === 'sha256_hash') {
        const hash = val.toLowerCase().trim();
        if (hash.length === 64) {
          pipe.sadd('threat:hashes', hash);
          records.push({ ioc_type: 'sha256', ioc_value: hash, malware_family: malware, source_feed: 'threatfox', confidence_level: conf, status: 'online' });
          count++;
        }
      }
    }

    await pipe.exec();
    await bulkUpsertIocs(records);
    console.log(`[ThreatIntel] ThreatFox processed ${count} indicators.`);
    return { count };
  } catch (err) {
    console.error('[ThreatIntel] ThreatFox sync error:', err.message);
    return { count: 0, error: err.message };
  }
}

// ── 2. MalwareBazaar Ingestor (100% Malicious EXE Hashes) ───────────
async function syncMalwareBazaar() {
  const apiKey = await getThreatFoxApiKey();
  if (!apiKey) {
    console.log('[ThreatIntel] Abuse.ch API key not configured yet. Skipping MalwareBazaar sync.');
    return { count: 0, skipped: true };
  }

  console.log('[ThreatIntel] Fetching MalwareBazaar daily executable hashes via v2 export API...');
  try {
    const pipe = redis.pipeline();
    const records = [];
    let count = 0;

    const url = `https://mb-api.abuse.ch/v2/files/exports/${encodeURIComponent(apiKey.trim())}/recent.csv`;
    const headers = { 'Auth-Key': apiKey.trim() };

    await streamCsvLines(url, (line) => {
      if (!line || line.startsWith('#')) return;
      // CSV format: "first_seen_utc","sha256_hash","md5_hash","sha1_hash","reporter","file_name","file_type_guess","signature"
      const cols = parseCsvLine(line);
      const sha256 = (cols[1] || '').toLowerCase().trim();
      const signature = cols[7] || 'Malware';

      if (sha256 && sha256.length === 64 && /^[0-9a-f]{64}$/i.test(sha256)) {
        pipe.sadd('threat:hashes', sha256);
        records.push({
          ioc_type: 'sha256',
          ioc_value: sha256,
          malware_family: signature,
          source_feed: 'malwarebazaar',
          confidence_level: 100, // 100% verified binary signature
          status: 'active'
        });
        count++;
      }
    }, headers);

    await pipe.exec();
    await bulkUpsertIocs(records);
    console.log(`[ThreatIntel] MalwareBazaar processed ${count} executable hashes.`);
    return { count };
  } catch (err) {
    console.error('[ThreatIntel] MalwareBazaar sync error:', err.message);
    return { count: 0, error: err.message };
  }
}

// ── 3. URLhaus Ingestor (Malicious Domains & IPs) ────────────────────
async function syncURLhaus() {
  const apiKey = await getThreatFoxApiKey();
  if (!apiKey) {
    console.log('[ThreatIntel] Abuse.ch API key not configured yet. Skipping URLhaus sync.');
    return { count: 0, skipped: true };
  }

  console.log('[ThreatIntel] Fetching URLhaus recent malicious domains & IPs...');
  const pipe = redis.pipeline();
  const records = [];
  let count = 0;

  // Strategy 1: URLhaus v2 Bulk CSV Export with Gzip Decompression
  try {
    const url = `https://urlhaus-api.abuse.ch/v2/files/exports/${encodeURIComponent(apiKey.trim())}/recent.csv`;
    const headers = { 'Auth-Key': apiKey.trim() };

    await streamCsvLines(url, (line) => {
      if (!line || line.startsWith('#')) return;
      const cols = parseCsvLine(line);
      // Auto-detect URL column (find column starting with http://, https://, or hxxp://, or fallback to index 2)
      const rawUrl = cols.find(c => typeof c === 'string' && /^(?:https?|hxxps?):\/\//i.test(c.trim())) || cols[2];
      if (!rawUrl || rawUrl.toLowerCase() === 'url') return;

      // Extract status: 'online' or 'offline'
      let status = 'online';
      if (cols.includes('offline') || cols[3] === 'offline') {
        status = 'offline';
      } else if (cols.includes('online') || cols[3] === 'online') {
        status = 'online';
      }

      // Extract malware family excluding timestamps, URLs, and status keywords
      let threatTag = '';
      for (const c of [cols[6], cols[5], cols[7], cols[4]]) {
        if (!c) continue;
        const val = c.trim();
        if (val && 
            val !== 'None' && 
            val !== 'online' && 
            val !== 'offline' && 
            val !== 'malware_download' &&
            !val.startsWith('http') && 
            !/^\d{4}-\d{2}-\d{2}/.test(val)) {
          threatTag = val;
          break;
        }
      }
      if (!threatTag) threatTag = 'Malware Distribution';

      const conf = status === 'online' ? 100 : 80;

      try {
        let parseTarget = rawUrl.replace(/^hxxp/i, 'http').replace(/\[\.\]/g, '.').trim();
        if (!parseTarget.startsWith('http://') && !parseTarget.startsWith('https://')) {
          parseTarget = 'http://' + parseTarget;
        }
        const hostname = new URL(parseTarget).hostname.toLowerCase().trim();
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

        if (isIp) {
          pipe.sadd('threat:ips', hostname);
          records.push({ ioc_type: 'ip', ioc_value: hostname, malware_family: threatTag, source_feed: 'urlhaus', confidence_level: conf, status });
          count++;
        } else if (hostname && hostname.includes('.')) {
          pipe.sadd('threat:domains', hostname);
          records.push({ ioc_type: 'domain', ioc_value: hostname, malware_family: threatTag, source_feed: 'urlhaus', confidence_level: conf, status });
          count++;
        }
      } catch (_) {}
    }, headers);

    if (records.length > 0) {
      await pipe.exec();
      await bulkUpsertIocs(records);
      console.log(`[ThreatIntel] URLhaus processed ${count} indicators from CSV export.`);
      return { count };
    }
  } catch (err) {
    console.warn('[ThreatIntel] URLhaus CSV export attempt failed, falling back to JSON API:', err.message);
  }

  // Strategy 2: Official URLhaus JSON API (/v1/urls/recent/)
  try {
    console.log('[ThreatIntel] Fetching URLhaus recent indicators via official JSON API fallback...');
    const jsonRes = await fetchJson('https://urlhaus-api.abuse.ch/v1/urls/recent/', null, {
      'Auth-Key': apiKey.trim()
    });

    if (jsonRes && jsonRes.query_status === 'ok' && Array.isArray(jsonRes.urls)) {
      const fbPipe = redis.pipeline();
      const fbRecords = [];
      let fbCount = 0;

      for (const item of jsonRes.urls) {
        let host = (item.host || '').toLowerCase().trim();
        const status = item.url_status === 'offline' ? 'offline' : 'online';
        const threat = item.threat || (Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(', ') : 'Malware Distribution');
        const conf = status === 'online' ? 100 : 80;

        if (!host && item.url) {
          try {
            let t = item.url.replace(/^hxxp/i, 'http').replace(/\[\.\]/g, '.').trim();
            if (!t.startsWith('http://') && !t.startsWith('https://')) t = 'http://' + t;
            host = new URL(t).hostname.toLowerCase().trim();
          } catch (_) {}
        }

        if (!host) continue;
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

        if (isIp) {
          fbPipe.sadd('threat:ips', host);
          fbRecords.push({ ioc_type: 'ip', ioc_value: host, malware_family: threat, source_feed: 'urlhaus', confidence_level: conf, status });
          fbCount++;
        } else if (host.includes('.')) {
          fbPipe.sadd('threat:domains', host);
          fbRecords.push({ ioc_type: 'domain', ioc_value: host, malware_family: threat, source_feed: 'urlhaus', confidence_level: conf, status });
          fbCount++;
        }
      }

      await fbPipe.exec();
      await bulkUpsertIocs(fbRecords);
      console.log(`[ThreatIntel] URLhaus processed ${fbCount} indicators via JSON API.`);
      return { count: fbCount };
    } else {
      console.warn('[ThreatIntel] URLhaus JSON API status:', jsonRes?.query_status);
    }
  } catch (jsonErr) {
    console.warn('[ThreatIntel] URLhaus JSON API attempt failed, trying hostfile fallback:', jsonErr.message);
  }

  // Strategy 3: URLhaus Hostfile (/v2/files/exports/<API KEY>/hostfile.txt)
  try {
    console.log('[ThreatIntel] Fetching URLhaus malicious hostfile export...');
    const hostfileUrl = `https://urlhaus-api.abuse.ch/v2/files/exports/${encodeURIComponent(apiKey.trim())}/hostfile.txt`;
    const hfPipe = redis.pipeline();
    const hfRecords = [];
    let hfCount = 0;

    await streamCsvLines(hostfileUrl, (line) => {
      if (!line || line.startsWith('#')) return;
      // Hostfile format: "127.0.0.1  malicious.domain.com"
      const parts = line.trim().split(/\s+/);
      const domain = (parts[1] || parts[0] || '').toLowerCase().trim();
      if (!domain || domain === '127.0.0.1' || domain === 'localhost' || !domain.includes('.')) return;

      hfPipe.sadd('threat:domains', domain);
      hfRecords.push({ ioc_type: 'domain', ioc_value: domain, malware_family: 'Malware Distribution', source_feed: 'urlhaus', confidence_level: 90, status: 'online' });
      hfCount++;
    }, { 'Auth-Key': apiKey.trim() });

    if (hfRecords.length > 0) {
      await hfPipe.exec();
      await bulkUpsertIocs(hfRecords);
      console.log(`[ThreatIntel] URLhaus processed ${hfCount} domains from hostfile export.`);
      return { count: hfCount };
    }
  } catch (hfErr) {
    console.error('[ThreatIntel] URLhaus hostfile fallback error:', hfErr.message);
  }

  return { count };
}

// ── 4. 60-Day Rotational Purge ─────────────────────────────────────
async function run60DayPurge() {
  const retentionDays = parseInt(process.env.THREAT_INTEL_RETENTION_DAYS, 10) || 60;
  console.log(`[ThreatIntel] Running 60-day rotational purge (Retention: ${retentionDays} days)...`);
  try {
    const expiredRes = await db.query(`
      SELECT ioc_type, ioc_value FROM threat_intel_iocs
      WHERE last_seen < NOW() - ($1 || ' days')::INTERVAL;
    `, [retentionDays]);

    if (expiredRes.rows.length > 0) {
      const pipe = redis.pipeline();
      for (const row of expiredRes.rows) {
        if (row.ioc_type === 'ip') pipe.srem('threat:ips', row.ioc_value);
        if (row.ioc_type === 'domain') pipe.srem('threat:domains', row.ioc_value);
        if (row.ioc_type === 'sha256') pipe.srem('threat:hashes', row.ioc_value);
      }
      await pipe.exec();

      await db.query(`
        DELETE FROM threat_intel_iocs
        WHERE last_seen < NOW() - ($1 || ' days')::INTERVAL;
      `, [retentionDays]);

      console.log(`[ThreatIntel] Purged ${expiredRes.rows.length} expired threats older than ${retentionDays} days.`);
    }
  } catch (err) {
    console.error('[ThreatIntel] Purge error:', err.message);
  }
}

// ── 5. Master Sync & Cache Refresh Trigger ──────────────────────────
async function syncAllFeeds() {
  if (isSyncing) {
    console.log('[ThreatIntel] Sync already in progress. Skipping duplicate run.');
    return;
  }
  isSyncing = true;
  try {
    const config = await getThreatIntelConfig();
    const feeds = config.feeds || { threatfox: true, malwarebazaar: true, urlhaus: true };

    if (feeds.threatfox !== false) {
      await syncThreatFox();
    }
    if (feeds.malwarebazaar !== false) {
      await syncMalwareBazaar();
    }
    if (feeds.urlhaus !== false) {
      await syncURLhaus();
    }

    await run60DayPurge();

    // Signal bulkWorker to reload its Level-1 in-memory RAM cache
    const bulkWorker = require('./bulkWorker');
    if (typeof bulkWorker.reloadThreatCache === 'function') {
      await bulkWorker.reloadThreatCache();
    }

    // 🚀 Automatic Retroactive Back-Testing across past telemetry
    try {
      const schedule = await getSavedRetroSchedule();
      if (schedule.enabled && (schedule.frequency === 'on_sync' || schedule.frequency === 'daily')) {
        const lookback = ['7d', '14d', '30d'].includes(schedule.lookbackWindow) ? schedule.lookbackWindow : '7d';
        console.log(`[ThreatIntel] Triggering automated retrohunt after feed sync (${lookback} historical lookback)...`);
        const threatHuntingController = require('../controllers/threatHuntingController');
        if (typeof threatHuntingController.executeAutoRetrohunt === 'function') {
          await threatHuntingController.executeAutoRetrohunt(lookback);
        }
      }
    } catch (autoRetroErr) {
      console.warn('[ThreatIntel] Auto-retrohunt warning:', autoRetroErr.message);
    }
  } finally {
    isSyncing = false;
  }
}

// ── 6. Client-Configurable Automated Retrohunt Scheduler ──────────────
let cachedSchedule = null;
let lastExecutedMinute = null;

async function getSavedRetroSchedule() {
  if (cachedSchedule) return cachedSchedule;
  try {
    const res = await db.query('SELECT threat_intel_config FROM settings LIMIT 1');
    if (res.rows.length > 0 && res.rows[0].threat_intel_config) {
      const cfg = typeof res.rows[0].threat_intel_config === 'string'
        ? JSON.parse(res.rows[0].threat_intel_config)
        : res.rows[0].threat_intel_config;
      cachedSchedule = cfg.retrohunt_schedule || null;
    }
  } catch (_) {}

  if (!cachedSchedule) {
    cachedSchedule = {
      enabled: true,
      frequency: 'daily',
      runTime: '08:00',
      lookbackWindow: '7d',
      lastRunAt: null
    };
  }
  return cachedSchedule;
}

function reloadRetrohuntSchedule(newSchedule) {
  cachedSchedule = newSchedule;
  console.log(`[ThreatIntel] Active Retrohunt Schedule updated: ${newSchedule.frequency} at ${newSchedule.runTime} (${newSchedule.lookbackWindow} lookback)`);
}

async function checkScheduleHeartbeat() {
  try {
    const schedule = await getSavedRetroSchedule();
    if (!schedule || !schedule.enabled || schedule.frequency === 'disabled' || schedule.frequency === 'on_sync') {
      return;
    }

    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMins = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMins}`;
    const currentMinuteKey = `${now.toDateString()} ${currentTimeStr}`;

    if (lastExecutedMinute === currentMinuteKey) return;

    let shouldRun = false;
    const lastRun = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
    const msSinceLast = lastRun ? (now.getTime() - lastRun.getTime()) : Infinity;
    const hoursSinceLast = msSinceLast / (1000 * 60 * 60);

    const targetTime = schedule.runTime || '08:00';

    if (schedule.frequency === 'daily') {
      if (currentTimeStr === targetTime && hoursSinceLast >= 12) {
        shouldRun = true;
      }
    } else if (schedule.frequency === '2days') {
      if (currentTimeStr === targetTime && hoursSinceLast >= 44) {
        shouldRun = true;
      }
    } else if (schedule.frequency === '5days') {
      if (currentTimeStr === targetTime && hoursSinceLast >= 116) {
        shouldRun = true;
      }
    } else if (schedule.frequency === 'every_6h') {
      if (hoursSinceLast >= 6) {
        shouldRun = true;
      }
    } else if (schedule.frequency === 'every_12h') {
      if (hoursSinceLast >= 12) {
        shouldRun = true;
      }
    }

    if (shouldRun) {
      lastExecutedMinute = currentMinuteKey;
      const lookback = ['7d', '14d', '30d'].includes(schedule.lookbackWindow) ? schedule.lookbackWindow : '7d';
      console.log(`[ThreatIntel] Executing scheduled retrohunt (${schedule.frequency} - ${lookback} lookback window)...`);
      const threatHuntingController = require('../controllers/threatHuntingController');
      if (typeof threatHuntingController.executeAutoRetrohunt === 'function') {
        await threatHuntingController.executeAutoRetrohunt(lookback);
        schedule.lastRunAt = now.toISOString();
        try {
          const sRes = await db.query('SELECT threat_intel_config FROM settings LIMIT 1');
          if (sRes.rows.length > 0) {
            const cfg = typeof sRes.rows[0].threat_intel_config === 'string'
              ? JSON.parse(sRes.rows[0].threat_intel_config)
              : sRes.rows[0].threat_intel_config;
            cfg.retrohunt_schedule = schedule;
            await db.query('UPDATE settings SET threat_intel_config = $1', [JSON.stringify(cfg)]);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[ThreatIntel] Schedule heartbeat check error:', err.message);
  }
}

// ── 7. Scheduler Initialization ────────────────────────────────────
function startThreatIntelSync() {
  if (process.env.THREAT_INTEL_SYNC_ENABLED === 'false') {
    console.log('[ThreatIntel] Threat feed sync is disabled via THREAT_INTEL_SYNC_ENABLED=false');
    return;
  }

  console.log('[ThreatIntel] Starting Threat Intelligence Engine...');
  // Initial sync on startup
  syncAllFeeds().catch(err => console.error('[ThreatIntel] Initial sync error:', err.message));

  // Recurring sync every interval (default: 6 hours)
  const intervalHours = parseInt(process.env.THREAT_INTEL_SYNC_INTERVAL_HOURS, 10) || 6;
  setInterval(() => {
    console.log('[ThreatIntel] Executing scheduled threat feed sync...');
    syncAllFeeds().catch(err => console.error('[ThreatIntel] Scheduled sync error:', err.message));
  }, intervalHours * 60 * 60 * 1000);

  // Heartbeat loop every 30 seconds for exact-minute schedule triggers
  setInterval(checkScheduleHeartbeat, 30000);
}

module.exports = {
  startThreatIntelSync,
  syncAllFeeds,
  syncThreatFox,
  syncMalwareBazaar,
  syncURLhaus,
  run60DayPurge,
  getThreatFoxApiKey,
  getThreatIntelConfig,
  reloadRetrohuntSchedule,
  getSavedRetroSchedule
};

