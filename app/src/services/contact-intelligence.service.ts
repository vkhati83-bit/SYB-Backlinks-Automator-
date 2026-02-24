/**
 * Contact Intelligence Service
 *
 * Orchestrates multi-source contact finding:
 * 1. Enhanced website scraping
 * 2. Snov.io domain search + email finder
 * 3. Google Custom Search (LinkedIn)
 * 4. Contact scoring & ranking
 *
 * Implements progressive enhancement and cost controls
 */

import logger from '../utils/logger.js';
import { getCachedDomainSearch, cacheDomainSearch, clearDomainCache } from './contact-cache.service.js';
import { validateEmail } from './email-validator.service.js';
import { scoreAndRankContacts, selectBestContacts, type ScoredContact } from './decision-maker.service.js';
import { isSnovConfigured, domainSearch as snovDomainSearch, findEmailByName as snovFindEmail } from './snov.service.js';

// Junk domains to filter out of cached results
const JUNK_DOMAINS = new Set([
  'namecheap.com', 'godaddy.com', 'tucows.com', 'enom.com', 'networksolutions.com',
  'register.com', 'name.com', 'dynadot.com', 'porkbun.com', 'hover.com',
  'gandi.net', 'ionos.com', '1and1.com', 'ovh.com', 'ovhcloud.com',
  'cloudflare.com', 'amazonaws.com', 'google.com', 'googledomains.com',
  'squarespace.com', 'wix.com', 'wixpress.com', 'wordpress.com', 'shopify.com',
  'bluehost.com', 'hostgator.com', 'siteground.com', 'dreamhost.com',
  'a2hosting.com', 'inmotionhosting.com', 'wpengine.com',
  'markmonitor.com', 'corporatedomains.com', 'cscdbs.com', 'namebright.com',
  'sentry-next.wixpress.com',
]);

function isJunkEmail(email: string): boolean {
  if (!email) return true;
  const parts = email.split('@');
  if (parts.length !== 2) return true;
  const [local, domain] = parts;
  if (local.toLowerCase() === 'abuse') return true;
  if (local.toLowerCase() === 'noreply' || local.toLowerCase() === 'no-reply') return true;
  if (JUNK_DOMAINS.has(domain.toLowerCase())) return true;
  return false;
}

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;
const MAX_COST_PER_PROSPECT_CENTS = parseInt(process.env.MAX_CONTACT_COST_PER_PROSPECT_CENTS || '50');

interface ContactSearchResult {
  contacts: Array<{
    email: string;
    name?: string;
    title?: string;
    role?: string;
    linkedin_url?: string;
    confidence_score: number;
    confidence_tier?: string;
    source: string;
    source_metadata?: Record<string, any>;
    verification_status?: string;
  }>;
  total_found: number;
  sources_used: string[];
  total_cost_cents: number;
  cached: boolean;
}

/**
 * Search for contacts using Snov.io Domain Search
 * Cost: 1 credit per unique domain
 */
async function searchWithSnov(domain: string): Promise<{
  contacts: any[];
  cost_cents: number;
}> {
  if (!isSnovConfigured()) {
    logger.debug('Snov.io not configured, skipping');
    return { contacts: [], cost_cents: 0 };
  }

  try {
    const result = await snovDomainSearch(domain);

    if (result.contacts.length > 0) {
      const contacts = result.contacts.map(c => ({
        email: c.email,
        name: c.name,
        title: c.position || undefined,
        role: c.position || undefined,
        source: 'snov_domain_search',
        source_metadata: {
          snov_status: c.status,
          snov_source_url: c.sourceUrl,
        },
      }));

      logger.info(`Snov.io found ${contacts.length} contacts for ${domain}`);
      return { contacts, cost_cents: 1 }; // 1 credit per domain search
    }

    return { contacts: [], cost_cents: 1 };
  } catch (error) {
    logger.error('Snov.io domain search failed:', error);
    return { contacts: [], cost_cents: 0 };
  }
}

/**
 * Search for LinkedIn profiles using Google Custom Search
 */
