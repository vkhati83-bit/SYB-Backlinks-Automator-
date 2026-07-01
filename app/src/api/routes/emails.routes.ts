import { Router, Request, Response } from 'express';
import { emailRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import { emailSenderQueue } from '../../config/queues.js';
import { generateOutreachEmail } from '../../services/claude.service.js';
import { findResearchCategory } from '../../services/research-matcher.service.js';
import { settingsRepository } from '../../db/repositories/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// POST /api/v1/emails/generate - Generate email with Claude (synchronous)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prospect_id, contact_id } = req.body;

    if (!prospect_id || !contact_id) {
      res.status(400).json({ error: 'prospect_id and contact_id are required' });
      return;
    }

    // Get prospect and contact info
    const prospectResult = await db.query(
      'SELECT * FROM prospects WHERE id = $1',
      [prospect_id]
    );
    if (prospectResult.rows.length === 0) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const contactResult = await db.query(
      'SELECT * FROM contacts WHERE id = $1',
      [contact_id]
    );
    if (contactResult.rows.length === 0) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    const prospect = prospectResult.rows[0];
    const contact = contactResult.rows[0];

    // For research_citation prospects, resolve research DB category URL
    let suggestedArticleUrl = prospect.suggested_article_url;
    let suggestedArticleTitle = prospect.suggested_article_title;
    let matchReason = prospect.match_reason;
    let researchCategoryName: string | undefined;
    let researchStudyCount: number | undefined;

    if (prospect.opportunity_type === 'research_citation') {
      const researchMatch = await findResearchCategory(
        prospect.keyword || '',
        prospect.title || '',
        prospect.url || ''
      );
      if (researchMatch) {
        suggestedArticleUrl = researchMatch.researchUrl;
        suggestedArticleTitle = `${researchMatch.studyCount}+ peer-reviewed studies on "${researchMatch.searchTerm}"`;
        matchReason = `Directly relevant to their ${researchMatch.searchTerm} content`;
        researchCategoryName = researchMatch.searchTerm;
        researchStudyCount = researchMatch.studyCount;
      } else {
        suggestedArticleUrl = 'https://www.shieldyourbody.com/research/studies?q=radiofrequency';
        suggestedArticleTitle = 'SYB EMF Research Database (3,600+ peer-reviewed studies)';
      }
    }

    // Generate email with Claude
    const generated = await generateOutreachEmail({
      prospectUrl: prospect.url,
      prospectDomain: prospect.domain,
      prospectTitle: prospect.title,
      prospectDescription: prospect.description,
      contactName: contact.name,
      contactEmail: contact.email,
      opportunityType: prospect.opportunity_type,
      pageContent: prospect.page_content || undefined,
      suggestedArticleUrl,
      suggestedArticleTitle,
      matchReason,
      brokenUrl: prospect.broken_url,
      researchCategoryName,
      researchStudyCount,
    });

    // Append sender name + signature so the preview matches what gets sent
    const settings = await settingsRepository.getAll();
    const senderName = settings.sender_name || '';
    const signature = settings.email_signature || '';
    const signOff = [senderName, signature].filter(Boolean).join('\n');
    if (signOff) {
      generated.body = `${generated.body}\n\nBest regards,\n${signOff}`;
    }

    res.json({
      subject: generated.subject,
      body: generated.body,
      prospect_id,
      contact_id,
    });
  } catch (error) {
    logger.error('Error generating email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to generate email',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

// POST /api/v1/emails/send - Save generated email and queue for review
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { prospect_id, contact_id, subject, body } = req.body;

    if (!prospect_id || !contact_id || !subject || !body) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Create email record
    const result = await db.query(`
      INSERT INTO emails (prospect_id, contact_id, subject, body, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending_review', NOW())
      RETURNING *
    `, [prospect_id, contact_id, subject, body]);

    const email = result.rows[0];

    // Log audit
    await auditRepository.log({
      action: 'email_generated',
      entity_type: 'email',
      entity_id: email.id,
      details: { subject },
    });

    res.json({
      success: true,
      email_id: email.id,
      message: 'Email queued for review',
    });
  } catch (error) {
    logger.error('Error saving email:', error);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

// GET /api/v1/emails - List emails (primarily for review queue)
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status = 'pending_review',
      limit = '50',
      offset = '0',
    } = req.query;

    const result = await db.query(`
      SELECT
        e.id,
        e.subject,
        e.body,
        e.edited_subject,
        e.edited_body,
        e.status,
        e.created_at,
        e.sent_at,
        json_build_object(
          'url', p.url,
          'domain', p.domain,
          'domain_authority', p.domain_authority,
          'quality_score', p.quality_score,
          'opportunity_type', p.opportunity_type
        ) as prospect,
        json_build_object(
          'email', c.email,
          'name', c.name,
          'confidence_tier', c.confidence_tier
        ) as contact
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.status = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3
    `, [status, parseInt(limit as string), parseInt(offset as string)]);

    const countResult = await db.query(
      'SELECT COUNT(*) FROM emails WHERE status = $1',
      [status]
    );

    res.json({
      emails: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    logger.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// GET /api/v1/emails/queue-status - Lightweight status check for the send queue
// NOTE: Must be defined BEFORE /:id route so Express doesn't match these as IDs
router.get('/queue-status', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'sent' AND sent_at > NOW() - INTERVAL '24 hours') as sent_today
      FROM emails
    `);
    const row = result.rows[0];
    res.json({
      pending_review: parseInt(row.pending_review),
      approved: parseInt(row.approved),
      sent: parseInt(row.sent),
      sent_today: parseInt(row.sent_today),
    });
  } catch (error) {
    logger.error('Error fetching queue status:', error);
    res.status(500).json({ error: 'Failed to fetch queue status' });
  }
});

// GET /api/v1/emails/wip - Work-in-progress snapshot: today's send budget, live queue, pipeline.
// The daily numbers mirror the autopilot's own logic exactly (autopilot.worker.ts) so what you
// see here is what the automation actually does. "Today" = UTC calendar day, because that is when
// the autopilot's daily cap resets (midnight UTC = 5:30 AM IST). Must stay above the /:id route.
router.get('/wip', async (_req: Request, res: Response) => {
  try {
    const settings = await settingsRepository.getAll();
    const safetyMode = (await settingsRepository.get<string>('safety_mode')) || 'test';

    // Hard ceiling is 20/day regardless of the configured limit (autopilot uses min(limit, 20)).
    const dailyCap = Math.min(settings.daily_send_limit, 20);

    // used_today mirrors autopilot.countEmailsSentToday(): rows CREATED today that reached
    // approved-or-later status. That is what consumes the daily budget.
    const emailRes = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status IN ('approved','sent','delivered','opened','clicked','bounced','complained')
                          AND created_at >= CURRENT_DATE) AS used_today,
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked') AND sent_at >= CURRENT_DATE) AS delivered_today,
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked')) AS sent_all_time,
        MAX(sent_at) AS last_sent_at
      FROM emails
    `);
    const e = emailRes.rows[0];
    const usedToday = parseInt(e.used_today, 10);
    const remainingToday = Math.max(dailyCap - usedToday, 0);

    // Prospects ready to email right now (mirrors autopilot.getReadyProspects()):
    // contact found, not deleted, has a contact, and no active email yet.
    const readyRes = await db.query(`
      SELECT COUNT(*) AS ready
      FROM prospects p
      WHERE p.status = 'contact_found'
        AND p.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = p.id)
        AND NOT EXISTS (
          SELECT 1 FROM emails e
          WHERE e.prospect_id = p.id AND e.status IN ('pending_review','approved','sent')
        )
    `);
    const ready = parseInt(readyRes.rows[0].ready, 10);

    // Prospect pipeline funnel (non-deleted).
    const funnelRes = await db.query<{ status: string; count: string }>(`
      SELECT status, COUNT(*) AS count FROM prospects WHERE deleted_at IS NULL GROUP BY status
    `);
    const pipeline: Record<string, number> = {};
    for (const row of funnelRes.rows) pipeline[row.status] = parseInt(row.count, 10);

    // Next autopilot run (UTC): scheduler fires at the top of settings.autopilot_run_hour.
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), settings.autopilot_run_hour, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

    res.json({
      today: {
        daily_cap: dailyCap,
        used_today: usedToday,
        remaining_today: remainingToday,
        delivered_today: parseInt(e.delivered_today, 10),
      },
      queue: {
        pending_review: parseInt(e.pending_review, 10), // waiting for your approval
        approved: parseInt(e.approved, 10),             // approved, queued to send
        ready_prospects: ready,                         // have a contact, no email drafted yet
      },
      autopilot: {
        enabled: settings.autopilot_enabled,
        run_hour_utc: settings.autopilot_run_hour,
        next_run_utc: next.toISOString(),
      },
      pipeline,
      totals: {
        sent_all_time: parseInt(e.sent_all_time, 10),
        last_sent_at: e.last_sent_at,
      },
      safety_mode: safetyMode,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching WIP status:', error);
    res.status(500).json({ error: 'Failed to fetch WIP status' });
  }
});

