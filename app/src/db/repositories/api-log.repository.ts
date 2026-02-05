/**
 * API Response Log Repository
 * Never lose data - log ALL external API calls immediately
 */

import { db } from '../index.js';
import logger from '../../utils/logger.js';

export interface ApiLogEntry {
  service: 'dataforseo' | 'claude' | 'resend' | 'scraper' | 'other';
  endpoint: string;
  method?: string;
  requestBody?: Record<string, unknown>;
  statusCode?: number;
  responseBody?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
  cost?: number;
  jobId?: string;
  prospectId?: string;
  campaignId?: string;
}

export class ApiLogRepository {
  /**
   * Log an API call immediately - call this BEFORE processing the response
   * Returns the log ID so you can update it if needed
   */
  async log(entry: ApiLogEntry): Promise<string> {
    try {
      const result = await db.query(`
        INSERT INTO api_response_log (
          service, endpoint, method, request_body,
          status_code, response_body, response_headers,
          success, error_message, duration_ms, cost,
          job_id, prospect_id, campaign_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `, [
        entry.service,
        entry.endpoint,
        entry.method || 'POST',
        entry.requestBody ? JSON.stringify(entry.requestBody) : null,
        entry.statusCode || null,
        entry.responseBody ? JSON.stringify(entry.responseBody) : null,
        entry.responseHeaders ? JSON.stringify(entry.responseHeaders) : null,
        entry.success,
        entry.errorMessage || null,
        entry.durationMs || null,
        entry.cost || null,
        entry.jobId || null,
        entry.prospectId || null,
        entry.campaignId || null,
      ]);

      return result.rows[0].id;
    } catch (error) {
      // Even if logging fails, don't crash - just warn
      logger.error('Failed to log API response:', error);
      return '';
    }
  }

  /**
   * Update an existing log entry (e.g., after processing)
   */
  async update(id: string, updates: Partial<ApiLogEntry>): Promise<void> {
    if (!id) return;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.statusCode !== undefined) {
      setClauses.push(`status_code = $${paramIndex++}`);
      values.push(updates.statusCode);
    }
    if (updates.responseBody !== undefined) {
      setClauses.push(`response_body = $${paramIndex++}`);
      values.push(JSON.stringify(updates.responseBody));
    }
    if (updates.success !== undefined) {
      setClauses.push(`success = $${paramIndex++}`);
      values.push(updates.success);
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }
    if (updates.durationMs !== undefined) {
      setClauses.push(`duration_ms = $${paramIndex++}`);
      values.push(updates.durationMs);
    }
    if (updates.cost !== undefined) {
      setClauses.push(`cost = $${paramIndex++}`);
      values.push(updates.cost);
    }

    if (setClauses.length === 0) return;

    values.push(id);

    try {
      await db.query(`
        UPDATE api_response_log
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `, values);
    } catch (error) {
      logger.error('Failed to update API log:', error);
    }
  }

  /**
   * Get recent logs for a service
   */
  async getRecent(service?: string, limit: number = 50): Promise<unknown[]> {
    const result = await db.query(`
      SELECT *
      FROM api_response_log
      ${service ? 'WHERE service = $1' : ''}
      ORDER BY created_at DESC
      LIMIT ${service ? '$2' : '$1'}
    `, service ? [service, limit] : [limit]);

    return result.rows;
  }

  /**
   * Get failed API calls for debugging
   */
  async getFailures(service?: string, limit: number = 50): Promise<unknown[]> {
    const result = await db.query(`
      SELECT *
      FROM api_response_log
      WHERE success = false
      ${service ? 'AND service = $1' : ''}
      ORDER BY created_at DESC
      LIMIT ${service ? '$2' : '$1'}
    `, service ? [service, limit] : [limit]);

    return result.rows;
  }

  /**
   * Get API usage stats
   */
  async getStats(days: number = 7): Promise<{
    byService: Record<string, { total: number; success: number; failed: number; cost: number }>;
    total: number;
    successRate: number;
    totalCost: number;
  }> {
    const result = await db.query(`
      SELECT
        service,
        COUNT(*) as total,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as fail_count,
        COALESCE(SUM(cost), 0) as total_cost
      FROM api_response_log
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY service
    `);

    const byService: Record<string, { total: number; success: number; failed: number; cost: number }> = {};
    let total = 0;
    let totalSuccess = 0;
    let totalCost = 0;

    for (const row of result.rows) {
      byService[row.service] = {
        total: parseInt(row.total),
        success: parseInt(row.success_count),
        failed: parseInt(row.fail_count),
        cost: parseFloat(row.total_cost),
      };
      total += parseInt(row.total);
      totalSuccess += parseInt(row.success_count);
      totalCost += parseFloat(row.total_cost);
    }

    return {
      byService,
      total,
      successRate: total > 0 ? (totalSuccess / total) * 100 : 0,
      totalCost,
    };
  }
}

export const apiLogRepository = new ApiLogRepository();
