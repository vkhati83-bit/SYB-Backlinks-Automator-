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
      WHERE deleted_at IS NULL
    `);

    const trashCount = await db.query(`
      SELECT COUNT(*) as trash FROM prospects WHERE deleted_at IS NOT NULL
    `);

    const row = result.rows[0];
    res.json({
      pending: parseInt(row.pending) || 0,
      approved: parseInt(row.approved) || 0,
      rejected: parseInt(row.rejected) || 0,
      completed: parseInt(row.completed) || 0,
      total: parseInt(row.total) || 0,
      trash: parseInt(trashCount.rows[0].trash) || 0,
    });
  } catch (error) {
    logger.error('Error fetching prospect stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/v1/prospects/filtered - Get prospects by filter status
router.get('/filtered', async (req: Request, res: Response) => {
  try {
    const {
      status = 'needs_review',
      opportunity_type,
      limit = '100',
      offset = '0',
      sort_by = 'filter_score',
      sort_order = 'desc',
    } = req.query;

    // Validate filter status
    const validStatuses = ['auto_approved', 'needs_review', 'auto_rejected'];
    if (!validStatuses.includes(status as string)) {
      res.status(400).json({ error: 'Invalid filter status. Must be: auto_approved, needs_review, or auto_rejected' });
      return;
    }

    let query = `
      SELECT
        p.*,
        COUNT(c.id) as contact_count
      FROM prospects p
      LEFT JOIN contacts c ON c.prospect_id = p.id
      WHERE p.filter_status = $1
    `;
    const params: unknown[] = [status];
    let paramIndex = 2;

    if (opportunity_type && opportunity_type !== 'all') {
      query += ` AND p.opportunity_type = $${paramIndex++}`;
      params.push(opportunity_type);
    }

    query += ` GROUP BY p.id`;

    // Sorting
    const validSortFields = ['filter_score', 'quality_score', 'domain_authority', 'created_at'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by : 'filter_score';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY p.${sortField} ${order} NULLS LAST`;

    // Pagination
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM prospects WHERE filter_status = $1`;
    const countParams: unknown[] = [status];
    let countParamIndex = 2;

    if (opportunity_type && opportunity_type !== 'all') {
      countQuery += ` AND opportunity_type = $${countParamIndex++}`;
      countParams.push(opportunity_type);
    }

    const countResult = await db.query(countQuery, countParams);

    res.json({
      prospects: result.rows,
      filter_status: status,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    logger.error('Error fetching filtered prospects:', error);
    res.status(500).json({ error: 'Failed to fetch filtered prospects' });
  }
});

// GET /api/v1/prospects/filter-summary - Get filter summary for a batch
router.get('/filter-summary', async (req: Request, res: Response) => {
  try {
    const { batch_id } = req.query;

    if (!batch_id) {
      res.status(400).json({ error: 'batch_id query parameter is required' });
      return;
    }

    const result = await db.query(`
      SELECT * FROM prospect_filter_log
      WHERE batch_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [batch_id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }

    const log = result.rows[0];

    // Get current counts by filter status for this batch
    const statusCounts = await db.query(`
      SELECT
        filter_status,
        COUNT(*) as count
      FROM prospects
      WHERE campaign_id IN (
        SELECT DISTINCT campaign_id
        FROM prospects
        WHERE created_at >= $1 - INTERVAL '5 minutes'
        AND created_at <= $1 + INTERVAL '5 minutes'
      )
      AND created_at >= $1 - INTERVAL '5 minutes'
      AND created_at <= $1 + INTERVAL '5 minutes'
      GROUP BY filter_status
    `, [log.created_at]);

    const statusBreakdown = Object.fromEntries(
      statusCounts.rows.map((r: { filter_status: string; count: string }) => [r.filter_status, parseInt(r.count)])
    );

    res.json({
      batch_id: log.batch_id,
      fetch_type: log.fetch_type,
      created_at: log.created_at,
      total_found: log.total_found,
      auto_approved: log.auto_approved,
      needs_review: log.needs_review,
      auto_rejected: log.auto_rejected,
      filter_breakdown: log.filter_breakdown,
      current_status_breakdown: statusBreakdown,
      data_loss_percentage: log.total_found > 0
        ? Math.round((log.auto_rejected / log.total_found) * 100)
        : 0,
    });
  } catch (error) {
    logger.error('Error fetching filter summary:', error);
    res.status(500).json({ error: 'Failed to fetch filter summary' });
  }
});

