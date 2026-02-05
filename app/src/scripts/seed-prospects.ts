/**
 * Seed script - Pull real prospects from SEO Command Center
 * Run with: npx ts-node src/scripts/seed-prospects.ts
 */

import { db, seoDb } from '../db/index.js';
import logger from '../utils/logger.js';

interface SEOProspect {
  url: string;
  domain: string;
  title?: string;
  domain_authority?: number;
  source: string;
  opportunity_type: string;
}

async function seedFromBrokenLinks(limit: number = 20): Promise<SEOProspect[]> {
  const result = await seoDb.query(`
    SELECT DISTINCT
      referring_page_url as url,
      referring_domain as domain,
      broken_url_title as title,
      referring_domain_rank as domain_authority,
      suggested_syb_url
    FROM competitor_broken_backlinks
    WHERE referring_domain NOT LIKE '%shieldyourbody%'
      AND referring_domain NOT LIKE '%safesleeve%'
      AND referring_domain_rank >= 20
    ORDER BY referring_domain_rank DESC NULLS LAST
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    url: row.url,
    domain: row.domain,
    title: row.title,
    domain_authority: row.domain_authority,
    source: 'competitor_broken_backlinks',
    opportunity_type: 'broken_link',
  }));
}

async function seedFromSerpResults(limit: number = 20): Promise<SEOProspect[]> {
  const result = await seoDb.query(`
    SELECT DISTINCT ON (domain)
      url,
      domain,
      title,
      keyword,
      position
    FROM emf_serp_results
    WHERE domain NOT LIKE '%shieldyourbody%'
      AND domain NOT LIKE '%safesleeve%'
      AND domain NOT LIKE '%amazon%'
      AND domain NOT LIKE '%wikipedia%'
      AND domain NOT LIKE '%youtube%'
      AND domain NOT LIKE '%facebook%'
      AND domain NOT LIKE '%reddit%'
      AND position <= 20
    ORDER BY domain, position ASC
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    url: row.url,
    domain: row.domain,
    title: row.title,
    domain_authority: null, // SERP results don't have DA, will estimate later
    source: 'emf_serp_results',
    opportunity_type: 'research_citation',
  }));
}

async function seedFromCompetitorDomains(limit: number = 10): Promise<SEOProspect[]> {
  const result = await seoDb.query(`
    SELECT DISTINCT
      referring_domain as domain,
      domain_rating as domain_authority,
      competitor_domain,
      total_links
    FROM competitor_referring_domains
    WHERE referring_domain NOT LIKE '%shieldyourbody%'
      AND referring_domain NOT LIKE '%safesleeve%'
      AND domain_rating >= 30
      AND we_have_link = false
      AND is_ignored = false
    ORDER BY domain_rating DESC NULLS LAST
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    url: `https://${row.domain}`,
    domain: row.domain,
    title: `Links to ${row.competitor_domain} (${row.total_links} links)`,
    domain_authority: row.domain_authority,
    source: 'competitor_referring_domains',
    opportunity_type: 'guest_post', // Uses guest_post type since competitor_backlink not in schema
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

  return Math.min(Math.round(score), 100);
}

async function createDefaultCampaign(): Promise<string> {
  // Check if default campaign exists
  const existing = await db.query(
    "SELECT id FROM campaigns WHERE name = 'Initial Outreach'"
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await db.query(`
    INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
    VALUES ('Initial Outreach', 'First batch of prospects from SEO Command Center', 'active', 'research_citation', NOW())
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
      opportunity_type, source, status, campaign_id, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, NOW())
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

async function main() {
  console.log('🌱 Seeding prospects from SEO Command Center...\n');

  try {
    // Create default campaign
    const campaignId = await createDefaultCampaign();
    console.log(`📁 Campaign ID: ${campaignId}\n`);

    // Fetch prospects from different sources
    console.log('Fetching from broken links...');
    const brokenLinks = await seedFromBrokenLinks(15);
    console.log(`  Found ${brokenLinks.length} prospects\n`);

    console.log('Fetching from SERP results...');
    const serpResults = await seedFromSerpResults(25);
    console.log(`  Found ${serpResults.length} prospects\n`);

    console.log('Fetching from competitor domains...');
    const competitorDomains = await seedFromCompetitorDomains(10);
    console.log(`  Found ${competitorDomains.length} prospects\n`);

    // Combine all prospects
    const allProspects = [...brokenLinks, ...serpResults, ...competitorDomains];

    // Insert prospects
    let inserted = 0;
    let skipped = 0;

    for (const prospect of allProspects) {
      const id = await insertProspect(prospect, campaignId);
      if (id) {
        inserted++;
        console.log(`✅ ${prospect.domain} (DA: ${prospect.domain_authority || 'N/A'}, Score: ${calculateQualityScore(prospect)})`);
      } else {
        skipped++;
      }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Inserted: ${inserted} prospects`);
    console.log(`⏭️  Skipped: ${skipped} duplicates`);
    console.log(`📊 Total in DB: ${inserted} new prospects`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error seeding prospects:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
