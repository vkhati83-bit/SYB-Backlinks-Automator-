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

// Common contact page paths (expanded)
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '/write-for-us',
  '/contribute',
  '/team',
  '/our-team',
  '/author',
  '/staff',
  '/people',
  '/contributors',
  '/writers',
  '/editorial',
  '/editorial-team',
  '/masthead',
  '/editors',
];

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

  // Try to extract from email address (skip generic role prefixes)
  const genericPrefixes = new Set(['editor', 'contact', 'info', 'hello', 'admin', 'webmaster', 'press', 'media', 'support', 'team']);
  const localPart = email.split('@')[0];
  if (localPart && !genericPrefixes.has(localPart.toLowerCase())) {
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

// Extract author page URLs from an article page
function extractAuthorLinks(html: string, origin: string): Array<{ url: string; name: string | null }> {
  const $ = cheerio.load(html);
  const authorLinks: Array<{ url: string; name: string | null }> = [];
  const seen = new Set<string>();

  const addLink = (href: string, name: string | null) => {
    try {
      const fullUrl = href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? href : '/' + href}`;
      if (!seen.has(fullUrl) && fullUrl.startsWith(origin)) {
        seen.add(fullUrl);
        authorLinks.push({ url: fullUrl, name: name || null });
      }
    } catch (_) {}
  };

  // 1. rel="author" links
  $('a[rel="author"], a[rel~="author"]').each((_, el) => {
    const href = $(el).attr('href');
    const name = $(el).text().trim() || null;
    if (href) addLink(href, name);
  });

  // 2. Schema.org itemprop="author"
  $('[itemprop="author"]').each((_, el) => {
    const link = $(el).find('a').first();
    const href = link.attr('href');
    const name = $(el).find('[itemprop="name"]').text().trim() || $(el).text().trim() || null;
    if (href) addLink(href, name);
  });

  // 3. JSON-LD schema
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      const checkSchema = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        if (obj.author) {
          const author = Array.isArray(obj.author) ? obj.author[0] : obj.author;
          if (author?.url && typeof author.url === 'string') addLink(author.url, author.name || null);
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === 'object') checkSchema(v);
        }
      };
      checkSchema(json);
    } catch (_) {}
  });

  // 4. Common author CSS class patterns — only follow links that look like author profile paths
  const authorSelectors = [
    '.author a', '.byline a', '.post-author a', '.entry-author a',
    '.article-author a', '[class*="author"] a', '[class*="byline"] a',
  ];
  for (const sel of authorSelectors) {
    $(sel).each((_, el) => {
      const href = $(el).attr('href') || '';
      const name = $(el).text().trim() || null;
      if (href && /\/(author|user|profile|contributor|writer)\//i.test(href)) {
        addLink(href, name);
      }
    });
  }

  return authorLinks.slice(0, 3); // max 3 author pages
}

// Extract emails from search result HTML using domain-specific regex
function extractEmailsFromSearchHtml(
  html: string,
  domain: string,
  snippetSelectors: string[],
): Array<{ email: string; name: string | null; source: 'scraped' }> {
  const results: Array<{ email: string; name: string | null; source: 'scraped' }> = [];
  const domainEmailRegex = new RegExp(`[a-zA-Z0-9._%+\\-]+@${domain.replace('.', '\\.')}`, 'gi');
  const $ = cheerio.load(html);

  // Extract from snippet text
  const snippetText = $(snippetSelectors.join(', ')).map((_, el) => $(el).text()).get().join(' ');
  const inlineMatches = snippetText.match(domainEmailRegex) || [];
  for (const email of inlineMatches) {
    const lowerEmail = email.toLowerCase();
    if (isValidEmail(lowerEmail) && !results.some(r => r.email === lowerEmail)) {
      results.push({ email: lowerEmail, name: extractName(lowerEmail, snippetText), source: 'scraped' });
    }
  }

  // Scan full HTML as fallback
  if (results.length === 0) {
    const fullMatches = html.match(domainEmailRegex) || [];
    for (const email of fullMatches) {
      const lowerEmail = email.toLowerCase();
      if (isValidEmail(lowerEmail) && !results.some(r => r.email === lowerEmail)) {
        results.push({ email: lowerEmail, name: null, source: 'scraped' });
      }
    }
  }

  return results;
}

// Search Google for publicly indexed emails (better coverage, may get blocked)
async function searchGoogleForEmails(domain: string): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  const results: Array<{ email: string; name: string | null; source: 'scraped' }> = [];

  const queries = [
    `"@${domain}"`,
    `contact email site:${domain}`,
  ];

  for (const query of queries) {
    if (results.length > 0) break;
    try {
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.debug(`Google search returned ${response.status} for ${domain}`);
        break; // Don't retry other queries if Google is blocking
      }

      const html = await response.text();

      // Check if blocked by CAPTCHA
      if (html.includes('detected unusual traffic') || html.includes('captcha')) {
        logger.debug(`Google CAPTCHA detected for ${domain}, will fall back to DuckDuckGo`);
        break;
      }

      const found = extractEmailsFromSearchHtml(html, domain, ['.VwiC3b', '.st', '.s3v9rd', 'span.aCOpRe']);
      results.push(...found);
    } catch (error) {
      logger.debug(`Google search failed for ${domain}:`, error);
      break;
    }
  }

  if (results.length > 0) {
    logger.info(`Google found ${results.length} email(s) for ${domain}`);
  }
  return results;
}

// Search DuckDuckGo for publicly indexed emails (reliable fallback, never blocks)
async function searchDuckDuckGoForEmails(domain: string): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  const results: Array<{ email: string; name: string | null; source: 'scraped' }> = [];

  const queries = [
    `"@${domain}"`,
    `contact email site:${domain}`,
  ];

  for (const query of queries) {
    if (results.length > 0) break;
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const html = await fetchPage(url);
      if (!html) continue;

      const found = extractEmailsFromSearchHtml(html, domain, ['.result__snippet', '.result__body', '.result__title']);
      results.push(...found);
    } catch (error) {
      logger.debug(`DuckDuckGo search failed for ${domain}:`, error);
    }
  }

  if (results.length > 0) {
    logger.info(`DuckDuckGo found ${results.length} email(s) for ${domain}`);
  }
  return results;
}

// Search the web for emails — tries Google first, falls back to DuckDuckGo
async function searchWebForEmails(domain: string): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  // Try Google first (better indexing coverage)
  const googleResults = await searchGoogleForEmails(domain);
  if (googleResults.length > 0) return googleResults;

  // Fall back to DuckDuckGo (never blocks, always works)
  return await searchDuckDuckGoForEmails(domain);
}

// Run a single query against Google then DuckDuckGo and extract domain emails
async function searchQueryForEmails(query: string, domain: string): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  // Try Google first
  try {
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const html = await response.text();
      if (!html.includes('detected unusual traffic') && !html.includes('captcha')) {
        const found = extractEmailsFromSearchHtml(html, domain, ['.VwiC3b', '.st', '.s3v9rd', 'span.aCOpRe']);
        if (found.length > 0) return found;
      }
    }
  } catch (error) {
    logger.debug(`Google query search failed:`, error);
  }

  // Fall back to DuckDuckGo
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await fetchPage(ddgUrl);
    if (html) {
      return extractEmailsFromSearchHtml(html, domain, ['.result__snippet', '.result__body', '.result__title']);
    }
  } catch (error) {
    logger.debug(`DuckDuckGo query search failed:`, error);
  }

  return [];
}

// WHOIS/RDAP lookup — domain registration sometimes has admin email (free, no auth)
async function lookupWhoisEmail(domain: string): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  const results: Array<{ email: string; name: string | null; source: 'scraped' }> = [];
  try {
    const rdapUrl = `https://rdap.org/domain/${domain}`;
    const response = await fetch(rdapUrl, {
      headers: { 'Accept': 'application/rdap+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return results;
    const data = await response.json() as any;

    // Recursively extract emails from RDAP entities and their vcardArrays
    const processEntity = (entity: any) => {
      if (entity.vcardArray && Array.isArray(entity.vcardArray[1])) {
        const vcard = entity.vcardArray[1];
        for (const prop of vcard) {
          if (prop[0] === 'email' && typeof prop[3] === 'string') {
            const email = prop[3].toLowerCase();
            if (isValidEmail(email) && !results.some(r => r.email === email)) {
              const fnProp = vcard.find((p: any) => p[0] === 'fn');
              const name = fnProp ? fnProp[3] : null;
              results.push({ email, name, source: 'scraped' });
            }
          }
        }
      }
      // Check nested entities
      if (entity.entities) {
        for (const sub of entity.entities) processEntity(sub);
      }
    };

    if (data.entities) {
      for (const entity of data.entities) processEntity(entity);
    }
  } catch (error) {
    logger.debug(`RDAP lookup failed for ${domain}:`, error);
  }

  if (results.length > 0) {
    logger.info(`WHOIS/RDAP found ${results.length} email(s) for ${domain}`);
  }
  return results;
}

// Extract links to individual profile/bio pages from team/staff pages
function extractProfileLinks(html: string, origin: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/\/(team|staff|people|author|contributor|writer|about|member)\//i.test(href)) {
      try {
        const fullUrl = href.startsWith('http') ? href : `${origin}${href.startsWith('/') ? href : '/' + href}`;
        if (!seen.has(fullUrl) && fullUrl.startsWith(origin)) {
          seen.add(fullUrl);
          links.push(fullUrl);
        }
      } catch (_) {}
    }
  });

  return links.slice(0, 5); // max 5 profile pages
}

// Extract social media handles from page HTML (for targeted web search)
function extractSocialHandles(html: string): Array<{ platform: string; handle: string }> {
  const $ = cheerio.load(html);
  const handles: Array<{ platform: string; handle: string }> = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Twitter/X
    const twitterMatch = href.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15})\/?$/);
    if (twitterMatch && !seen.has(twitterMatch[1]) && !['share', 'intent', 'hashtag', 'search'].includes(twitterMatch[1])) {
      seen.add(twitterMatch[1]);
      handles.push({ platform: 'twitter', handle: twitterMatch[1] });
    }
  });

  return handles.slice(0, 2);
}

