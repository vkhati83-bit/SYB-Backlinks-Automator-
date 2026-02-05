/**
 * Seed script v2 - Pull RELEVANT EMF health prospects from SEO Command Center
 *
 * Target: Sites discussing EMF/radiation health topics that could benefit from
 * linking to SYB's research database (3,600+ peer-reviewed studies)
 *
 * Run with: npx tsx src/scripts/seed-prospects-v2.ts
 */

import { db, seoDb } from '../db/index.js';
import logger from '../utils/logger.js';

interface SEOProspect {
  url: string;
  domain: string;
  title: string | null;
  keyword: string | null;
  domain_authority: number | null;
  source: string;
  opportunity_type: 'research_citation' | 'broken_link' | 'guest_post';
}

// Keywords that indicate EMF HEALTH content (what we want)
const HEALTH_KEYWORDS = [
  'emf exposure',
  'emf health',
  'emf protection',
  'emf radiation',
  'emf safety',
  'cell phone radiation',
  'phone radiation',
  'wifi radiation',
  'wifi health',
  '5g health',
  '5g radiation',
  '5g safety',
  'electromagnetic radiation health',
  'electromagnetic sensitivity',
  'emf sensitivity',
  'radiation protection',
  'emf blocking',
  'emf shield',
  'faraday',
  'blue light health',
  'blue light sleep',
  'screen time health',
  'digital wellness',
  'tech health',
];

// Domains to EXCLUDE (competitors, spam, irrelevant)
const EXCLUDE_DOMAINS = [
  // Competitors
  'defendershield.com',
  'safesleevecases.com',
  'airestech.com',
  'emfharmony.com',
  'waveguard.com',
  'harapad.com',

  // Big platforms (won't respond to outreach)
  'amazon.com',
  'ebay.com',
  'walmart.com',
  'target.com',
  'apple.com',
  'apps.apple.com',
  'play.google.com',

  // Social/UGC (can't get links)
  'pinterest.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'linkedin.com',
  'reddit.com',
  'quora.com',
  'stackexchange.com',
  'stackoverflow.com',
  'youtube.com',
  'tiktok.com',
  'medium.com',

  // Reference sites (won't add external links)
  'wikipedia.org',
  'webmd.com',
  'mayoclinic.org',
  'healthline.com',
  'medicalnewstoday.com',
  'nih.gov',
  'cdc.gov',
  'who.int',
  'fda.gov',

  // Spam/analytics/aggregators
  'prlog.ru',
  'shareasale.com',
  'yellowpages.com',
  'yelp.com',

  // App stores
  'myshopify.com',
  'shopify.com',

  // News (usually don't add backlinks to articles)
  'nytimes.com',
  'washingtonpost.com',
  'cnn.com',
  'bbc.com',
  'foxnews.com',

  // Our own sites
  'shieldyourbody.com',
];

// Keywords that indicate NON-health content (exclude these)
const EXCLUDE_KEYWORDS = [
  'missile',
  'military',
  'warfare',
  'band',
  'music',
  'song',
  'album',
  'unbelievable', // EMF the band
  'airtag',
  'tracker',
  'tens unit',
  'muscle stimulator',
  'grounding rod',
  'electrical panel',
  'electrician',
  'wiring',
  'code compliance',
];

function isDomainExcluded(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return EXCLUDE_DOMAINS.some(excluded => lowerDomain.includes(excluded));
}

function isKeywordExcluded(keyword: string | null, title: string | null): boolean {
  const text = `${keyword || ''} ${title || ''}`.toLowerCase();
  return EXCLUDE_KEYWORDS.some(excluded => text.includes(excluded));
}

function isKeywordRelevant(keyword: string | null): boolean {
  if (!keyword) return false;
  const lowerKeyword = keyword.toLowerCase();
  return HEALTH_KEYWORDS.some(health => lowerKeyword.includes(health));
}

