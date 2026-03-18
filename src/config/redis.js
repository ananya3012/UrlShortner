// src/config/redis.js
// Redis client setup with connection pooling and error handling

const { createClient } = require('redis');

let redisClient = null;

/**
 * Initialize and connect Redis client.
 * Falls back gracefully if Redis is unavailable (cache misses handled in service layer).
 */
const connectRedis = async () => {
  const config = process.env.REDIS_URL
    ? { url: process.env.REDIS_URL }
    : {
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          reconnectStrategy: () => false, // Don't retry — Redis is optional
        },
        password: process.env.REDIS_PASSWORD || undefined,
      };

  redisClient = createClient(config);

  redisClient.on('connect', () => console.log('✅ Redis connected'));
  redisClient.on('error', (err) => console.error(`❌ Redis error: ${err.message}`));
  redisClient.on('reconnecting', () => console.warn('⚠️  Redis reconnecting...'));

  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('⚠️  Redis unavailable — running without cache (all reads hit MongoDB)');
    redisClient = null; // Allow app to run without cache
  }

  return redisClient;
};

/**
 * Get the active Redis client instance.
 * Returns null if Redis is unavailable (cache-aside pattern handles this).
 */
const getRedisClient = () => redisClient;

/**
 * Gracefully close Redis connection.
 */
const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    console.log('Redis connection closed.');
  }
};

module.exports = { connectRedis, getRedisClient, closeRedis };
