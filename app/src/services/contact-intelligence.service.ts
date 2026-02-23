/**
 * Contact Intelligence Service
 *
 * Orchestrates multi-source contact finding:
 * 1. Enhanced website scraping
 * 2. Google Custom Search (LinkedIn)
 * 3. Hunter.io API
 * 4. Claude analysis
 * 5. Clearbit (optional)
 *
 * Implements progressive enhancement and cost controls
 */

import logger from '../utils/logger.js';
import { getCachedDomainSearch, cacheDomainSearch } from './contact-cache.service.js';
import { validateEmail } from './email-validator.service.js';
import { scoreAndRankContacts, selectBestContacts, type ScoredContact } from './decision-maker.service.js';

const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;
const CLEARBIT_API_KEY = process.env.CLEARBIT_API_KEY;
const MAX_COST_PER_PROSPECT_CENTS = parseInt(process.env.MAX_CONTACT_COST_PER_PROSPECT_CENTS || '50');
const ENABLE_CLEARBIT = process.env.ENABLE_CLEARBIT === 'true';

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
 * Search for contacts using Hunter.io Domain Search
 */
async function searchWithHunter(domain: string): Promise<{
  contacts: any[];
  cost_cents: number;
}> {
  if (!HUNTER_API_KEY) {
    logger.debug('Hunter.io not configured, skipping');
    return { contacts: [], cost_cents: 0 };
  }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_API_KEY}&limit=10`
    );

    if (!response.ok) {
      throw new Error(`Hunter API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.data && data.data.emails) {
      const contacts = data.data.emails.map((email: any) => ({
        email: email.value,
        name: `${email.first_name || ''} ${email.last_name || ''}`.trim(),
        title: email.position || undefined,
        role: email.position || undefined,
        linkedin_url: email.linkedin || undefined,
        source: 'hunter_domain_search',
        source_metadata: {
          hunter_confidence: email.confidence,
          hunter_score: email.score,
          department: email.department,
        },
      }));

      logger.info(`Hunter.io found ${contacts.length} contacts for ${domain}`);
      return { contacts, cost_cents: 5 }; // ~$0.05 per domain search
    }

    return { contacts: [], cost_cents: 0 };
  } catch (error) {
    logger.error('Hunter.io search failed:', error);
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
 * Find email by name + domain using Hunter.io
 */
async function findEmailByName(name: string, domain: string): Promise<{
  email?: string;
  cost_cents: number;
}> {
  if (!HUNTER_API_KEY || !name) {
    return { cost_cents: 0 };
  }

  try {
    const [firstName, ...lastNameParts] = name.split(' ');
    const lastName = lastNameParts.join(' ');

    if (!firstName || !lastName) {
      return { cost_cents: 0 };
    }

    const response = await fetch(
      `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${HUNTER_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Hunter Email Finder error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (data.data && data.data.email) {
      logger.info(`Hunter.io found email for ${name} @ ${domain}: ${data.data.email}`);
      return { email: data.data.email, cost_cents: 1 }; // ~$0.01 per email finder
    }

    return { cost_cents: 1 }; // Still charged even if not found
  } catch (error) {
    logger.error('Hunter Email Finder failed:', error);
    return { cost_cents: 0 };
  }
}

/**
 * Apollo.io — Search for people at a domain (FREE, no credits)
 * Returns names, titles, LinkedIn URLs but NOT emails
 */
async function apolloSearchPeople(domain: string): Promise<Array<{
  first_name: string;
  last_name: string;
  name: string;
  title?: string;
  linkedin_url?: string;
  id: string;
}>> {
  if (!APOLLO_API_KEY) {
    logger.debug('Apollo not configured, skipping');
    return [];
  }

  try {
    const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-api-key': APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: 10,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.debug(`Apollo search returned ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    const people = data.people || [];

    const results = people
      .filter((p: any) => p.first_name && p.last_name)
      .map((p: any) => ({
        first_name: p.first_name,
        last_name: p.last_name,
        name: `${p.first_name} ${p.last_name}`,
        title: p.title || undefined,
        linkedin_url: p.linkedin_url || undefined,
        id: p.id,
      }));

    if (results.length > 0) {
      logger.info(`Apollo search found ${results.length} people at ${domain}`);
    }
    return results;
  } catch (error) {
    logger.error('Apollo people search failed:', error);
    return [];
  }
}

/**
 * Apollo.io — Enrich a person to get their email (costs 1 credit)
 */
async function apolloEnrichPerson(firstName: string, lastName: string, domain: string): Promise<{
  email?: string;
  title?: string;
  linkedin_url?: string;
  cost_cents: number;
}> {
  if (!APOLLO_API_KEY) {
    return { cost_cents: 0 };
  }

  try {
    const response = await fetch(
      `https://api.apollo.io/api/v1/people/match?first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&domain=${encodeURIComponent(domain)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': APOLLO_API_KEY,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      logger.debug(`Apollo enrich returned ${response.status}`);
      return { cost_cents: 1 };
    }

    const data = await response.json() as any;
    const person = data.person;

    if (person?.email) {
      logger.info(`Apollo found email for ${firstName} ${lastName} @ ${domain}: ${person.email}`);
      return {
        email: person.email,
        title: person.title || undefined,
        linkedin_url: person.linkedin_url || undefined,
        cost_cents: 1,
      };
    }

    return { cost_cents: 1 };
  } catch (error) {
    logger.error('Apollo enrich failed:', error);
    return { cost_cents: 0 };
  }
}

/**
 * Apollo.io — Full flow: search people (free) then enrich top matches (1 credit each)
 */
async function searchWithApollo(domain: string): Promise<{
  contacts: any[];
  cost_cents: number;
}> {
  // Step 1: Free search to find people at this domain
  const people = await apolloSearchPeople(domain);
  if (people.length === 0) {
    return { contacts: [], cost_cents: 0 };
  }

  // Step 2: Enrich top 2 people to get their emails (1 credit each)
  const contacts: any[] = [];
  let cost = 0;

  for (const person of people.slice(0, 2)) {
    const result = await apolloEnrichPerson(person.first_name, person.last_name, domain);
    cost += result.cost_cents;

    if (result.email) {
      contacts.push({
        email: result.email,
        name: person.name,
        title: result.title || person.title,
        role: result.title || person.title,
        linkedin_url: result.linkedin_url || person.linkedin_url,
        source: 'apollo',
        source_metadata: { apollo_id: person.id },
      });
    }
  }

  if (contacts.length > 0) {
    logger.info(`Apollo found ${contacts.length} contacts for ${domain} (cost: ${cost} credits)`);
  }

  return { contacts, cost_cents: cost };
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
    logger.info(`Using cached contacts for ${domain}`);
    return {
      contacts: cached.contacts,
      total_found: cached.total_found,
      sources_used: ['cache'],
      total_cost_cents: 0,
      cached: true,
    };
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

  // Stage 2: Apollo.io — search people (free) then enrich (1 credit each)
  if (allContacts.length === 0 && totalCost < MAX_COST_PER_PROSPECT_CENTS) {
    logger.info(`Stage 2: Trying Apollo.io for ${domain}`);
    const apolloResult = await searchWithApollo(domain);
    if (apolloResult.contacts.length > 0) {
      allContacts.push(...apolloResult.contacts);
      totalCost += apolloResult.cost_cents;
      sourcesUsed.push('apollo');
      logger.info(`Stage 2: Apollo found ${apolloResult.contacts.length} contacts`);
    }
  }

  // Stage 3: Hunter.io Domain Search — LAST RESORT only when Apollo also found nothing
  if (allContacts.length === 0 && totalCost < MAX_COST_PER_PROSPECT_CENTS) {
    logger.info(`Stage 3: All free methods + Apollo failed for ${domain}, falling back to Hunter.io`);
    const hunterResult = await searchWithHunter(domain);
    if (hunterResult.contacts.length > 0) {
      allContacts.push(...hunterResult.contacts);
      totalCost += hunterResult.cost_cents;
      sourcesUsed.push('hunter_domain_search');
      logger.info(`Stage 2: Hunter.io found ${hunterResult.contacts.length} contacts (cost: $${(hunterResult.cost_cents / 100).toFixed(2)})`);
    }
  }

  // Stage 4: Google LinkedIn Search — only if everything else found nothing
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
            allContacts.push(contact);
          }
        }
      }

      totalCost += linkedinResult.cost_cents;
      sourcesUsed.push('google_linkedin_search');
      logger.info(`Stage 3: Added LinkedIn profiles (cost: $${(linkedinResult.cost_cents / 100).toFixed(2)})`);
    }
  }

  // Stage 5: Score and rank all contacts
  const scoredContacts = scoreAndRankContacts(allContacts);

  // Stage 6: Select best 1-2 contacts
  const selectedContacts = selectBestContacts(scoredContacts, 2);

  // Stage 7: Validate emails for selected contacts (if budget allows)
  const finalContacts = [];
  for (const contact of selectedContacts) {
    if (contact.email) {
      // Only use Hunter verification if we have budget and contact score is high
      const useHunterVerify = totalCost < MAX_COST_PER_PROSPECT_CENTS && contact.confidence_score >= 70;

      try {
        const validation = await validateEmail(contact.email, useHunterVerify);
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

  // Cache results for 30 days
  if (finalContacts.length > 0) {
    await cacheDomainSearch(domain, finalContacts);
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
