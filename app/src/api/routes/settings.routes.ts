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

export default router;
