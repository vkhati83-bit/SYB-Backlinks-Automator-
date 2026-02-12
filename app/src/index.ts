import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env.js';
import logger from './utils/logger.js';
import { testConnections, closeConnections } from './db/index.js';
import { testRedisConnection } from './config/redis.js';
import apiRoutes from './api/routes/index.js';

// Workers
import { createContactFinderWorker } from './workers/contact-finder.worker.js';
import { createProspectingWorker } from './workers/prospecting.worker.js';
import { createEmailGeneratorWorker } from './workers/email-generator.worker.js';
import { createEmailSenderWorker } from './workers/email-sender.worker.js';
import { createFollowupWorker } from './workers/followup.worker.js';
import { createLinkCheckerWorker } from './workers/link-checker.worker.js';
import { createResponseClassifierWorker } from './workers/response-classifier.worker.js';
import { startTrashCleanupScheduler } from './workers/trash-cleanup.worker.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SYB Backlinks Gen',
    version: '1.0.0',
    description: 'Backlink Automation System for ShieldYourBody',
    api: '/api/v1',
    health: '/api/v1/health',
  });
});

// API routes
app.use('/api/v1', apiRoutes);

// Legacy health check (for backwards compatibility)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    safetyMode: env.SAFETY_MODE,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Store worker references for graceful shutdown
const workers: Array<{ close: () => Promise<void> }> = [];

// Start all workers
function startWorkers() {
  logger.info('Starting workers...');

  workers.push(createContactFinderWorker());
  workers.push(createProspectingWorker());
  workers.push(createEmailGeneratorWorker());
  workers.push(createEmailSenderWorker());
  workers.push(createFollowupWorker());
  workers.push(createLinkCheckerWorker());
  workers.push(createResponseClassifierWorker());

  logger.info(`Started ${workers.length} workers`);
}

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down...');

  // Close all workers
  for (const worker of workers) {
    await worker.close();
  }

  await closeConnections();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
async function start() {
  const PORT = env.PORT;

  try {
    // Test database connections
    logger.info('Testing database connections...');
    await testConnections();

    // Test Redis connection (non-blocking)
    logger.info('Testing Redis connection...');
    const redisConnected = await Promise.race([
      testRedisConnection(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
    ]);

    if (redisConnected) {
      logger.info('✅ Redis connection successful');
    } else {
      logger.warn('⚠️ Redis connection timeout - workers will retry automatically');
    }

    // Start workers (they will retry connections automatically)
    try {
      startWorkers();
    } catch (workerError) {
      logger.warn('Some workers failed to start:', workerError);
    }

    // Start trash cleanup scheduler (daily at 2:00 AM)
    try {
      startTrashCleanupScheduler();
    } catch (schedulerError) {
      logger.warn('Trash cleanup scheduler failed to start:', schedulerError);
    }

    // Start server (explicitly bind to 0.0.0.0 for Railway)
    app.listen(PORT, '0.0.0.0', () => {
      logger.info('='.repeat(50));
      logger.info('🚀 SYB Backlinks Gen API');
      logger.info('='.repeat(50));
      logger.info(`📍 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`🛡️ Safety Mode: ${env.SAFETY_MODE}`);
      logger.info(`👷 Workers: ${workers.length} active`);
      if (env.SAFETY_MODE === 'test') {
        logger.info(`📧 All emails redirect to: ${env.TEST_EMAIL_RECIPIENT}`);
      }
      logger.info('='.repeat(50));
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
