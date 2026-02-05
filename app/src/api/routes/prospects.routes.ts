import { Router, Request, Response } from 'express';
import { prospectRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import logger from '../../utils/logger.js';
import { ApprovalStatus, OutcomeTag } from '../../types/index.js';

const router = Router();

// GET /api/v1/prospects/stats - Get prospect counts by status
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE approval_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE approval_status = 'approved' AND outcome_tag IS NULL) as approved,
        COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE outcome_tag IS NOT NULL) as completed,
        COUNT(*) as total
      FROM prospects
    `);

    const row = result.rows[0];
    res.json({
      pending: parseInt(row.pending) || 0,
      approved: parseInt(row.approved) || 0,
      rejected: parseInt(row.rejected) || 0,
      completed: parseInt(row.completed) || 0,
      total: parseInt(row.total) || 0,
    });
  } catch (error) {
    logger.error('Error fetching prospect stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/v1/prospects/grouped - Get prospects grouped by opportunity type
router.get('/grouped', async (req: Request, res: Response) => {
  try {
    const { approval_status = 'pending' } = req.query;
    const grouped = await prospectRepository.findGrouped(approval_status as ApprovalStatus);

    // Get contact counts for each prospect
    const allProspectIds = [
      ...grouped.broken_link,
      ...grouped.research_citation,
      ...grouped.guest_post,
    ].map(p => p.id);

    let contactCounts: Record<string, number> = {};
    if (allProspectIds.length > 0) {
      const counts = await db.query(`
        SELECT prospect_id, COUNT(*) as count
        FROM contacts
        WHERE prospect_id = ANY($1::uuid[])
        GROUP BY prospect_id
      `, [allProspectIds]);
      contactCounts = Object.fromEntries(counts.rows.map((r: { prospect_id: string; count: string }) => [r.prospect_id, parseInt(r.count)]));
    }

    // Attach contact counts
    const attachCounts = (prospects: typeof grouped.broken_link) =>
      prospects.map(p => ({ ...p, contact_count: contactCounts[p.id] || 0 }));

    res.json({
      broken_link: attachCounts(grouped.broken_link),
      research_citation: attachCounts(grouped.research_citation),
      guest_post: attachCounts(grouped.guest_post),
      total: allProspectIds.length,
    });
  } catch (error) {
    logger.error('Error fetching grouped prospects:', error);
    res.status(500).json({ error: 'Failed to fetch grouped prospects' });
  }
});

// GET /api/v1/prospects/approved - Get approved prospects
router.get('/approved', async (req: Request, res: Response) => {
  try {
    const { limit = '100', offset = '0' } = req.query;
    const prospects = await prospectRepository.findApproved(
      parseInt(limit as string),
      parseInt(offset as string)
    );

    // Get contact counts
    const prospectIds = prospects.map(p => p.id);
    let contactCounts: Record<string, number> = {};
    if (prospectIds.length > 0) {
      const counts = await db.query(`
        SELECT prospect_id, COUNT(*) as count
        FROM contacts
        WHERE prospect_id = ANY($1::uuid[])
        GROUP BY prospect_id
      `, [prospectIds]);
      contactCounts = Object.fromEntries(counts.rows.map((r: { prospect_id: string; count: string }) => [r.prospect_id, parseInt(r.count)]));
    }

    res.json({
      prospects: prospects.map(p => ({ ...p, contact_count: contactCounts[p.id] || 0 })),
      total: prospects.length,
    });
  } catch (error) {
    logger.error('Error fetching approved prospects:', error);
    res.status(500).json({ error: 'Failed to fetch approved prospects' });
  }
});

// GET /api/v1/prospects/completed - Get completed prospects (with outcome tags)
router.get('/completed', async (req: Request, res: Response) => {
  try {
    const { limit = '100', offset = '0' } = req.query;
    const prospects = await prospectRepository.findCompleted(
      parseInt(limit as string),
      parseInt(offset as string)
    );

    // Get contact counts
    const prospectIds = prospects.map(p => p.id);
    let contactCounts: Record<string, number> = {};
    if (prospectIds.length > 0) {
      const counts = await db.query(`
        SELECT prospect_id, COUNT(*) as count
        FROM contacts
        WHERE prospect_id = ANY($1::uuid[])
        GROUP BY prospect_id
      `, [prospectIds]);
      contactCounts = Object.fromEntries(counts.rows.map((r: { prospect_id: string; count: string }) => [r.prospect_id, parseInt(r.count)]));
    }

    res.json({
      prospects: prospects.map(p => ({ ...p, contact_count: contactCounts[p.id] || 0 })),
      total: prospects.length,
    });
  } catch (error) {
    logger.error('Error fetching completed prospects:', error);
    res.status(500).json({ error: 'Failed to fetch completed prospects' });
  }
});

// POST /api/v1/prospects/bulk-action - Bulk approve/reject prospects
router.post('/bulk-action', async (req: Request, res: Response) => {
  try {
    const { ids, action } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: 'action must be "approve" or "reject"' });
      return;
    }

    const approvalStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'rejected';
    const count = await prospectRepository.bulkUpdateApprovalStatus(ids, approvalStatus);

    // Log the action
    await auditRepository.log({
      action: 'prospect_bulk_action',
      entity_type: 'prospect',
      details: { ids, action, count },
    });

    res.json({
      success: true,
      message: `${count} prospects ${action}d`,
      count,
    });
  } catch (error) {
    logger.error('Error performing bulk action:', error);
    res.status(500).json({ error: 'Failed to perform bulk action' });
  }
});

// GET /api/v1/prospects - List all prospects with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      approval_status,
      opportunity_type,
      min_score,
      limit = '50',
      offset = '0',
      sort_by = 'quality_score',
      sort_order = 'desc',
    } = req.query;

    let query = `
      SELECT
        p.*,
        COUNT(c.id) as contact_count
      FROM prospects p
      LEFT JOIN contacts c ON c.prospect_id = p.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      query += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    if (approval_status && approval_status !== 'all') {
      query += ` AND p.approval_status = $${paramIndex++}`;
      params.push(approval_status);
    }

    if (opportunity_type && opportunity_type !== 'all') {
      query += ` AND p.opportunity_type = $${paramIndex++}`;
      params.push(opportunity_type);
    }

    if (min_score) {
      query += ` AND p.quality_score >= $${paramIndex++}`;
      params.push(parseFloat(min_score as string));
    }

    query += ` GROUP BY p.id`;

    // Sorting
    const validSortFields = ['quality_score', 'domain_authority', 'created_at'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by : 'quality_score';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY p.${sortField} ${order} NULLS LAST`;

    // Pagination
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM prospects WHERE 1=1`;
    const countParams: unknown[] = [];
    let countParamIndex = 1;

    if (status && status !== 'all') {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (approval_status && approval_status !== 'all') {
      countQuery += ` AND approval_status = $${countParamIndex++}`;
      countParams.push(approval_status);
    }
    if (opportunity_type && opportunity_type !== 'all') {
      countQuery += ` AND opportunity_type = $${countParamIndex++}`;
      countParams.push(opportunity_type);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      prospects: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    logger.error('Error fetching prospects:', error);
    res.status(500).json({ error: 'Failed to fetch prospects' });
  }
});

