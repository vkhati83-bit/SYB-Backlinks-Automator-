import { Router, Request, Response } from 'express';
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
];

const PREFER_DOMAINS = [
  'blog', 'wellness', 'parent', 'mom', 'family', 'natural', 'holistic',
  'functional', 'integrative', 'lifestyle', 'living', 'mindful', 'organic',
  'eco', 'green', 'detox', 'emf', 'radiation', 'safety',
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

    const result = await seoDb.query(query, params);

    // Filter and score
    const filtered: any[] = [];
    const seenDomains = new Set<string>();

    // Get existing domains to skip
    const existingProspects = await db.query('SELECT domain FROM prospects');
    for (const row of existingProspects.rows) {
      seenDomains.add(row.domain.toLowerCase().replace('www.', ''));
    }

    for (const row of result.rows) {
      const domain = (row.domain || '').toLowerCase().replace('www.', '');
      const text = `${row.keyword || ''} ${row.title || ''}`;

      if (seenDomains.has(domain)) continue;
      if (isDomainExcluded(domain)) continue;
      if (hasExcludeSignal(text)) continue;
      if (!hasHealthSignal(text)) continue;

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

    // Sort by score
    filtered.sort((a, b) => b.score - a.score);

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

    // Insert prospects
    let inserted = 0;
    const queueJobs: Array<{ prospectId: string; url: string; domain: string }> = [];

    for (const prospect of filtered.slice(0, limit)) {
      try {
        const qualityScore = Math.min(50 + prospect.score, 100);

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, quality_score,
            opportunity_type, source, status, campaign_id, approval_status, created_at
          )
          VALUES ($1, $2, $3, $4, 'research_citation', 'seo_command_center', 'new', $5, 'pending', NOW())
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `, [prospect.url, prospect.domain, prospect.title, qualityScore, campaignId]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Collect for batch queueing
          queueJobs.push({
            prospectId,
            url: prospect.url,
            domain: prospect.domain,
          });

          inserted++;
        }
      } catch (error) {
        // Skip duplicates
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

    // Status will be updated by contact-finder worker when real contacts are found

    res.json({
      success: true,
      message: `Fetched ${inserted} new research citation prospects. Contact finder queued for ${queueJobs.length} prospects.`,
      total_found: filtered.length,
      inserted: inserted,
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
      competitors = ['defendershield.com', 'safesleevecases.com', 'airestech.com'],
      dofollow = true,
    } = req.body;

    const AUTH = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');

    logger.info('Fetching broken backlinks from DataForSEO...', {
      minDA, maxDA, limit, competitors, dofollow
    });

    const allResults: any[] = [];
    const seenDomains = new Set<string>();

    // Get existing domains
    const existingProspects = await db.query('SELECT domain FROM prospects');
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
        const filters: any[] = [];
        if (dofollow) {
          filters.push(['dofollow', '=', true]);
          filters.push('and');
        }
        filters.push(['rank', '>=', minDA]);
        if (maxDA < 100) {
          filters.push('and');
          filters.push(['rank', '<=', maxDA]);
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

            if (seenDomains.has(referringDomain)) continue;
            if (isDomainExcluded(referringDomain)) continue;

            // Skip spam
            if (referringDomain.includes('shareasale') ||
                referringDomain.includes('klaviyo') ||
                referringDomain.includes('mailchimp') ||
                referringDomain.includes('myshopify')) continue;

            seenDomains.add(referringDomain);

            // Get the target URL on competitor site
            const targetUrl = item.url_to || `https://${competitor}`;

            allResults.push({
              referringPageUrl: item.url_from,
              referringDomain: referringDomain,
              brokenUrl: targetUrl,  // The competitor page being linked to
              anchorText: item.anchor || '',
              domainRank: item.rank || item.domain_from_rank || 0,
              pageTitle: item.page_from_title || '',
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

    // Sort by rank
    allResults.sort((a, b) => b.domainRank - a.domainRank);

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

    // Insert prospects with article recommendations
    let inserted = 0;
    for (const link of allResults.slice(0, 50)) {
      try {
        // Find matching SYB article for this broken link
        const articleMatch = await findMatchingArticle(
          link.anchorText || '',
          link.brokenUrl || '',
          link.pageTitle
        );

        const qualityScore = Math.min(50 + link.domainRank * 0.5, 100);
        const description = `BROKEN LINK OPPORTUNITY
Broken URL: ${link.brokenUrl}
Anchor text: "${link.anchorText}"
Page title: ${link.pageTitle || 'N/A'}
${articleMatch ? `\nSuggested replacement: ${articleMatch.article.title}\nMatch reason: ${articleMatch.reason}` : ''}`;

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, description, domain_authority, quality_score,
            opportunity_type, source, status, campaign_id, approval_status,
            suggested_article_url, suggested_article_title, match_reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'broken_link', 'dataforseo_broken', 'new', $7, 'pending', $8, $9, $10, NOW())
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `, [
          link.referringPageUrl,
          link.referringDomain,
          link.pageTitle || `Broken link: ${link.anchorText}`,
          description,
          link.domainRank,
          qualityScore,
          campaignId,
          articleMatch?.article.url || null,
          articleMatch?.article.title || null,
          articleMatch?.reason || null,
        ]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Queue contact finder to scrape website for REAL contacts
          const { contactFinderQueue } = await import('../../config/queues.js');
          await contactFinderQueue.add('find-contact', {
            prospectId,
            url: link.referringPageUrl,
            domain: link.referringDomain,
          });

          inserted++;
        }
      } catch (error) {
        // Skip duplicates
        logger.debug('Error inserting prospect:', error);
      }
    }

    // Status will be updated by contact-finder worker when real contacts are found

    res.json({
      success: true,
      message: `Fetched ${inserted} new broken link prospects`,
      total_found: allResults.length,
      inserted: inserted,
      campaign_id: campaignId,
      competitors_checked: competitors.length,
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

    // Get existing domains
    const existingProspects = await db.query('SELECT domain FROM prospects');
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
        const filters: any[] = [];
        if (dofollow) {
          filters.push(['dofollow', '=', true]);
          filters.push('and');
        }
        filters.push(['rank', '>=', minDA]);
        if (maxDA < 100) {
          filters.push('and');
          filters.push(['rank', '<=', maxDA]);
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

          for (const item of items) {
            const referringDomain = (item.main_domain || item.referring_main_domain || '').toLowerCase();

            if (seenDomains.has(referringDomain)) continue;
            if (isDomainExcluded(referringDomain)) continue;

            seenDomains.add(referringDomain);
            allResults.push({
              referringPageUrl: item.url_from || item.referring_page,
              referringDomain: referringDomain,
              brokenUrl: targetUrl,
              anchorText: item.anchor || '',
              domainRank: item.rank || item.domain_rank || 0,
              pageTitle: item.page_from_title || item.referring_page_title || '',
              isBroken: isBroken,
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

    // Sort by rank
    allResults.sort((a, b) => b.domainRank - a.domainRank);

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

    // Insert prospects with article recommendations
    let inserted = 0;
    for (const link of allResults.slice(0, 100)) {
      try {
        // Find matching SYB article for this broken link
        const articleMatch = await findMatchingArticle(
          link.anchorText || '',
          link.brokenUrl || '',
          link.pageTitle
        );

        const qualityScore = Math.min(50 + link.domainRank * 0.5, 100);
        const brokenStatus = link.isBroken ? 'CONFIRMED BROKEN' : 'LINK STATUS UNKNOWN';
        const description = `BROKEN LINK OPPORTUNITY (${brokenStatus})
Broken URL: ${link.brokenUrl}
Anchor text: "${link.anchorText}"
Page title: ${link.pageTitle || 'N/A'}
${articleMatch ? `\nSuggested replacement: ${articleMatch.article.title}\nMatch reason: ${articleMatch.reason}` : ''}`;

        const result = await db.query(`
          INSERT INTO prospects (
            url, domain, title, description, domain_authority, quality_score,
            opportunity_type, source, status, campaign_id, approval_status,
            suggested_article_url, suggested_article_title, match_reason, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'broken_link', 'dataforseo_specific', 'new', $7, 'pending', $8, $9, $10, NOW())
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `, [
          link.referringPageUrl,
          link.referringDomain,
          link.pageTitle || `Links to broken: ${link.anchorText}`,
          description,
          link.domainRank,
          qualityScore,
          campaignId,
          articleMatch?.article.url || null,
          articleMatch?.article.title || null,
          articleMatch?.reason || null,
        ]);

        if (result.rows.length > 0) {
          const prospectId = result.rows[0].id;

          // Queue contact finder to scrape website for REAL contacts
          const { contactFinderQueue } = await import('../../config/queues.js');
          await contactFinderQueue.add('find-contact', {
            prospectId,
            url: link.referringPageUrl,
            domain: link.referringDomain,
          });

          inserted++;
        }
      } catch (error) {
        // Skip duplicates
        logger.debug('Error inserting prospect:', error);
      }
    }

    res.json({
      success: true,
      message: `Found ${allResults.length} pages linking to ${brokenUrls.length} URLs, ${inserted} new prospects added`,
      total_found: allResults.length,
      inserted: inserted,
      campaign_id: campaignId,
      url_statuses: urlStatuses,
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

export default router;
