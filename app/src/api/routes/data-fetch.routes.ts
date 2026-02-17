import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db, seoDb } from '../../db/index.js';
import { apiLogRepository } from '../../db/repositories/api-log.repository.js';
import { contactFinderQueue } from '../../config/queues.js';
import { findMatchingArticle } from '../../services/article-matcher.service.js';
import logger from '../../utils/logger.js';

const router = Router();

// ==========================================
// SMART FILTERING RULES (from seed script)
// ==========================================

const HEALTH_SIGNAL_KEYWORDS = [
  'health', 'radiation', 'exposure', 'protection', 'safety', 'danger', 'risk',
  'harmful', 'cancer', 'brain', 'children', 'pregnant', 'baby', 'symptoms',
  'effects', 'studies', 'research', 'science', 'cell phone', 'wifi', '5g',
  'wireless', 'electromagnetic', 'reduce', 'shield', 'block',
];

const EXCLUDE_SIGNALS = [
  'unbelievable', 'band', 'music', 'song', 'album', 'spotify',
  'missile', 'military', 'warfare', 'defense',
  'airtag', 'tracker', 'find my', 'tens unit', 'muscle stimulator',
  'grounding rod', 'electrical panel', 'electrician', 'wiring code', 'nec code',
  'stock', 'price', 'buy', 'shop', 'cart', 'checkout', 'coupon', 'discount', 'sale',
];

const EXCLUDE_DOMAINS = [
  'amazon.com', 'ebay.com', 'walmart.com', 'target.com', 'bestbuy.com',
  'aliexpress.com', 'alibaba.com', 'etsy.com',
  'pinterest.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'linkedin.com', 'reddit.com', 'quora.com', 'tiktok.com',
  'youtube.com', 'vimeo.com', 'medium.com',
  'wikipedia.org', 'wikihow.com', 'britannica.com', 'khanacademy.org',
  '.edu', 'harvard.edu', 'stanford.edu', 'mit.edu', 'berkeley.edu',
  'yale.edu', 'princeton.edu', 'columbia.edu', 'cornell.edu',
  'university', 'college',
  '.gov', 'nih.gov', 'cdc.gov', 'who.int', 'fda.gov', 'epa.gov',
  'cancer.gov', 'health.gov',
  'webmd.com', 'mayoclinic.org', 'healthline.com', 'medicalnewstoday.com',
  'clevelandclinic.org', 'hopkinsmedicine.org', 'health.harvard.edu',
  'cancer.org', 'heart.org', 'diabetes.org',
  'dukehealth.org', 'uclahealth.org', 'uhhospitals.org',
  'kaiserpermanente.org', 'stanfordmedicine', 'med.stanford',
  'nytimes.com', 'washingtonpost.com', 'cnn.com', 'bbc.com',
  'forbes.com', 'reuters.com', 'apnews.com', 'news.', 'magazine.',
  'frontiersin.org', 'pubmed', 'ncbi.nlm', 'sciencedirect',
  'springer.com', 'nature.com', 'journals.', 'academic.',
  'shieldyourbody.com', 'defendershield.com', 'safesleevecases.com',
  'airestech.com', 'emfharmony.com', 'lessemf.com', 'emfacademy.com',
  'shareasale.com', 'yellowpages.com', 'yelp.com', 'prlog.',
  'shopify.com', 'myshopify.com',
  'apps.apple.com', 'play.google.com',
  'stackexchange.com', 'stackoverflow.com', 'answers.com',
  'aarp.org', 'cancer.org.au', 'cancerresearchuk.org',
  // Link shorteners & affiliate platforms
  'fas.st', 'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly',
  'rebrand.ly', 'linktr.ee', 'lnk.to', 'shorte.st',
  'go2l.ink', 'shrsl.com', 'avantlink.com', 'anrdoezrs.net', 'jdoqocy.com',
  'tkqlhce.com', 'dpbolvw.net', 'kqzyfj.com', 'pntra.com', 'pntrac.com',
  'pntrs.com', 'commission-junction.com', 'cj.com',
];

const PREFER_DOMAINS = [
  'blog', 'wellness', 'parent', 'mom', 'family', 'natural', 'holistic',
  'functional', 'integrative', 'lifestyle', 'living', 'mindful', 'organic',
  'eco', 'green', 'detox', 'emf', 'radiation', 'safety',
];

// DataForSEO rank is 0-1000 (InLink Rank), not 0-100 DA. Normalize to 0-100.
function normalizeRankToDA(rank: number | undefined | null): number {
  if (!rank) return 0;
  return Math.round(Math.min(100, rank / 10));
}

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

  if (row.position <= 10) score += 20;
  else if (row.position <= 20) score += 15;
  else if (row.position <= 30) score += 10;
  else if (row.position <= 40) score += 5;
  else if (row.position <= 50) score += 2;

  const healthSignals = HEALTH_SIGNAL_KEYWORDS.filter(sig => text.includes(sig)).length;
  score += healthSignals * 5;

  if (domain.includes('blog') || text.includes('blog')) score += 25;
  if (isPreferredDomain(domain)) score += 20;
  if (domain.split('.').length <= 2) score += 5;
  if (domain.includes('my') || domain.includes('the')) score += 5;
  if (domain.includes('emf') || domain.includes('radiation')) score += 15;

  if (text.includes('shop') || text.includes('buy') || text.includes('product') || text.includes('price')) {
    score -= 20;
  }

  if (domain.includes('.edu') || domain.includes('.gov') || domain.includes('university')) {
    score -= 50;
  }

  return score;
}