// POST /api/v1/prospects/bulk-review - Bulk approve/reject filtered prospects
router.post('/bulk-review', async (req: Request, res: Response) => {
  try {
    const { ids, action, update_filter_status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      res.status(400).json({ error: 'action must be "approve" or "reject"' });
      return;
    }

    const approvalStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update approval status
    let query = `
      UPDATE prospects
      SET approval_status = $1, updated_at = NOW()
    `;
    const params: unknown[] = [approvalStatus];
    let paramIndex = 2;

    // Optionally update filter_status
    if (update_filter_status && action === 'approve') {
      query += `, filter_status = 'auto_approved'`;
    } else if (update_filter_status && action === 'reject') {
      query += `, filter_status = 'auto_rejected'`;
    }

    query += ` WHERE id = ANY($${paramIndex++}::uuid[]) RETURNING id`;
    params.push(ids);

    const result = await db.query(query, params);
    const count = result.rows.length;

    // Log the action
    await auditRepository.log({
      action: 'prospect_bulk_review',
      entity_type: 'prospect',
      details: { ids, action, count, update_filter_status },
    });

    res.json({
      success: true,
      message: `${count} prospects ${action}d and ${update_filter_status ? 'filter status updated' : 'filter status unchanged'}`,
      count,
    });
  } catch (error) {
    logger.error('Error performing bulk review:', error);
    res.status(500).json({ error: 'Failed to perform bulk review' });
  }
});

