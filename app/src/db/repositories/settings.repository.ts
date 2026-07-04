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
      daily_send_limit: settings.daily_send_limit as number || 9999,
      followup_1_delay_days: settings.followup_1_delay_days as number || 4,
      followup_2_delay_days: settings.followup_2_delay_days as number || 8,
      followup_mode: (settings.followup_mode as Settings['followup_mode']) || 'manual',
      min_domain_authority: settings.min_domain_authority as number || 20,
      max_spam_score: settings.max_spam_score as number || 30,
      min_monthly_traffic: settings.min_monthly_traffic as number || 1000,
      claude_model: settings.claude_model as string || 'claude-sonnet-5',
      warmup_enabled: settings.warmup_enabled as boolean ?? true,
      warmup_week: settings.warmup_week as number || 1,
      email_signature: settings.email_signature as string || '',
      sender_title: settings.sender_title as string || 'EMF Research Specialist',
      email_template_research: settings.email_template_research as string || '',
      email_template_broken_link: settings.email_template_broken_link as string || '',
      email_template_followup_1: settings.email_template_followup_1 as string || '',
      email_template_followup_2: settings.email_template_followup_2 as string || '',
      autopilot_enabled: settings.autopilot_enabled as boolean ?? false,
      autopilot_run_hour: settings.autopilot_run_hour as number ?? 8,
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

}

export const settingsRepository = new SettingsRepository();
export default settingsRepository;