function generateContacts(domain: string): Array<{ email: string; name: string; role: string; confidence: string }> {
  const lower = domain.toLowerCase();
  const contacts: Array<{ email: string; name: string; role: string; confidence: string }> = [];

  // Strip www. for email generation
  const emailDomain = domain.replace(/^www\./, '');

  // Determine site type and generate appropriate contacts
  if (lower.includes('blog')) {
    contacts.push({ email: `editor@${emailDomain}`, name: 'Editor', role: 'Blog Editor', confidence: 'C' });
    contacts.push({ email: `hello@${emailDomain}`, name: 'Team', role: 'Site Owner', confidence: 'C' });
  } else if (lower.includes('health') || lower.includes('wellness') || lower.includes('natural') || lower.includes('holistic')) {
    contacts.push({ email: `editor@${emailDomain}`, name: 'Editor', role: 'Content Editor', confidence: 'C' });
    contacts.push({ email: `info@${emailDomain}`, name: 'Info', role: 'General Contact', confidence: 'C' });
  } else if (lower.includes('mom') || lower.includes('parent') || lower.includes('family') || lower.includes('baby')) {
    contacts.push({ email: `hello@${emailDomain}`, name: 'Team', role: 'Site Owner', confidence: 'C' });
    contacts.push({ email: `contact@${emailDomain}`, name: 'Contact', role: 'General', confidence: 'C' });
  } else if (lower.includes('emf') || lower.includes('radiation') || lower.includes('safety')) {
    contacts.push({ email: `info@${emailDomain}`, name: 'Info', role: 'Site Owner', confidence: 'C' });
    contacts.push({ email: `contact@${emailDomain}`, name: 'Contact', role: 'General', confidence: 'C' });
  } else {
    // Default: try multiple common patterns
    contacts.push({ email: `hello@${emailDomain}`, name: 'Team', role: 'General', confidence: 'C' });
    contacts.push({ email: `info@${emailDomain}`, name: 'Info', role: 'General', confidence: 'C' });
    contacts.push({ email: `contact@${emailDomain}`, name: 'Contact', role: 'General', confidence: 'D' });
  }

  return contacts;
}

// Legacy single contact function for backward compatibility
function generateContact(domain: string): { email: string; name: string; role: string; confidence: string } {
  const contacts = generateContacts(domain);
  return contacts[0] || { email: `hello@${domain.replace(/^www\./, '')}`, name: 'Team', role: 'General', confidence: 'D' };
}

