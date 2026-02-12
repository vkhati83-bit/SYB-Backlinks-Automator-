import { Queue, QueueEvents, JobsOptions } from 'bullmq';
import redis from './redis.js';
import logger from '../utils/logger.js';

// Default job options
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
};

// Queue definitions
export const QUEUE_NAMES = {
  PROSPECTING: 'prospecting',
  CONTACT_FINDER: 'contact-finder',
  EMAIL_GENERATOR: 'email-generator',
  EMAIL_SENDER: 'email-sender',
  FOLLOWUP: 'followup',
  LINK_CHECKER: 'link-checker',
  RESPONSE_CLASSIFIER: 'response-classifier',
  BROKEN_LINK_VERIFIER: 'broken-link-verifier',
} as const;

// Create queues
export const prospectingQueue = new Queue(QUEUE_NAMES.PROSPECTING, {
  connection: redis,
  defaultJobOptions,
});

export const contactFinderQueue = new Queue(QUEUE_NAMES.CONTACT_FINDER, {
  connection: redis,
  defaultJobOptions,
});

export const emailGeneratorQueue = new Queue(QUEUE_NAMES.EMAIL_GENERATOR, {
  connection: redis,
  defaultJobOptions,
});

export const emailSenderQueue = new Queue(QUEUE_NAMES.EMAIL_SENDER, {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2, // Fewer retries for sending
  },
});

export const followupQueue = new Queue(QUEUE_NAMES.FOLLOWUP, {
  connection: redis,
  defaultJobOptions,
});

export const linkCheckerQueue = new Queue(QUEUE_NAMES.LINK_CHECKER, {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
  },
});

export const responseClassifierQueue = new Queue(QUEUE_NAMES.RESPONSE_CLASSIFIER, {
  connection: redis,
  defaultJobOptions,
});

export const brokenLinkVerifierQueue = new Queue(QUEUE_NAMES.BROKEN_LINK_VERIFIER, {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
  },
});

// All queues for easy iteration
export const allQueues = [
  prospectingQueue,
  contactFinderQueue,
  emailGeneratorQueue,
  emailSenderQueue,
  followupQueue,
  linkCheckerQueue,
  responseClassifierQueue,
  brokenLinkVerifierQueue,
];

// Queue events for monitoring
export function createQueueEvents(queueName: string): QueueEvents {
  const events = new QueueEvents(queueName, { connection: redis });

  events.on('completed', ({ jobId }) => {
    logger.debug(`Job ${jobId} completed in ${queueName}`);
  });

  events.on('failed', ({ jobId, failedReason }) => {
    logger.error(`Job ${jobId} failed in ${queueName}: ${failedReason}`);
  });

  return events;
}

// Get queue stats
export async function getQueueStats(): Promise<Record<string, {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}>> {
  const stats: Record<string, any> = {};

  for (const queue of allQueues) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    stats[queue.name] = { waiting, active, completed, failed, delayed };
  }

  return stats;
}

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map(q => q.close()));
  logger.info('All queues closed');
}

export default {
  QUEUE_NAMES,
  prospectingQueue,
  contactFinderQueue,
  emailGeneratorQueue,
  emailSenderQueue,
  followupQueue,
  linkCheckerQueue,
  responseClassifierQueue,
  brokenLinkVerifierQueue,
  allQueues,
  getQueueStats,
  closeQueues,
};
