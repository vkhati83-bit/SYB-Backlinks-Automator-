/**
 * Seed prospects from EXISTING SEO Command Center data
 * Better filtering of the 3,969 EMF SERP results
 *
 * NO new DataForSEO API calls - use what we already have
 */

import { db, seoDb } from '../db/index.js';
import logger from '../utils/logger.js';

// ==========================================
// SMART FILTERING RULES
// ==========================================

// Keywords that indicate REAL EMF health content (not just mentions EMF)
const HEALTH_SIGNAL_KEYWORDS = [
  'health',
  'radiation',
  'exposure',
  'protection',
  'safety',
  'danger',
  'risk',
  'harmful',
  'cancer',
  'brain',
  'children',
  'pregnant',
  'baby',
  'symptoms',
  'effects',
  'studies',
  'research',
  'science',
  'cell phone',
  'wifi',
  '5g',
  'wireless',
  'electromagnetic',
  'reduce',
  'shield',
  'block',
];

// Keywords that indicate it's NOT about EMF health
const EXCLUDE_SIGNALS = [
  'unbelievable',     // EMF the band
  'band',
  'music',
  'song',
  'album',
  'spotify',
  'missile',          // Anti-radiation missiles
  'military',
  'warfare',
  'defense',
  'airtag',           // AirTag tracking
  'tracker',
  'find my',
  'tens unit',        // TENS devices (unrelated)
  'muscle stimulator',
  'grounding rod',    // Electrical grounding (not health)
  'electrical panel',
  'electrician',
  'wiring code',
  'nec code',
  'stock',            // Stock/trading
  'price',
  'buy',
  'shop',
  'cart',
  'checkout',
  'coupon',
  'discount',
  'sale',
];

// Domains to ALWAYS exclude - sites that will NEVER link back
const EXCLUDE_DOMAINS = [
  // Big platforms
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
  'aliexpress.com', 'alibaba.com', 'etsy.com',

  // Social/UGC
  'pinterest.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'linkedin.com', 'reddit.com', 'quora.com', 'tiktok.com',
  'youtube.com', 'vimeo.com',
  'medium.com',

  // Reference (won't add backlinks)
  'wikipedia.org', 'wikihow.com', 'britannica.com', 'khanacademy.org',

  // UNIVERSITIES - will NEVER link to commercial sites
  '.edu',
  'harvard.edu', 'stanford.edu', 'mit.edu', 'berkeley.edu',
  'yale.edu', 'princeton.edu', 'columbia.edu', 'cornell.edu',
  'university', 'college',

  // GOVERNMENT - will NEVER link to commercial sites
  '.gov',
  'nih.gov', 'cdc.gov', 'who.int', 'fda.gov', 'epa.gov',
  'cancer.gov', 'health.gov',

  // Major health institutions - editorial policies prevent linking
  'webmd.com', 'mayoclinic.org', 'healthline.com', 'medicalnewstoday.com',
  'clevelandclinic.org', 'hopkinsmedicine.org', 'health.harvard.edu',
  'cancer.org', 'heart.org', 'diabetes.org',
  'dukehealth.org', 'uclahealth.org', 'uhhospitals.org',
  'kaiserpermanente.org', 'stanfordmedicine', 'med.stanford',

  // Major news sites - won't add backlinks to articles
  'nytimes.com', 'washingtonpost.com', 'cnn.com', 'bbc.com',
  'forbes.com', 'reuters.com', 'apnews.com', 'news.', 'magazine.',

  // Research/academic sites - institutional policies
  'frontiersin.org', 'pubmed', 'ncbi.nlm', 'sciencedirect',
  'springer.com', 'nature.com', 'journals.', 'academic.',

  // Competitors
  'shieldyourbody.com', 'defendershield.com', 'safesleevecases.com',
  'airestech.com', 'emfharmony.com', 'lessemf.com', 'emfacademy.com',

  // Spam/aggregators
  'shareasale.com', 'yellowpages.com', 'yelp.com', 'prlog.',
  'shopify.com', 'myshopify.com',

  // App stores
  'apps.apple.com', 'play.google.com',

  // Q&A sites (low value)
  'stackexchange.com', 'stackoverflow.com', 'answers.com',

  // Big orgs that won't link out
  'aarp.org', 'cancer.org.au', 'cancerresearchuk.org',
];