// POST /api/v1/data-fetch/research-citations - Fetch from SEO Command Center
router.post('/research-citations', async (req: Request, res: Response) => {
  try {
    const {
      limit = 100,
      minPosition = 1,
      maxPosition = 50,
      minDA = 0,
      maxDA = 100,
      keywords = [],
    } = req.body;

    logger.info('Fetching research citation prospects from SEO Command Center...', {
      minPosition, maxPosition, minDA, maxDA, keywords, limit
    });

    // Build dynamic query based on filters
    let query = `
      SELECT url, domain, title, keyword, position
      FROM emf_serp_results
      WHERE position >= $1 AND position <= $2
    `;
    const params: any[] = [minPosition, maxPosition];

    // Add keyword filter if provided
    if (keywords && keywords.length > 0) {
      const keywordConditions = keywords.map((_: string, i: number) => `(keyword ILIKE $${params.length + i + 1} OR title ILIKE $${params.length + i + 1})`);
      query += ` AND (${keywordConditions.join(' OR ')})`;
      keywords.forEach((kw: string) => params.push(`%${kw}%`));
    }

    query += ` ORDER BY position ASC`;

    // Fetch MORE than requested to account for filtering out competitors/duplicates/spam
    const maxResults = Math.min(Math.max(1, parseInt(limit) || 100), 1000);
    const fetchMultiplier = 10; // Fetch 10x to ensure enough after filtering
    const dbLimit = Math.min(maxResults * fetchMultiplier, 5000);
    query += ` LIMIT $${params.length + 1}`;
    params.push(dbLimit);

    const result = await seoDb.query(query, params);

    // Score ALL prospects (no data loss!)
    const allProspects: any[] = [];
    const seenDomains = new Set<string>();
    const batchId = randomUUID();
    let autoApproved = 0;
    let needsReview = 0;
    let autoRejected = 0;
    const filterBreakdown: Record<string, number> = {};

    // Get existing domains (including deleted) to track duplicates
    const existingProspects = await db.query('SELECT domain FROM prospects WHERE deleted_at IS NULL');
    for (const row of existingProspects.rows) {
      seenDomains.add(row.domain.toLowerCase().replace('www.', ''));
    }

    let skippedBlocklist = 0;
    let skippedDuplicate = 0;
    let skippedExcludeSignal = 0;

    for (const row of result.rows) {
      const domain = (row.domain || '').toLowerCase().replace('www.', '');
      const text = `${row.keyword || ''} ${row.title || ''}`;

      // HARD FILTER: Skip blocklisted domains entirely (competitors, spam, etc.)
      if (isDomainExcluded(domain)) {
        skippedBlocklist++;
        filterBreakdown['domain_blocklist'] = (filterBreakdown['domain_blocklist'] || 0) + 1;
        continue;
      }

      // HARD FILTER: Skip duplicates entirely
      if (seenDomains.has(domain)) {
        skippedDuplicate++;
        filterBreakdown['duplicate_domain'] = (filterBreakdown['duplicate_domain'] || 0) + 1;
        continue;
      }

      // Score the prospect
      const filterReasons: string[] = [];
      let qualityScore = scoreProspect(row);

      // Soft penalties (reduce score but still include)
      if (hasExcludeSignal(text)) {
        filterReasons.push('exclude_keywords');
        qualityScore -= 30;
        skippedExcludeSignal++;
      }
      if (!hasHealthSignal(text)) {
        filterReasons.push('no_health_keywords');
        qualityScore -= 25;
      }

      // Ensure score is 0-100
      qualityScore = Math.max(0, Math.min(100, qualityScore));

      // Categorize based on final score
      let filterStatus: 'auto_approved' | 'needs_review' | 'auto_rejected';
      if (qualityScore >= 70) {
        filterStatus = 'auto_approved';
        autoApproved++;
      } else if (qualityScore >= 30) {
        filterStatus = 'needs_review';
        needsReview++;
      } else {
        filterStatus = 'auto_rejected';
        autoRejected++;
      }

      // Track filter reasons
      filterReasons.forEach(reason => {
        filterBreakdown[reason] = (filterBreakdown[reason] || 0) + 1;
      });

      seenDomains.add(domain);

      allProspects.push({
        url: row.url,
        domain: domain,
        title: row.title || '',
        keyword: row.keyword || '',
        position: row.position,
        score: qualityScore,
        filterStatus: filterStatus,
        filterReasons: filterReasons,
      });

      // Stop once we have enough viable prospects
      if (allProspects.length >= maxResults) break;
    }

    logger.info(`Research citations filtering: ${result.rows.length} fetched from DB, ${skippedBlocklist} blocklisted, ${skippedDuplicate} duplicates, ${allProspects.length} viable`);

    // Sort by score (best first)
    allProspects.sort((a, b) => b.score - a.score);

    // Get or create campaign
    let campaignId: string;
    const existingCampaign = await db.query(
      "SELECT id FROM campaigns WHERE name = 'EMF Research Outreach'"
    );
    if (existingCampaign.rows.length > 0) {
      campaignId = existingCampaign.rows[0].id;
    } else {
      const newCampaign = await db.query(`
        INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
        VALUES ('EMF Research Outreach', 'Filtered prospects from SEO Command Center', 'active', 'research_citation', NOW())
        RETURNING id
      `);
      campaignId = newCampaign.rows[0].id;
    }

    // Import queue once
    const { contactFinderQueue } = await import('../../config/queues.js');

    // Insert ALL prospects with filter status (no limit!)
    let inserted = 0;
    const queueJobs: Array<{ prospectId: string; url: string; domain: string }> = [];

    for (const prospect of allProspects) {
      try {
        // Find matching SYB article based on keyword + title context
        const articleMatch = await findMatchingArticle(
          prospect.keyword || '',
          prospect.url || '',
          prospect.title
        );

        // Boost score if we found a good article match
        let finalScore = prospect.score;
        if (articleMatch) finalScore = Math.min(100, finalScore + 10);

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, quality_score,
            filter_status, filter_reasons, filter_score,
            suggested_article_url, suggested_article_title, match_reason,
            opportunity_type, source, status, campaign_id, approval_status, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'research_citation', 'seo_command_center', 'new', $11, 'pending', NOW())
          ON CONFLICT (url) DO UPDATE SET
            quality_score = GREATEST(prospects.quality_score, EXCLUDED.quality_score),
            filter_reasons = array_cat(prospects.filter_reasons, EXCLUDED.filter_reasons),
            filter_score = GREATEST(prospects.filter_score, EXCLUDED.filter_score),
            suggested_article_url = COALESCE(EXCLUDED.suggested_article_url, prospects.suggested_article_url),
            suggested_article_title = COALESCE(EXCLUDED.suggested_article_title, prospects.suggested_article_title),
            match_reason = COALESCE(EXCLUDED.match_reason, prospects.match_reason),
            updated_at = NOW()
          RETURNING id
        `, [
          prospect.url,
          prospect.domain,
          prospect.title,
          finalScore,
          prospect.filterStatus,
          prospect.filterReasons,
          finalScore,
          articleMatch?.article.url || null,
          articleMatch?.article.title || null,
          articleMatch?.reason || null,
          campaignId
        ]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Only queue auto-approved and needs-review for contact finding
          if (prospect.filterStatus === 'auto_approved' || prospect.filterStatus === 'needs_review') {
            queueJobs.push({
              prospectId,
              url: prospect.url,
              domain: prospect.domain,
            });
          }

          inserted++;
        }
      } catch (error) {
        logger.debug('Error inserting prospect:', error);
      }
    }

    // Batch queue all contact finder jobs (fast, non-blocking)
    if (queueJobs.length > 0) {
      await contactFinderQueue.addBulk(
        queueJobs.map(job => ({
          name: 'find-contact',
          data: job,
        }))
      );
    }

    // Log filter summary for analytics
    await db.query(`
      INSERT INTO prospect_filter_log (
        batch_id, fetch_type, total_found, auto_approved, needs_review, auto_rejected, filter_breakdown
      )
      VALUES ($1, 'research_citations', $2, $3, $4, $5, $6)
    `, [batchId, allProspects.length, autoApproved, needsReview, autoRejected, JSON.stringify(filterBreakdown)]);

    // Status will be updated by contact-finder worker when real contacts are found

    res.json({
      success: true,
      message: `Saved ${inserted} prospects (${autoApproved} auto-approved, ${needsReview} need review, ${autoRejected} auto-rejected). Skipped ${skippedBlocklist} blocklisted, ${skippedDuplicate} duplicates. Contact finder queued for ${queueJobs.length} prospects.`,
      batch_id: batchId,
      total_from_db: result.rows.length,
      skipped_blocklist: skippedBlocklist,
      skipped_duplicate: skippedDuplicate,
      viable_prospects: allProspects.length,
      inserted: inserted,
      auto_approved: autoApproved,
      needs_review: needsReview,
      auto_rejected: autoRejected,
      filter_breakdown: filterBreakdown,
      campaign_id: campaignId,
      queued_for_contact_finding: queueJobs.length,
    });
  } catch (error) {
    logger.error('Error fetching research citations:', error);
    res.status(500).json({ error: 'Failed to fetch research citations' });
  }
});

// POST /api/v1/data-fetch/broken-links - Fetch broken backlinks via DataForSEO
router.post('/broken-links', async (req: Request, res: Response) => {
  try {
    const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
    const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      res.status(400).json({ error: 'DataForSEO credentials not configured' });
      return;
    }

    const {
      minDA = 15,
      maxDA = 100,
      limit = 50,
      competitors: rawCompetitors = [],
      dofollow = true,
    } = req.body;

    // If no competitors specified, auto-research a broad set of EMF niche sites
    const EMF_NICHE_TARGETS = [
      // Direct competitors
      'defendershield.com', 'safesleevecases.com', 'airestech.com', 'emfharmony.com', 'lessemf.com',
      // EMF info sites
      'electricsense.com', 'emfanalysis.com',
      // Health/wellness sites with EMF content
      'draxe.com', 'mercola.com', 'wellnessmama.com',
      // Additional EMF niche
      'saferemf.com', 'emfwise.com', 'nontoxicliving.tips', 'buildingbiology.org',
    ];

    const competitors = rawCompetitors.length > 0 ? rawCompetitors : EMF_NICHE_TARGETS;

    const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

    logger.info('Fetching broken backlinks from DataForSEO...', {
      minDA, maxDA, limit, competitors, dofollow
    });

    const allResults: any[] = [];
    const seenDomains = new Set<string>();
    const batchId = randomUUID();
    let autoApproved = 0;
    let needsReview = 0;
    let autoRejected = 0;
    const filterBreakdown: Record<string, number> = {};

    // Get existing domains (including deleted)
    const existingProspects = await db.query('SELECT domain FROM prospects WHERE deleted_at IS NULL');
    for (const row of existingProspects.rows) {
      seenDomains.add(row.domain.toLowerCase());
    }

    for (const competitor of competitors) {
      // Log the request
      const logId = await apiLogRepository.log({
        service: 'dataforseo',
        endpoint: 'backlinks/broken_backlinks/live',
        method: 'POST',
        requestBody: { target: competitor },
        success: false,
      });

      try {
        // Build filters based on parameters
        // User provides DA on 0-100 scale; DataForSEO rank is 0-1000, so multiply by 10
        const filters: any[] = [];
        if (dofollow) {
          filters.push(['dofollow', '=', true]);
          filters.push('and');
        }
        filters.push(['rank', '>=', minDA * 10]);
        if (maxDA < 100) {
          filters.push('and');
          filters.push(['rank', '<=', maxDA * 10]);
        }

        // Use regular backlinks endpoint (broken_backlinks not available on all accounts)
        const response = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${AUTH}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{
            target: competitor,
            limit: limit,
            order_by: ['rank,desc'],
            filters: filters.length > 0 ? filters : undefined,
          }]),
        });

        const data = await response.json() as {
          status_code?: number;
          cost?: number;
          tasks?: Array<{ result?: Array<{ items?: any[] }> }>;
        };

        await apiLogRepository.update(logId, {
          statusCode: response.status,
          responseBody: data as Record<string, unknown>,
          success: data.status_code === 20000,
          cost: data.cost || 0,
        });

        if (data.status_code === 20000) {
          const items = data.tasks?.[0]?.result?.[0]?.items || [];

          for (const item of items) {
            // DataForSEO uses domain_from for the referring domain
            const referringDomain = (item.domain_from || '').toLowerCase().replace(/^www\./, '');
            const competitorDomain = competitor.toLowerCase().replace(/^www\./, '');

            // HARD FILTER: Skip the competitor's own domain (internal links are useless)
            if (referringDomain === competitorDomain || referringDomain.endsWith('.' + competitorDomain)) {
              filterBreakdown['competitor_internal'] = (filterBreakdown['competitor_internal'] || 0) + 1;
              continue;
            }

            // HARD FILTER: Skip already-seen domains
            if (seenDomains.has(referringDomain)) {
              filterBreakdown['duplicate_domain'] = (filterBreakdown['duplicate_domain'] || 0) + 1;
              continue;
            }

            // HARD FILTER: Skip blocklisted domains (edu, gov, competitors, social media, etc.)
            if (isDomainExcluded(referringDomain)) {
              filterBreakdown['domain_blocklist'] = (filterBreakdown['domain_blocklist'] || 0) + 1;
              continue;
            }

            // HARD FILTER: Skip spam domains
            if (referringDomain.includes('shareasale') ||
                referringDomain.includes('klaviyo') ||
                referringDomain.includes('mailchimp') ||
                referringDomain.includes('myshopify')) {
              filterBreakdown['spam_domain'] = (filterBreakdown['spam_domain'] || 0) + 1;
              continue;
            }

            // --- Score the viable prospect ---
            const filterReasons: string[] = [];
            const normalizedDA = normalizeRankToDA(item.rank);
            // Base: DA contributes up to 50 points
            let qualityScore = Math.min(normalizedDA, 50);

            // Dofollow bonus (+15)
            if (item.dofollow) qualityScore += 15;

            // Anchor text / page title relevance to health/EMF (+20 if present, -25 penalty if absent)
            // Pages must be talking about EMF/health topics to be worth outreach
            const textContext = `${item.anchor || ''} ${item.page_from_title || ''} ${item.url_from || ''}`;
            if (hasHealthSignal(textContext)) {
              qualityScore += 20;
            } else {
              qualityScore -= 25;
              filterReasons.push('no_health_keywords');
            }

            // Preferred domain type bonus (+10)
            if (isPreferredDomain(referringDomain)) qualityScore += 10;

            // Blog signal bonus (+5)
            if (referringDomain.includes('blog') || textContext.toLowerCase().includes('blog')) qualityScore += 5;

            qualityScore = Math.max(0, Math.min(100, qualityScore));

            // Categorize
            let filterStatus: 'auto_approved' | 'needs_review' | 'auto_rejected';
            if (qualityScore >= 60) {
              filterStatus = 'auto_approved';
              autoApproved++;
            } else if (qualityScore >= 25) {
              filterStatus = 'needs_review';
              needsReview++;
            } else {
              filterStatus = 'auto_rejected';
              autoRejected++;
            }

            // Track filter reasons
            filterReasons.forEach(reason => {
              filterBreakdown[reason] = (filterBreakdown[reason] || 0) + 1;
            });

            seenDomains.add(referringDomain);

            // Get the target URL on competitor site
            const targetUrl = item.url_to || `https://${competitor}`;

            allResults.push({
              referringPageUrl: item.url_from,
              referringDomain: referringDomain,
              brokenUrl: targetUrl,  // The competitor page being linked to
              anchorText: item.anchor || '',
              domainRank: normalizedDA,
              pageTitle: item.page_from_title || '',
              pageAuthority: normalizeRankToDA(item.page_from_rank),
              isDofollow: item.dofollow ?? null,
              firstSeen: item.first_seen || null,
              lastSeen: item.last_seen || null,
              qualityScore: qualityScore,
              filterStatus: filterStatus,
              filterReasons: filterReasons,
            });
          }
        }
      } catch (error: any) {
        await apiLogRepository.update(logId, {
          success: false,
          errorMessage: error.message,
        });
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));
    }

    // Sort by quality score (best first)
    allResults.sort((a, b) => b.qualityScore - a.qualityScore);

    // Get or create campaign
    let campaignId: string;
    const existingCampaign = await db.query(
      "SELECT id FROM campaigns WHERE name = 'Broken Link Outreach'"
    );
    if (existingCampaign.rows.length > 0) {
      campaignId = existingCampaign.rows[0].id;
    } else {
      const newCampaign = await db.query(`
        INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
        VALUES ('Broken Link Outreach', 'Sites with broken outbound links to competitors', 'active', 'broken_link', NOW())
        RETURNING id
      `);
      campaignId = newCampaign.rows[0].id;
    }

    // Insert ALL prospects with article recommendations (no limit!)
    let inserted = 0;
    const queueJobs: Array<{ prospectId: string; url: string; domain: string }> = [];

    for (const link of allResults) {
      try {
        // Find matching SYB article for this broken link
        const articleMatch = await findMatchingArticle(
          link.anchorText || '',
          link.brokenUrl || '',
          link.pageTitle
        );

        // Boost score if we found a matching SYB article
        let finalScore = link.qualityScore;
        if (articleMatch) finalScore = Math.min(100, finalScore + 10);

        const description = `BROKEN LINK OPPORTUNITY
Broken URL: ${link.brokenUrl}
Anchor text: "${link.anchorText}"
Page title: ${link.pageTitle || 'N/A'}
${articleMatch ? `\nSuggested replacement: ${articleMatch.article.title}\nMatch reason: ${articleMatch.reason}` : ''}`;

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, description, domain_authority, quality_score,
            filter_status, filter_reasons, filter_score,
            broken_url, outbound_link_context,
            page_authority, is_dofollow, first_seen, last_seen,
            opportunity_type, source, status, campaign_id, approval_status,
            suggested_article_url, suggested_article_title, match_reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'broken_link', 'dataforseo_broken', 'new', $16, 'pending', $17, $18, $19, NOW())
          ON CONFLICT (url) DO UPDATE SET
            quality_score = GREATEST(prospects.quality_score, EXCLUDED.quality_score),
            filter_reasons = array_cat(prospects.filter_reasons, EXCLUDED.filter_reasons),
            filter_score = GREATEST(prospects.filter_score, EXCLUDED.filter_score),
            broken_url = COALESCE(EXCLUDED.broken_url, prospects.broken_url),
            outbound_link_context = COALESCE(EXCLUDED.outbound_link_context, prospects.outbound_link_context),
            page_authority = COALESCE(EXCLUDED.page_authority, prospects.page_authority),
            is_dofollow = COALESCE(EXCLUDED.is_dofollow, prospects.is_dofollow),
            first_seen = COALESCE(EXCLUDED.first_seen, prospects.first_seen),
            last_seen = COALESCE(EXCLUDED.last_seen, prospects.last_seen),
            updated_at = NOW()
          RETURNING id
        `, [
          link.referringPageUrl,
          link.referringDomain,
          link.pageTitle || `Broken link: ${link.anchorText}`,
          description,
          link.domainRank,
          finalScore,
          link.filterStatus,
          link.filterReasons,
          finalScore,
          link.brokenUrl || null,
          link.anchorText || null,
          link.pageAuthority,
          link.isDofollow,
          link.firstSeen,
          link.lastSeen,
          campaignId,
          articleMatch?.article.url || null,
          articleMatch?.article.title || null,
          articleMatch?.reason || null,
        ]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Only queue auto-approved and needs-review for contact finding
          if (link.filterStatus === 'auto_approved' || link.filterStatus === 'needs_review') {
            queueJobs.push({
              prospectId,
              url: link.referringPageUrl,
              domain: link.referringDomain,
            });
          }

          inserted++;
        }
      } catch (error) {
        logger.debug('Error inserting prospect:', error);
      }
    }

    // Batch queue contact finder jobs
    if (queueJobs.length > 0) {
      const { contactFinderQueue } = await import('../../config/queues.js');
      await contactFinderQueue.addBulk(
        queueJobs.map(job => ({
          name: 'find-contact',
          data: job,
        }))
      );
    }

    // Log filter summary
    await db.query(`
      INSERT INTO prospect_filter_log (
        batch_id, fetch_type, total_found, auto_approved, needs_review, auto_rejected, filter_breakdown
      )
      VALUES ($1, 'broken_links', $2, $3, $4, $5, $6)
    `, [batchId, allResults.length, autoApproved, needsReview, autoRejected, JSON.stringify(filterBreakdown)]);

    // Status will be updated by contact-finder worker when real contacts are found

    res.json({
      success: true,
      message: `Saved ${inserted} prospects (${autoApproved} auto-approved, ${needsReview} need review, ${autoRejected} auto-rejected). Contact finder queued for ${queueJobs.length} prospects.`,
      batch_id: batchId,
      total_found: allResults.length,
      inserted: inserted,
      auto_approved: autoApproved,
      needs_review: needsReview,
      auto_rejected: autoRejected,
      filter_breakdown: filterBreakdown,
      campaign_id: campaignId,
      competitors_checked: competitors.length,
      queued_for_contact_finding: queueJobs.length,
    });
  } catch (error) {
    logger.error('Error fetching broken links:', error);
    res.status(500).json({ error: 'Failed to fetch broken links' });
  }
});

// POST /api/v1/data-fetch/backlinks-to-url - Find pages linking to specific broken URLs
router.post('/backlinks-to-url', async (req: Request, res: Response) => {
  try {
    const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
    const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD;

    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      res.status(400).json({ error: 'DataForSEO credentials not configured' });
      return;
    }

    const {
      brokenUrls = [],
      minDA = 15,
      maxDA = 100,
      limit = 50,
      dofollow = true,
    } = req.body;

    if (!brokenUrls || brokenUrls.length === 0) {
      res.status(400).json({ error: 'Please provide at least one URL to check' });
      return;
    }

    const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

    logger.info('Finding backlinks to specific broken URLs...', {
      urls: brokenUrls, minDA, maxDA, limit, dofollow
    });

    const allResults: any[] = [];
    const seenDomains = new Set<string>();
    const urlStatuses: Array<{ url: string; isBroken: boolean; statusCode: number; backlinksFound: number }> = [];
    const batchId = randomUUID();
    let autoApproved = 0;
    let needsReview = 0;
    let autoRejected = 0;
    const filterBreakdown: Record<string, number> = {};

    // Get existing domains (including deleted)
    const existingProspects = await db.query('SELECT domain FROM prospects WHERE deleted_at IS NULL');
    for (const row of existingProspects.rows) {
      seenDomains.add(row.domain.toLowerCase());
    }

    for (const targetUrl of brokenUrls) {
      // Step 1: Verify the URL is actually broken
      let isBroken = false;
      let statusCode = 0;

      try {
        const checkResponse = await fetch(targetUrl, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        });
        statusCode = checkResponse.status;
        isBroken = checkResponse.status >= 400;
      } catch (error: any) {
        // Network error or timeout - treat as potentially broken
        isBroken = true;
        statusCode = 0;
        logger.warn(`Could not reach ${targetUrl}: ${error.message}`);
      }

      // Step 2: Find backlinks to this URL using DataForSEO
      const logId = await apiLogRepository.log({
        service: 'dataforseo',
        endpoint: 'backlinks/backlinks/live',
        method: 'POST',
        requestBody: { target: targetUrl },
        success: false,
      });

      let backlinksFound = 0;

      try {
        // Build filters
        // User provides DA on 0-100 scale; DataForSEO rank is 0-1000, so multiply by 10
        const filters: any[] = [];
        if (dofollow) {
          filters.push(['dofollow', '=', true]);
          filters.push('and');
        }
        filters.push(['rank', '>=', minDA * 10]);
        if (maxDA < 100) {
          filters.push('and');
          filters.push(['rank', '<=', maxDA * 10]);
        }

        const response = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${AUTH}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([{
            target: targetUrl,
            limit: limit,
            order_by: ['rank,desc'],
            filters: filters.length > 0 ? filters : undefined,
          }]),
        });

        const data = await response.json() as {
          status_code?: number;
          cost?: number;
          tasks?: Array<{ result?: Array<{ items?: any[] }> }>;
        };

        await apiLogRepository.update(logId, {
          statusCode: response.status,
          responseBody: data as Record<string, unknown>,
          success: data.status_code === 20000,
          cost: data.cost || 0,
        });

        if (data.status_code === 20000) {
          const items = data.tasks?.[0]?.result?.[0]?.items || [];
          backlinksFound = items.length;

          // Extract domain from the target URL to skip internal links
          let targetDomain = '';
          try {
            targetDomain = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, '');
          } catch { /* ignore parse errors */ }

          for (const item of items) {
            const referringDomain = (item.main_domain || item.referring_main_domain || '').toLowerCase();

            // HARD FILTER: Skip if referring domain IS the target domain (internal links)
            if (targetDomain && (referringDomain === targetDomain || referringDomain.endsWith('.' + targetDomain))) {
              filterBreakdown['target_internal'] = (filterBreakdown['target_internal'] || 0) + 1;
              continue;
            }

            // HARD FILTER: Skip already-seen domains
            if (seenDomains.has(referringDomain)) {
              filterBreakdown['duplicate_domain'] = (filterBreakdown['duplicate_domain'] || 0) + 1;
              continue;
            }

            // HARD FILTER: Skip blocklisted domains
            if (isDomainExcluded(referringDomain)) {
              filterBreakdown['domain_blocklist'] = (filterBreakdown['domain_blocklist'] || 0) + 1;
              continue;
            }

            // --- Score the viable prospect ---
            const filterReasons: string[] = [];
            const normalizedDA = normalizeRankToDA(item.rank || item.domain_rank);
            // Base: DA contributes up to 50 points
            let qualityScore = Math.min(normalizedDA, 50);

            // Verified broken bonus (+15)
            if (isBroken) {
              qualityScore += 15;
            } else {
              filterReasons.push('unverified_broken_status');
            }

            // Dofollow bonus (+15)
            if (item.dofollow) qualityScore += 15;

            // Anchor text / page title relevance (+20 if present, -25 penalty if absent)
            // Pages must be talking about EMF/health topics to be worth outreach
            const textContext = `${item.anchor || ''} ${item.page_from_title || item.referring_page_title || ''} ${item.url_from || item.referring_page || ''}`;
            if (hasHealthSignal(textContext)) {
              qualityScore += 20;
            } else {
              qualityScore -= 25;
              filterReasons.push('no_health_keywords');
            }

            // Preferred domain type bonus (+10)
            if (isPreferredDomain(referringDomain)) qualityScore += 10;

            qualityScore = Math.max(0, Math.min(100, qualityScore));

            // Categorize
            let filterStatus: 'auto_approved' | 'needs_review' | 'auto_rejected';
            if (qualityScore >= 60) {
              filterStatus = 'auto_approved';
              autoApproved++;
            } else if (qualityScore >= 25) {
              filterStatus = 'needs_review';
              needsReview++;
            } else {
              filterStatus = 'auto_rejected';
              autoRejected++;
            }

            // Track filter reasons
            filterReasons.forEach(reason => {
              filterBreakdown[reason] = (filterBreakdown[reason] || 0) + 1;
            });

            seenDomains.add(referringDomain);
            allResults.push({
              referringPageUrl: item.url_from || item.referring_page,
              referringDomain: referringDomain,
              brokenUrl: targetUrl,
              anchorText: item.anchor || '',
              domainRank: normalizedDA,
              pageTitle: item.page_from_title || item.referring_page_title || '',
              pageAuthority: normalizeRankToDA(item.page_from_rank),
              isDofollow: item.dofollow ?? null,
              firstSeen: item.first_seen || null,
              lastSeen: item.last_seen || null,
              isBroken: isBroken,
              qualityScore: qualityScore,
              filterStatus: filterStatus,
              filterReasons: filterReasons,
            });
          }
        }
      } catch (error: any) {
        await apiLogRepository.update(logId, {
          success: false,
          errorMessage: error.message,
        });
        logger.error(`Error fetching backlinks for ${targetUrl}:`, error);
      }

      urlStatuses.push({
        url: targetUrl,
        isBroken,
        statusCode,
        backlinksFound,
      });

      // Rate limit between requests
      await new Promise(r => setTimeout(r, 1000));
    }

    // Sort by quality score (best first)
    allResults.sort((a, b) => b.qualityScore - a.qualityScore);

    // Get or create campaign
    let campaignId: string;
    const existingCampaign = await db.query(
      "SELECT id FROM campaigns WHERE name = 'Broken Link Outreach'"
    );
    if (existingCampaign.rows.length > 0) {
      campaignId = existingCampaign.rows[0].id;
    } else {
      const newCampaign = await db.query(`
        INSERT INTO campaigns (name, description, status, opportunity_type, created_at)
        VALUES ('Broken Link Outreach', 'Sites with broken outbound links to competitors', 'active', 'broken_link', NOW())
        RETURNING id
      `);
      campaignId = newCampaign.rows[0].id;
    }

    // Insert ALL prospects with article recommendations (no limit!)
    let inserted = 0;
    const queueJobs: Array<{ prospectId: string; url: string; domain: string }> = [];

    for (const link of allResults) {
      try {
        // Find matching SYB article for this broken link
        const articleMatch = await findMatchingArticle(
          link.anchorText || '',
          link.brokenUrl || '',
          link.pageTitle
        );

        // Boost score if we found a matching SYB article
        let finalScore = link.qualityScore;
        if (articleMatch) finalScore = Math.min(100, finalScore + 10);

        const brokenStatus = link.isBroken ? 'VERIFIED BROKEN' : 'NOT VERIFIED';

        // Clear, structured description
        const description = JSON.stringify({
          opportunity_type: 'broken_link',
          referring_page: {
            url: link.referringPageUrl,
            title: link.pageTitle || 'Unknown',
            domain: link.referringDomain,
            domain_authority: link.domainRank,
          },
          broken_link_details: {
            broken_url: link.brokenUrl,
            anchor_text: link.anchorText || 'No anchor text',
            status_code: link.isBroken ? 404 : 0,
            verified: link.isBroken,
            verified_at: new Date().toISOString(),
          },
          replacement_suggestion: articleMatch ? {
            article_url: articleMatch.article.url,
            article_title: articleMatch.article.title,
            match_reason: articleMatch.reason,
          } : null,
        }, null, 2);

        const humanReadableTitle = `${link.pageTitle || link.referringDomain} → Broken: "${link.anchorText || link.brokenUrl}"`;

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, description, domain_authority, quality_score,
            filter_status, filter_reasons, filter_score,
            broken_url, broken_url_status_code, broken_url_verified_at,
            outbound_link_context,
            page_authority, is_dofollow, first_seen, last_seen,
            opportunity_type, source, status, campaign_id, approval_status,
            suggested_article_url, suggested_article_title, match_reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'broken_link', 'dataforseo_verified', 'new', $18, 'pending', $19, $20, $21, NOW())
          ON CONFLICT (url) DO UPDATE SET
            quality_score = GREATEST(prospects.quality_score, EXCLUDED.quality_score),
            filter_reasons = array_cat(prospects.filter_reasons, EXCLUDED.filter_reasons),
            filter_score = GREATEST(prospects.filter_score, EXCLUDED.filter_score),
            broken_url = EXCLUDED.broken_url,
            broken_url_status_code = EXCLUDED.broken_url_status_code,
            broken_url_verified_at = EXCLUDED.broken_url_verified_at,
            page_authority = COALESCE(EXCLUDED.page_authority, prospects.page_authority),
            is_dofollow = COALESCE(EXCLUDED.is_dofollow, prospects.is_dofollow),
            first_seen = COALESCE(EXCLUDED.first_seen, prospects.first_seen),
            last_seen = COALESCE(EXCLUDED.last_seen, prospects.last_seen),
            updated_at = NOW()
          RETURNING id
        `, [
          link.referringPageUrl,           // Where the broken link is
          link.referringDomain,            // Domain of referring page
          humanReadableTitle,              // Clear title
          description,                     // Structured JSON data
          link.domainRank,
          finalScore,
          link.filterStatus,
          link.filterReasons,
          finalScore,
          link.brokenUrl,                  // The actual broken URL
          link.isBroken ? 404 : 0,        // HTTP status code
          new Date(),                      // When verified
          link.anchorText,                 // Anchor text context
          link.pageAuthority,
          link.isDofollow,
          link.firstSeen,
          link.lastSeen,
          campaignId,
          articleMatch?.article.url || null,
          articleMatch?.article.title || null,
          articleMatch?.reason || null,
        ]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Only queue auto-approved and needs-review for contact finding
          if (link.filterStatus === 'auto_approved' || link.filterStatus === 'needs_review') {
            queueJobs.push({
              prospectId,
              url: link.referringPageUrl,
              domain: link.referringDomain,
            });
          }

          inserted++;
        }
      } catch (error) {
        logger.debug('Error inserting prospect:', error);
      }
    }

    // Batch queue contact finder jobs
    if (queueJobs.length > 0) {
      const { contactFinderQueue } = await import('../../config/queues.js');
      await contactFinderQueue.addBulk(
        queueJobs.map(job => ({
          name: 'find-contact',
          data: job,
        }))
      );
    }

    // Log filter summary
    await db.query(`
      INSERT INTO prospect_filter_log (
        batch_id, fetch_type, total_found, auto_approved, needs_review, auto_rejected, filter_breakdown
      )
      VALUES ($1, 'backlinks_to_url', $2, $3, $4, $5, $6)
    `, [batchId, allResults.length, autoApproved, needsReview, autoRejected, JSON.stringify(filterBreakdown)]);

    res.json({
      success: true,
      message: `Saved ${inserted} prospects (${autoApproved} auto-approved, ${needsReview} need review, ${autoRejected} auto-rejected). Contact finder queued for ${queueJobs.length} prospects.`,
      batch_id: batchId,
      total_found: allResults.length,
      inserted: inserted,
      auto_approved: autoApproved,
      needs_review: needsReview,
      auto_rejected: autoRejected,
      filter_breakdown: filterBreakdown,
      campaign_id: campaignId,
      url_statuses: urlStatuses,
      queued_for_contact_finding: queueJobs.length,
    });
  } catch (error) {
    logger.error('Error finding backlinks to URLs:', error);
    res.status(500).json({ error: 'Failed to find backlinks' });
  }
});