// POST /api/v1/emails/bulk-generate - Queue email generation for multiple prospects
router.post('/bulk-generate', async (req: Request, res: Response) => {
  try {
    const { prospect_ids } = req.body;

    if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
      res.status(400).json({ error: 'prospect_ids array is required' });
      return;
    }

    const { emailGeneratorQueue } = await import('../../config/queues.js');
    const queued: string[] = [];
    const skipped: { id: string; domain: string; reason: string }[] = [];

    for (const prospectId of prospect_ids) {
      // Get prospect
      const prospectResult = await db.query(
        'SELECT id, domain, opportunity_type FROM prospects WHERE id = $1',
        [prospectId]
      );
      if (prospectResult.rows.length === 0) {
        skipped.push({ id: prospectId, domain: '?', reason: 'Prospect not found' });
        continue;
      }
      const prospect = prospectResult.rows[0];

      // Check if email already exists (pending_review or approved or sent)
      const existingEmail = await db.query(
        `SELECT id FROM emails WHERE prospect_id = $1 AND status IN ('pending_review', 'approved', 'sent')`,
        [prospectId]
      );
      if (existingEmail.rows.length > 0) {
        skipped.push({ id: prospectId, domain: prospect.domain, reason: 'Email already exists' });
        continue;
      }

      // Find primary contact (or first contact)
      const contactResult = await db.query(
        `SELECT id FROM contacts WHERE prospect_id = $1 ORDER BY is_primary DESC, confidence_tier ASC, created_at ASC LIMIT 1`,
        [prospectId]
      );
      if (contactResult.rows.length === 0) {
        skipped.push({ id: prospectId, domain: prospect.domain, reason: 'No contacts found' });
        continue;
      }

      const contactId = contactResult.rows[0].id;

      // Queue email generation
      await emailGeneratorQueue.add('generate-email', {
        prospectId,
        contactId,
      });

      queued.push(prospectId);
    }

    res.json({
      queued: queued.length,
      skipped: skipped.length,
      queued_prospect_ids: queued,
      skipped_details: skipped,
    });
  } catch (error) {
    logger.error('Error bulk generating emails:', error);
    res.status(500).json({ error: 'Failed to queue bulk email generation' });
  }
});

