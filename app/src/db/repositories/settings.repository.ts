import { db } from '../index.js';
import logger from '../../utils/logger.js';
import { Settings } from '../../types/index.js';

export class SettingsRepository {
  async get<T>(key: string): Promise<T | null> {
    try {
      const result = await db.query<{ value: T }>(
        'SELECT value FROM settings WHERE key = $1',
        [key]
      );
      return result.rows[0]?.value ?? null;
    } catch (error) {
      logger.error(`Failed to get setting ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, description?: string): Promise<void> {
    try {
      await db.query(`
        INSERT INTO settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          description = COALESCE(EXCLUDED.description, settings.description),
          updated_at = NOW()
      `, [key, JSON.stringify(value), description]);
    } catch (error) {
      logger.error(`Failed to set setting ${key}:`, error);
      throw error;
    }
  }

  async getAll(): Promise<Settings> {
    const result = await db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM settings'
    );

    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return {
      sender_name: settings.sender_name as string || 'SYB Research Team',
      sender_email: settings.sender_email as string || 'outreach@shieldyourbody.com',
      daily_send_limit: settings.daily_send_limit as number || 20,
      followup_1_delay_days: settings.followup_1_delay_days as number || 4,
      followup_2_delay_days: settings.followup_2_delay_days as number || 8,
      followup_mode: (settings.followup_mode as Settings['followup_mode']) || 'manual',
      min_domain_authority: settings.min_domain_authority as number || 20,
      max_spam_score: settings.max_spam_score as number || 30,
      min_monthly_traffic: settings.min_monthly_traffic as number || 1000,
      claude_model: settings.claude_model as string || 'claude-sonnet-4-20250514',
      warmup_enabled: settings.warmup_enabled as boolean ?? true,
      warmup_week: settings.warmup_week as number || 1,
    };
  }

  async updateMany(updates: Partial<Settings>): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          await client.query(`
            UPDATE settings SET value = $1, updated_at = NOW()
            WHERE key = $2
          `, [JSON.stringify(value), key]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update settings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getDailySendLimit(): Promise<number> {
    const settings = await this.getAll();

    if (!settings.warmup_enabled) {
      return settings.daily_send_limit;
    }

    // Warmup schedule
    const warmupLimits: Record<number, number> = {
      1: 20,
      2: 20,
      3: 50,
      4: 50,
      5: 75,
      6: 75,
      7: 100,
    };

    const week = Math.min(settings.warmup_week, 7);
    return warmupLimits[week] || settings.daily_send_limit;
  }

  async advanceWarmupWeek(): Promise<number> {
    const current = await this.get<number>('warmup_week') || 1;
    const next = Math.min(current + 1, 7);
    await this.set('warmup_week', next);
    return next;
  }
}

export const settingsRepository = new SettingsRepository();
export default settingsRepository;
