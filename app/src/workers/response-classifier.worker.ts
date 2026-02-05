import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { classifyResponse } from '../services/claude.service.js';
import { responseRepository, sequenceRepository, auditRepository } from '../db/repositories/index.js';
import { db } from '../db/index.js';
import logger from '../utils/logger.js';

export interface ResponseClassifierJobData {
  responseId: string;
}

// Response categories
export type ResponseCategory =
  | 'positive'      // Interested, will add link
  | 'negotiating'   // Wants something in return
  | 'question'      // Has questions, needs more info
  | 'declined'      // Not interested but polite
  | 'negative'      // Hostile or unsubscribe request
  | 'auto_reply'    // Out of office, vacation
  | 'bounce'        // Delivery failure
  | 'unrelated';    // Wrong person or topic

export interface ClassificationResult {
  category: ResponseCategory;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  suggestedAction: string;
  summary: string;
}

// Worker processor
async function processResponseClassifierJob(job: Job<ResponseClassifierJobData>): Promise<ClassificationResult> {
  const { responseId } = job.data;

  logger.info(`Classifying response: ${responseId}`, { jobId: job.id });

  // Get response details
  const response = await responseRepository.findById(responseId);
  if (!response) {
    throw new Error(`Response not found: ${responseId}`);
  }

  // Get original email for context
  const emailResult = await db.query(`
    SELECT e.subject, e.body, p.url, p.domain
    FROM emails e
    JOIN prospects p ON e.prospect_id = p.id
    WHERE e.id = $1
  `, [response.email_id]);

  const originalEmail = emailResult.rows[0];

  // Classify using Claude
  const classification = await classifyResponse(
    response.subject,
    response.body,
    originalEmail?.subject,
    originalEmail?.body
  );

  // Update response with classification
  await db.query(`
    UPDATE responses
    SET
      classification = $1,
      sentiment = $2,
      confidence = $3,
      suggested_action = $4,
      summary = $5,
      classified_at = NOW()
    WHERE id = $6
  `, [
    classification.category,
    classification.sentiment,
    classification.confidence,
    classification.suggestedAction,
    classification.summary,
    responseId,
  ]);

  // Take automatic actions based on classification
  await handleClassificationActions(response.email_id, classification);

  // Log audit
  await auditRepository.log({
    action: 'response_categorized',
    entity_type: 'response',
    entity_id: responseId,
    details: {
      category: classification.category,
      sentiment: classification.sentiment,
      confidence: classification.confidence,
    },
  });

  logger.info(`Response classified: ${classification.category}`, {
    responseId,
    sentiment: classification.sentiment,
    confidence: classification.confidence,
  });

  return classification;
}

// Handle automatic actions based on classification
async function handleClassificationActions(emailId: string, classification: ClassificationResult): Promise<void> {
  // Stop follow-up sequences for certain responses
  const stopSequenceCategories: ResponseCategory[] = ['positive', 'declined', 'negative', 'bounce'];

  if (stopSequenceCategories.includes(classification.category)) {
    // Find and stop active sequences for this email
    const sequences = await db.query(`
      SELECT id FROM sequences
      WHERE email_id = $1 AND status = 'active'
    `, [emailId]);

    for (const seq of sequences.rows) {
      const newStatus = classification.category === 'positive' ? 'completed' : 'stopped';
      await sequenceRepository.updateStatus(seq.id, newStatus as 'completed' | 'stopped');
      logger.info(`Stopped sequence ${seq.id} due to ${classification.category} response`);
    }
  }

  // Update prospect status for positive responses
  if (classification.category === 'positive') {
    await db.query(`
      UPDATE prospects p
      SET status = 'responded'
      FROM emails e
      WHERE e.id = $1 AND e.prospect_id = p.id
    `, [emailId]);
  }

  // Add to blocklist for negative responses
  if (classification.category === 'negative' && classification.sentiment === 'negative') {
    const emailResult = await db.query(`
      SELECT c.email
      FROM emails e
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.id = $1
    `, [emailId]);

    if (emailResult.rows[0]) {
      await db.query(`
        INSERT INTO blocklist (type, value, reason, created_at)
        VALUES ('email', $1, 'Requested removal or hostile response', NOW())
        ON CONFLICT (type, value) DO NOTHING
      `, [emailResult.rows[0].email]);

      logger.info(`Added ${emailResult.rows[0].email} to blocklist due to negative response`);
    }
  }
}

// Create and start worker
export function createResponseClassifierWorker() {
  const worker = new Worker(QUEUE_NAMES.RESPONSE_CLASSIFIER, processResponseClassifierJob, {
    connection: redis,
    concurrency: 5,
    limiter: {
      max: 30,
      duration: 60000, // 30 per minute
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Classification job ${job.id} completed:`, { category: result.category });
  });

  worker.on('failed', (job, error) => {
    logger.error(`Classification job ${job?.id} failed:`, error);
  });

  logger.info('Response classifier worker started');
  return worker;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createResponseClassifierWorker();
}

export default createResponseClassifierWorker;