// GET /api/v1/prospects/broken-links - Get broken link opportunities with clear structure
router.get('/broken-links', async (req: Request, res: Response) => {
  try {
    const { limit = '50', offset = '0', approval_status = 'pending' } = req.query;

    const prospects = await db.query(`
      SELECT
        p.*,
        COUNT(c.id) as contact_count
      FROM prospects p
      LEFT JOIN contacts c ON c.prospect_id = p.id
      WHERE p.opportunity_type = 'broken_link'
        AND p.approval_status = $1
        AND p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.broken_url_verified_at DESC NULLS LAST, p.quality_score DESC
      LIMIT $2 OFFSET $3
    `, [approval_status, parseInt(limit as string), parseInt(offset as string)]);

    // Format each prospect with clear structure
    const formatted = prospects.rows.map((p: any) => {
      let structuredData;
      try {
        // Try to parse JSON description
        structuredData = JSON.parse(p.description || '{}');
      } catch (e) {
        // Fallback structure
        structuredData = {
          opportunity_type: 'broken_link',
          referring_page: {
            url: p.url,
            title: p.title,
            domain: p.domain,
            domain_authority: p.domain_authority,
          },
          broken_link_details: {
            broken_url: p.broken_url,
            anchor_text: p.outbound_link_context,
            status_code: p.broken_url_status_code,
            verified: p.broken_url_verified_at != null,
            verified_at: p.broken_url_verified_at,
          },
          replacement_suggestion: p.suggested_article_url ? {
            article_url: p.suggested_article_url,
            article_title: p.suggested_article_title,
            match_reason: p.match_reason,
          } : null,
        };
      }

      return {
        id: p.id,
        quality_score: p.quality_score,
        filter_status: p.filter_status,
        approval_status: p.approval_status,
        status: p.status,
        contact_count: parseInt(p.contact_count),
        created_at: p.created_at,
        ...structuredData,
      };
    });

    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM prospects
      WHERE opportunity_type = 'broken_link'
        AND approval_status = $1
        AND deleted_at IS NULL
    `, [approval_status]);

    res.json({
      opportunities: formatted,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    logger.error('Error fetching broken link opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch broken link opportunities' });
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

// Shared filter builder for prospect queries
// prefix: table alias like 'p.' for JOINed queries, or '' for simple queries
function buildProspectFilters(query: Record<string, unknown>, prefix = '') {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const { status, approval_status, opportunity_type, min_score, max_score,
    min_da, max_da, date_from, date_to, search, is_dofollow,
    has_article_match, filter_status } = query;

  if (status && status !== 'all') {
    clauses.push(`${prefix}status = $${idx++}`);
    params.push(status);
  }
  if (approval_status && approval_status !== 'all') {
    clauses.push(`${prefix}approval_status = $${idx++}`);
    params.push(approval_status);
  }
  if (opportunity_type && opportunity_type !== 'all') {
    clauses.push(`${prefix}opportunity_type = $${idx++}`);
    params.push(opportunity_type);
  }
  if (min_score) {
    clauses.push(`${prefix}quality_score >= $${idx++}`);
    params.push(parseFloat(min_score as string));
  }
  if (max_score) {
    clauses.push(`${prefix}quality_score <= $${idx++}`);
    params.push(parseFloat(max_score as string));
  }
  if (min_da) {
    clauses.push(`${prefix}domain_authority >= $${idx++}`);
    params.push(parseFloat(min_da as string));
  }
  if (max_da) {
    clauses.push(`${prefix}domain_authority <= $${idx++}`);
    params.push(parseFloat(max_da as string));
  }
  if (date_from) {
    clauses.push(`${prefix}created_at >= $${idx++}`);
    params.push(date_from as string);
  }
  if (date_to) {
    clauses.push(`${prefix}created_at <= $${idx++}`);
    params.push(date_to as string);
  }
  if (search) {
    clauses.push(`${prefix}domain ILIKE $${idx++}`);
    params.push(`%${search}%`);
  }
  if (is_dofollow === 'true') {
    clauses.push(`${prefix}is_dofollow = true`);
  } else if (is_dofollow === 'false') {
    clauses.push(`(${prefix}is_dofollow = false OR ${prefix}is_dofollow IS NULL)`);
  }
  if (has_article_match === 'true') {
    clauses.push(`${prefix}suggested_article_url IS NOT NULL`);
  } else if (has_article_match === 'false') {
    clauses.push(`${prefix}suggested_article_url IS NULL`);
  }
  if (filter_status && filter_status !== 'all') {
    clauses.push(`${prefix}filter_status = $${idx++}`);
    params.push(filter_status);
  }

  return { clauses, params, nextIndex: idx };
}

// GET /api/v1/prospects - List all prospects with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      limit = '1000',
      offset = '0',
      sort_by = 'quality_score',
      sort_order = 'desc',
    } = req.query;

    const { clauses, params, nextIndex } = buildProspectFilters(req.query, 'p.');
    let paramIndex = nextIndex;

    let query = `
      SELECT
        p.*,
        COUNT(c.id) as contact_count
      FROM prospects p
      LEFT JOIN contacts c ON c.prospect_id = p.id
      WHERE p.deleted_at IS NULL
    `;

    if (clauses.length > 0) {
      query += ` AND ` + clauses.join(' AND ');
    }

    query += ` GROUP BY p.id`;

    // Sorting
    const validSortFields = ['quality_score', 'domain_authority', 'created_at', 'filter_score'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by : 'quality_score';
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY p.${sortField} ${order} NULLS LAST`;

    // Pagination
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(query, params);

    // Get total count (reuse the same filter builder, no table prefix)
    const countFilter = buildProspectFilters(req.query);
    let countQuery = `SELECT COUNT(*) FROM prospects WHERE deleted_at IS NULL`;
    if (countFilter.clauses.length > 0) {
      countQuery += ` AND ` + countFilter.clauses.join(' AND ');
    }

    const countResult = await db.query(countQuery, countFilter.params);

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

// GET /api/v1/prospects/trash - View trash (MUST be before /:id route)
router.get('/trash', async (req: Request, res: Response) => {
  try {
    const { limit = '100', offset = '0' } = req.query;

    const prospects = await prospectRepository.findTrash(
      parseInt(limit as string),
      parseInt(offset as string)
    );

    const total = await prospectRepository.countTrash();

    res.json({
      prospects,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    logger.error('Error fetching trash:', error);
    res.status(500).json({ error: 'Failed to fetch trash' });
  }
});

// GET /api/v1/prospects/:id - Get single prospect with contacts
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Validate UUID format to prevent DB errors from route mismatches
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.params.id as string)) {
      res.status(400).json({ error: 'Invalid prospect ID format' });
      return;
    }

    const prospect = await prospectRepository.findById(req.params.id as string as string);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Get contacts for this prospect
    const contacts = await db.query(
      'SELECT * FROM contacts WHERE prospect_id = $1 ORDER BY confidence_score DESC, confidence_tier ASC',
      [req.params.id as string]
    );

    // Get emails sent to this prospect
    const emails = await db.query(
      'SELECT * FROM emails WHERE prospect_id = $1 ORDER BY created_at DESC',
      [req.params.id as string]
    );

    // For broken link opportunities, parse and structure the data clearly
    let structuredData = null;
    if (prospect.opportunity_type === 'broken_link') {
      try {
        // Try to parse JSON description
        const parsed = JSON.parse(prospect.description || '{}');
        structuredData = {
          opportunity_type: 'broken_link',
          referring_page: {
            url: prospect.url,
            title: prospect.title,
            domain: prospect.domain,
            domain_authority: prospect.domain_authority,
          },
          broken_link_details: {
            broken_url: prospect.broken_url || parsed.broken_link_details?.broken_url,
            anchor_text: prospect.outbound_link_context || parsed.broken_link_details?.anchor_text,
            status_code: prospect.broken_url_status_code || parsed.broken_link_details?.status_code,
            verified: prospect.broken_url_verified_at != null || parsed.broken_link_details?.verified,
            verified_at: prospect.broken_url_verified_at || parsed.broken_link_details?.verified_at,
          },
          replacement_suggestion: prospect.suggested_article_url ? {
            article_url: prospect.suggested_article_url,
            article_title: prospect.suggested_article_title,
            match_reason: prospect.match_reason,
          } : parsed.replacement_suggestion,
        };
      } catch (e) {
        // Fallback for old format
        structuredData = {
          opportunity_type: 'broken_link',
          referring_page: {
            url: prospect.url,
            title: prospect.title,
            domain: prospect.domain,
            domain_authority: prospect.domain_authority,
          },
          broken_link_details: {
            broken_url: prospect.broken_url,
            anchor_text: prospect.outbound_link_context,
            status_code: prospect.broken_url_status_code,
            verified: prospect.broken_url_verified_at != null,
            verified_at: prospect.broken_url_verified_at,
          },
          replacement_suggestion: prospect.suggested_article_url ? {
            article_url: prospect.suggested_article_url,
            article_title: prospect.suggested_article_title,
            match_reason: prospect.match_reason,
          } : null,
        };
      }
    }

    res.json({
      ...prospect,
      contacts: contacts.rows,
      emails: emails.rows,
      structured_data: structuredData, // Clear broken link structure
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

    const prospect = await prospectRepository.setOutcomeTag(req.params.id as string, outcome_tag);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'outcome_tagged',
      entity_type: 'prospect',
      entity_id: req.params.id as string,
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

    const prospect = await prospectRepository.updateApprovalStatus(req.params.id as string, approval_status);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Log the action
    const action = approval_status === 'approved' ? 'prospect_approved' : 'prospect_rejected';
    await auditRepository.log({
      action,
      entity_type: 'prospect',
      entity_id: req.params.id as string,
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
    const prospect = await prospectRepository.setNiche(req.params.id as string, niche || null);

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
    const prospect = await prospectRepository.findById(req.params.id as string as string);
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
    await prospectRepository.updateStatus(req.params.id as string as string, 'rejected');

    res.json({ success: true, message: `Blocked ${prospect.domain}` });
  } catch (error) {
    logger.error('Error blocking prospect:', error);
    res.status(500).json({ error: 'Failed to block prospect' });
  }
});

// ============================================
// SOFT DELETE ENDPOINTS (TRASH SYSTEM)
// ============================================

// DELETE /api/v1/prospects/:id - Soft delete (move to trash)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const prospect = await prospectRepository.softDelete(
      req.params.id as string,
      reason,
      (req as any).user?.id // If auth is implemented
    );

    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found or already deleted' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'prospect_soft_deleted',
      entity_type: 'prospect',
      entity_id: req.params.id as string,
      details: { reason, domain: prospect.domain },
    });

    res.json({
      success: true,
      message: `Prospect moved to trash (recoverable for 90 days)`,
      prospect: {
        id: prospect.id,
        domain: prospect.domain,
        deleted_at: prospect.deleted_at,
      },
    });
  } catch (error) {
    logger.error('Error soft deleting prospect:', error);
    res.status(500).json({ error: 'Failed to delete prospect' });
  }
});