// Domains that are GOOD for outreach (will actually respond)
const PREFER_DOMAINS = [
  'blog',          // Blogs respond to outreach
  'wellness',      // Wellness sites
  'parent',        // Parenting sites
  'mom',           // Mom blogs
  'family',        // Family sites
  'natural',       // Natural health
  'holistic',      // Holistic health
  'functional',    // Functional medicine
  'integrative',   // Integrative health
  'lifestyle',     // Lifestyle blogs
  'living',        // Healthy living sites
  'mindful',       // Mindful/wellness
  'organic',       // Organic lifestyle
  'eco',           // Eco/environmental
  'green',         // Green living
  'detox',         // Detox/health
  'emf',           // EMF focused sites
  'radiation',     // Radiation awareness
  'safety',        // Safety focused
];

function isDomainExcluded(domain: string): boolean {
  const lower = domain.toLowerCase();
  return EXCLUDE_DOMAINS.some(ex => lower.includes(ex));
}

function hasExcludeSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return EXCLUDE_SIGNALS.some(sig => lower.includes(sig));
}

function hasHealthSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return HEALTH_SIGNAL_KEYWORDS.some(sig => lower.includes(sig));
}

function isPreferredDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return PREFER_DOMAINS.some(pref => lower.includes(pref));
}

function scoreProspect(row: any): number {
  let score = 0;
  const text = `${row.keyword || ''} ${row.title || ''} ${row.url || ''}`.toLowerCase();
  const domain = (row.domain || '').toLowerCase();

  // Base score from position (higher ranking = more relevant content)
  if (row.position <= 10) score += 20;
  else if (row.position <= 20) score += 15;
  else if (row.position <= 30) score += 10;
  else if (row.position <= 40) score += 5;
  else if (row.position <= 50) score += 2;

  // Health signal bonus - more signals = more relevant
  const healthSignals = HEALTH_SIGNAL_KEYWORDS.filter(sig => text.includes(sig)).length;
  score += healthSignals * 5;

  // BLOG BONUS - blogs actually respond to outreach!
  if (domain.includes('blog') || text.includes('blog')) score += 25;

  // Preferred domain bonus (wellness, parenting, etc.)
  if (isPreferredDomain(domain)) score += 20;

  // Personal/small site signals (more likely to respond)
  if (domain.split('.').length <= 2) score += 5; // Simple domain = often personal site
  if (domain.includes('my') || domain.includes('the')) score += 5; // "mysite", "thehealthsite"

  // EMF-specific sites - highly relevant
  if (domain.includes('emf') || domain.includes('radiation')) score += 15;

  // Penalty for commercial/shop signals
  if (text.includes('shop') || text.includes('buy') || text.includes('product') || text.includes('price')) {
    score -= 20;
  }

  // Penalty for institutional domains that slip through
  if (domain.includes('.edu') || domain.includes('.gov') || domain.includes('university')) {
    score -= 50; // Should be filtered, but just in case
  }

  return score;
}

interface FilteredProspect {
  url: string;
  domain: string;
  title: string;
  keyword: string;
  position: number;
  score: number;
}

async function fetchAndFilterSerpResults(): Promise<FilteredProspect[]> {
  console.log('📊 Fetching EMF SERP results from SEO Command Center...\n');

  const result = await seoDb.query(`
    SELECT url, domain, title, keyword, position
    FROM emf_serp_results
    WHERE position <= 50
    ORDER BY position ASC
  `);

  console.log(`   Total rows: ${result.rows.length}`);

  // Filter and score
  const filtered: FilteredProspect[] = [];
  const seenDomains = new Set<string>();
  let excluded = { domain: 0, signal: 0, noHealth: 0 };

  for (const row of result.rows) {
    const domain = (row.domain || '').toLowerCase().replace('www.', '');
    const text = `${row.keyword || ''} ${row.title || ''}`;

    // Skip if already seen this domain
    if (seenDomains.has(domain)) continue;

    // Skip excluded domains
    if (isDomainExcluded(domain)) {
      excluded.domain++;
      continue;
    }

    // Skip if has exclude signal (music, military, etc)
    if (hasExcludeSignal(text)) {
      excluded.signal++;
      continue;
    }

    // Skip if no health signal at all
    if (!hasHealthSignal(text)) {
      excluded.noHealth++;
      continue;
    }

    const score = scoreProspect(row);
    seenDomains.add(domain);

    filtered.push({
      url: row.url,
      domain: domain,
      title: row.title || '',
      keyword: row.keyword || '',
      position: row.position,
      score: score,
    });
  }

  console.log(`   Excluded: ${excluded.domain} bad domains, ${excluded.signal} non-health, ${excluded.noHealth} no health signal`);
  console.log(`   Passed filter: ${filtered.length} prospects`);

  // Sort by score
  filtered.sort((a, b) => b.score - a.score);

  return filtered;
}

async function clearExistingProspects(): Promise<void> {
  console.log('🗑️  Clearing existing prospects...');
  await db.query('DELETE FROM emails');
  await db.query('DELETE FROM contacts');
  await db.query('DELETE FROM prospects');
  console.log('   Done.\n');
}

