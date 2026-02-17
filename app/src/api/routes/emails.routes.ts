import { Router, Request, Response } from 'express';
import { emailRepository, auditRepository } from '../../db/repositories/index.js';
import { db } from '../../db/index.js';
import { emailSenderQueue } from '../../config/queues.js';
import { generateOutreachEmail } from '../../services/claude.service.js';
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
      suggestedArticleUrl: prospect.suggested_article_url,
      suggestedArticleTitle: prospect.suggested_article_title,
      matchReason: prospect.match_reason,
      brokenUrl: prospect.broken_url,
    });

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
    await auditRepository.logEmailApproved(req.params.id as string, 'system');

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
    await auditRepository.logEmailRejected(req.params.id as string, 'system', reason || 'No reason provided');

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

export default router;