// POST /api/v1/prospects/bulk-delete - Bulk soft delete
router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids, reason } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const count = await prospectRepository.bulkSoftDelete(ids, reason, (req as any).user?.id);

    // Log the action
    await auditRepository.log({
      action: 'prospect_bulk_delete',
      entity_type: 'prospect',
      details: { ids, reason, count },
    });

    res.json({
      success: true,
      message: `${count} prospects moved to trash`,
      count,
    });
  } catch (error) {
    logger.error('Error bulk deleting prospects:', error);
    res.status(500).json({ error: 'Failed to bulk delete prospects' });
  }
});

// POST /api/v1/prospects/:id/restore - Restore from trash
router.post('/:id/restore', async (req: Request, res: Response) => {
  try {
    const prospect = await prospectRepository.restore(req.params.id as string);

    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found in trash' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'prospect_restored',
      entity_type: 'prospect',
      entity_id: req.params.id as string,
      details: { domain: prospect.domain },
    });

    res.json({
      success: true,
      message: 'Prospect restored from trash',
      prospect,
    });
  } catch (error) {
    logger.error('Error restoring prospect:', error);
    res.status(500).json({ error: 'Failed to restore prospect' });
  }
});

// POST /api/v1/prospects/bulk-restore - Bulk restore from trash
router.post('/bulk-restore', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const count = await prospectRepository.bulkRestore(ids);

    // Log the action
    await auditRepository.log({
      action: 'prospect_bulk_restore',
      entity_type: 'prospect',
      details: { ids, count },
    });

    res.json({
      success: true,
      message: `${count} prospects restored from trash`,
      count,
    });
  } catch (error) {
    logger.error('Error bulk restoring prospects:', error);
    res.status(500).json({ error: 'Failed to bulk restore prospects' });
  }
});

// DELETE /api/v1/prospects/:id/permanent - Permanent delete (admin only)
router.delete('/:id/permanent', async (req: Request, res: Response) => {
  try {
    // Get prospect first to log details
    const prospect = await prospectRepository.findById(req.params.id as string, true); // Include deleted
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const success = await prospectRepository.permanentDelete(req.params.id as string);

    if (!success) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'prospect_permanent_delete',
      entity_type: 'prospect',
      entity_id: req.params.id as string,
      details: {
        domain: prospect.domain,
        url: prospect.url,
        warning: 'PERMANENT - Cannot be recovered',
      },
    });

    res.json({
      success: true,
      message: 'Prospect permanently deleted (cannot be recovered)',
      warning: 'This action cannot be undone',
    });
  } catch (error) {
    logger.error('Error permanently deleting prospect:', error);
    res.status(500).json({ error: 'Failed to permanently delete prospect' });
  }
});

export default router;
