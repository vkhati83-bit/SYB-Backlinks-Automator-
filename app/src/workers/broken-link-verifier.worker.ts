/**
 * Broken Link Verifier Worker
 *
 * Verifies URLs are actually broken (404, 410, 500, timeout) before
 * finding backlinks to them. This prevents treating all competitor
 * backlinks as "broken link opportunities" when they're not broken.
 *
 * Two-step verification process:
 * 1. Verify URL is actually broken (HEAD request)
 * 2. Find backlinks only to confirmed broken URLs
 */

import { Job, Worker } from 'bullmq';
import { db } from '../db/index.js';
import { apiLogRepository } from '../db/repositories/api-log.repository.js';
import logger from '../utils/logger.js';
import { redisConnection } from '../config/redis.js';

interface BrokenLinkVerificationJob {
  competitorUrls: string[];
  campaignId?: string;
  minDA?: number;
  maxDA?: number;
  limit?: number;
}

interface UrlVerificationResult {
  url: string;
  isBroken: boolean;
  statusCode: number;
  checkedAt: Date;
  error?: string;
}

/**
 * Verify if a URL is actually broken
 */
async function verifyUrlIsBroken(url: string): Promise<UrlVerificationResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const isBroken = response.status >= 400;
    const statusCode = response.status;

    logger.info(`URL verification: ${url} -> ${statusCode} (${isBroken ? 'BROKEN' : 'OK'})`);

    return {
      url,
      isBroken,
      statusCode,
      checkedAt: new Date(),
    };
  } catch (error: any) {
    // Network errors, timeouts, SSL errors all indicate broken URLs
    logger.warn(`URL verification failed for ${url}: ${error.message}`);
    return {
      url,
      isBroken: true,
      statusCode: 0,
      checkedAt: new Date(),
      error: error.message,
    };
  }
}

/**
 * Find backlinks to a broken URL using DataForSEO
 */
async function findBacklinksToUrl(
  brokenUrl: string,
  minDA: number = 15,
  maxDA: number = 100,
  limit: number = 50
): Promise<any[]> {
  const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
  const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
    throw new Error('DataForSEO credentials not configured');
  }

  const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

  const logId = await apiLogRepository.log({
    service: 'dataforseo',
    endpoint: 'backlinks/backlinks/live',
    method: 'POST',
    requestBody: { target: brokenUrl },
    success: false,
  });

  try {
    const filters: any[] = [['rank', '>=', minDA]];
    if (maxDA < 100) {
      filters.push('and');
      filters.push(['rank', '<=', maxDA]);
    }

    const response = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        target: brokenUrl,
        limit: limit,
        order_by: ['rank,desc'],
        filters: filters.length > 0 ? filters : undefined,
      }]),
    });

    const data = await response.json() as {
      status_code?: number;
      cost?: number;
      tasks?: Array<{ result?: Array<{ items?: any[] }> }>;
    };

    await apiLogRepository.update(logId, {
      statusCode: response.status,
      responseBody: data as Record<string, unknown>,
      success: data.status_code === 20000,
      cost: data.cost || 0,
    });

    if (data.status_code === 20000) {
      const items = data.tasks?.[0]?.result?.[0]?.items || [];
      logger.info(`Found ${items.length} backlinks to broken URL: ${brokenUrl}`);
      return items;
    }

    return [];
  } catch (error: any) {
    await apiLogRepository.update(logId, {
      success: false,
      errorMessage: error.message,
    });
    logger.error(`Error finding backlinks to ${brokenUrl}:`, error);
    return [];
  }
}

/**
 * Process broken link verification job
 */
