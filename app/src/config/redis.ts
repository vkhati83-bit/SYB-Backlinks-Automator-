import IORedis from 'ioredis';
import env from './env.js';
import logger from '../utils/logger.js';

// Create Redis connection with retry settings
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 200, 5000);
    logger.warn(`Redis reconnecting, attempt ${times} (delay: ${delay}ms)`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  keepAlive: 10000, // More aggressive keepalive
  connectTimeout: 10000,
  family: 0, // Auto-detect IPv4/IPv6 (needed for Railway internal networking)
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
    await redis.ping();
    logger.info('✅ Redis ping successful');
    return true;
  } catch (error) {
    logger.error('❌ Redis ping failed:', error);
    return false;
  }
}

export default redis;
