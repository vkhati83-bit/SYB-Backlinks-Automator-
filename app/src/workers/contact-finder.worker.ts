import { Worker, Job } from 'bullmq';
import * as cheerio from 'cheerio';
import redis from '../config/redis.js';
import { QUEUE_NAMES, emailGeneratorQueue } from '../config/queues.js';
import { contactRepository, prospectRepository, blocklistRepository, auditRepository } from '../db/repositories/index.js';
import { db } from '../db/index.js';
import { ContactConfidenceTier } from '../types/index.js';
import logger from '../utils/logger.js';
import { findContactsForProspect } from '../services/contact-intelligence.service.js';

export interface ContactFinderJobData {
  prospectId: string;
  url: string;
  domain: string;
}

// Common contact page paths
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/write-for-us',
  '/contribute',
  '/team',
  '/author',
  '/staff',
];

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common email patterns for guessing
const COMMON_EMAIL_PREFIXES = ['editor', 'contact', 'info', 'hello', 'admin', 'webmaster', 'press', 'media'];

// Disposable email domains to filter out
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
  'throwaway.email', 'fakeinbox.com', 'trashmail.com',
]);

// Validate email format
function isValidEmail(email: string): boolean {
  // Basic validation
  if (!email || email.length > 254) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || !domain || local.length > 64) return false;

  // Check for disposable domains
  if (DISPOSABLE_DOMAINS.has(domain.toLowerCase())) return false;

  // Check for common invalid patterns
  if (email.includes('example.com') || email.includes('test.com')) return false;
  if (email.includes('noreply') || email.includes('no-reply')) return false;

  return true;
}

// Determine confidence tier based on how email was found
function getConfidenceTier(source: string, hasName: boolean): ContactConfidenceTier {
  if (source === 'scraped' && hasName) return 'A';
  if (source === 'scraped') return 'B';
  if (source === 'pattern') return 'C';
  return 'D';
}

// Extract name from email or nearby text
function extractName(email: string, context: string): string | null {
  // Try to find name near the email in context
  const emailIndex = context.indexOf(email);
  if (emailIndex > 0) {
    const beforeEmail = context.substring(Math.max(0, emailIndex - 100), emailIndex);
    // Look for patterns like "Name - email" or "Name: email"
    const nameMatch = beforeEmail.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
    if (nameMatch) return nameMatch[1];
  }

  // Try to extract from email address
  const localPart = email.split('@')[0];
  if (localPart && !COMMON_EMAIL_PREFIXES.includes(localPart.toLowerCase())) {
    // Convert firstname.lastname or firstname_lastname to Name
    const nameParts = localPart.split(/[._]/);
    if (nameParts.length >= 2) {
      return nameParts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }
  }

  return null;
}