// GET /api/v1/emails/by-prospects - Get emails for specific prospect IDs
router.get('/by-prospects', async (req: Request, res: Response) => {
  try {
    const ids = req.query.ids as string;
    if (!ids) {
      res.status(400).json({ error: 'ids query parameter is required (comma-separated)' });
      return;
    }

    const prospectIds = ids.split(',').filter(Boolean);
    if (prospectIds.length === 0) {
      res.json({ emails: [] });
      return;
    }

    // Build parameterized query
    const placeholders = prospectIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(`
      SELECT
        e.id,
        e.prospect_id,
        e.contact_id,
        e.subject,
        e.body,
        e.edited_subject,
        e.edited_body,
        e.status,
        e.created_at,
        e.sent_at,
        p.domain,
        p.url as prospect_url,
        p.domain_authority,
        p.opportunity_type,
        c.email as contact_email,
        c.name as contact_name
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.prospect_id IN (${placeholders})
        AND e.status IN ('pending_review', 'approved', 'sent')
      ORDER BY e.created_at DESC
    `, prospectIds);

    res.json({ emails: result.rows });
  } catch (error) {
    logger.error('Error fetching emails by prospects:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// POST /api/v1/emails/bulk-send - Approve and queue multiple emails for sending
router.post('/bulk-send', async (req: Request, res: Response) => {
  try {
    const { email_ids } = req.body;

    if (!Array.isArray(email_ids) || email_ids.length === 0) {
      res.status(400).json({ error: 'email_ids array is required' });
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const emailId of email_ids) {
      try {
        const email = await emailRepository.findById(emailId);
        if (!email) {
          failed++;
          continue;
        }

        // Only approve emails that are pending_review
        if (email.status !== 'pending_review') {
          failed++;
          continue;
        }

        await emailRepository.updateStatus(emailId, 'approved');
        await emailSenderQueue.add('send-email', { emailId });
        await auditRepository.logEmailApproved(emailId);
        sent++;
      } catch (err) {
        logger.error(`Failed to approve email ${emailId}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      sent,
      failed,
      message: `${sent} emails queued for sending${failed > 0 ? `, ${failed} failed` : ''}`,
    });
  } catch (error) {
    logger.error('Error bulk sending emails:', error);
    res.status(500).json({ error: 'Failed to bulk send emails' });
  }
});

// GET /api/v1/emails/sent - List sent emails with link check status
// NOTE: Must be defined BEFORE /:id route so Express doesn't match "sent" as an ID
router.get('/sent', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT
        e.id,
        e.subject,
        e.sent_at,
        e.status,
        c.email as contact_email,
        c.name as contact_name,
        p.domain,
        p.url as prospect_url,
        p.opportunity_type,
        p.research_link_found,
        p.research_link_last_checked_at
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      LEFT JOIN contacts c ON e.contact_id = c.id
      WHERE e.status = 'sent'
        AND e.sent_at IS NOT NULL
      ORDER BY e.sent_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM emails e WHERE e.status = 'sent' AND e.sent_at IS NOT NULL`
    );

    res.json({
      emails: result.rows,
      total: parseInt(countResult.rows[0].total),
      page,
      limit,
    });
  } catch (error) {
    logger.error('Error fetching sent emails:', error);
    res.status(500).json({ error: 'Failed to fetch sent emails' });
  }
});

// GET /api/v1/emails/:id - Get single email
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const email = await emailRepository.findById(req.params.id as string);
    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    res.json(email);
  } catch (error) {
    logger.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// POST /api/v1/emails/:id/approve - Approve email for sending
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const email = await emailRepository.findById(req.params.id as string);
    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    const { edited_subject, edited_body } = req.body;

    // Update email with edits if provided
    if (edited_subject || edited_body) {
      await db.query(`
        UPDATE emails
        SET edited_subject = COALESCE($1, edited_subject),
            edited_body = COALESCE($2, edited_body),
            status = 'approved',
            updated_at = NOW()
        WHERE id = $3
      `, [edited_subject, edited_body, req.params.id]);
    } else {
      await emailRepository.updateStatus(req.params.id as string, 'approved');
    }

    // Queue for sending
    await emailSenderQueue.add('send-email', { emailId: req.params.id });

    // Log audit
    await auditRepository.logEmailApproved(req.params.id as string);

    res.json({ success: true, message: 'Email approved and queued for sending' });
  } catch (error) {
    logger.error('Error approving email:', error);
    res.status(500).json({ error: 'Failed to approve email' });
  }
});

// POST /api/v1/emails/:id/reject - Reject email
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const email = await emailRepository.findById(req.params.id as string);
    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    const { reason } = req.body;

    await db.query(`
      UPDATE emails
      SET status = 'rejected',
          rejection_reason = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [reason || 'No reason provided', req.params.id]);

    // Log audit
    await auditRepository.logEmailRejected(req.params.id as string, undefined, reason || 'No reason provided');

    res.json({ success: true, message: 'Email rejected' });
  } catch (error) {
    logger.error('Error rejecting email:', error);
    res.status(500).json({ error: 'Failed to reject email' });
  }
});

// POST /api/v1/emails/:id/regenerate - Regenerate email
router.post('/:id/regenerate', async (req: Request, res: Response) => {
  try {
    const email = await emailRepository.findById(req.params.id as string);
    if (!email) {
      res.status(404).json({ error: 'Email not found' });
      return;
    }

    // Queue for regeneration
    const { emailGeneratorQueue } = await import('../../config/queues.js');
    await emailGeneratorQueue.add('generate-email', {
      prospectId: email.prospect_id,
      contactId: email.contact_id,
      regenerate: true,
      previousEmailId: email.id,
    });

    // Mark current as superseded
    await emailRepository.updateStatus(req.params.id as string, 'rejected');

    res.json({ success: true, message: 'Email queued for regeneration' });
  } catch (error) {
    logger.error('Error regenerating email:', error);
    res.status(500).json({ error: 'Failed to regenerate email' });
  }
});


// POST /api/v1/emails/:id/check-link - Check if prospect page has a backlink to SYB research
router.post('/:id/check-link', async (req: Request, res: Response) => {
  try {
    const emailId = req.params.id as string;

    const result = await db.query(`
      SELECT p.url as prospect_url, p.domain
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      WHERE e.id = $1 AND e.status = 'sent'
    `, [emailId]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Sent email not found' });
      return;
    }

    const { prospect_url } = result.rows[0];

    // Import the checkForBacklink function from the link-checker worker
    const { checkForBacklink } = await import('../../workers/link-checker.worker.js');
    const linkResult = await checkForBacklink(prospect_url, 'shieldyourbody.com');

    // Update prospects table
    await db.query(`
      UPDATE prospects p
      SET
        research_link_found = $1,
        research_link_last_checked_at = NOW()
      FROM emails e
      WHERE e.id = $2 AND e.prospect_id = p.id
    `, [linkResult.found, emailId]);

    res.json({
      found: linkResult.found,
      linkUrl: linkResult.linkUrl || null,
      anchorText: linkResult.anchorText || null,
      isDoFollow: linkResult.isDoFollow,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error checking link:', error);
    res.status(500).json({ error: 'Failed to check link' });
  }
});

export default router;

