/**
 * Fresh EMF Research using DataForSEO API
 *
 * IMPORTANT: All API responses are logged IMMEDIATELY to api_response_log
 * No data is ever thrown away, even on failures
 */

import { db } from '../db/index.js';
import { apiLogRepository } from '../db/repositories/api-log.repository.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
  console.error('❌ DataForSEO credentials not found in .env');
  process.exit(1);
}

const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

// EMF Health keywords to search
const EMF_KEYWORDS = [
  'EMF exposure health effects',
  'cell phone radiation health risks',
  '5G radiation health effects',
  'WiFi radiation health risks',
  'electromagnetic sensitivity symptoms',
  'EMF protection research',
  'cell phone radiation studies',
  'is cell phone radiation dangerous',
  'EMF and cancer research',
  'reduce EMF exposure tips',
];

// Competitors for broken link research
const COMPETITORS = [
  'defendershield.com',
  'safesleevecases.com',
];

// Domains to exclude
const EXCLUDE_DOMAINS = [
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com',
  'pinterest.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'youtube.com', 'reddit.com', 'quora.com', 'linkedin.com',
  'wikipedia.org', 'tiktok.com',
  'shieldyourbody.com', 'defendershield.com', 'safesleevecases.com',
  'airestech.com', 'emfharmony.com',
];

interface SerpResult {
  url: string;
  domain: string;
  title: string;
  description: string;
  position: number;
  keyword: string;
}

interface BrokenBacklink {
  referringPageUrl: string;
  referringDomain: string;
  brokenUrl: string;
  anchorText: string;
  domainRank: number;
  isDofollow: boolean;
}

/**
 * Make API call and LOG IMMEDIATELY - never lose data
 */