// Fetch page content with retry logic
async function fetchPage(url: string, retries: number = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SYB Research Bot; +https://shieldyourbody.com)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(30000), // Increased from 10s to 30s
      });

      if (!response.ok) {
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return null;
        }
        // Retry server errors (5xx)
        if (attempt < retries) {
          logger.debug(`Retrying ${url} after ${response.status} error (attempt ${attempt + 1})`);
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;

      return await response.text();
    } catch (error: any) {
      // Retry on timeout or network errors
      const isRetryable = error.name === 'TimeoutError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
      if (isRetryable && attempt < retries) {
        logger.debug(`Retrying ${url} after ${error.name || error.code} (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      logger.debug(`Failed to fetch ${url}:`, error);
      return null;
    }
  }
  return null;
}

// Extract emails from HTML
function extractEmails(html: string): Array<{ email: string; context: string }> {
  const $ = cheerio.load(html);
  const emails: Array<{ email: string; context: string }> = [];
  const seen = new Set<string>();

  // Extract from mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace('mailto:', '').split('?')[0].toLowerCase().trim();
    if (isValidEmail(email) && !seen.has(email)) {
      seen.add(email);
      emails.push({
        email,
        context: $(el).parent().text().substring(0, 200),
      });
    }
  });

  // Extract from text content
  const textContent = $('body').text();
  const matches = textContent.match(EMAIL_REGEX) || [];
  for (const email of matches) {
    const lowerEmail = email.toLowerCase();
    if (isValidEmail(lowerEmail) && !seen.has(lowerEmail)) {
      seen.add(lowerEmail);
      const index = textContent.indexOf(email);
      emails.push({
        email: lowerEmail,
        context: textContent.substring(Math.max(0, index - 50), index + 100),
      });
    }
  }

  return emails;
}

// Try to find contacts by scraping
async function findContactsByScraping(
  domain: string,
  baseUrl: string
): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  const contacts: Array<{ email: string; name: string | null; source: 'scraped' }> = [];
  const triedUrls = new Set<string>();

  // Try main URL first
  const mainHtml = await fetchPage(baseUrl);
  if (mainHtml) {
    const mainEmails = extractEmails(mainHtml);
    for (const { email, context } of mainEmails) {
      if (!contacts.some(c => c.email === email)) {
        contacts.push({
          email,
          name: extractName(email, context),
          source: 'scraped',
        });
      }
    }
  }

  // If no contacts found, try contact pages
  if (contacts.length === 0) {
    const baseUrlObj = new URL(baseUrl);
    const origin = baseUrlObj.origin;

    for (const path of CONTACT_PATHS) {
      const contactUrl = `${origin}${path}`;
      if (triedUrls.has(contactUrl)) continue;
      triedUrls.add(contactUrl);

      const html = await fetchPage(contactUrl);
      if (!html) continue;

      const emails = extractEmails(html);
      for (const { email, context } of emails) {
        if (!contacts.some(c => c.email === email)) {
          contacts.push({
            email,
            name: extractName(email, context),
            source: 'scraped',
          });
        }
      }

      // Stop if we found contacts
      if (contacts.length > 0) break;
    }
  }

  return contacts;
}

// Generate common email patterns as fallback
function generateEmailPatterns(domain: string): Array<{ email: string; name: string | null; source: 'pattern' }> {
  return COMMON_EMAIL_PREFIXES.map(prefix => ({
    email: `${prefix}@${domain}`,
    name: null,
    source: 'pattern' as const,
  }));
}

// Worker processor with multi-source intelligence
async function processContactFinderJob(job: Job<ContactFinderJobData>): Promise<{ found: number; prospectId: string }> {
  const { prospectId, url, domain } = job.data;

  logger.info(`🔍 Finding contacts for: ${domain}`, { jobId: job.id, prospectId });

  // Get prospect
  const prospect = await prospectRepository.findById(prospectId);
  if (!prospect) {
    throw new Error(`Prospect not found: ${prospectId}`);
  }

  // Step 1: Try enhanced web scraping first (free)
  logger.debug(`Step 1: Scraping ${domain} for contacts...`);
  const scrapedContacts = await findContactsByScraping(domain, url);

  // Step 2: Use multi-source intelligence service
  logger.debug(`Step 2: Using multi-source intelligence...`);
  const intelligenceResult = await findContactsForProspect(domain, url, scrapedContacts);

  let savedCount = 0;
  let totalCost = intelligenceResult.total_cost_cents;

  // Step 3: Save selected high-quality contacts (1-2 instead of 3)
  if (intelligenceResult.contacts.length > 0) {
    for (const contact of intelligenceResult.contacts) {
      // Check blocklist
      if (await blocklistRepository.isEmailBlocked(contact.email)) {
        logger.debug(`Skipping blocked email: ${contact.email}`);
        continue;
      }

      try {
        const saved = await contactRepository.create({
          prospect_id: prospectId,
          email: contact.email,
          name: contact.name,
          role: contact.title || contact.role,
          title: contact.title,
          confidence_tier: contact.confidence_tier as ContactConfidenceTier,
          source: contact.source as 'scraped' | 'pattern' | 'linkedin' | 'manual',
          linkedin_url: contact.linkedin_url,
          verified: contact.verification_status === 'valid',
          confidence_score: contact.confidence_score,
          verification_status: contact.verification_status,
          source_metadata: contact.source_metadata,
          api_cost_cents: 0, // Individual contact cost (will be updated below)
        });

        // Log API usage
        await db.query(`
          INSERT INTO contact_api_logs (
            prospect_id, contact_id, api_provider, endpoint,
            request_data, response_data, cost_cents, success, cached, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW())
        `, [
          prospectId,
          saved.id,
          'multi_source_intelligence',
          'find_contacts',
          JSON.stringify({ domain, url }),
          JSON.stringify({
            sources_used: intelligenceResult.sources_used,
            total_found: intelligenceResult.total_found,
          }),
          totalCost,
          intelligenceResult.cached,
        ]);

        await auditRepository.logContactFound(saved.id, prospectId);
        savedCount++;

        logger.info(`✅ Saved contact: ${contact.email} (${contact.confidence_tier}, score: ${contact.confidence_score})`);
      } catch (error) {
        logger.debug(`Failed to save contact: ${contact.email}`, error);
      }
    }
  } else {
    // Fallback: Use pattern-based emails only if no other contacts found
    logger.warn(`No contacts found via intelligence service, using pattern fallback for ${domain}`);
    const patternContacts = generateEmailPatterns(domain);

    for (const contact of patternContacts.slice(0, 2)) {
      if (await blocklistRepository.isEmailBlocked(contact.email)) continue;

      try {
        const saved = await contactRepository.create({
          prospect_id: prospectId,
          email: contact.email,
          name: contact.name,
          confidence_tier: 'D' as ContactConfidenceTier,
          source: 'pattern',
          confidence_score: 10,
        });

        await auditRepository.logContactFound(saved.id, prospectId);
        savedCount++;
      } catch (error) {
        logger.debug(`Failed to save pattern contact: ${contact.email}`, error);
      }
    }
  }

  // Update prospect status if contacts found
  if (savedCount > 0) {
    await prospectRepository.updateStatus(prospectId, 'contact_found');

    logger.info(`✅ Found ${savedCount} contacts for ${domain} (cost: $${(totalCost / 100).toFixed(2)}, sources: ${intelligenceResult.sources_used.join(', ')})`);
  } else {
    logger.warn(`❌ No contacts found for ${domain}`);
  }

  logger.info(`Contact finding completed: ${savedCount} contacts saved`, {
    jobId: job.id,
    prospectId,
    domain,
  });

  return { found: savedCount, prospectId };
}

// Create and start worker
export function createContactFinderWorker() {
  const worker = new Worker(QUEUE_NAMES.CONTACT_FINDER, processContactFinderJob, {
    connection: redis,
    concurrency: 10, // Increased from 5 to process more in parallel
    limiter: {
      max: 30, // Increased from 10 to 30 jobs per
      duration: 1000, // per second (rate limiting)
    },
  });

  worker.on('completed', (job, result) => {
    logger.info(`Contact finder job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Contact finder job ${job?.id} failed:`, error);
  });

  logger.info('Contact finder worker started');
  return worker;
}

// Run if executed directly
// @ts-ignore - tsx handles import.meta at runtime
if (import.meta.url === `file://${process.argv[1]}`) {
  createContactFinderWorker();
}

export default createContactFinderWorker;