// POST /api/v1/data-fetch/find-contacts - Queue prospects for real contact finding
router.post('/find-contacts', async (req: Request, res: Response) => {
  try {
    const { prospect_ids, opportunity_type, limit = 20 } = req.body;

    let prospects: any[] = [];

    if (prospect_ids && Array.isArray(prospect_ids) && prospect_ids.length > 0) {
      // Find specific prospects
      const result = await db.query(
        'SELECT id, url, domain FROM prospects WHERE id = ANY($1::uuid[])',
        [prospect_ids]
      );
      prospects = result.rows;
    } else if (opportunity_type) {
      // Find prospects of a specific type that need contacts
      const result = await db.query(`
        SELECT p.id, p.url, p.domain
        FROM prospects p
        LEFT JOIN contacts c ON c.prospect_id = p.id AND c.source = 'scraped'
        WHERE p.opportunity_type = $1
        AND p.approval_status IN ('pending', 'approved')
        AND c.id IS NULL
        LIMIT $2
      `, [opportunity_type, limit]);
      prospects = result.rows;
    } else {
      // Find all prospects that need real contacts
      const result = await db.query(`
        SELECT p.id, p.url, p.domain
        FROM prospects p
        LEFT JOIN contacts c ON c.prospect_id = p.id AND c.source = 'scraped'
        WHERE p.approval_status IN ('pending', 'approved')
        AND c.id IS NULL
        LIMIT $1
      `, [limit]);
      prospects = result.rows;
    }

    if (prospects.length === 0) {
      res.json({
        success: true,
        message: 'No prospects need contact finding',
        queued: 0,
      });
      return;
    }

    // Queue each prospect for contact finding
    let queued = 0;
    for (const prospect of prospects) {
      await contactFinderQueue.add('find-contacts', {
        prospectId: prospect.id,
        url: prospect.url,
        domain: prospect.domain,
      });
      queued++;
    }

    logger.info(`Queued ${queued} prospects for contact finding`);

    res.json({
      success: true,
      message: `Queued ${queued} prospects for contact finding`,
      queued,
      note: 'Contact finder worker must be running to process the queue',
    });
  } catch (error) {
    logger.error('Error queuing contact finder:', error);
    res.status(500).json({ error: 'Failed to queue contact finding' });
  }
});

