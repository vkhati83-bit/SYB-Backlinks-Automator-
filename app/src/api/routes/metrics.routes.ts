import { Router, Request, Response } from 'express';
import { db } from '../../db/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// GET /api/v1/metrics/summary - Get overall summary metrics
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM prospects) as total_prospects,
        (SELECT COUNT(*) FROM emails WHERE status = 'sent') as total_emails_sent,
        (SELECT COUNT(*) FROM responses) as total_responses,
        (SELECT COUNT(*) FROM prospects WHERE status = 'converted') as total_conversions,
        (SELECT AVG(quality_score) FROM prospects WHERE quality_score IS NOT NULL) as avg_quality_score
    `);

    const row = result.rows[0];
    const emailsSent = parseInt(row.total_emails_sent);
    const responses = parseInt(row.total_responses);
    const conversions = parseInt(row.total_conversions);

    res.json({
      total_prospects: parseInt(row.total_prospects),
      total_emails_sent: emailsSent,
      total_responses: responses,
      total_conversions: conversions,
      response_rate: emailsSent > 0 ? (responses / emailsSent) * 100 : 0,
      conversion_rate: emailsSent > 0 ? (conversions / emailsSent) * 100 : 0,
      avg_quality_score: parseFloat(row.avg_quality_score) || 0,
    });
  } catch (error) {
    logger.error('Error fetching summary metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/v1/metrics/daily - Get daily metrics
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;

    const result = await db.query(`
      SELECT * FROM daily_metrics
      WHERE date >= CURRENT_DATE - INTERVAL '${parseInt(days as string)} days'
      ORDER BY date ASC
    `);

    res.json({ metrics: result.rows });
  } catch (error) {
    logger.error('Error fetching daily metrics:', error);
    res.status(500).json({ error: 'Failed to fetch daily metrics' });
  }
});

// GET /api/v1/metrics/by-source - Get metrics grouped by source
router.get('/by-source', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        p.source,
        COUNT(*) as prospect_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'sent') as emails_sent,
        COUNT(DISTINCT r.id) as responses,
        COUNT(*) FILTER (WHERE p.status = 'converted') as conversions
      FROM prospects p
      LEFT JOIN emails e ON e.prospect_id = p.id
      LEFT JOIN responses r ON r.email_id = e.id
      GROUP BY p.source
      ORDER BY prospect_count DESC
    `);

    res.json({
      sources: result.rows.map(row => ({
        source: row.source,
        prospects: parseInt(row.prospect_count),
        emails_sent: parseInt(row.emails_sent),
        responses: parseInt(row.responses),
        conversions: parseInt(row.conversions),
        conversion_rate: parseInt(row.emails_sent) > 0
          ? (parseInt(row.conversions) / parseInt(row.emails_sent)) * 100
          : 0,
      })),
    });
  } catch (error) {
    logger.error('Error fetching metrics by source:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/v1/metrics/by-type - Get metrics grouped by opportunity type
router.get('/by-type', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        p.opportunity_type,
        COUNT(*) as prospect_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'sent') as emails_sent,
        COUNT(DISTINCT r.id) as responses,
        COUNT(*) FILTER (WHERE p.status = 'converted') as conversions
      FROM prospects p
      LEFT JOIN emails e ON e.prospect_id = p.id
      LEFT JOIN responses r ON r.email_id = e.id
      GROUP BY p.opportunity_type
      ORDER BY prospect_count DESC
    `);

    res.json({
      types: result.rows.map(row => ({
        opportunity_type: row.opportunity_type,
        prospects: parseInt(row.prospect_count),
        emails_sent: parseInt(row.emails_sent),
        responses: parseInt(row.responses),
        conversions: parseInt(row.conversions),
        conversion_rate: parseInt(row.emails_sent) > 0
          ? (parseInt(row.conversions) / parseInt(row.emails_sent)) * 100
          : 0,
      })),
    });
  } catch (error) {
    logger.error('Error fetching metrics by type:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/v1/metrics/response-breakdown - Get response classification breakdown
router.get('/response-breakdown', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        classification,
        COUNT(*) as count
      FROM responses
      WHERE classification IS NOT NULL
      GROUP BY classification
      ORDER BY count DESC
    `);

    res.json({
      breakdown: result.rows.map(row => ({
        classification: row.classification,
        count: parseInt(row.count),
      })),
    });
  } catch (error) {
    logger.error('Error fetching response breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch response breakdown' });
  }
});

// GET /api/v1/metrics/quality-impact - Get quality score impact on conversions
router.get('/quality-impact', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        CASE
          WHEN quality_score >= 70 THEN 'high'
          WHEN quality_score >= 50 THEN 'medium'
          ELSE 'low'
        END as quality_tier,
        COUNT(*) as prospect_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'sent') as emails_sent,
        COUNT(*) FILTER (WHERE p.status = 'converted') as conversions
      FROM prospects p
      LEFT JOIN emails e ON e.prospect_id = p.id
      WHERE p.quality_score IS NOT NULL
      GROUP BY quality_tier
      ORDER BY quality_tier
    `);

    res.json({
      quality_impact: result.rows.map(row => ({
        tier: row.quality_tier,
        prospects: parseInt(row.prospect_count),
        emails_sent: parseInt(row.emails_sent),
        conversions: parseInt(row.conversions),
        conversion_rate: parseInt(row.emails_sent) > 0
          ? (parseInt(row.conversions) / parseInt(row.emails_sent)) * 100
          : 0,
      })),
    });
  } catch (error) {
    logger.error('Error fetching quality impact:', error);
    res.status(500).json({ error: 'Failed to fetch quality impact' });
  }
});

// POST /api/v1/metrics/daily/update - Update daily metrics (called by cron)
router.post('/daily/update', async (req: Request, res: Response) => {
  try {
    await db.query(`
      INSERT INTO daily_metrics (date, emails_sent, emails_opened, responses_received, positive_responses, links_acquired)
      SELECT
        CURRENT_DATE,
        COUNT(*) FILTER (WHERE e.sent_at::date = CURRENT_DATE),
        0, -- opens tracking not implemented yet
        COUNT(DISTINCT r.id) FILTER (WHERE r.received_at::date = CURRENT_DATE),
        COUNT(DISTINCT r.id) FILTER (WHERE r.received_at::date = CURRENT_DATE AND r.classification = 'positive'),
        COUNT(*) FILTER (WHERE lc.checked_at::date = CURRENT_DATE AND lc.link_found = true)
      FROM emails e
      LEFT JOIN responses r ON r.email_id = e.id
      LEFT JOIN link_checks lc ON lc.email_id = e.id
      WHERE e.sent_at::date = CURRENT_DATE OR r.received_at::date = CURRENT_DATE OR lc.checked_at::date = CURRENT_DATE
      ON CONFLICT (date) DO UPDATE
      SET
        emails_sent = EXCLUDED.emails_sent,
        emails_opened = EXCLUDED.emails_opened,
        responses_received = EXCLUDED.responses_received,
        positive_responses = EXCLUDED.positive_responses,
        links_acquired = EXCLUDED.links_acquired,
        updated_at = NOW()
    `);

    res.json({ success: true, message: 'Daily metrics updated' });
  } catch (error) {
    logger.error('Error updating daily metrics:', error);
    res.status(500).json({ error: 'Failed to update daily metrics' });
  }
});

export default router;