async function clearExistingProspects(): Promise<void> {
  console.log('🗑️  Clearing existing prospects...');

  // Delete in order due to foreign keys
  await db.query('DELETE FROM emails');
  await db.query('DELETE FROM contacts');
  await db.query('DELETE FROM prospects');

  console.log('   Done.\n');
}

async function seedFromEMFSerp(limit: number = 100): Promise<SEOProspect[]> {
  console.log('📊 Fetching from emf_serp_results...');

  const result = await seoDb.query(`
    SELECT DISTINCT ON (domain)
      url,
      domain,
      title,
      keyword,
      position
    FROM emf_serp_results
    WHERE position <= 30
    ORDER BY domain, position ASC
  `);

  console.log(`   Found ${result.rows.length} unique domains\n`);

  // Filter in JavaScript for more control
  const filtered = result.rows
    .filter((row: any) => {
      // Exclude bad domains
      if (isDomainExcluded(row.domain)) {
        return false;
      }

      // Exclude non-health keywords
      if (isKeywordExcluded(row.keyword, row.title)) {
        return false;
      }

      // Prefer health-related keywords
      if (!isKeywordRelevant(row.keyword)) {
        return false;
      }

      return true;
    })
    .slice(0, limit);

  console.log(`   After filtering: ${filtered.length} relevant prospects\n`);

  return filtered.map((row: any) => ({
    url: row.url,
    domain: row.domain,
    title: row.title,
    keyword: row.keyword,
    domain_authority: null,
    source: 'emf_serp_results',
    opportunity_type: 'research_citation' as const,
  }));
}

async function seedFromBrokenLinks(limit: number = 50): Promise<SEOProspect[]> {
  console.log('🔗 Fetching from competitor_broken_backlinks...');

  const result = await seoDb.query(`
    SELECT DISTINCT ON (referring_domain)
      referring_page_url as url,
      referring_domain as domain,
      broken_url_title as title,
      referring_domain_rank as domain_authority,
      anchor_text,
      broken_url
    FROM competitor_broken_backlinks
    WHERE referring_domain_rank >= 20
      AND is_dofollow = true
    ORDER BY referring_domain, referring_domain_rank DESC NULLS LAST
  `);

  console.log(`   Found ${result.rows.length} unique domains\n`);

  // Filter
  const filtered = result.rows
    .filter((row: any) => {
      if (isDomainExcluded(row.domain)) {
        return false;
      }
      return true;
    })
    .slice(0, limit);

  console.log(`   After filtering: ${filtered.length} prospects\n`);

  return filtered.map((row: any) => ({
    url: row.url,
    domain: row.domain,
    title: row.title || `Broken link: ${row.anchor_text || row.broken_url}`,
    keyword: null,
    domain_authority: row.domain_authority,
    source: 'competitor_broken_backlinks',
    opportunity_type: 'broken_link' as const,
  }));
}

function calculateQualityScore(prospect: SEOProspect): number {
  let score = 50; // Base score

  // Domain authority impact (0-40 points)
  if (prospect.domain_authority) {
    score += Math.min(prospect.domain_authority * 0.5, 40);
  }

  // Opportunity type bonus
  if (prospect.opportunity_type === 'broken_link') {
    score += 10; // Broken links are high-value
  }

  // Keyword relevance bonus
  if (prospect.keyword && isKeywordRelevant(prospect.keyword)) {
    score += 5;
  }

  return Math.min(Math.round(score), 100);
}