async function processBrokenLinkVerification(job: Job<BrokenLinkVerificationJob>) {
  const { competitorUrls, campaignId, minDA = 15, maxDA = 100, limit = 50 } = job.data;

  logger.info(`Processing broken link verification job for ${competitorUrls.length} URLs`);

  const verificationResults: UrlVerificationResult[] = [];
  const brokenUrls: string[] = [];

  // Step 1: Verify each URL is actually broken
  for (const url of competitorUrls) {
    const result = await verifyUrlIsBroken(url);
    verificationResults.push(result);

    if (result.isBroken) {
      brokenUrls.push(url);
    }

    // Rate limit to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  logger.info(`Verified ${competitorUrls.length} URLs: ${brokenUrls.length} are broken, ${competitorUrls.length - brokenUrls.length} are OK`);

  // Step 2: Find backlinks only to confirmed broken URLs
  let totalBacklinks = 0;
  const allBacklinks: Array<{
    brokenUrl: string;
    backlink: any;
    verification: UrlVerificationResult;
  }> = [];

  for (const brokenUrl of brokenUrls) {
    const backlinks = await findBacklinksToUrl(brokenUrl, minDA, maxDA, limit);
    totalBacklinks += backlinks.length;

    const verification = verificationResults.find(v => v.url === brokenUrl)!;

    backlinks.forEach(backlink => {
      allBacklinks.push({
        brokenUrl,
        backlink,
        verification,
      });
    });

    // Rate limit DataForSEO API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info(`Found ${totalBacklinks} backlinks to ${brokenUrls.length} confirmed broken URLs`);

  // Step 3: Save as prospects with broken URL metadata
  let inserted = 0;
  const seenDomains = new Set<string>();

  // Get existing domains
  const existingProspects = await db.query('SELECT domain FROM prospects WHERE deleted_at IS NULL');
  for (const row of existingProspects.rows) {
    seenDomains.add(row.domain.toLowerCase());
  }

  for (const { brokenUrl, backlink, verification } of allBacklinks) {
    try {
      const referringDomain = (backlink.domain_from || backlink.main_domain || '').toLowerCase().replace(/^www\./, '');

      if (!referringDomain || seenDomains.has(referringDomain)) {
        continue;
      }

      seenDomains.add(referringDomain);

      const qualityScore = Math.min(50 + (backlink.rank || 0) * 0.5, 100);
      const referringPageUrl = backlink.url_from || backlink.referring_page;
      const referringPageTitle = backlink.page_from_title || backlink.referring_page_title || 'Unknown';
      const anchorText = backlink.anchor || 'No anchor text';

      // Clear, structured description
      const description = JSON.stringify({
        opportunity_type: 'broken_link',
        referring_page: {
          url: referringPageUrl,
          title: referringPageTitle,
          domain: referringDomain,
          domain_authority: backlink.rank || backlink.domain_rank || 0,
        },
        broken_link_details: {
          broken_url: brokenUrl,
          anchor_text: anchorText,
          status_code: verification.statusCode || 0,
          verified: true,
          verified_at: verification.checkedAt.toISOString(),
        },
        replacement_suggestion: null, // Will be populated by article matcher
      }, null, 2);

      const humanReadableTitle = `${referringPageTitle} → Broken: "${anchorText}"`;

      await db.query(`
        INSERT INTO prospects (
          url, domain, title, description, domain_authority, quality_score,
          filter_status, filter_reasons, filter_score,
          broken_url, broken_url_status_code, broken_url_verified_at,
          outbound_link_context,
          opportunity_type, source, status, campaign_id, approval_status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'auto_approved', '{}', $7, $8, $9, $10, $11, 'broken_link', 'verified_broken', 'new', $12, 'pending', NOW())
        ON CONFLICT (url) DO UPDATE SET
          broken_url = EXCLUDED.broken_url,
          broken_url_status_code = EXCLUDED.broken_url_status_code,
          broken_url_verified_at = EXCLUDED.broken_url_verified_at,
          updated_at = NOW()
        RETURNING id
      `, [
        referringPageUrl,              // WHERE the broken link is
        referringDomain,
        humanReadableTitle,            // Clear title
        description,                   // Structured JSON
        backlink.rank || backlink.domain_rank || 0,
        qualityScore,
        qualityScore,
        brokenUrl,                     // The ACTUAL broken URL
        verification.statusCode || 0,  // HTTP status
        verification.checkedAt,        // When verified
        anchorText,                    // Anchor text context
        campaignId || null,
      ]);

      inserted++;
    } catch (error) {
      logger.debug('Error inserting broken link prospect:', error);
    }
  }

  logger.info(`Inserted ${inserted} new broken link prospects`);

  return {
    success: true,
    total_urls_checked: competitorUrls.length,
    broken_urls_found: brokenUrls.length,
    total_backlinks_found: totalBacklinks,
    prospects_created: inserted,
    verification_results: verificationResults,
  };
}

// Create the worker
export const brokenLinkVerifierWorker = new Worker(
  'broken-link-verifier',
  async (job: Job<BrokenLinkVerificationJob>) => {
    try {
      return await processBrokenLinkVerification(job);
    } catch (error) {
      logger.error('Broken link verification job failed:', error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // Process 2 jobs in parallel
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000, // Per minute
    },
  }
);

brokenLinkVerifierWorker.on('completed', (job) => {
  logger.info(`Broken link verification job ${job.id} completed`, job.returnvalue);
});

brokenLinkVerifierWorker.on('failed', (job, err) => {
  logger.error(`Broken link verification job ${job?.id} failed:`, err);
});

logger.info('Broken Link Verifier Worker started');
