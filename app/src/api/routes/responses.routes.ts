import { Router, Request, Response } from 'express';
import { responseRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import { responseClassifierQueue } from '../../config/queues.js';
import logger from '../../utils/logger.js';

const router = Router();

// GET /api/v1/responses - List responses
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      classification,
      handled,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = `
      SELECT
        r.*,
        json_build_object(
          'subject', e.subject,
          'prospect_domain', p.domain
        ) as original_email
      FROM responses r
      JOIN emails e ON r.email_id = e.id
      JOIN prospects p ON e.prospect_id = p.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (classification && classification !== 'all') {
      query += ` AND r.classification = $${paramIndex++}`;
      params.push(classification);
    }

    if (handled !== undefined && handled !== 'all') {
      query += ` AND r.handled = $${paramIndex++}`;
      params.push(handled === 'true');
    }

    query += ` ORDER BY r.received_at DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM responses WHERE 1=1`;
    const countParams: unknown[] = [];
    let countParamIndex = 1;

    if (classification && classification !== 'all') {
      countQuery += ` AND classification = $${countParamIndex++}`;
      countParams.push(classification);
    }
    if (handled !== undefined && handled !== 'all') {
      countQuery += ` AND handled = $${countParamIndex++}`;
      countParams.push(handled === 'true');
    }

    const countResult = await db.query(countQuery, countParams);
    const unhandledResult = await db.query('SELECT COUNT(*) FROM responses WHERE handled = false');

    res.json({
      responses: result.rows,
      total: parseInt(countResult.rows[0].count),
      unhandled: parseInt(unhandledResult.rows[0].count),
    });
  } catch (error) {
    logger.error('Error fetching responses:', error);
    res.status(500).json({ error: 'Failed to fetch responses' });
  }
});

// GET /api/v1/responses/:id - Get response details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const response = await responseRepository.findById(req.params.id as string);
    if (!response) {
      res.status(404).json({ error: 'Response not found' });
      return;
    }

    // Get email thread
    const thread = await db.query(`
      SELECT e.*,
        json_build_object('domain', p.domain, 'url', p.url) as prospect
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      WHERE e.id = $1
    `, [response.email_id]);

    res.json({
      ...response,
      original_email: thread.rows[0],
    });
  } catch (error) {
    logger.error('Error fetching response:', error);
    res.status(500).json({ error: 'Failed to fetch response' });
  }
});

// POST /api/v1/responses/:id/mark-handled - Mark response as handled
router.post('/:id/mark-handled', async (req: Request, res: Response) => {
  try {
    const response = await responseRepository.findById(req.params.id as string);
    if (!response) {
      res.status(404).json({ error: 'Response not found' });
      return;
    }

    await db.query(`
      UPDATE responses
      SET handled = true, handled_at = NOW()
      WHERE id = $1
    `, [req.params.id]);

    await auditRepository.log({
      action: 'response_handled',
      entity_type: 'response',
      entity_id: req.params.id as string,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Error marking response as handled:', error);
    res.status(500).json({ error: 'Failed to mark response as handled' });
  }
});

// POST /api/v1/responses/:id/reclassify - Reclassify response
router.post('/:id/reclassify', async (req: Request, res: Response) => {
  try {
    const response = await responseRepository.findById(req.params.id as string);
    if (!response) {
      res.status(404).json({ error: 'Response not found' });
      return;
    }

    // Queue for reclassification
    await responseClassifierQueue.add('classify-response', { responseId: req.params.id as string });

    res.json({ success: true, message: 'Response queued for reclassification' });
  } catch (error) {
    logger.error('Error reclassifying response:', error);
    res.status(500).json({ error: 'Failed to reclassify response' });
  }
});

// POST /api/v1/responses - Create new response (webhook from email provider)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email_id, from_email, from_name, subject, body, message_id } = req.body;

    if (!email_id || !from_email || !body) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = await db.query(`
      INSERT INTO responses (email_id, from_email, from_name, subject, body, message_id, received_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `, [email_id, from_email, from_name, subject, body, message_id]);

    const responseId = result.rows[0].id;

    // Queue for classification
    await responseClassifierQueue.add('classify-response', { responseId });

    await auditRepository.log({
      action: 'response_received',
      entity_type: 'response',
      entity_id: responseId,
      details: { from_email },
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error creating response:', error);
    res.status(500).json({ error: 'Failed to create response' });
  }
});

export default router;
