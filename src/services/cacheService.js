// src/services/cacheService.js
// Redis cache layer — implements cache-aside pattern for URL lookups

const { getRedisClient } = require('../config/redis');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 3600; // 1 hour

// Key prefix for namespacing (useful when Redis is shared across services)
const KEY_PREFIX = 'url:';

/**
 * Build a Redis key from a shortId.
 * @param {string} shortId
 * @returns {string}
 */
const buildKey = (shortId) => `${KEY_PREFIX}${shortId}`;

/**
 * Cache-aside pattern:
 *   1. Check Redis (fast, ~0.1ms)
 *   2. On miss, fetch from MongoDB (~5-20ms)
 *   3. Populate Redis for next request
 *
 * This means the first request to a URL hits MongoDB,
 * but all subsequent requests within TTL are served from Redis.
 */

/**
 * Get a cached URL by shortId.
 * @param {string} shortId
 * @returns {Promise<string|null>} Original URL or null on miss
 */
const getCachedUrl = async (shortId) => {
  const client = getRedisClient();
  if (!client) return null; // Redis unavailable — graceful degradation

  try {
    const cached = await client.get(buildKey(shortId));
    return cached; // Returns null if key doesn't exist
  } catch (err) {
    console.error(`Cache GET error for ${shortId}: ${err.message}`);
    return null; // Fail open: allow DB lookup on cache error
  }
};

/**
 * Cache a URL mapping with TTL.
 * @param {string} shortId
 * @param {string} originalUrl
 * @param {number} [ttl] - TTL in seconds (defaults to env setting)
 * @returns {Promise<void>}
 */
const setCachedUrl = async (shortId, originalUrl, ttl = DEFAULT_TTL) => {
  const client = getRedisClient();
  if (!client) return; // Redis unavailable — skip caching

  try {
    await client.setEx(buildKey(shortId), ttl, originalUrl);
  } catch (err) {
    console.error(`Cache SET error for ${shortId}: ${err.message}`);
    // Non-fatal — data is still in MongoDB
  }
};

/**
 * Invalidate a cached URL (e.g., on soft-delete or expiry).
 * @param {string} shortId
 * @returns {Promise<void>}
 */
const invalidateCache = async (shortId) => {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(buildKey(shortId));
  } catch (err) {
    console.error(`Cache DEL error for ${shortId}: ${err.message}`);
  }
};

/**
 * Warm up the cache with a batch of URLs (useful at startup or for hot URLs).
 * @param {Array<{shortId: string, originalUrl: string}>} urls
 * @returns {Promise<void>}
 */
const warmCache = async (urls) => {
  const client = getRedisClient();
  if (!client || !urls.length) return;

  try {
    // Use pipeline for atomic batch writes (single round-trip to Redis)
    const pipeline = client.multi();
    for (const { shortId, originalUrl } of urls) {
      pipeline.setEx(buildKey(shortId), DEFAULT_TTL, originalUrl);
    }
    await pipeline.exec();
    console.log(`🔥 Cache warmed with ${urls.length} URLs`);
  } catch (err) {
    console.error(`Cache warm-up error: ${err.message}`);
  }
};

module.exports = { getCachedUrl, setCachedUrl, invalidateCache, warmCache };
