// ════════════════════════════════════════════════════════════════
// IOC Hunt — Redis Client (SaaS Architecture)
// ════════════════════════════════════════════════════════════════
// Central Redis connection used by:
// 1. Ingestion API (publishes logs to Redis Streams)
// 2. Bulk Workers (consume logs from Redis Streams)
// 3. Rate limiting and tenant-aware caching
// ════════════════════════════════════════════════════════════════

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisClient = null;
let isConnected = false;

/**
 * Get the shared Redis client instance (lazy initialization).
 * @returns {Redis}
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})...`);
      return delay;
    },
    lazyConnect: false
  });

  redisClient.on('connect', () => {
    isConnected = true;
    console.log(`[Redis] Connected to ${REDIS_URL}`);
  });

  redisClient.on('error', (err) => {
    isConnected = false;
    console.error('[Redis] Connection error:', err.message);
  });

  redisClient.on('close', () => {
    isConnected = false;
    console.log('[Redis] Connection closed.');
  });

  return redisClient;
}

/**
 * Check if Redis is currently connected.
 * @returns {boolean}
 */
function isRedisConnected() {
  return isConnected;
}

/**
 * Gracefully close the Redis connection.
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    console.log('[Redis] Connection closed gracefully.');
  }
}

module.exports = {
  getRedisClient,
  isRedisConnected,
  closeRedis
};
