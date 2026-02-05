import { Worker, Job } from 'bullmq';
import redis from '../config/redis.js';
import { QUEUE_NAMES, contactFinderQueue } from '../config/queues.js';
import { seoDataService, BrokenBacklink, CompetitorReferringDomain, SerpResult } from '../services/seo-data.service.js';
import { prospectRepository, blocklistRepository, auditRepository } from '../db/repositories/index.js';
import logger from '../utils/logger.js';

// Job types
export interface ProspectingJobData {
  type: 'broken_links' | 'competitor_domains' | 'serp_results' | 'manual';
  campaignId?: string;
  limit?: number;
  minDomainRating?: number;
  keywords?: string[];
}

// Extract domain from URL
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Calculate quality score
function calculateQualityScore(
  domainRating: number | null,
  position: number | null,
  isDofollow: boolean = true
): number {
  let score = 0;

  // Domain rating (0-100) contributes 40%
  if (domainRating) {
    score += (domainRating / 100) * 40;
  }

  // Position in SERP (lower is better) contributes 30%
  if (position) {
    const positionScore = Math.max(0, (50 - position) / 50);
    score += positionScore * 30;
  }

  // Dofollow bonus contributes 20%
  if (isDofollow) {
    score += 20;
  }

  // Base score contributes 10%
  score += 10;

  return Math.round(score * 100) / 100;
}

// Process broken backlinks from competitors
async function processBrokenBacklinks(
  job: Job<ProspectingJobData>,
  limit: number,
  campaignId?: string
): Promise<number> {
  const brokenLinks = await seoDataService.getBrokenBacklinks(limit);
  let created = 0;

  for (const link of brokenLinks) {
    const domain = extractDomain(link.referring_page_url);

    // Check blocklist
    if (await blocklistRepository.isDomainBlocked(domain)) {
      logger.debug(`Skipping blocked domain: ${domain}`);
      continue;
    }

    // Check if already exists
    const existing = await prospectRepository.findByUrl(link.referring_page_url);
    if (existing) {
      logger.debug(`Prospect already exists: ${link.referring_page_url}`);
      continue;
    }

    // Create prospect
    const prospect = await prospectRepository.create({
      url: link.referring_page_url,
      domain,
      title: link.broken_url_title || `Broken link opportunity on ${domain}`,
      description: `Broken link to ${link.broken_url}. Suggested replacement: ${link.suggested_syb_url || 'TBD'}`,
      domain_authority: link.referring_domain_rank,
      quality_score: calculateQualityScore(link.referring_domain_rank, null, link.is_dofollow),
      opportunity_type: 'broken_link',
      campaign_id: campaignId,
      source: 'seo_command_center:broken_backlinks',
    });

    await auditRepository.logProspectCreated(prospect.id, {
      source: 'broken_backlinks',
      broken_url: link.broken_url,
      anchor_text: link.anchor_text,
    });

    // Queue for contact finding
    await contactFinderQueue.add('find-contacts', {
      prospectId: prospect.id,
      url: link.referring_page_url,
      domain,
    });

    created++;
    job.updateProgress(Math.round((created / brokenLinks.length) * 100));
  }

  return created;
}

