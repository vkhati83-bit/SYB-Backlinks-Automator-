import { Router, Request, Response } from 'express';
import { contactRepository, prospectRepository, auditRepository } from '../../db/repositories/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// POST /api/v1/contacts/retry-failed - Retry contact finder for all prospects with 0 contacts
router.post('/retry-failed', async (req: Request, res: Response) => {
  try {
    const { contactFinderQueue } = await import('../../config/queues.js');
    const { db } = await import('../../db/index.js');

    // Find all approved prospects with 0 contacts
    const result = await db.query(`
      SELECT p.id, p.url, p.domain
      FROM prospects p
      WHERE p.approval_status = 'approved'
        AND p.status != 'email_sent'
        AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = p.id)
    `);

    const prospects = result.rows;
    let queued = 0;

    for (const prospect of prospects) {
      await contactFinderQueue.add('find-contact', {
        prospectId: prospect.id,
        url: prospect.url,
        domain: prospect.domain,
      });
      queued++;
    }

    logger.info(`Retry-failed: queued ${queued} prospects for contact finding`);

    res.json({
      success: true,
      message: `Queued ${queued} prospects for retry`,
      queued,
    });
  } catch (error) {
    logger.error('Error in retry-failed:', error);
    res.status(500).json({ error: 'Failed to queue retries' });
  }
});

// GET /api/v1/contacts/:prospectId - Get contacts for a prospect
router.get('/:prospectId', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const contacts = await contactRepository.findByProspect(prospectId);
    const primary = contacts.find(c => c.is_primary);
    const queue = contacts.filter(c => c.queue_status === 'queued').sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));

    res.json({
      contacts,
      primary,
      queue,
    });
  } catch (error) {
    logger.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// POST /api/v1/contacts/:prospectId/set-primary - Set primary contact
router.post('/:prospectId/set-primary', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const { contact_id } = req.body;

    if (!contact_id) {
      res.status(400).json({ error: 'contact_id is required' });
      return;
    }

    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const contact = await contactRepository.setPrimary(prospectId, contact_id);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'contact_set_primary',
      entity_type: 'contact',
      entity_id: contact_id,
      details: { prospect_id: prospectId },
    });

    res.json({ success: true, contact });
  } catch (error) {
    logger.error('Error setting primary contact:', error);
    res.status(500).json({ error: 'Failed to set primary contact' });
  }
});

// POST /api/v1/contacts/:prospectId/queue - Add contact to email queue
router.post('/:prospectId/queue', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const { contact_id } = req.body;

    if (!contact_id) {
      res.status(400).json({ error: 'contact_id is required' });
      return;
    }

    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const contact = await contactRepository.addToQueue(prospectId, contact_id);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'contact_queued',
      entity_type: 'contact',
      entity_id: contact_id,
      details: { prospect_id: prospectId, queue_position: contact.queue_position },
    });

    res.json({ success: true, contact });
  } catch (error) {
    logger.error('Error adding contact to queue:', error);
    res.status(500).json({ error: 'Failed to add contact to queue' });
  }
});

// DELETE /api/v1/contacts/:prospectId/queue/:contactId - Remove contact from queue
router.delete('/:prospectId/queue/:contactId', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const contactId = req.params.contactId as string;
    const contact = await contactRepository.removeFromQueue(prospectId, contactId);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found or not in queue' });
      return;
    }

    // Log the action
    await auditRepository.log({
      action: 'contact_removed_from_queue',
      entity_type: 'contact',
      entity_id: contactId,
      details: { prospect_id: prospectId },
    });

    res.json({ success: true, contact });
  } catch (error) {
    logger.error('Error removing contact from queue:', error);
    res.status(500).json({ error: 'Failed to remove contact from queue' });
  }
});

// GET /api/v1/contacts/:prospectId/queue - Get email queue for prospect
router.get('/:prospectId/queue', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const queue = await contactRepository.getQueue(prospectId);
    const primary = await contactRepository.getPrimaryContact(prospectId);

    res.json({
      primary,
      queue,
      total: queue.length,
    });
  } catch (error) {
    logger.error('Error fetching queue:', error);
    res.status(500).json({ error: 'Failed to fetch queue' });
  }
});

// PATCH /api/v1/contacts/:prospectId/queue/reorder - Reorder queue
router.patch('/:prospectId/queue/reorder', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const { order } = req.body; // Array of { contact_id, position }

    if (!order || !Array.isArray(order)) {
      res.status(400).json({ error: 'order array is required' });
      return;
    }

    for (const item of order) {
      await contactRepository.updateQueuePosition(
        prospectId,
        item.contact_id,
        item.position
      );
    }

    const queue = await contactRepository.getQueue(prospectId);
    res.json({ success: true, queue });
  } catch (error) {
    logger.error('Error reordering queue:', error);
    res.status(500).json({ error: 'Failed to reorder queue' });
  }
});

// POST /api/v1/contacts/:prospectId/find - Trigger contact finder for a prospect
router.post('/:prospectId/find', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Queue the contact finder worker
    const { contactFinderQueue } = await import('../../config/queues.js');
    await contactFinderQueue.add('find-contact', {
      prospectId: prospect.id,
      url: prospect.url,
      domain: prospect.domain,
    });

    logger.info(`Queued contact finder for prospect ${prospectId}`);

    res.json({
      success: true,
      message: 'Contact finder queued. Emails will appear shortly.',
      prospect_id: prospectId,
    });
  } catch (error) {
    logger.error('Error queueing contact finder:', error);
    res.status(500).json({ error: 'Failed to queue contact finder' });
  }
});

// POST /api/v1/contacts/:prospectId/use - Set a contact as primary and queue email generation
router.post('/:prospectId/use', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const { contact_id } = req.body;

    if (!contact_id) {
      res.status(400).json({ error: 'contact_id is required' });
      return;
    }

    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    // Set as primary contact
    const contact = await contactRepository.setPrimary(prospectId, contact_id);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    // Queue email generation
    const { emailGeneratorQueue } = await import('../../config/queues.js');
    await emailGeneratorQueue.add('generate-email', {
      prospectId,
      contactId: contact_id,
    });

    // Log the action
    await auditRepository.log({
      action: 'contact_selected_for_outreach',
      entity_type: 'contact',
      entity_id: contact_id,
      details: { prospect_id: prospectId },
    });

    logger.info(`Contact ${contact_id} set as primary for prospect ${prospectId}, email generation queued`);

    res.json({
      success: true,
      message: 'Contact selected and email generation queued',
      contact,
    });
  } catch (error) {
    logger.error('Error using contact:', error);
    res.status(500).json({ error: 'Failed to use contact' });
  }
});

// POST /api/v1/contacts/:prospectId - Create new contact
router.post('/:prospectId', async (req: Request, res: Response) => {
  try {
    const prospectId = req.params.prospectId as string;
    const prospect = await prospectRepository.findById(prospectId);
    if (!prospect) {
      res.status(404).json({ error: 'Prospect not found' });
      return;
    }

    const { email, name, role, confidence_tier, source = 'manual' } = req.body;

    if (!email) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    const contact = await contactRepository.create({
      prospect_id: prospectId,
      email,
      name,
      role,
      confidence_tier: confidence_tier || 'A', // Manual adds are high confidence
      source,
    });

    // Log the action
    await auditRepository.log({
      action: 'contact_found',
      entity_type: 'contact',
      entity_id: contact.id,
      details: { prospect_id: prospectId, source },
    });

    res.status(201).json(contact);
  } catch (error) {
    logger.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

export default router;
