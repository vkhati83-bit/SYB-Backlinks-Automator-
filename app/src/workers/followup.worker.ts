import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { generateFollowupEmail } from '../services/claude.service.js';
import { sendEmail } from '../services/resend.service.js';
import { sequenceRepository, emailRepository, contactRepository, auditRepository } from '../db/repositories/index.js';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';

export interface FollowupJobData {
  sequenceId: string;
}

// Check for due follow-ups (called by scheduler)
export async function checkDueFollowups(): Promise<number> {
  const dueSequences = await sequenceRepository.findDueForFollowup(50);
  let queued = 0;

  for (const sequence of dueSequences) {
    // Import here to avoid circular dependency
    const { followupQueue } = await import('../config/queues.js');
    await followupQueue.add('send-followup', { sequenceId: sequence.id });
    queued++;
  }

  if (queued > 0) {
    logger.info(`Queued ${queued} follow-up emails`);
  }

  return queued;
}

// Worker processor
async function processFollowupJob(job: Job<FollowupJobData>): Promise<{ sent: boolean; step: number }> {
  const { sequenceId } = job.data;

  logger.info(`Processing follow-up: ${sequenceId}`, { jobId: job.id });

  // Get sequence
  const sequence = await sequenceRepository.findById(sequenceId);
  if (!sequence) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  // Verify sequence is still active
  if (sequence.status !== 'active') {
    logger.info(`Sequence ${sequenceId} is not active, skipping`);
    return { sent: false, step: sequence.current_step };
  }

  // Get original email
  const originalEmail = await emailRepository.findById(sequence.email_id);
  if (!originalEmail) {
    throw new Error(`Original email not found: ${sequence.email_id}`);
  }

  // Get contact
  const contact = await contactRepository.findById(sequence.contact_id);
  if (!contact) {
    throw new Error(`Contact not found: ${sequence.contact_id}`);
  }

  // Generate follow-up email
  const followup = await generateFollowupEmail(
    originalEmail.edited_subject || originalEmail.subject,
    originalEmail.edited_body || originalEmail.body,
    contact.name,
    sequence.current_step
  );

  // Send follow-up
  const result = await sendEmail({
    to: contact.email,
    subject: `Re: ${originalEmail.edited_subject || originalEmail.subject}`,
    body: followup.body,
  });

  if (!result.success) {
    throw new Error(`Failed to send follow-up: ${result.error}`);
  }

  // Save follow-up email record
  await db.query(`
    INSERT INTO followup_emails (sequence_id, step_number, subject, body, resend_id, sent_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [
    sequenceId,
    sequence.current_step,
    followup.subject,
    followup.body,
    result.resendId,
  ]);

  // Advance sequence to next step
  await sequenceRepository.advanceStep(sequenceId);

  // Log audit
  await auditRepository.logFollowupSent(originalEmail.id, sequence.current_step);

  logger.info(`Follow-up sent: step ${sequence.current_step}`, {
    sequenceId,
    resendId: result.resendId,
  });

  return {
    sent: true,
    step: sequence.current_step,
  };
}

// Create and start worker
export function createFollowupWorker() {
  const worker = new Worker(QUEUE_NAMES.FOLLOWUP, processFollowupJob, {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // 10 per minute
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Follow-up job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Follow-up job ${job?.id} failed:`, error);
  });

  logger.info('Follow-up worker started');
  return worker;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createFollowupWorker();
}

export default createFollowupWorker;
