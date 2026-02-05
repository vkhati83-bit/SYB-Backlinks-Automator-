import IORedis from 'ioredis';
import env from './env.js';
import logger from '../utils/logger.js';

// Create Redis connection with retry settings for unstable connections
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  lazyConnect: true, // Don't connect immediately
  keepAlive: 30000, // Keep connection alive
  connectTimeout: 10000, // 10 second connection timeout
  family: 4, // Use IPv4
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('error', (error) => {
  logger.error('❌ Redis error:', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

// Test connection
export async function testRedisConnection(): Promise<boolean> {
  try {
    // Connect if not already connected
    if (redis.status !== 'ready') {
      await redis.connect();
    }
    await redis.ping();
    logger.info('✅ Redis ping successful');
    return true;
  } catch (error) {
    logger.error('❌ Redis ping failed:', error);
    return false;
  }
}

export default redis;
