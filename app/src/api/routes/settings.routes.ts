import { Router, Request, Response } from 'express';
import { settingsRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// GET /api/v1/settings - Get all settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.query('SELECT key, value, description FROM settings');

    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      // Parse JSON values
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    res.json({ settings });
  } catch (error) {
    logger.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// GET /api/v1/settings/:key - Get single setting
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const setting = await settingsRepository.get(req.params.key as string);
    if (setting === null) {
      res.status(404).json({ error: 'Setting not found' });
      return;
    }

    res.json({ key: req.params.key, value: setting });
  } catch (error) {
    logger.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// PUT /api/v1/settings/:key - Update single setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { value } = req.body;

    if (value === undefined) {
      res.status(400).json({ error: 'Value is required' });
      return;
    }

    // Validate certain settings
    const key = req.params.key;

    if (key === 'daily_send_limit') {
      const limit = parseInt(value);
      if (isNaN(limit) || limit < 1 || limit > 500) {
        res.status(400).json({ error: 'Daily send limit must be between 1 and 500' });
        return;
      }
    }

    if (key === 'safety_mode' && !['test', 'live'].includes(value)) {
      res.status(400).json({ error: 'Safety mode must be "test" or "live"' });
      return;
    }

    await settingsRepository.set(key as string, value);

    await auditRepository.log({
      action: 'settings_changed',
      entity_type: 'settings',
      entity_id: key as string,
      details: { value },
    });

    res.json({ success: true, key, value });
  } catch (error) {
    logger.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// PUT /api/v1/settings - Bulk update settings
router.put('/', async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Settings object is required' });
      return;
    }

    const updates: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
      await settingsRepository.set(key as string, value);
      updates.push(key);
    }

    await auditRepository.log({
      action: 'settings_changed',
      entity_type: 'settings',
      details: { keys: updates },
    });

    res.json({ success: true, updated: updates });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/v1/settings/blocklist/domains - Get blocked domains
router.get('/blocklist/domains', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT value, reason, created_at
      FROM blocklist
      WHERE type = 'domain'
      ORDER BY created_at DESC
    `);

    res.json({ domains: result.rows });
  } catch (error) {
    logger.error('Error fetching blocked domains:', error);
    res.status(500).json({ error: 'Failed to fetch blocked domains' });
  }
});

// GET /api/v1/settings/blocklist/emails - Get blocked emails
router.get('/blocklist/emails', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT value, reason, created_at
      FROM blocklist
      WHERE type = 'email'
      ORDER BY created_at DESC
    `);

    res.json({ emails: result.rows });
  } catch (error) {
    logger.error('Error fetching blocked emails:', error);
    res.status(500).json({ error: 'Failed to fetch blocked emails' });
  }
});

// POST /api/v1/settings/blocklist - Add to blocklist
router.post('/blocklist', async (req: Request, res: Response) => {
  try {
    const { type, value, reason } = req.body;

    if (!type || !value) {
      res.status(400).json({ error: 'Type and value are required' });
      return;
    }

    if (!['domain', 'email'].includes(type)) {
      res.status(400).json({ error: 'Type must be "domain" or "email"' });
      return;
    }

    await db.query(`
      INSERT INTO blocklist (type, value, reason, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (type, value) DO UPDATE SET reason = $3
    `, [type, value.toLowerCase(), reason || 'Manually added']);

    await auditRepository.logBlocklistAdded(type, value);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error adding to blocklist:', error);
    res.status(500).json({ error: 'Failed to add to blocklist' });
  }
});

