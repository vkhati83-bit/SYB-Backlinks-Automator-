/**
 * Broken Backlinks Research using DataForSEO API
 *
 * Find pages with broken outbound links to EMF/health competitors
 * These are outreach opportunities - offer SYB research database as replacement
 *
 * All API responses logged immediately to api_response_log
 */

import { db } from '../db/index.js';
import { apiLogRepository } from '../db/repositories/api-log.repository.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  console.error('DataForSEO credentials not found in .env');
  process.exit(1);
}

const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

// EMF/Health competitors to check for broken backlinks
// Sites that sell EMF products or have EMF content
const COMPETITOR_TARGETS = [
  // Direct competitors
  'defendershield.com',
  'safesleevecases.com',
  'airestech.com',
  'emfharmony.com',
  'lessemf.com',

  // EMF info sites (may have old/broken pages)
  'emfacademy.com',
  'electricsense.com',
  'emfanalysis.com',

  // Health/wellness sites with EMF content
  'draxe.com',
  'mercola.com',
  'wellnessmama.com',
];

// Same exclusions as SERP filtering - sites that won't link back
const EXCLUDE_DOMAINS = [
  // Big platforms
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
  'aliexpress.com', 'alibaba.com', 'etsy.com',

  // Social/UGC
  'pinterest.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'linkedin.com', 'reddit.com', 'quora.com', 'tiktok.com',
  'youtube.com', 'vimeo.com', 'medium.com',

  // Reference
  'wikipedia.org', 'wikihow.com', 'britannica.com',

  // UNIVERSITIES - will NEVER link to commercial sites
  '.edu', 'university', 'college',

  // GOVERNMENT
  '.gov', 'who.int',

  // Major health institutions
  'webmd.com', 'mayoclinic.org', 'healthline.com', 'medicalnewstoday.com',
  'clevelandclinic.org', 'hopkinsmedicine.org', 'health.harvard.edu',
  'cancer.org', 'heart.org', 'diabetes.org',

  // News sites
  'nytimes.com', 'washingtonpost.com', 'cnn.com', 'bbc.com',
  'forbes.com', 'reuters.com', 'apnews.com', 'news.', 'magazine.',

  // Research/academic
  'frontiersin.org', 'pubmed', 'ncbi.nlm', 'sciencedirect',
  'springer.com', 'nature.com', 'journals.', 'academic.',

  // Spam/affiliate
  'shareasale.com', 'klaviyo.com', 'kmail-lists', 'mailchimp',
  'yellowpages.com', 'yelp.com', 'prlog.',
  'shopify.com', 'myshopify.com',

  // Our own site
  'shieldyourbody.com',
];

// Spam patterns in URLs
const SPAM_URL_PATTERNS = [
  '/cart', '/checkout', '/account', '/login', '/signup',
  '/affiliate', '/partner', '/ref=', '/tracking',
  '.ru/', '.cn/', '/wp-admin', '/feed/',
];

function isDomainExcluded(domain: string): boolean {
  const lower = domain.toLowerCase();
  return EXCLUDE_DOMAINS.some(ex => lower.includes(ex));
}

function isSpamUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SPAM_URL_PATTERNS.some(pattern => lower.includes(pattern));
}

interface BrokenBacklink {
  referringPageUrl: string;
  referringDomain: string;
  brokenUrl: string;
  brokenDomain: string;
  anchorText: string;
  domainRank: number;
  isDofollow: boolean;
  pageTitle?: string;
}

/**
 * Make API call and LOG IMMEDIATELY
 */
