// ════════════════════════════════════════════════════════════════
// IOC Hunt — High-Performance Threat Feed Ingestion Worker
// ════════════════════════════════════════════════════════════════
// Fetches daily threat indicators from ThreatFox, MalwareBazaar,
// and URLhaus. Caches in Redis & PostgreSQL with 60-day auto-purge.
// ════════════════════════════════════════════════════════════════

const https = require('https');
const readline = require('readline');
const db = require('../config/db');
const { getRedisClient } = require('../config/redisClient');
const { decryptText } = require('../utils/cryptoHelper');

const redis = getRedisClient();

let isSyncing = false;

// Helper to fetch JSON from HTTPS endpoints
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
        ...headers
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}`));
        }
      });
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

// Helper to stream CSV lines from HTTPS endpoints
function streamCsvLines(url, onLine) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'IOCHunt-ThreatEngine/2.0' }, timeout: 60000 }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP error ${res.statusCode} fetching ${url}`));
      }

      const rl = readline.createInterface({ input: res, crlfDelay: Infinity });
      rl.on('line', (line) => {
        try {
          onLine(line);
        } catch (_) {}
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    }).on('error', reject);
  });
}

// Retrieve ThreatFox API Key (checks encrypted settings in DB, then env fallback)
async function getThreatFoxApiKey() {
  try {
    const res = await db.query('SELECT threat_intel_config FROM settings LIMIT 1');
    if (res.rows.length > 0 && res.rows[0].threat_intel_config) {
      const cfg = JSON.parse(res.rows[0].threat_intel_config);
      if (cfg.encryptedApiKey) {
        return decryptText(cfg.encryptedApiKey);
      }
      if (cfg.apiKey) return cfg.apiKey;
    }
  } catch (err) {
    console.warn('[ThreatIntel] DB config read warning:', err.message);
  }
  return process.env.THREATFOX_API_KEY || null;
}

// Helper for batch upserting indicators into PostgreSQL
async function bulkUpsertIocs(records) {
  if (!records || records.length === 0) return;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const values = [];
    const params = [];
    let pIdx = 1;

    for (const r of chunk) {
      values.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      params.push(r.ioc_type, r.ioc_value, r.malware_family || '', r.source_feed);
    }

    const query = `
      INSERT INTO threat_intel_iocs (ioc_type, ioc_value, malware_family, source_feed)
      VALUES ${values.join(', ')}
      ON CONFLICT (ioc_type, ioc_value) DO UPDATE SET 
        malware_family = EXCLUDED.malware_family,
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
      if (!val) continue;

      if (type === 'ip:port') {
        const ip = val.split(':')[0].trim();
        if (ip) {
          pipe.sadd('threat:ips', ip);
          records.push({ ioc_type: 'ip', ioc_value: ip, malware_family: malware, source_feed: 'threatfox' });
          count++;
        }
      } else if (type === 'domain') {
        const domain = val.toLowerCase().trim();
        if (domain && domain.includes('.')) {
          pipe.sadd('threat:domains', domain);
          records.push({ ioc_type: 'domain', ioc_value: domain, malware_family: malware, source_feed: 'threatfox' });
          count++;
        }
      } else if (type === 'sha256_hash') {
        const hash = val.toLowerCase().trim();
        if (hash.length === 64) {
          pipe.sadd('threat:hashes', hash);
          records.push({ ioc_type: 'sha256', ioc_value: hash, malware_family: malware, source_feed: 'threatfox' });
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
  console.log('[ThreatIntel] Fetching MalwareBazaar daily executable hashes...');
  try {
    const pipe = redis.pipeline();
    const records = [];
    let count = 0;

    await streamCsvLines('https://bazaar.abuse.ch/export/csv/recent/', (line) => {
      if (!line || line.startsWith('#')) return;
      // CSV format: "first_seen_utc","sha256_hash","md5_hash","sha1_hash","reporter","file_name","file_type_guess","signature"
      const cols = line.split('","').map(c => c.replace(/"/g, ''));
      const sha256 = (cols[1] || '').toLowerCase().trim();
      const signature = cols[7] || 'Malware';

      if (sha256 && sha256.length === 64) {
        pipe.sadd('threat:hashes', sha256);
        records.push({ ioc_type: 'sha256', ioc_value: sha256, malware_family: signature, source_feed: 'malwarebazaar' });
        count++;
      }
    });

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
  console.log('[ThreatIntel] Fetching URLhaus recent malicious domains & IPs...');
  try {
    const pipe = redis.pipeline();
    const records = [];
    let count = 0;

    await streamCsvLines('https://urlhaus.abuse.ch/downloads/csv_recent/', (line) => {
      if (!line || line.startsWith('#')) return;
      // CSV format: id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter
      const cols = line.split('","').map(c => c.replace(/"/g, ''));
      const rawUrl = cols[2];
      const threatTag = cols[6] || 'Malware';
      if (!rawUrl) return;

      try {
        let parseTarget = rawUrl.trim();
        if (!parseTarget.startsWith('http://') && !parseTarget.startsWith('https://')) {
          parseTarget = 'http://' + parseTarget;
        }
        const hostname = new URL(parseTarget).hostname.toLowerCase().trim();
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);

        if (isIp) {
          pipe.sadd('threat:ips', hostname);
          records.push({ ioc_type: 'ip', ioc_value: hostname, malware_family: threatTag, source_feed: 'urlhaus' });
          count++;
        } else if (hostname.includes('.')) {
          pipe.sadd('threat:domains', hostname);
          records.push({ ioc_type: 'domain', ioc_value: hostname, malware_family: threatTag, source_feed: 'urlhaus' });
          count++;
        }
      } catch (_) {}
    });

    await pipe.exec();
    await bulkUpsertIocs(records);
    console.log(`[ThreatIntel] URLhaus processed ${count} indicators.`);
    return { count };
  } catch (err) {
    console.error('[ThreatIntel] URLhaus sync error:', err.message);
    return { count: 0, error: err.message };
  }
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
    await syncThreatFox();
    await syncMalwareBazaar();
    await syncURLhaus();
    await run60DayPurge();

    // Signal bulkWorker to reload its Level-1 in-memory RAM cache
    const bulkWorker = require('./bulkWorker');
    if (typeof bulkWorker.reloadThreatCache === 'function') {
      await bulkWorker.reloadThreatCache();
    }
  } finally {
    isSyncing = false;
  }
}

// ── 6. Scheduler Initialization ────────────────────────────────────
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
}

module.exports = {
  startThreatIntelSync,
  syncAllFeeds,
  syncThreatFox,
  syncMalwareBazaar,
  syncURLhaus,
  run60DayPurge,
  getThreatFoxApiKey
};