// Try to find contacts by scraping — article page → author pages → contact pages → web search
async function findContactsByScraping(
  domain: string,
  baseUrl: string
): Promise<Array<{ email: string; name: string | null; source: 'scraped' }>> {
  const contacts: Array<{ email: string; name: string | null; source: 'scraped' }> = [];
  const triedUrls = new Set<string>();
  const origin = new URL(baseUrl).origin;
  let foundAuthorName: string | null = null; // Track author name for targeted searches later

  const addEmails = (emails: Array<{ email: string; context: string }>, authorName?: string | null) => {
    for (const { email, context } of emails) {
      if (!contacts.some(c => c.email === email)) {
        contacts.push({
          email,
          name: authorName || extractName(email, context),
          source: 'scraped',
        });
      }
    }
  };

  // Step 1: Scrape the article page itself
  triedUrls.add(baseUrl);
  const articleHtml = await fetchPage(baseUrl);
  if (articleHtml) {
    addEmails(extractEmails(articleHtml));

    // Step 2: Follow author page links found on the article
    if (contacts.length === 0) {
      const authorLinks = extractAuthorLinks(articleHtml, origin);
      logger.debug(`Found ${authorLinks.length} author links on article page`);
      for (const { url: authorUrl, name: authorName } of authorLinks) {
        if (authorName) foundAuthorName = authorName; // Save for later targeted search
        if (triedUrls.has(authorUrl)) continue;
        triedUrls.add(authorUrl);
        const authorHtml = await fetchPage(authorUrl);
        if (authorHtml) {
          addEmails(extractEmails(authorHtml), authorName);
          if (contacts.length > 0) break;
        }
      }
    }
  }

  // Step 3: Try standard contact/about/team pages + follow links to individual profiles
  if (contacts.length === 0) {
    for (const path of CONTACT_PATHS) {
      const contactUrl = `${origin}${path}`;
      if (triedUrls.has(contactUrl)) continue;
      triedUrls.add(contactUrl);

      const html = await fetchPage(contactUrl);
      if (!html) continue;

      addEmails(extractEmails(html));
      if (contacts.length > 0) break;

      // On team/staff/people pages, follow links to individual profile pages
      if (/\/(team|staff|people|our-team|editorial|masthead|editors|contributors|writers)$/.test(path)) {
        const profileLinks = extractProfileLinks(html, origin);
        logger.debug(`Found ${profileLinks.length} profile links on ${path}`);
        for (const profileUrl of profileLinks) {
          if (triedUrls.has(profileUrl)) continue;
          triedUrls.add(profileUrl);
          const profileHtml = await fetchPage(profileUrl);
          if (profileHtml) {
            addEmails(extractEmails(profileHtml));
            if (contacts.length > 0) break;
          }
        }
        if (contacts.length > 0) break;
      }
    }
  }

  // Step 4: WHOIS/RDAP lookup (domain registration email)
  if (contacts.length === 0) {
    logger.debug(`Trying WHOIS/RDAP lookup for ${domain}`);
    const whoisResults = await lookupWhoisEmail(domain);
    contacts.push(...whoisResults);
  }

  // Step 5: Web search (Google first, DuckDuckGo fallback)
  if (contacts.length === 0) {
    logger.debug(`Trying web search for ${domain}`);
    const webResults = await searchWebForEmails(domain);
    contacts.push(...webResults);
  }

  // Step 6: Targeted web search using author name (if we found one from Step 2)
  if (contacts.length === 0 && foundAuthorName) {
    logger.debug(`Trying targeted name search: "${foundAuthorName}" + ${domain}`);
    const nameQueries = [
      `"${foundAuthorName}" "@${domain}"`,
      `"${foundAuthorName}" email ${domain}`,
    ];

    for (const query of nameQueries) {
      if (contacts.length > 0) break;
      // Try Google first, then DuckDuckGo
      const found = await searchQueryForEmails(query, domain);
      for (const result of found) {
        if (!contacts.some(c => c.email === result.email)) {
          contacts.push({ ...result, name: foundAuthorName });
        }
      }
    }
    if (contacts.length > 0) {
      logger.info(`Targeted name search found ${contacts.length} email(s) for "${foundAuthorName}" @ ${domain}`);
    }
  }

  // Step 7: Social handle web search — find Twitter/X handles and search for their email
  if (contacts.length === 0 && articleHtml) {
    const socialHandles = extractSocialHandles(articleHtml);
    if (socialHandles.length > 0) {
      logger.debug(`Found ${socialHandles.length} social handle(s), searching for associated emails`);

      for (const { handle } of socialHandles) {
        if (contacts.length > 0) break;
        const query = `"@${handle}" email "@${domain}"`;
        const found = await searchQueryForEmails(query, domain);
        for (const result of found) {
          if (!contacts.some(c => c.email === result.email)) {
            contacts.push(result);
          }
        }
      }
      if (contacts.length > 0) {
        logger.info(`Social handle search found ${contacts.length} email(s) for ${domain}`);
      }
    }
  }

  return contacts;
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
    logger.warn(`No contacts found for ${domain} — skipping pattern fallback`);
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