async function callDataForSEO(
  endpoint: string,
  body: unknown,
  context: { competitor?: string }
): Promise<{ data: any; logId: string }> {
  const startTime = Date.now();
  const fullEndpoint = `https://api.dataforseo.com/v3/${endpoint}`;

  // Log request BEFORE making it
  const logId = await apiLogRepository.log({
    service: 'dataforseo',
    endpoint: endpoint,
    method: 'POST',
    requestBody: body as Record<string, unknown>,
    success: false,
  });

  try {
    const response = await fetch(fullEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${AUTH}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as any;
    const durationMs = Date.now() - startTime;

    // Update log with response IMMEDIATELY
    await apiLogRepository.update(logId, {
      statusCode: response.status,
      responseBody: data,
      success: data.status_code === 20000,
      errorMessage: data.status_code !== 20000 ? data.status_message : undefined,
      durationMs,
      cost: data.cost || 0,
    });

    console.log(`   API: ${endpoint} (${durationMs}ms, cost: $${data.cost || 0})`);

    return { data, logId };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    await apiLogRepository.update(logId, {
      success: false,
      errorMessage: error.message,
      durationMs,
    });

    console.error(`   API error: ${error.message}`);
    return { data: null, logId };
  }
}

async function fetchBrokenBacklinks(targetDomain: string): Promise<BrokenBacklink[]> {
  console.log(`\n   Checking: ${targetDomain}...`);

  const { data } = await callDataForSEO(
    'backlinks/broken_backlinks/live',
    [{
      target: targetDomain,
      limit: 100,
      order_by: ['rank,desc'],
      filters: [
        ['dofollow', '=', true],
        'and',
        ['rank', '>=', 15],  // Minimum domain authority
      ],
    }],
    { competitor: targetDomain }
  );

  if (!data || data.status_code !== 20000) {
    console.log(`   Failed: ${data?.status_message || 'Unknown error'}`);
    return [];
  }

  const results: BrokenBacklink[] = [];
  const items = data.tasks?.[0]?.result?.[0]?.items || [];

  for (const item of items) {
    const referringDomain = (item.referring_main_domain || '').toLowerCase();
    const referringUrl = item.referring_page || '';
    const brokenUrl = item.broken_url || '';

    // Skip excluded domains
    if (isDomainExcluded(referringDomain)) continue;

    // Skip spam URLs
    if (isSpamUrl(referringUrl) || isSpamUrl(brokenUrl)) continue;

    // Skip if broken URL is just tracking/affiliate
    if (brokenUrl.includes('shareasale') ||
        brokenUrl.includes('klaviyo') ||
        brokenUrl.includes('mailchimp') ||
        brokenUrl.includes('tracking')) continue;

    results.push({
      referringPageUrl: referringUrl,
      referringDomain: referringDomain,
      brokenUrl: brokenUrl,
      brokenDomain: targetDomain,
      anchorText: item.anchor || '',
      domainRank: item.rank || 0,
      isDofollow: item.dofollow,
      pageTitle: item.referring_page_title || '',
    });
  }

  console.log(`   Found ${results.length} quality opportunities (from ${items.length} total)`);
  return results;
}

async function getOrCreateCampaign(): Promise<string> {
  // Check if campaign exists
  const existing = await db.query(
    "SELECT id FROM campaigns WHERE name = 'Broken Link Outreach'"
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await db.query(`
    INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
    VALUES (
      'Broken Link Outreach',
      'Sites with broken outbound links to EMF competitors - offer SYB research as replacement',
      'active',
      'broken_link',
      NOW()
    )
    RETURNING id
  `);

  return result.rows[0].id;
}

function generateContactEmail(domain: string): { email: string; name: string; role: string; confidence: string } {
  const lower = domain.toLowerCase();

  if (lower.includes('blog')) {
    return { email: `hello@${domain}`, name: 'Editor', role: 'Blog Owner', confidence: 'B' };
  }
  if (lower.includes('health') || lower.includes('wellness') || lower.includes('natural')) {
    return { email: `editor@${domain}`, name: 'Editor', role: 'Content Editor', confidence: 'B' };
  }
  if (lower.includes('mom') || lower.includes('parent') || lower.includes('family')) {
    return { email: `hello@${domain}`, name: 'Editor', role: 'Site Owner', confidence: 'B' };
  }
  return { email: `contact@${domain}`, name: 'Contact', role: 'General', confidence: 'C' };
}

async function insertBrokenLinkProspect(
  link: BrokenBacklink,
  campaignId: string
): Promise<boolean> {
  try {
    // Check duplicate
    const existing = await db.query(
      'SELECT id FROM prospects WHERE domain = $1',
      [link.referringDomain]
    );
    if (existing.rows.length > 0) return false;

    // Quality score based on domain rank
    const qualityScore = Math.min(50 + link.domainRank * 0.5, 100);

    // Store broken URL info in description for outreach
    const description = `BROKEN LINK OPPORTUNITY
Broken URL: ${link.brokenUrl}
Anchor text: "${link.anchorText}"
Page title: ${link.pageTitle || 'N/A'}

This page has a broken outbound link. Reach out offering SYB research database as a replacement resource.`;

    const result = await db.query(`
      INSERT INTO prospects (
        url, domain, title, description, domain_authority, quality_score,
        opportunity_type, source, status, campaign_id, approval_status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'broken_link', 'dataforseo_broken', 'new', $7, 'pending', NOW())
      RETURNING id
    `, [
      link.referringPageUrl,
      link.referringDomain,
      link.pageTitle || `Broken link: ${link.anchorText}`,
      description,
      link.domainRank,
      qualityScore,
      campaignId,
    ]);

    const prospectId = result.rows[0].id;

    // Add contact
    const contact = generateContactEmail(link.referringDomain);
    await db.query(`
      INSERT INTO contacts (prospect_id, email, name, role, confidence_tier, source, is_primary)
      VALUES ($1, $2, $3, $4, $5, 'pattern', true)
    `, [prospectId, contact.email, contact.name, contact.role, contact.confidence]);

    return true;
  } catch (error) {
    console.error(`Failed to insert ${link.referringDomain}:`, error);
    return false;
  }
}

async function main() {
  console.log('Broken Backlinks Research');
  console.log('=========================');
  console.log('Finding pages with broken links to EMF competitors\n');

  try {
    const campaignId = await getOrCreateCampaign();
    console.log(`Campaign ID: ${campaignId}`);

    const allResults: BrokenBacklink[] = [];
    const seenDomains = new Set<string>();

    // Get existing prospect domains to avoid duplicates
    const existingProspects = await db.query('SELECT domain FROM prospects');
    for (const row of existingProspects.rows) {
      seenDomains.add(row.domain.toLowerCase());
    }
    console.log(`Skipping ${seenDomains.size} existing prospect domains\n`);

    console.log('Checking competitors for broken backlinks...');
    console.log('=' .repeat(50));

    for (const competitor of COMPETITOR_TARGETS) {
      const results = await fetchBrokenBacklinks(competitor);

      for (const result of results) {
        const domain = result.referringDomain.toLowerCase();
        if (!seenDomains.has(domain)) {
          seenDomains.add(domain);
          allResults.push(result);
        }
      }

      // Rate limit - 1 second between calls
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\nTotal unique opportunities: ${allResults.length}`);

    // Sort by domain rank (quality)
    allResults.sort((a, b) => b.domainRank - a.domainRank);

    // Insert top results
    const limit = 50;
    let inserted = 0;

    console.log(`\nInserting top ${limit} prospects...\n`);

    for (const link of allResults.slice(0, limit)) {
      if (await insertBrokenLinkProspect(link, campaignId)) {
        inserted++;
        console.log(`${link.referringDomain} (DA: ${link.domainRank})`);
        console.log(`   Broken: ${link.brokenUrl.substring(0, 60)}...`);
        console.log(`   Anchor: "${link.anchorText}"`);
      }
    }

    // Update statuses
    await db.query(`
      UPDATE prospects SET status = 'contact_found'
      WHERE opportunity_type = 'broken_link'
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = prospects.id)
    `);

    // Get API stats
    const apiStats = await apiLogRepository.getStats(1);

    console.log('\n' + '='.repeat(50));
    console.log('RESULTS');
    console.log('='.repeat(50));
    console.log(`Competitors checked: ${COMPETITOR_TARGETS.length}`);
    console.log(`Opportunities found: ${allResults.length}`);
    console.log(`Prospects inserted: ${inserted}`);
    console.log('');
    console.log('API Usage:');
    console.log(`   Calls: ${apiStats.byService['dataforseo']?.total || 0}`);
    console.log(`   Cost: $${apiStats.byService['dataforseo']?.cost?.toFixed(4) || 0}`);
    console.log('='.repeat(50));
    console.log('\nRefresh http://localhost:3001/prospects to see results');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