async function callDataForSEO(
  endpoint: string,
  body: unknown,
  context: { keyword?: string; competitor?: string }
): Promise<{ data: any; logId: string }> {
  const startTime = Date.now();
  const fullEndpoint = `https://api.dataforseo.com/v3/${endpoint}`;

  // Log the request BEFORE making it
  const logId = await apiLogRepository.log({
    service: 'dataforseo',
    endpoint: endpoint,
    method: 'POST',
    requestBody: body as Record<string, unknown>,
    success: false, // Will update after response
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

    // Update log with response - IMMEDIATELY
    await apiLogRepository.update(logId, {
      statusCode: response.status,
      responseBody: data,
      success: data.status_code === 20000,
      errorMessage: data.status_code !== 20000 ? data.status_message : undefined,
      durationMs,
      cost: data.cost || 0,
    });

    console.log(`   API call: ${endpoint} (${durationMs}ms, cost: $${data.cost || 0})`);

    return { data, logId };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // Log the error - IMMEDIATELY
    await apiLogRepository.update(logId, {
      success: false,
      errorMessage: error.message,
      durationMs,
    });

    console.error(`   API error: ${error.message}`);
    return { data: null, logId };
  }
}

async function fetchSerpResults(keyword: string): Promise<SerpResult[]> {
  console.log(`\n   Searching: "${keyword}"...`);

  const { data } = await callDataForSEO(
    'serp/google/organic/live/advanced',
    [{
      keyword: keyword,
      location_code: 2840, // USA
      language_code: 'en',
      depth: 50,
    }],
    { keyword }
  );

  if (!data || data.status_code !== 20000) {
    console.log(`   ⚠️ Failed: ${data?.status_message || 'Unknown error'}`);
    return [];
  }

  const results: SerpResult[] = [];
  const items = data.tasks?.[0]?.result?.[0]?.items || [];

  for (const item of items) {
    if (item.type !== 'organic') continue;

    try {
      const domain = new URL(item.url).hostname.replace('www.', '');

      // Skip excluded domains
      if (EXCLUDE_DOMAINS.some(ex => domain.includes(ex))) continue;

      results.push({
        url: item.url,
        domain: domain,
        title: item.title || '',
        description: item.description || '',
        position: item.rank_absolute,
        keyword: keyword,
      });
    } catch (e) {
      // Skip malformed URLs
    }
  }

  console.log(`   ✅ Found ${results.length} relevant results`);
  return results;
}

async function fetchBrokenBacklinks(targetDomain: string): Promise<BrokenBacklink[]> {
  console.log(`\n   Checking broken backlinks for: ${targetDomain}...`);

  const { data } = await callDataForSEO(
    'backlinks/broken_backlinks/live',
    [{
      target: targetDomain,
      limit: 100,
      order_by: ['rank,desc'],
      filters: [
        ['dofollow', '=', true],
        'and',
        ['rank', '>=', 20],
      ],
    }],
    { competitor: targetDomain }
  );

  if (!data || data.status_code !== 20000) {
    console.log(`   ⚠️ Failed: ${data?.status_message || 'Unknown error'}`);
    return [];
  }

  const results: BrokenBacklink[] = [];
  const items = data.tasks?.[0]?.result?.[0]?.items || [];

  for (const item of items) {
    const domain = item.referring_main_domain || '';

    // Skip excluded domains
    if (EXCLUDE_DOMAINS.some(ex => domain.includes(ex))) continue;

    // Skip spammy/tracking domains
    if (domain.includes('shareasale') ||
        domain.includes('prlog.') ||
        domain.includes('klaviyo') ||
        domain.includes('kmail-lists') ||
        domain.match(/\.(ru|cn)$/)) continue;

    results.push({
      referringPageUrl: item.referring_page,
      referringDomain: domain,
      brokenUrl: item.broken_url,
      anchorText: item.anchor || '',
      domainRank: item.rank || 0,
      isDofollow: item.dofollow,
    });
  }

  console.log(`   ✅ Found ${results.length} quality broken backlink opportunities`);
  return results;
}

async function clearExistingProspects(): Promise<void> {
  console.log('🗑️  Clearing existing prospects...');
  await db.query('DELETE FROM emails');
  await db.query('DELETE FROM contacts');
  await db.query('DELETE FROM prospects');
  await db.query("DELETE FROM campaigns WHERE name = 'EMF Research Outreach'");
  console.log('   Done.\n');
}

async function createCampaign(): Promise<string> {
  const result = await db.query(`
    INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
    VALUES ('EMF Research Outreach', 'Fresh DataForSEO research - EMF health sites for research database outreach', 'active', 'research_citation', NOW())
    RETURNING id
  `);
  return result.rows[0].id;
}

function generateContactEmail(domain: string): { email: string; name: string; role: string; confidence: string } {
  const baseDomain = domain.replace(/^(www\.|blog\.|news\.)/i, '');

  if (baseDomain.includes('health') || baseDomain.includes('wellness') || baseDomain.includes('blog')) {
    return { email: `editor@${baseDomain}`, name: 'Editor', role: 'Content Editor', confidence: 'B' };
  }
  if (baseDomain.includes('.edu')) {
    return { email: `info@${baseDomain}`, name: 'Info', role: 'Communications', confidence: 'C' };
  }
  if (baseDomain.includes('.gov')) {
    return { email: `webmaster@${baseDomain}`, name: 'Webmaster', role: 'Web Team', confidence: 'C' };
  }
  return { email: `contact@${baseDomain}`, name: 'Contact', role: 'General', confidence: 'C' };
}

async function insertProspect(
  url: string,
  domain: string,
  title: string,
  description: string,
  opportunityType: 'research_citation' | 'broken_link',
  source: string,
  keyword: string | null,
  campaignId: string,
  domainAuthority: number | null = null,
): Promise<string | null> {
  // Check duplicate
  const existing = await db.query('SELECT id FROM prospects WHERE domain = $1', [domain]);
  if (existing.rows.length > 0) return null;

  const qualityScore = domainAuthority ? Math.min(50 + domainAuthority * 0.5, 100) : 55;

  const result = await db.query(`
    INSERT INTO prospects (
      url, domain, title, description, domain_authority, quality_score,
      opportunity_type, source, status, campaign_id, approval_status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'new', $9, 'pending', NOW())
    RETURNING id
  `, [url, domain, title, description, domainAuthority, qualityScore, opportunityType, source, campaignId]);

  const prospectId = result.rows[0].id;

  // Add contact
  const contact = generateContactEmail(domain);
  await db.query(`
    INSERT INTO contacts (prospect_id, email, name, role, confidence_tier, source, is_primary)
    VALUES ($1, $2, $3, $4, $5, 'pattern', true)
  `, [prospectId, contact.email, contact.name, contact.role, contact.confidence]);

  return prospectId;
}

async function main() {
  console.log('🔬 DataForSEO Fresh EMF Research');
  console.log('================================');
  console.log('All API responses are logged to api_response_log table\n');

  try {
    await clearExistingProspects();
    const campaignId = await createCampaign();
    console.log(`📁 Campaign ID: ${campaignId}`);

    // ==========================================
    // PART 1: SERP Research (Research Citations)
    // ==========================================
    console.log('\n📊 PART 1: SERP Search for EMF Health Keywords');
    console.log('=' .repeat(50));

    const allSerpResults: SerpResult[] = [];
    const seenDomains = new Set<string>();

    for (const keyword of EMF_KEYWORDS) {
      const results = await fetchSerpResults(keyword);

      for (const result of results) {
        if (!seenDomains.has(result.domain)) {
          seenDomains.add(result.domain);
          allSerpResults.push(result);
        }
      }

      // Delay between calls
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📈 Total unique domains from SERP: ${allSerpResults.length}`);

    // Insert SERP results
    let serpInserted = 0;
    for (const result of allSerpResults.slice(0, 80)) {
      const id = await insertProspect(
        result.url,
        result.domain,
        result.title,
        result.description,
        'research_citation',
        'dataforseo_serp',
        result.keyword,
        campaignId,
        null,
      );

      if (id) {
        serpInserted++;
        console.log(`✅ ${result.domain}`);
        console.log(`   "${result.title.substring(0, 60)}..."`);
      }
    }

    console.log(`\n   Inserted ${serpInserted} research citation prospects`);

    // ==========================================
    // PART 2: Broken Backlinks
    // ==========================================
    console.log('\n🔗 PART 2: Broken Backlinks to Competitors');
    console.log('=' .repeat(50));

    const allBrokenLinks: BrokenBacklink[] = [];
    const seenBrokenDomains = new Set<string>();

    for (const competitor of COMPETITORS) {
      const results = await fetchBrokenBacklinks(competitor);

      for (const result of results) {
        if (!seenBrokenDomains.has(result.referringDomain) && !seenDomains.has(result.referringDomain)) {
          seenBrokenDomains.add(result.referringDomain);
          allBrokenLinks.push(result);
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\n📈 Total unique broken link opportunities: ${allBrokenLinks.length}`);

    // Insert broken link results
    let brokenInserted = 0;
    for (const result of allBrokenLinks.slice(0, 30)) {
      const id = await insertProspect(
        result.referringPageUrl,
        result.referringDomain,
        `Broken link: ${result.anchorText || 'link'}`,
        `This page links to a broken URL: ${result.brokenUrl}`,
        'broken_link',
        'dataforseo_broken_backlinks',
        null,
        campaignId,
        result.domainRank,
      );

      if (id) {
        brokenInserted++;
        console.log(`✅ ${result.referringDomain} (DA: ${result.domainRank})`);
        console.log(`   Broken: ${result.brokenUrl.substring(0, 60)}...`);
      }
    }

    // Update statuses
    await db.query(`
      UPDATE prospects SET status = 'contact_found'
      WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = prospects.id)
    `);

    // Get API stats
    const apiStats = await apiLogRepository.getStats(1);

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTS');
    console.log('='.repeat(50));
    console.log(`Research Citations: ${serpInserted} prospects`);
    console.log(`Broken Links: ${brokenInserted} prospects`);
    console.log(`Total: ${serpInserted + brokenInserted} prospects`);
    console.log('');
    console.log('📡 API Usage:');
    console.log(`   Total calls: ${apiStats.total}`);
    console.log(`   Success rate: ${apiStats.successRate.toFixed(1)}%`);
    console.log(`   Total cost: $${apiStats.totalCost.toFixed(4)}`);
    console.log('='.repeat(50));
    console.log('\n✅ Refresh http://localhost:3001/prospects to see results');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
