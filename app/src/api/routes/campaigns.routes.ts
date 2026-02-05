import { Router, Request, Response } from 'express';
import { campaignRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// GET /api/v1/campaigns - List all campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) as prospect_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'sent') as emails_sent,
        COUNT(DISTINCT r.id) as response_count,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'converted') as conversion_count
      FROM campaigns c
      LEFT JOIN prospects p ON p.campaign_id = c.id
      LEFT JOIN emails e ON e.prospect_id = p.id
      LEFT JOIN responses r ON r.email_id = e.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    const campaigns = result.rows.map(row => ({
      ...row,
      stats: {
        prospects: parseInt(row.prospect_count),
        emails_sent: parseInt(row.emails_sent),
        responses: parseInt(row.response_count),
        conversions: parseInt(row.conversion_count),
      },
    }));

    res.json({ campaigns });
  } catch (error) {
    logger.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// GET /api/v1/campaigns/:id - Get campaign details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await campaignRepository.findById(req.params.id as string);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    // Get detailed stats
    const stats = await db.query(`
      SELECT
        COUNT(DISTINCT p.id) as prospect_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'sent') as emails_sent,
        COUNT(DISTINCT r.id) as response_count,
        COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'converted') as conversion_count
      FROM prospects p
      LEFT JOIN emails e ON e.prospect_id = p.id
      LEFT JOIN responses r ON r.email_id = e.id
      WHERE p.campaign_id = $1
    `, [req.params.id]);

    res.json({
      ...campaign,
      stats: {
        prospects: parseInt(stats.rows[0].prospect_count),
        emails_sent: parseInt(stats.rows[0].emails_sent),
        responses: parseInt(stats.rows[0].response_count),
        conversions: parseInt(stats.rows[0].conversion_count),
      },
    });
  } catch (error) {
    logger.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// POST /api/v1/campaigns - Create new campaign
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, target_keywords, opportunity_types } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Campaign name is required' });
      return;
    }

    const result = await db.query(`
      INSERT INTO campaigns (name, description, target_keywords, opportunity_types, status, created_at)
      VALUES ($1, $2, $3, $4, 'draft', NOW())
      RETURNING *
    `, [
      name,
      description || null,
      target_keywords || [],
      opportunity_types || ['research_citation'],
    ]);

    await auditRepository.log({
      action: 'campaign_created',
      entity_type: 'campaign',
      entity_id: result.rows[0].id,
      details: { name },
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating campaign:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// PATCH /api/v1/campaigns/:id - Update campaign
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await campaignRepository.findById(req.params.id as string);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const { name, description, target_keywords, opportunity_types, status } = req.body;

    const result = await db.query(`
      UPDATE campaigns
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        target_keywords = COALESCE($3, target_keywords),
        opportunity_types = COALESCE($4, opportunity_types),
        status = COALESCE($5, status),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `, [name, description, target_keywords, opportunity_types, status, req.params.id]);

    await auditRepository.log({
      action: 'campaign_updated',
      entity_type: 'campaign',
      entity_id: req.params.id as string,
      details: req.body,
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// POST /api/v1/campaigns/:id/activate - Activate campaign
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const campaign = await campaignRepository.findById(req.params.id as string);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    await campaignRepository.start(req.params.id as string);

    await auditRepository.log({
      action: 'campaign_activated',
      entity_type: 'campaign',
      entity_id: req.params.id as string,
    });

    res.json({ success: true, message: 'Campaign activated' });
  } catch (error) {
    logger.error('Error activating campaign:', error);
    res.status(500).json({ error: 'Failed to activate campaign' });
  }
});

// POST /api/v1/campaigns/:id/pause - Pause campaign
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const campaign = await campaignRepository.findById(req.params.id as string);
    if (!campaign) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    await campaignRepository.pause(req.params.id as string);

    await auditRepository.log({
      action: 'campaign_paused',
      entity_type: 'campaign',
      entity_id: req.params.id as string,
    });

    res.json({ success: true, message: 'Campaign paused' });
  } catch (error) {
    logger.error('Error pausing campaign:', error);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

export default router;