// Process competitor referring domains
async function processCompetitorDomains(
  job: Job<ProspectingJobData>,
  limit: number,
  minDomainRating: number,
  campaignId?: string
): Promise<number> {
  const domains = await seoDataService.getCompetitorReferringDomains(minDomainRating, limit);
  let created = 0;

  for (const ref of domains) {
    const domain = ref.referring_domain.replace(/^www\./, '');

    // Check blocklist
    if (await blocklistRepository.isDomainBlocked(domain)) {
      continue;
    }

    // Check if already exists
    const existingProspects = await prospectRepository.findByDomain(domain);
    if (existingProspects.length > 0) {
      continue;
    }

    // Create prospect
    const url = `https://${domain}`;
    const prospect = await prospectRepository.create({
      url,
      domain,
      title: `Research citation opportunity on ${domain}`,
      description: `Links to ${ref.competitor_domain} with ${ref.total_links} link(s). Domain rating: ${ref.domain_rating}`,
      domain_authority: ref.domain_rating,
      quality_score: calculateQualityScore(ref.domain_rating, null),
      opportunity_type: 'research_citation',
      campaign_id: campaignId,
      source: 'seo_command_center:competitor_referring_domains',
    });

    await auditRepository.logProspectCreated(prospect.id, {
      source: 'competitor_referring_domains',
      competitor: ref.competitor_domain,
      total_links: ref.total_links,
    });

    // Queue for contact finding
    await contactFinderQueue.add('find-contacts', {
      prospectId: prospect.id,
      url,
      domain,
    });

    created++;
    job.updateProgress(Math.round((created / domains.length) * 100));
  }

  return created;
}

// Process SERP results for EMF keywords
async function processSerpResults(
  job: Job<ProspectingJobData>,
  limit: number,
  campaignId?: string
): Promise<number> {
  const results = await seoDataService.getEmfSerpResults(1, 30, limit);
  let created = 0;

  // Get domain metrics in bulk
  const uniqueDomains = [...new Set(results.map(r => r.domain))];
  const metricsMap = await seoDataService.getBulkDomainMetrics(uniqueDomains);

  for (const result of results) {
    const domain = result.domain.replace(/^www\./, '');

    // Check blocklist
    if (await blocklistRepository.isDomainBlocked(domain)) {
      continue;
    }

    // Check if already exists
    const existing = await prospectRepository.findByUrl(result.url);
    if (existing) {
      continue;
    }

    const metrics = metricsMap.get(result.domain);

    // Create prospect
    const prospect = await prospectRepository.create({
      url: result.url,
      domain,
      title: result.title || `EMF content on ${domain}`,
      description: `Ranks #${result.position} for "${result.keyword}"`,
      domain_authority: metrics?.domain_rating || null,
      quality_score: calculateQualityScore(metrics?.domain_rating || null, result.position),
      opportunity_type: 'research_citation',
      campaign_id: campaignId,
      source: 'seo_command_center:emf_serp_results',
    });

    await auditRepository.logProspectCreated(prospect.id, {
      source: 'emf_serp_results',
      keyword: result.keyword,
      position: result.position,
    });

    // Queue for contact finding
    await contactFinderQueue.add('find-contacts', {
      prospectId: prospect.id,
      url: result.url,
      domain,
    });

    created++;
    job.updateProgress(Math.round((created / results.length) * 100));
  }

  return created;
}

// Worker processor
async function processProspectingJob(job: Job<ProspectingJobData>): Promise<{ created: number; type: string }> {
  const { type, campaignId, limit = 50, minDomainRating = 20 } = job.data;

  logger.info(`Processing prospecting job: ${type}`, { jobId: job.id, limit, campaignId });

  let created = 0;

  switch (type) {
    case 'broken_links':
      created = await processBrokenBacklinks(job, limit, campaignId);
      break;

    case 'competitor_domains':
      created = await processCompetitorDomains(job, limit, minDomainRating, campaignId);
      break;

    case 'serp_results':
      created = await processSerpResults(job, limit, campaignId);
      break;

    default:
      throw new Error(`Unknown prospecting type: ${type}`);
  }

  logger.info(`Prospecting job completed: ${created} prospects created`, { jobId: job.id, type });

  return { created, type };
}

// Create and start worker
export function createProspectingWorker() {
  const worker = new Worker(QUEUE_NAMES.PROSPECTING, processProspectingJob, {
    connection: redis,
    concurrency: 1, // Process one at a time to avoid duplicates
  });

  worker.on('completed', (job, result) => {
    logger.info(`Prospecting job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Prospecting job ${job?.id} failed:`, error);
  });

  logger.info('Prospecting worker started');
  return worker;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createProspectingWorker();
}

export default createProspectingWorker;