// GET /api/v1/prospects/:id - Get single prospect with contacts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const prospect = await prospectRepository.findById(req.params.id as string);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Get contacts for this prospect
    const contacts = await db.query(
      'SELECT * FROM contacts WHERE prospect_id = $1 ORDER BY confidence_tier ASC',
      [req.params.id]
    );

    // Get emails sent to this prospect
    const emails = await db.query(
      'SELECT * FROM emails WHERE prospect_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.json({
      ...prospect,
      contacts: contacts.rows,
      emails: emails.rows,
    });
  } catch (error) {
    logger.error('Error fetching prospect:', error);
    res.status(500).json({ error: 'Failed to fetch prospect' });
  }
});

// PATCH /api/v1/prospects/:id/outcome - Set outcome tag
router.patch('/:id/outcome', async (req: Request, res: Response) => {
  try {
    const { outcome_tag } = req.body;
    const validTags: (OutcomeTag | null)[] = ['partner', 'not_interested', 'follow_up_later', 'no_response', 'bounced', 'unsubscribed', null];

    if (outcome_tag !== undefined && !validTags.includes(outcome_tag)) {
      res.status(400).json({ error: 'Invalid outcome_tag value' });
      return;
    }

    const prospect = await prospectRepository.setOutcomeTag(req.params.id, outcome_tag);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'outcome_tagged',
      entity_type: 'prospect',
      entity_id: req.params.id,
      details: { outcome_tag },
    });

    res.json(prospect);
  } catch (error) {
    logger.error('Error setting outcome tag:', error);
    res.status(500).json({ error: 'Failed to set outcome tag' });
  }
});

// PATCH /api/v1/prospects/:id/approval - Set approval status
router.patch('/:id/approval', async (req: Request, res: Response) => {
  try {
    const { approval_status } = req.body;
    const validStatuses: ApprovalStatus[] = ['pending', 'approved', 'rejected'];

    if (!validStatuses.includes(approval_status)) {
      res.status(400).json({ error: 'Invalid approval_status value' });
      return;
    }

    const prospect = await prospectRepository.updateApprovalStatus(req.params.id, approval_status);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Log the action
    const action = approval_status === 'approved' ? 'prospect_approved' : 'prospect_rejected';
    await auditRepository.log({
      action,
      entity_type: 'prospect',
      entity_id: req.params.id,
      details: { approval_status },
    });

    res.json(prospect);
  } catch (error) {
    logger.error('Error setting approval status:', error);
    res.status(500).json({ error: 'Failed to set approval status' });
  }
});

// PATCH /api/v1/prospects/:id/niche - Set niche
router.patch('/:id/niche', async (req: Request, res: Response) => {
  try {
    const { niche } = req.body;
    const prospect = await prospectRepository.setNiche(req.params.id, niche || null);

    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    res.json(prospect);
  } catch (error) {
    logger.error('Error setting niche:', error);
    res.status(500).json({ error: 'Failed to set niche' });
  }
});

// POST /api/v1/prospects/:id/block - Block a prospect
router.post('/:id/block', async (req: Request, res: Response) => {
  try {
    const prospect = await prospectRepository.findById(req.params.id as string);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const { reason } = req.body;

    // Add domain to blocklist
    await db.query(`
      INSERT INTO blocklist (type, value, reason, created_at)
      VALUES ('domain', $1, $2, NOW())
      ON CONFLICT (type, value) DO NOTHING
    `, [prospect.domain, reason || 'Manually blocked']);

    // Update prospect status
    await prospectRepository.updateStatus(req.params.id as string, 'rejected');

    res.json({ success: true, message: `Blocked ${prospect.domain}` });
  } catch (error) {
    logger.error('Error blocking prospect:', error);
    res.status(500).json({ error: 'Failed to block prospect' });
  }
});

export default router;