async function createCampaign(): Promise<string> {
  await db.query("DELETE FROM campaigns WHERE name = 'EMF Research Outreach'");

  const result = await db.query(`
    INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
    VALUES (
      'EMF Research Outreach',
      'Filtered prospects from SEO Command Center - EMF health sites for research database outreach',
      'active',
      'research_citation',
      NOW()
    )
    RETURNING id
  `);

  return result.rows[0].id;
}

function generateContact(domain: string): { email: string; name: string; role: string; confidence: string } {
  const lower = domain.toLowerCase();
  // Strip www. prefix for email generation to avoid invalid emails like hello@www.example.com
  const emailDomain = domain.replace(/^www\./, '');

  // Blogs often have editor@ or hello@
  if (lower.includes('blog')) {
    return { email: `hello@${emailDomain}`, name: 'Editor', role: 'Blog Owner', confidence: 'B' };
  }

  // Health/wellness sites often have editor or info
  if (lower.includes('health') || lower.includes('wellness') || lower.includes('natural')) {
    return { email: `editor@${emailDomain}`, name: 'Editor', role: 'Content Editor', confidence: 'B' };
  }

  // Parenting/mom sites
  if (lower.includes('mom') || lower.includes('parent') || lower.includes('family')) {
    return { email: `hello@${emailDomain}`, name: 'Editor', role: 'Site Owner', confidence: 'B' };
  }

  // EMF-specific sites
  if (lower.includes('emf') || lower.includes('radiation')) {
    return { email: `info@${emailDomain}`, name: 'Info', role: 'Site Owner', confidence: 'B' };
  }

  // Default - try contact@
  return { email: `contact@${emailDomain}`, name: 'Contact', role: 'General', confidence: 'C' };
}

async function insertProspect(prospect: FilteredProspect, campaignId: string): Promise<boolean> {
  try {
    // Check duplicate
    const existing = await db.query('SELECT id FROM prospects WHERE domain = $1', [prospect.domain]);
    if (existing.rows.length > 0) return false;

    // Quality score based on our scoring
    const qualityScore = Math.min(50 + prospect.score, 100);

    const result = await db.query(`
      INSERT INTO prospects (
        url, domain, title, quality_score,
        opportunity_type, source, status, campaign_id, approval_status, created_at
      )
      VALUES ($1, $2, $3, $4, 'research_citation', 'seo_command_center', 'new', $5, 'pending', NOW())
      RETURNING id
    `, [prospect.url, prospect.domain, prospect.title, qualityScore, campaignId]);

    const prospectId = result.rows[0].id;

    // Add contact
    const contact = generateContact(prospect.domain);
    await db.query(`
      INSERT INTO contacts (prospect_id, email, name, role, confidence_tier, source, is_primary)
      VALUES ($1, $2, $3, $4, $5, 'pattern', true)
    `, [prospectId, contact.email, contact.name, contact.role, contact.confidence]);

    return true;
  } catch (error) {
    logger.error(`Failed to insert ${prospect.domain}:`, error);
    return false;
  }
}

async function main() {
  console.log('🔬 SEO Command Center → Backlinks Gen');
  console.log('=====================================');
  console.log('Smart filtering of existing EMF SERP data\n');

  try {
    // Get filtered prospects
    const prospects = await fetchAndFilterSerpResults();

    console.log(`\n📋 Top 10 prospects by score:`);
    prospects.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.domain} (score: ${p.score})`);
      console.log(`      "${p.title.substring(0, 50)}..."`);
      console.log(`      Keyword: "${p.keyword}"`);
    });

    // Clear and insert
    await clearExistingProspects();
    const campaignId = await createCampaign();
    console.log(`\n📁 Campaign ID: ${campaignId}\n`);

    // Insert top 100 prospects
    const limit = 100;
    let inserted = 0;

    console.log(`📥 Inserting top ${limit} prospects...\n`);

    for (const prospect of prospects.slice(0, limit)) {
      if (await insertProspect(prospect, campaignId)) {
        inserted++;
        console.log(`✅ ${prospect.domain} (score: ${prospect.score})`);
        console.log(`   "${prospect.title.substring(0, 60)}..."`);
      }
    }

    // Update statuses
    await db.query(`
      UPDATE prospects SET status = 'contact_found'
      WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.prospect_id = prospects.id)
    `);

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTS');
    console.log('='.repeat(50));
    console.log(`Inserted: ${inserted} prospects`);
    console.log(`From: ${prospects.length} filtered prospects`);
    console.log(`Source: SEO Command Center (no new API calls)`);
    console.log('='.repeat(50));
    console.log('\n✅ Refresh http://localhost:3001/prospects to see results');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
