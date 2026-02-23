import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queues.js';
import { db } from '../db/index.js';
import { auditRepository } from '../db/repositories/index.js';
import logger from '../utils/logger.js';
import * as cheerio from 'cheerio';

export interface LinkCheckerJobData {
  emailId: string;
  prospectUrl: string;
  targetUrl: string; // The SYB URL we want linked
}

interface LinkCheckResult {
  found: boolean;
  linkUrl?: string;
  anchorText?: string;
  isDoFollow: boolean;
  context?: string;
  error?: string;
}

// Check if a page contains a link to our target URL
async function checkForBacklink(pageUrl: string, targetDomain: string): Promise<LinkCheckResult> {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return {
        found: false,
        isDoFollow: false,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find all links
    const links = $('a[href]');

    for (let i = 0; i < links.length; i++) {
      const link = $(links[i]);
      const href = link.attr('href') || '';

      // Check if link points to our target domain
      if (href.includes(targetDomain) || href.includes('shieldyourbody.com')) {
        const rel = link.attr('rel') || '';
        const isNoFollow = rel.toLowerCase().includes('nofollow');

        // Get surrounding context (parent paragraph or nearby text)
        const parent = link.parent();
        let context = parent.text().trim().substring(0, 200);

        return {
          found: true,
          linkUrl: href,
          anchorText: link.text().trim(),
          isDoFollow: !isNoFollow,
          context,
        };
      }
    }

    return {
      found: false,
      isDoFollow: false,
    };
  } catch (error) {
    return {
      found: false,
      isDoFollow: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Worker processor
async function processLinkCheckerJob(job: Job<LinkCheckerJobData>): Promise<LinkCheckResult> {
  const { emailId, prospectUrl, targetUrl } = job.data;

  logger.info(`Checking for backlink: ${prospectUrl}`, { jobId: job.id });

  // Extract target domain
  const targetDomain = new URL(targetUrl).hostname;

  // Check for backlink
  const result = await checkForBacklink(prospectUrl, targetDomain);

  // Save link check result
  await db.query(`
    INSERT INTO link_checks (email_id, checked_url, link_found, link_url, anchor_text, is_dofollow, context, error)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    emailId,
    prospectUrl,
    result.found,
    result.linkUrl || null,
    result.anchorText || null,
    result.isDoFollow,
    result.context || null,
    result.error || null,
  ]);

  // If link found, update prospect status
  if (result.found) {
    await db.query(`
      UPDATE prospects p
      SET status = 'converted'
      FROM emails e
      WHERE e.id = $1 AND e.prospect_id = p.id
    `, [emailId]);

    // Log success
    await auditRepository.log({
      action: 'link_verified',
      entity_type: 'email',
      entity_id: emailId,
      details: {
        prospectUrl,
        linkUrl: result.linkUrl,
        isDoFollow: result.isDoFollow,
      },
    });

    logger.info(`Backlink FOUND: ${result.linkUrl}`, {
      emailId,
      anchorText: result.anchorText,
      isDoFollow: result.isDoFollow,
    });
  } else {
    logger.info(`No backlink found on ${prospectUrl}`, { emailId });
  }

  return result;
}

// Schedule periodic link checks for sent emails
export async function scheduleBacklinkChecks(): Promise<number> {
  // Find emails sent more than 7 days ago without a link check in the last 3 days
  const result = await db.query(`
    SELECT e.id as email_id, p.url as prospect_url
    FROM emails e
    JOIN prospects p ON e.prospect_id = p.id
    WHERE e.status = 'sent'
      AND e.sent_at < NOW() - INTERVAL '7 days'
      AND p.status != 'converted'
      AND NOT EXISTS (
        SELECT 1 FROM link_checks lc
        WHERE lc.email_id = e.id
          AND lc.checked_at > NOW() - INTERVAL '3 days'
      )
    LIMIT 50
  `);

  let queued = 0;

  for (const row of result.rows) {
    const { linkCheckerQueue } = await import('../config/queues.js');
    await linkCheckerQueue.add('check-backlink', {
      emailId: row.email_id,
      prospectUrl: row.prospect_url,
      targetUrl: 'https://shieldyourbody.com/research',
    });
    queued++;
  }

  if (queued > 0) {
    logger.info(`Scheduled ${queued} backlink checks`);
  }

  return queued;
}

// Create and start worker
export function createLinkCheckerWorker() {
  const worker = new Worker(QUEUE_NAMES.LINK_CHECKER, processLinkCheckerJob, {
    connection: redis,
    concurrency: 3,
    limiter: {
      max: 20,
      duration: 60000, // 20 per minute to avoid rate limiting
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Link check job ${job.id} completed:`, { found: result.found });
  });

  worker.on('failed', (job, error) => {
    logger.error(`Link check job ${job?.id} failed:`, error);
  });

  logger.info('Link checker worker started');
  return worker;
}

// Run if executed directly
// @ts-ignore - tsx handles import.meta at runtime
if (import.meta.url === `file://${process.argv[1]}`) {
  createLinkCheckerWorker();
}

export default createLinkCheckerWorker;