// DELETE /api/v1/settings/blocklist - Remove from blocklist
router.delete('/blocklist', async (req: Request, res: Response) => {
  try {
    const { type, value } = req.body;

    if (!type || !value) {
      res.status(400).json({ error: 'Type and value are required' });
      return;
    }

    await db.query(`
      DELETE FROM blocklist
      WHERE type = $1 AND value = $2
    `, [type, value.toLowerCase()]);

    await auditRepository.log({
      action: 'blocklist_removed',
      entity_type: 'blocklist',
      details: { type, value },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing from blocklist:', error);
    res.status(500).json({ error: 'Failed to remove from blocklist' });
  }
});

// ============================================
// DANGER ZONE: FACTORY RESET
// ============================================

// POST /api/v1/settings/factory-reset - Reset everything (ADMIN ONLY)
router.post('/factory-reset', async (req: Request, res: Response) => {
  try {
    const { confirmation, admin_password } = req.body;

    // Require explicit confirmation
    if (confirmation !== 'RESET_EVERYTHING') {
      res.status(400).json({
        error: 'Confirmation required',
        message: 'Send confirmation: "RESET_EVERYTHING" to proceed'
      });
      return;
    }

    // TODO: Add admin authentication check when login is implemented
    // For now, require admin password from environment
    const ADMIN_RESET_PASSWORD = process.env.ADMIN_RESET_PASSWORD || 'syb-admin-reset-2026';
    if (admin_password !== ADMIN_RESET_PASSWORD) {
      res.status(403).json({ error: 'Invalid admin password' });
      return;
    }

    logger.warn('⚠️  FACTORY RESET INITIATED - Deleting ALL data');

    // Count everything before deletion
    const beforeCounts = {
      prospects: (await db.query('SELECT COUNT(*) as count FROM prospects')).rows[0].count,
      contacts: (await db.query('SELECT COUNT(*) as count FROM contacts')).rows[0].count,
      emails: (await db.query('SELECT COUNT(*) as count FROM emails')).rows[0].count,
      campaigns: (await db.query('SELECT COUNT(*) as count FROM campaigns')).rows[0].count,
      responses: (await db.query('SELECT COUNT(*) as count FROM responses')).rows[0].count,
    };

    // Delete all data (cascading deletes will handle related records)
    await db.query('TRUNCATE TABLE prospects, campaigns, templates, ab_tests, users, blocklist, search_keywords, niches, scheduled_jobs, daily_metrics, prospect_filter_log, contact_api_logs, blog_analyses CASCADE');

    // Reset sequences
    await db.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
        LOOP
          EXECUTE 'ALTER SEQUENCE IF EXISTS ' || quote_ident(r.tablename) || '_id_seq RESTART WITH 1';
        END LOOP;
      END $$;
    `);

    // Re-insert default settings
    await db.query(`
      INSERT INTO settings (key, value, description) VALUES
        ('sender_name', '"SYB Research Team"', 'Name shown in outreach emails'),
        ('sender_email', '"outreach@mail.shieldyourbody.com"', 'Email address for outreach'),
        ('daily_send_limit', '20', 'Maximum emails to send per day'),
        ('followup_1_delay_days', '4', 'Days to wait before first follow-up'),
        ('followup_2_delay_days', '8', 'Days to wait before second follow-up'),
        ('followup_mode', '"manual"', 'Follow-up mode: manual, smart_auto, full_auto'),
        ('min_domain_authority', '20', 'Minimum DA for prospects'),
        ('max_spam_score', '30', 'Maximum spam score for prospects'),
        ('min_monthly_traffic', '1000', 'Minimum monthly traffic for prospects'),
        ('claude_model', '"claude-sonnet-4-20250514"', 'Claude model for email generation'),
        ('warmup_enabled', 'true', 'Whether email warmup is enabled'),
        ('warmup_week', '1', 'Current warmup week (1-7)')
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        description = EXCLUDED.description
    `);

    // Re-insert default niches
    await db.query(`
      INSERT INTO niches (name, description, keywords) VALUES
        ('EMF Health', 'EMF exposure and radiation protection', ARRAY['emf', 'electromagnetic', 'radiation', '5g', 'wifi safety']),
        ('Wellness', 'General health and wellness', ARRAY['health', 'wellness', 'natural', 'holistic']),
        ('Parenting', 'Family and child safety', ARRAY['parenting', 'family', 'kids', 'baby', 'child safety']),
        ('Tech Health', 'Technology impact on health', ARRAY['tech', 'digital wellness', 'screen time', 'blue light'])
      ON CONFLICT (name) DO NOTHING
    `);

    // Re-insert scheduled jobs
    await db.query(`
      INSERT INTO scheduled_jobs (job_type, config) VALUES
        ('followup_check', '{"interval_minutes": 60}'),
        ('link_check', '{"interval_minutes": 360}'),
        ('daily_metrics', '{"run_at_hour": 2}')
      ON CONFLICT (job_type) DO NOTHING
    `);

    // Log the reset
    await auditRepository.log({
      action: 'factory_reset',
      entity_type: 'system',
      details: {
        before_counts: beforeCounts,
        reset_at: new Date().toISOString(),
        warning: 'ALL DATA PERMANENTLY DELETED',
      },
    });

    logger.warn(`🚨 FACTORY RESET COMPLETE - Deleted: ${beforeCounts.prospects} prospects, ${beforeCounts.contacts} contacts, ${beforeCounts.emails} emails, ${beforeCounts.campaigns} campaigns, ${beforeCounts.responses} responses`);

    res.json({
      success: true,
      message: 'Factory reset complete - all data deleted and system restored to defaults',
      deleted: beforeCounts,
      warning: 'This action cannot be undone',
    });
  } catch (error) {
    logger.error('Factory reset failed:', error);
    res.status(500).json({ error: 'Failed to reset system' });
  }
});

export default router;
