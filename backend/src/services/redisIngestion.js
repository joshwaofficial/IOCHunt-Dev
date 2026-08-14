const { getRedisClient } = require('../config/redisClient');

/**
 * Publishes parsed events into a Redis Stream for bulk processing.
 * 
 * @param {string} streamKey - The Redis stream key (e.g., 'ingest:syslog' or 'ingest:agent')
 * @param {string} tenantId - The tenant's logical database ID
 * @param {Array<Object>} events - Array of parsed event objects
 */
async function publishToStream(streamKey, tenantId, events) {
  if (!events || events.length === 0) return;
  
  // Create a pipeline to batch XADD commands
  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  
  for (const event of events) {
    // Stringify the payload and associate it with the tenantId
    const payload = JSON.stringify(event);
    pipeline.xadd(streamKey, '*', 'tenant_id', tenantId, 'payload', payload);
  }
  
  await pipeline.exec();
}

module.exports = {
  get redis() { return getRedisClient(); },
  publishToStream
};
