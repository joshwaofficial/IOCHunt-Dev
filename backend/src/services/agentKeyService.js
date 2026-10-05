// ════════════════════════════════════════════════════════════════
// IOC Hunt — Agent Key Management & Zero-Trust Verification Service
// ════════════════════════════════════════════════════════════════
// Features:
// 1. High-Performance Bulk Key Generation (Single Multi-Row Batch INSERT, <20ms)
// 2. Trust-On-First-Use (TOFU) Automatic Machine Binding
// 3. Sub-millisecond Redis Caching (<0.2ms Auth) with Graceful Postgres Fallback
// 4. Instant Global Key Revocation & Cache Invalidation
// ════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const db = require('../config/db');
const { getRedisClient, isRedisConnected } = require('../config/redisClient');

const REDIS_KEY_TTL = 86400; // 24 hours

/**
 * Hash raw key using SHA-256
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Generates bulk cryptographically secure agent keys in a single batch SQL insertion
 * @param {Object} options
 * @param {string} options.tenantId
 * @param {number} options.count
 * @param {string} options.label
 * @param {string} options.createdBy
 * @returns {Promise<Array<{id: number, key: string, keyPrefix: string, label: string, status: string, createdAt: number}>>}
 */
async function generateBulkKeys({ tenantId = 'default', count = 10, label = '', createdBy = 'admin' }) {
  const safeCount = Math.max(1, Math.min(Number(count) || 10, 1000));
  const keys = [];
  const insertValues = [];
  const insertParams = [];
  let pIdx = 1;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < safeCount; i++) {
    // Generate clean high-entropy Base64URL key (16 random bytes = 22 characters, e.g. "BmHyVFDWUO1tUkiOC5gvbw")
    const rawKey = crypto.randomBytes(16).toString('base64url');
    const prefix = rawKey.slice(0, 8); // 8-char identifier prefix (e.g. "BmHyVFDW")
    const keyHash = hashKey(rawKey);

    keys.push({
      key: rawKey, // Plaintext secret returned ONLY once upon creation
      keyPrefix: prefix,
      label: label ? label.trim() : '',
      status: 'pending',
      createdAt: now
    });

    insertValues.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, 'pending', $${pIdx++}, $${pIdx++})`);
    insertParams.push(tenantId, prefix, keyHash, label ? label.trim() : '', createdBy, now);
  }

  // Single Batch SQL INSERT for maximum efficiency
  const query = `
    INSERT INTO agent_keys (tenant_id, key_prefix, key_hash, label, status, created_by, created_at)
    VALUES ${insertValues.join(', ')}
    RETURNING id, key_prefix, label, status, created_at
  `;

  const res = await db.query(query, insertParams);

  for (let i = 0; i < res.rows.length; i++) {
    keys[i].id = res.rows[i].id;
  }

  return keys;
}

/**
 * Validates an incoming agent key, enforcing machine binding and TOFU enrollment.
 * Uses Redis cache for sub-millisecond point lookups.
 * @param {string} rawKey
 * @param {string} reportedMachine
 * @param {string} clientIp
 * @returns {Promise<{valid: boolean, reason?: string, tenantId?: string, boundMachine?: string, id?: number, label?: string, newlyBound?: boolean}>}
 */
async function validateAndBindAgentKey(rawKey, reportedMachine, clientIp) {
  if (!rawKey || typeof rawKey !== 'string') {
    return { valid: false, reason: 'Missing API key' };
  }

  const cleanKey = rawKey.trim();
  const keyHash = hashKey(cleanKey);
  const cacheKey = `agent_key:${keyHash}`;
  const normReported = reportedMachine ? reportedMachine.trim().toLowerCase() : '';

  // 1. Check Redis Cache (Fastest Path: < 0.2ms)
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.status !== 'active') {
          return { valid: false, reason: 'Agent key is deactivated or revoked' };
        }

        // Auto-heal: If bound to placeholder 'UNNAMED-ENDPOINT' and real machine identity arrives, bind to real machine!
        if (normReported && normReported !== 'unnamed-endpoint' && (!data.boundMachine || data.boundMachine.toUpperCase() === 'UNNAMED-ENDPOINT')) {
          const realMachine = reportedMachine.trim();
          const now = Math.floor(Date.now() / 1000);
          await db.query('UPDATE agent_keys SET bound_machine = $1, last_used_at = $2 WHERE id = $3', [realMachine, now, data.id]);
          data.boundMachine = realMachine;
          await redis.set(cacheKey, JSON.stringify(data), 'EX', REDIS_KEY_TTL);
          return {
            valid: true,
            id: data.id,
            tenantId: data.tenantId,
            boundMachine: realMachine,
            label: data.label,
            newlyBound: true
          };
        }

        if (normReported && data.boundMachine && data.boundMachine.toUpperCase() !== 'UNNAMED-ENDPOINT' && data.boundMachine.toLowerCase() !== normReported) {
          return {
            valid: false,
            reason: 'Machine identity mismatch: Agent key is already paired to another endpoint',
            internalReason: `Machine identity mismatch: Key is bound to '${data.boundMachine}', but request specified '${reportedMachine}'`,
            boundMachine: data.boundMachine
          };
        }
        return {
          valid: true,
          id: data.id,
          tenantId: data.tenantId,
          boundMachine: data.boundMachine,
          label: data.label
        };
      }
    } catch (err) {
      console.warn('[AgentKey] Redis cache lookup failed, falling back to DB:', err.message);
    }
  }

  // 2. Cache Miss: Query PostgreSQL
  const res = await db.query(
    'SELECT id, tenant_id, key_prefix, bound_machine, label, status FROM agent_keys WHERE key_hash = $1',
    [keyHash]
  );

  if (res.rows.length === 0) {
    return { valid: false, reason: 'Invalid API key' };
  }

  const row = res.rows[0];

  if (row.status === 'revoked') {
    return { valid: false, reason: 'Agent key has been revoked by an administrator' };
  }

  const now = Math.floor(Date.now() / 1000);

  // 3. First-Contact (TOFU) Machine Binding
  if (row.status === 'pending') {
    // If request contains NO machine name (e.g. initial connection test/challenge),
    // allow request to succeed as valid key but remain pending so it can bind to the real machine on first log!
    if (!normReported || normReported === 'unnamed-endpoint') {
      return {
        valid: true,
        id: row.id,
        tenantId: row.tenant_id,
        boundMachine: null,
        label: row.label,
        pending: true
      };
    }

    const machineToBind = reportedMachine.trim();
    const updateRes = await db.query(`
      UPDATE agent_keys
      SET bound_machine = $1, status = 'active', activated_at = $2, last_used_at = $2
      WHERE id = $3 AND status = 'pending'
      RETURNING id, tenant_id, bound_machine, label, status
    `, [machineToBind, now, row.id]);

    if (updateRes.rows.length > 0) {
      const activated = updateRes.rows[0];

      // Cache in Redis
      if (isRedisConnected()) {
        try {
          const redis = getRedisClient();
          await redis.set(
            cacheKey,
            JSON.stringify({
              id: activated.id,
              tenantId: activated.tenant_id,
              boundMachine: activated.bound_machine,
              label: activated.label,
              status: 'active'
            }),
            'EX',
            REDIS_KEY_TTL
          );
        } catch (_) {}
      }

      return {
        valid: true,
        id: activated.id,
        tenantId: activated.tenant_id,
        boundMachine: activated.bound_machine,
        label: activated.label,
        newlyBound: true
      };
    }
  }

  // 4. Active Key Validation & Identity Enforcement
  if (row.status === 'active') {
    // Auto-heal: If DB key was previously bound to 'UNNAMED-ENDPOINT' and real machine identity arrives, bind to real machine!
    if (normReported && normReported !== 'unnamed-endpoint' && (!row.bound_machine || row.bound_machine.toUpperCase() === 'UNNAMED-ENDPOINT')) {
      const realMachine = reportedMachine.trim();
      await db.query('UPDATE agent_keys SET bound_machine = $1, last_used_at = $2 WHERE id = $3', [realMachine, now, row.id]);
      row.bound_machine = realMachine;

      if (isRedisConnected()) {
        try {
          const redis = getRedisClient();
          await redis.set(
            cacheKey,
            JSON.stringify({
              id: row.id,
              tenantId: row.tenant_id,
              boundMachine: realMachine,
              label: row.label,
              status: 'active'
            }),
            'EX',
            REDIS_KEY_TTL
          );
        } catch (_) {}
      }

      return {
        valid: true,
        id: row.id,
        tenantId: row.tenant_id,
        boundMachine: realMachine,
        label: row.label,
        newlyBound: true
      };
    }

    if (normReported && row.bound_machine && row.bound_machine.toUpperCase() !== 'UNNAMED-ENDPOINT' && row.bound_machine.toLowerCase() !== normReported) {
      return {
        valid: false,
        reason: 'Machine identity mismatch: Agent key is already paired to another endpoint',
        internalReason: `Machine identity mismatch: Key is bound to '${row.bound_machine}', but request specified '${reportedMachine}'`,
        boundMachine: row.bound_machine
      };
    }

    // Populate Redis Cache
    if (isRedisConnected()) {
      try {
        const redis = getRedisClient();
        await redis.set(
          cacheKey,
          JSON.stringify({
            id: row.id,
            tenantId: row.tenant_id,
            boundMachine: row.bound_machine,
            label: row.label,
            status: 'active'
          }),
          'EX',
          REDIS_KEY_TTL
        );
      } catch (_) {}
    }

    return {
      valid: true,
      id: row.id,
      tenantId: row.tenant_id,
      boundMachine: row.bound_machine,
      label: row.label
    };
  }

  return { valid: false, reason: 'Key status invalid' };
}

/**
 * Revoke an active or pending key immediately
 */
async function revokeKey(id, tenantId) {
  const queryParam = tenantId === 'all'
    ? 'SELECT id, key_hash FROM agent_keys WHERE id = $1'
    : 'SELECT id, key_hash FROM agent_keys WHERE id = $1 AND tenant_id = $2';
  const queryArgs = tenantId === 'all' ? [id] : [id, tenantId];

  const checkRes = await db.query(queryParam, queryArgs);
  if (checkRes.rows.length === 0) return false;

  const keyHash = checkRes.rows[0].key_hash;
  await db.query("UPDATE agent_keys SET status = 'revoked' WHERE id = $1", [id]);

  // Evict from Redis immediately
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      await redis.del(`agent_key:${keyHash}`);
    } catch (_) {}
  }

  return true;
}

/**
 * Reset a key binding (e.g. for re-imaged/formatted endpoints) back to pending
 */
async function resetKey(id, tenantId) {
  const queryParam = tenantId === 'all'
    ? 'SELECT id, key_hash FROM agent_keys WHERE id = $1'
    : 'SELECT id, key_hash FROM agent_keys WHERE id = $1 AND tenant_id = $2';
  const queryArgs = tenantId === 'all' ? [id] : [id, tenantId];

  const checkRes = await db.query(queryParam, queryArgs);
  if (checkRes.rows.length === 0) return false;

  const keyHash = checkRes.rows[0].key_hash;
  await db.query(
    "UPDATE agent_keys SET bound_machine = NULL, status = 'pending', activated_at = NULL WHERE id = $1",
    [id]
  );

  // Evict from Redis immediately
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      await redis.del(`agent_key:${keyHash}`);
    } catch (_) {}
  }

  return true;
}

/**
 * Delete a key permanently
 */
async function deleteKey(id, tenantId) {
  const queryParam = tenantId === 'all'
    ? 'DELETE FROM agent_keys WHERE id = $1 RETURNING key_hash'
    : 'DELETE FROM agent_keys WHERE id = $1 AND tenant_id = $2 RETURNING key_hash';
  const queryArgs = tenantId === 'all' ? [id] : [id, tenantId];

  const res = await db.query(queryParam, queryArgs);
  if (res.rows.length > 0 && isRedisConnected()) {
    try {
      const redis = getRedisClient();
      await redis.del(`agent_key:${res.rows[0].key_hash}`);
    } catch (_) {}
    return true;
  }
  return false;
}

/**
 * List keys with pagination, search, status filter, and aggregate statistics
 */
async function listKeys({ tenantId = 'default', status = 'all', search = '', limit = 50, offset = 0 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const whereClauses = [];
  const params = [];
  let pIdx = 1;

  if (tenantId !== 'all') {
    whereClauses.push(`tenant_id = $${pIdx++}`);
    params.push(tenantId);
  }

  if (status && status !== 'all') {
    whereClauses.push(`status = $${pIdx++}`);
    params.push(status);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push(`(key_prefix ILIKE $${pIdx} OR bound_machine ILIKE $${pIdx} OR label ILIKE $${pIdx})`);
    params.push(term);
    pIdx++;
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const dataQuery = `
    SELECT id, tenant_id, key_prefix, bound_machine, label, status, created_by, created_at, activated_at, last_used_at
    FROM agent_keys
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${pIdx++} OFFSET $${pIdx++}
  `;
  params.push(safeLimit, safeOffset);

  const countQuery = `SELECT COUNT(*)::INTEGER AS total FROM agent_keys ${whereSql}`;
  const countParams = params.slice(0, pIdx - 3);

  // Stats query
  const statsWhere = tenantId !== 'all' ? 'WHERE tenant_id = $1' : '';
  const statsParams = tenantId !== 'all' ? [tenantId] : [];
  const statsQuery = `
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(CASE WHEN status = 'active' THEN 1 END)::INTEGER AS active,
      COUNT(CASE WHEN status = 'pending' THEN 1 END)::INTEGER AS pending,
      COUNT(CASE WHEN status = 'revoked' THEN 1 END)::INTEGER AS revoked
    FROM agent_keys
    ${statsWhere}
  `;

  const [dataRes, countRes, statsRes] = await Promise.all([
    db.query(dataQuery, params),
    db.query(countQuery, countParams),
    db.query(statsQuery, statsParams)
  ]);

  return {
    keys: dataRes.rows,
    total: countRes.rows[0]?.total || 0,
    stats: statsRes.rows[0] || { total: 0, active: 0, pending: 0, revoked: 0 },
    limit: safeLimit,
    offset: safeOffset
  };
}

/**
 * Bulk revoke multiple keys immediately
 */
async function bulkRevokeKeys(ids, tenantId) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const cleanIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (cleanIds.length === 0) return 0;

  const queryParam = tenantId === 'all'
    ? 'SELECT id, key_hash FROM agent_keys WHERE id = ANY($1)'
    : 'SELECT id, key_hash FROM agent_keys WHERE id = ANY($1) AND tenant_id = $2';
  const queryArgs = tenantId === 'all' ? [cleanIds] : [cleanIds, tenantId];

  const checkRes = await db.query(queryParam, queryArgs);
  if (checkRes.rows.length === 0) return 0;

  const targetIds = checkRes.rows.map(r => r.id);
  await db.query("UPDATE agent_keys SET status = 'revoked' WHERE id = ANY($1)", [targetIds]);

  // Evict from Redis immediately
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      for (const row of checkRes.rows) {
        pipeline.del(`agent_key:${row.key_hash}`);
      }
      await pipeline.exec();
    } catch (_) {}
  }

  return targetIds.length;
}

/**
 * Bulk reset multiple keys (unbind machines, return to pending)
 */
async function bulkResetKeys(ids, tenantId) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const cleanIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (cleanIds.length === 0) return 0;

  const queryParam = tenantId === 'all'
    ? 'SELECT id, key_hash FROM agent_keys WHERE id = ANY($1)'
    : 'SELECT id, key_hash FROM agent_keys WHERE id = ANY($1) AND tenant_id = $2';
  const queryArgs = tenantId === 'all' ? [cleanIds] : [cleanIds, tenantId];

  const checkRes = await db.query(queryParam, queryArgs);
  if (checkRes.rows.length === 0) return 0;

  const targetIds = checkRes.rows.map(r => r.id);
  await db.query(
    "UPDATE agent_keys SET bound_machine = NULL, status = 'pending', activated_at = NULL WHERE id = ANY($1)",
    [targetIds]
  );

  // Evict from Redis immediately
  if (isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      for (const row of checkRes.rows) {
        pipeline.del(`agent_key:${row.key_hash}`);
      }
      await pipeline.exec();
    } catch (_) {}
  }

  return targetIds.length;
}

/**
 * Bulk delete multiple keys permanently
 */
async function bulkDeleteKeys(ids, tenantId) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const cleanIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (cleanIds.length === 0) return 0;

  const queryParam = tenantId === 'all'
    ? 'DELETE FROM agent_keys WHERE id = ANY($1) RETURNING id, key_hash'
    : 'DELETE FROM agent_keys WHERE id = ANY($1) AND tenant_id = $2 RETURNING id, key_hash';
  const queryArgs = tenantId === 'all' ? [cleanIds] : [cleanIds, tenantId];

  const res = await db.query(queryParam, queryArgs);
  if (res.rows.length > 0 && isRedisConnected()) {
    try {
      const redis = getRedisClient();
      const pipeline = redis.pipeline();
      for (const row of res.rows) {
        pipeline.del(`agent_key:${row.key_hash}`);
      }
      await pipeline.exec();
    } catch (_) {}
  }

  return res.rows.length;
}

module.exports = {
  hashKey,
  generateBulkKeys,
  validateAndBindAgentKey,
  revokeKey,
  resetKey,
  deleteKey,
  bulkRevokeKeys,
  bulkResetKeys,
  bulkDeleteKeys,
  listKeys
};
