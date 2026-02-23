import { Pool } from 'pg';
import env from '../config/env.js';
import logger from '../utils/logger.js';

// Main database pool (Backlinks Gen - read/write)
export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// SEO Command Center database pool (read-only)
export const seoDb = new Pool({
  connectionString: env.SEO_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Research database pool (syb-research-db - read-only)
export const researchDb = env.RESEARCH_DATABASE_URL
  ? new Pool({
      connectionString: env.RESEARCH_DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    })
  : null;

// Test connections
export async function testConnections(): Promise<void> {
  try {
    // Test main database
    const mainResult = await db.query('SELECT NOW()');
    logger.info('✅ Main database connected:', mainResult.rows[0].now);

    // Test SEO database
    const seoResult = await seoDb.query('SELECT NOW()');
    logger.info('✅ SEO Command Center database connected:', seoResult.rows[0].now);
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }

  if (researchDb) {
    try {
      const researchResult = await researchDb.query('SELECT NOW()');
      logger.info('✅ Research database connected:', researchResult.rows[0].now);
    } catch (e) {
      logger.warn('⚠️  Research database connection failed (optional)');
    }
  }
}

// Graceful shutdown
export async function closeConnections(): Promise<void> {
  await db.end();
  await seoDb.end();
  if (researchDb) await researchDb.end();
  logger.info('Database connections closed');
}

// Query helper with logging
export async function query<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await db.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
    return result.rows as T[];
  } catch (error) {
    logger.error('Query failed:', { text, params, error });
    throw error;
  }
}

// SEO database query helper (read-only)
export async function seoQuery<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await seoDb.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`SEO Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
    return result.rows as T[];
  } catch (error) {
    logger.error('SEO Query failed:', { text, params, error });
    throw error;
  }
}

export default db;