async function searchLinkedInProfiles(domain: string): Promise<{
  contacts: any[];
  cost_cents: number;
}> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    logger.debug('Google Search not configured, skipping LinkedIn search');
    return { contacts: [], cost_cents: 0 };
  }

  try {
    const query = `site:linkedin.com/in "${domain}" (founder OR CEO OR editor OR "content director")`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=5`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Google Search API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.items && data.items.length > 0) {
      const contacts = data.items.map((item: any) => {
        // Extract name from LinkedIn URL or title
        const linkedinUrl = item.link;
        const name = item.title.split('-')[0].trim() || item.title.split('|')[0].trim();

        return {
          name: name,
          linkedin_url: linkedinUrl,
          title: item.snippet.includes('at ') ? item.snippet.split('at ')[1].split('.')[0] : undefined,
          source: 'google_linkedin_search',
          source_metadata: {
            search_rank: item.cse || {},
          },
        };
      });

      logger.info(`Google Search found ${contacts.length} LinkedIn profiles for ${domain}`);
      return { contacts, cost_cents: 5 }; // ~$0.005 per query (100 queries = $0.50/day)
    }

    return { contacts: [], cost_cents: 0 };
  } catch (error) {
    logger.error('Google LinkedIn search failed:', error);
    return { contacts: [], cost_cents: 0 };
  }
}

/**
 * Find email by name + domain using Snov.io
 */
async function findEmailByName(name: string, domain: string): Promise<{
  email?: string;
  cost_cents: number;
}> {
  if (!isSnovConfigured() || !name) {
    return { cost_cents: 0 };
  }

  try {
    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ');

    if (!firstName || !lastName) {
      return { cost_cents: 0 };
    }

    const result = await snovFindEmail(firstName, lastName, domain);

    if (result.email) {
      logger.info(`Snov.io found email for ${name} @ ${domain}: ${result.email}`);
      return { email: result.email, cost_cents: 1 };
    }

    return { cost_cents: 1 }; // Still charged even if not found
  } catch (error) {
    logger.error('Snov.io email finder failed:', error);
    return { cost_cents: 0 };
  }
}

/**
 * Main contact intelligence function
 * Implements progressive enhancement with cost controls
 */
export async function findContactsForProspect(
  domain: string,
  url: string,
  scrapedContacts: any[] = []
): Promise<ContactSearchResult> {
  logger.info(`Starting multi-source contact search for: ${domain}`);

  // Check cache first
  const cached = await getCachedDomainSearch(domain);
  if (cached) {
    // Filter out junk emails from old cache entries
    const cleanContacts = cached.contacts.filter(c => !isJunkEmail(c.email));
    if (cleanContacts.length > 0) {
      logger.info(`Using cached contacts for ${domain} (${cleanContacts.length} clean of ${cached.contacts.length})`);
      return {
        contacts: cleanContacts,
        total_found: cleanContacts.length,
        sources_used: ['cache'],
        total_cost_cents: 0,
        cached: true,
      };
    }
    // All cached contacts were junk — clear cache and re-search
    logger.info(`Cache for ${domain} only had junk emails, clearing and re-searching`);
    await clearDomainCache(domain);
  }

  const allContacts: any[] = [];
  const sourcesUsed: string[] = [];
  let totalCost = 0;

  // Stage 1: Use scraped contacts (free)
  if (scrapedContacts && scrapedContacts.length > 0) {
    allContacts.push(...scrapedContacts.map(c => ({
      ...c,
      source: c.source || 'scraped',
    })));
    sourcesUsed.push('website_scraping');
    logger.info(`Stage 1: Added ${scrapedContacts.length} scraped contacts`);
  }

  // Stage 2: Snov.io Domain Search — find emails at this domain
  if (allContacts.length === 0 && totalCost < MAX_COST_PER_PROSPECT_CENTS) {
    logger.info(`Stage 2: Trying Snov.io domain search for ${domain}`);
    const snovResult = await searchWithSnov(domain);
    if (snovResult.contacts.length > 0) {
      allContacts.push(...snovResult.contacts);
      totalCost += snovResult.cost_cents;
      sourcesUsed.push('snov_domain_search');
      logger.info(`Stage 2: Snov.io found ${snovResult.contacts.length} contacts`);
    } else {
      totalCost += snovResult.cost_cents;
    }
  }

  // Stage 3: Google LinkedIn Search + Snov.io email finder — only if everything else found nothing
  if (allContacts.length === 0 && totalCost < MAX_COST_PER_PROSPECT_CENTS) {
    const linkedinResult = await searchLinkedInProfiles(domain);
    if (linkedinResult.contacts.length > 0) {
      for (const contact of linkedinResult.contacts) {
        if (totalCost >= MAX_COST_PER_PROSPECT_CENTS) break;

        if (contact.name) {
          const emailResult = await findEmailByName(contact.name, domain);
          totalCost += emailResult.cost_cents;

          if (emailResult.email) {
            contact.email = emailResult.email;
            contact.source = 'snov_email_finder';
            allContacts.push(contact);
          }
        }
      }

      totalCost += linkedinResult.cost_cents;
      sourcesUsed.push('google_linkedin_search');
      logger.info(`Stage 3: LinkedIn + Snov.io found ${allContacts.length} contacts (cost: $${(totalCost / 100).toFixed(2)})`);
    }
  }

  // Stage 4: Score and rank all contacts
  const scoredContacts = scoreAndRankContacts(allContacts);

  // Stage 5: Select best 1-2 contacts
  const selectedContacts = selectBestContacts(scoredContacts, 2);

  // Stage 6: Validate emails for selected contacts (if budget allows)
  const finalContacts = [];
  for (const contact of selectedContacts) {
    if (contact.email) {
      // Use Snov verification if we have budget and contact score is high
      const usePaidVerify = totalCost < MAX_COST_PER_PROSPECT_CENTS && contact.confidence_score >= 70;

      try {
        const validation = await validateEmail(contact.email, usePaidVerify);
        totalCost += validation.api_cost_cents;

        finalContacts.push({
          email: contact.email,
          name: contact.name,
          title: contact.title,
          role: contact.role,
          linkedin_url: contact.linkedin_url,
          confidence_score: contact.confidence_score,
          confidence_tier: contact.tier,
          source: contact.source,
          source_metadata: contact.source_metadata,
          verification_status: validation.status,
        });
      } catch (error) {
        logger.error(`Email validation failed for ${contact.email}:`, error);
        finalContacts.push({
          ...contact,
          confidence_tier: contact.tier,
        });
      }
    }
  }

  // Filter out junk before caching
  const cacheableContacts = finalContacts.filter(c => !isJunkEmail(c.email));
  if (cacheableContacts.length > 0) {
    await cacheDomainSearch(domain, cacheableContacts);
  }

  logger.info(`Contact search complete for ${domain}: Found ${finalContacts.length} contacts, cost: $${(totalCost / 100).toFixed(2)}, sources: ${sourcesUsed.join(', ')}`);

  return {
    contacts: finalContacts,
    total_found: allContacts.length,
    sources_used: sourcesUsed,
    total_cost_cents: totalCost,
    cached: false,
  };
}

export default {
  findContactsForProspect,
};
