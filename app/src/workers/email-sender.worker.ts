import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { sendEmail } from '../services/resend.service.js';
import { Resend } from 'resend';
import { emailRepository, contactRepository, sequenceRepository, settingsRepository, auditRepository, prospectRepository } from '../db/repositories/index.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

export interface EmailSenderJobData {
  emailId: string;
}

// Worker processor
async function processEmailSenderJob(job: Job<EmailSenderJobData>): Promise<{ sent: boolean; resendId?: string }> {
  const { emailId } = job.data;

  logger.info(`Processing email send: ${emailId}`, { jobId: job.id });

  // Get email
  const email = await emailRepository.findById(emailId);
  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // Verify email is approved
  if (email.status !== 'approved') {
    logger.warn(`Email ${emailId} not approved, status: ${email.status}`);
    return { sent: false };
  }

  // Get contact
  const contact = await contactRepository.findById(email.contact_id);
  if (!contact) {
    throw new Error(`Contact not found: ${email.contact_id}`);
  }

  // Use edited content if available
  const subject = email.edited_subject || email.subject;

  // Signature is already embedded at generation time; just use the body as-is
  const settings = await settingsRepository.getAll();
  const finalBody = email.edited_body || email.body || '';

  // Send email
  const result = await sendEmail({
    to: contact.email,
    subject,
    body: finalBody,
    fromName: settings.sender_name || 'SYB Research Team',
    fromEmail: settings.sender_email || env.OUTREACH_FROM_EMAIL,
  });

  if (!result.success) {
    logger.error(`Failed to send email ${emailId}:`, result.error);
    throw new Error(`Email send failed: ${result.error}`);
  }

  // Update email status
  await emailRepository.markSent(emailId, result.resendId!);

  // Move prospect to completed
  await prospectRepository.updateStatus(email.prospect_id, 'email_sent');

  // Create follow-up sequence
  await sequenceRepository.create({
    email_id: emailId,
    prospect_id: email.prospect_id,
    contact_id: email.contact_id,
  });

  // Log audit
  await auditRepository.logEmailSent(emailId, contact.email);

  logger.info(`Email sent successfully: ${emailId}`, {
    resendId: result.resendId,
    recipient: contact.email,
  });

  return {
    sent: true,
    resendId: result.resendId,
  };
}

// Create and start worker
export function createEmailSenderWorker() {
  const worker = new Worker(QUEUE_NAMES.EMAIL_SENDER, processEmailSenderJob, {
    connection: redis,
    concurrency: 5,
  });

  worker.on('completed', (job, result) => {
    logger.info(`Email sender job ${job.id} completed:`, result);
  });

  worker.on('failed', async (job, error) => {
    logger.error(`Email sender job ${job?.id} failed:`, error);

    // Send failure notification
    try {
      const resend = new Resend(env.RESEND_API_KEY);
      const emailId = job?.data?.emailId ?? 'unknown';

      // Try to get contact email for context
      let recipientInfo = 'unknown recipient';
      try {
        const { db } = await import('../db/index.js');
        const result = await db.query<{ email: string; subject: string }>(
          `SELECT c.email, e.subject
           FROM emails e
           JOIN contacts c ON c.id = e.contact_id
           WHERE e.id = $1`,
          [emailId]
        );
        if (result.rows[0]) {
          recipientInfo = `${result.rows[0].email} — "${result.rows[0].subject}"`;
        }
      } catch (_) {}

      await resend.emails.send({
        from: 'SYB Backlinks <outreach@shieldyourbody.com>',
        to: 'vicky@shieldyourbody.com',
        subject: `[SYB Backlinks] Email send failed — ${recipientInfo}`,
        text: [
          `A backlinks outreach email failed to send.`,
          ``,
          `Email ID: ${emailId}`,
          `Recipient: ${recipientInfo}`,
          `Error: ${error.message}`,
          `Job ID: ${job?.id ?? 'unknown'}`,
          `Time: ${new Date().toISOString()}`,
          ``,
          `Check the dashboard for details.`,
        ].join('\n'),
      });
    } catch (notifyError) {
      logger.error('Failed to send failure notification:', notifyError);
    }
  });

  logger.info('Email sender worker started');
  return worker;
}

// Run if executed directly
// @ts-ignore - tsx handles import.meta at runtime
if (import.meta.url === `file://${process.argv[1]}`) {
  createEmailSenderWorker();
}

export default createEmailSenderWorker;
