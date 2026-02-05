import { Pool, QueryResult } from 'pg';
import { db } from '../index.js';
import logger from '../../utils/logger.js';

export abstract class BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;

  constructor(tableName: string, pool: Pool = db) {
    this.tableName = tableName;
    this.pool = pool;
  }

  protected async query<R = T>(text: string, params?: unknown[]): Promise<R[]> {
    const start = Date.now();
    try {
      const result: QueryResult = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug(`Query [${this.tableName}] executed in ${duration}ms`);
      return result.rows as R[];
    } catch (error) {
      logger.error(`Query failed [${this.tableName}]:`, { text: text.substring(0, 200), error });
      throw error;
    }
  }

  protected async queryOne<R = T>(text: string, params?: unknown[]): Promise<R | null> {
    const rows = await this.query<R>(text, params);
    return rows[0] || null;
  }

  async findById(id: string): Promise<T | null> {
    return this.queryOne<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
  }

  async findAll(limit = 100, offset = 0): Promise<T[]> {
    return this.query<T>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  async count(where?: string, params?: unknown[]): Promise<number> {
    const whereClause = where ? `WHERE ${where}` : '';
    const result = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params
    );
    return parseInt(result?.count || '0', 10);
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async exists(id: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE id = $1) as exists`,
      [id]
    );
    return result?.exists || false;
  }
}

export default BaseRepository;
