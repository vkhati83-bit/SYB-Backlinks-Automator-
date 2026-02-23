import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { sendEmail } from '../services/resend.service.js';
import { emailRepository, contactRepository, sequenceRepository, settingsRepository, auditRepository } from '../db/repositories/index.js';
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

  // Check daily send limit
  const sentToday = await emailRepository.countSentToday();
  const dailyLimit = await settingsRepository.getDailySendLimit();

  if (sentToday >= dailyLimit) {
    logger.warn(`Daily send limit reached: ${sentToday}/${dailyLimit}`);
    // Re-queue for later
    throw new Error(`Daily send limit reached (${sentToday}/${dailyLimit}). Will retry later.`);
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
    recipient: env.SAFETY_MODE === 'test' ? env.TEST_EMAIL_RECIPIENT : contact.email,
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
    concurrency: 2, // Limit concurrent sends
    limiter: {
      max: 10, // Max 10 emails per
      duration: 60000, // per minute
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Email sender job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Email sender job ${job?.id} failed:`, error);
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