// POST /api/v1/data-fetch/backfill-articles - Re-run article matching on existing prospects
router.post('/backfill-articles', async (req: Request, res: Response) => {
  try {
    const { opportunity_type, limit = 200 } = req.body;

    let query = `
      SELECT id, url, domain, title, description, opportunity_type,
             outbound_link_context, broken_url
      FROM prospects
      WHERE deleted_at IS NULL
      AND suggested_article_url IS NULL
    `;
    const params: any[] = [];

    if (opportunity_type) {
      params.push(opportunity_type);
      query += ` AND opportunity_type = $${params.length}`;
    }

    params.push(Math.min(limit, 500));
    query += ` LIMIT $${params.length}`;

    const result = await db.query(query, params);
    logger.info(`Backfilling article matches for ${result.rows.length} prospects`);

    let updated = 0;
    for (const prospect of result.rows) {
      // Build matching inputs based on opportunity type
      let anchorText = '';
      let urlForMatching = '';

      if (prospect.opportunity_type === 'broken_link') {
        anchorText = prospect.outbound_link_context || '';
        urlForMatching = prospect.broken_url || prospect.url || '';
      } else {
        // research_citation: use URL + title for matching
        anchorText = '';
        urlForMatching = prospect.url || '';
      }

      const articleMatch = await findMatchingArticle(
        anchorText,
        urlForMatching,
        prospect.title
      );

      if (articleMatch) {
        await db.query(`
          UPDATE prospects
          SET suggested_article_url = $1,
              suggested_article_title = $2,
              match_reason = $3,
              quality_score = LEAST(100, COALESCE(quality_score, 0) + 10),
              updated_at = NOW()
          WHERE id = $4
        `, [
          articleMatch.article.url,
          articleMatch.article.title,
          articleMatch.reason,
          prospect.id,
        ]);
        updated++;
      }
    }

    res.json({
      success: true,
      message: `Backfilled article matches: ${updated}/${result.rows.length} prospects updated`,
      total_checked: result.rows.length,
      updated,
    });
  } catch (error) {
    logger.error('Error backfilling article matches:', error);
    res.status(500).json({ error: 'Failed to backfill article matches' });
  }
});

export default router;