async function createDefaultCampaign(): Promise<string> {
  // Check if default campaign exists
  const existing = await db.query(
    "SELECT id FROM campaigns WHERE name = 'EMF Research Outreach'"
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await db.query(`
    INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
    VALUES ('EMF Research Outreach', 'Outreach to sites discussing EMF health topics - pitching SYB research database', 'active', 'research_citation', NOW())
    RETURNING id
  `);

  return result.rows[0].id;
}

async function insertProspect(prospect: SEOProspect, campaignId: string): Promise<string | null> {
  // Check if domain already exists
  const existing = await db.query(
    'SELECT id FROM prospects WHERE domain = $1',
    [prospect.domain]
  );

  if (existing.rows.length > 0) {
    logger.info(`Skipping duplicate: ${prospect.domain}`);
    return null;
  }

  const qualityScore = calculateQualityScore(prospect);

  const result = await db.query(`
    INSERT INTO prospects (
      url, domain, title, domain_authority, quality_score,
      opportunity_type, source, status, campaign_id, approval_status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, 'pending', NOW())
    RETURNING id
  `, [
    prospect.url,
    prospect.domain,
    prospect.title || null,
    prospect.domain_authority || null,
    qualityScore,
    prospect.opportunity_type,
    prospect.source,
    campaignId,
  ]);

  return result.rows[0].id;
}

function generateContactEmail(domain: string): { email: string; name: string; role: string; confidence: string } {
  const baseDomain = domain.replace(/^(www\.|blog\.|news\.|support\.)/i, '');

  const patterns = [
    { prefix: 'editor', name: 'Editor', role: 'Content Editor', confidence: 'B' },
    { prefix: 'contact', name: 'Contact', role: 'General', confidence: 'C' },
    { prefix: 'info', name: 'Info', role: 'General', confidence: 'C' },
  ];

  // Pick pattern based on domain type
  let pattern;
  if (baseDomain.includes('health') || baseDomain.includes('wellness') || baseDomain.includes('blog')) {
    pattern = patterns[0]; // editor
  } else {
    pattern = patterns[1]; // contact
  }

  return {
    email: `${pattern.prefix}@${baseDomain}`,
    name: pattern.name,
    role: pattern.role,
    confidence: pattern.confidence,
  };
}

async function addContactForProspect(prospectId: string, domain: string): Promise<void> {
  const contact = generateContactEmail(domain);

  await db.query(`
    INSERT INTO contacts (prospect_id, email, name, role, confidence_tier, source, is_primary)
    VALUES ($1, $2, $3, $4, $5, 'pattern', true)
    ON CONFLICT (prospect_id, email) DO NOTHING
  `, [prospectId, contact.email, contact.name, contact.role, contact.confidence]);
}

async function main() {
  console.log('🌱 SYB Backlinks Gen - Prospect Seeder v2');
  console.log('=========================================');
  console.log('Target: EMF health sites for research database outreach\n');

  try {
    // Clear existing data
    await clearExistingProspects();

    // Create campaign
    const campaignId = await createDefaultCampaign();
    console.log(`📁 Campaign ID: ${campaignId}\n`);

    // Fetch prospects
    const serpProspects = await seedFromEMFSerp(80);
    const brokenLinkProspects = await seedFromBrokenLinks(20);

    const allProspects = [...serpProspects, ...brokenLinkProspects];

    // Insert prospects
    let inserted = 0;
    let skipped = 0;

    for (const prospect of allProspects) {
      const id = await insertProspect(prospect, campaignId);
      if (id) {
        // Add contact
        await addContactForProspect(id, prospect.domain);

        inserted++;
        const score = calculateQualityScore(prospect);
        console.log(`✅ ${prospect.domain}`);
        console.log(`   Type: ${prospect.opportunity_type} | Score: ${score}`);
        if (prospect.keyword) {
          console.log(`   Keyword: "${prospect.keyword}"`);
        }
        if (prospect.title) {
          console.log(`   Title: ${prospect.title.substring(0, 60)}...`);
        }
        console.log('');
      } else {
        skipped++;
      }
    }

    // Update prospect status
    await db.query(`
      UPDATE prospects SET status = 'contact_found'
      WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = prospects.id)
    `);

    console.log('='.repeat(50));
    console.log(`✅ Inserted: ${inserted} prospects with contacts`);
    console.log(`⏭️  Skipped: ${skipped} duplicates`);
    console.log('='.repeat(50));
    console.log('\nProspects are ready for review at http://localhost:3001/prospects');

  } catch (error) {
    console.error('❌ Error seeding prospects:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
