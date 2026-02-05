import { Router } from 'express';
import { db, seoDb, testConnections } from '../../db/index.js';
import { testRedisConnection } from '../../config/redis.js';
import { getQueueStats } from '../../config/queues.js';
import env from '../../config/env.js';

const router = Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    safetyMode: env.SAFETY_MODE,
  });
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // Check main database
  const dbStart = Date.now();
  try {
    await db.query('SELECT 1');
    checks.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch (error: any) {
    checks.database = { status: 'unhealthy', error: error.message };
  }

  // Check SEO database
  const seoStart = Date.now();
  try {
    await seoDb.query('SELECT 1');
    checks.seo_database = { status: 'healthy', latency: Date.now() - seoStart };
  } catch (error: any) {
    checks.seo_database = { status: 'unhealthy', error: error.message };
  }

  // Check Redis
  const redisStart = Date.now();
  try {
    const redisOk = await testRedisConnection();
    checks.redis = {
      status: redisOk ? 'healthy' : 'unhealthy',
      latency: Date.now() - redisStart,
    };
  } catch (error: any) {
    checks.redis = { status: 'unhealthy', error: error.message };
  }

  // Get queue stats
  try {
    const queueStats = await getQueueStats();
    checks.queues = { status: 'healthy', ...queueStats } as any;
  } catch (error: any) {
    checks.queues = { status: 'unhealthy', error: error.message };
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
