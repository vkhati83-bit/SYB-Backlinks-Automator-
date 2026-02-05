import { seoQuery } from '../db/index.js';
import logger from '../utils/logger.js';

// Types for SEO Command Center data
export interface BrokenBacklink {
  id: number;
  competitor_id: number;
  broken_url: string;
  broken_url_title: string | null;
  referring_page_url: string;
  referring_domain: string;
  referring_domain_rank: number | null;
  anchor_text: string | null;
  is_dofollow: boolean;
  suggested_syb_url: string | null;
  outreach_status: string;
}

export interface CompetitorReferringDomain {
  id: number;
  competitor_domain: string;
  referring_domain: string;
  domain_rating: number | null;
  total_links: number;
  we_have_link: boolean;
  is_ignored: boolean;
}

export interface SerpResult {
  id: number;
  keyword: string;
  position: number;
  domain: string;
  url: string;
  title: string | null;
  is_our_domain: boolean;
}

export interface DomainMetrics {
  domain: string;
  domain_rating: number;
  backlinks_count: number;
  referring_domains_count: number;
}

// SEO Data Service - pulls data from SEO Command Center
export class SeoDataService {

  // Get broken backlinks from competitors (great for outreach)
  async getBrokenBacklinks(limit = 100, excludeContacted = true): Promise<BrokenBacklink[]> {
    const whereClause = excludeContacted
      ? "WHERE outreach_status = 'new' OR outreach_status IS NULL"
      : '';

    return seoQuery<BrokenBacklink>(`
      SELECT id, competitor_id, broken_url, broken_url_title,
             referring_page_url, referring_domain, referring_domain_rank,
             anchor_text, is_dofollow, suggested_syb_url, outreach_status
      FROM competitor_broken_backlinks
      ${whereClause}
      ORDER BY referring_domain_rank DESC NULLS LAST
      LIMIT $1
    `, [limit]);
  }

  // Get domains linking to competitors but not to us
  async getCompetitorReferringDomains(
    minDomainRating = 20,
    limit = 100
  ): Promise<CompetitorReferringDomain[]> {
    return seoQuery<CompetitorReferringDomain>(`
      SELECT id, competitor_domain, referring_domain, domain_rating,
             total_links, we_have_link, is_ignored
      FROM competitor_referring_domains
      WHERE we_have_link = FALSE
        AND is_ignored = FALSE
        AND domain_rating >= $1
      ORDER BY domain_rating DESC
      LIMIT $2
    `, [minDomainRating, limit]);
  }

  // Get sites ranking for EMF keywords (content-relevant prospects)
  async getEmfSerpResults(
    minPosition = 1,
    maxPosition = 50,
    limit = 100
  ): Promise<SerpResult[]> {
    return seoQuery<SerpResult>(`
      SELECT id, keyword, position, domain, url, title, is_our_domain
      FROM emf_serp_results
      WHERE is_our_domain = FALSE
        AND position >= $1
        AND position <= $2
      ORDER BY position ASC
      LIMIT $3
    `, [minPosition, maxPosition, limit]);
  }

  // Get domain metrics from cache
  async getDomainMetrics(domain: string): Promise<DomainMetrics | null> {
    const results = await seoQuery<DomainMetrics>(`
      SELECT domain, domain_rating, backlinks_count, referring_domains_count
      FROM domain_metrics_cache
      WHERE domain = $1
    `, [domain]);
    return results[0] || null;
  }

  // Get multiple domain metrics
  async getBulkDomainMetrics(domains: string[]): Promise<Map<string, DomainMetrics>> {
    if (domains.length === 0) return new Map();

    const placeholders = domains.map((_, i) => `$${i + 1}`).join(', ');
    const results = await seoQuery<DomainMetrics>(`
      SELECT domain, domain_rating, backlinks_count, referring_domains_count
      FROM domain_metrics_cache
      WHERE domain IN (${placeholders})
    `, domains);

    return new Map(results.map(r => [r.domain, r]));
  }

  // Get competitor list
  async getCompetitors(): Promise<{ id: number; name: string; domain: string }[]> {
    return seoQuery(`
      SELECT id, name, domain
      FROM competitors
      WHERE is_active = TRUE AND is_competitor = TRUE
      ORDER BY priority, name
    `);
  }

  // Search for prospects by keyword/topic
  async searchProspectsByKeyword(keyword: string, limit = 50): Promise<SerpResult[]> {
    return seoQuery<SerpResult>(`
      SELECT id, keyword, position, domain, url, title, is_our_domain
      FROM emf_serp_results
      WHERE keyword ILIKE $1
        AND is_our_domain = FALSE
      ORDER BY position ASC
      LIMIT $2
    `, [`%${keyword}%`, limit]);
  }

  // Get forum posts mentioning EMF topics (for community outreach)
  async getRelevantForumPosts(limit = 50): Promise<{
    id: number;
    source: string;
    subreddit: string | null;
    title: string;
    url: string;
    score: number;
  }[]> {
    return seoQuery(`
      SELECT id, source, subreddit, title, url, score
      FROM emf_forum_posts
      WHERE is_ignored = FALSE
        AND score > 10
      ORDER BY score DESC
      LIMIT $1
    `, [limit]);
  }

  // Get stats about available SEO data
  async getDataStats(): Promise<{
    broken_backlinks: number;
    competitor_referring_domains: number;
    emf_serp_results: number;
    forum_posts: number;
  }> {
    const [brokenBacklinks, referringDomains, serpResults, forumPosts] = await Promise.all([
      seoQuery<{ count: string }>("SELECT COUNT(*) as count FROM competitor_broken_backlinks WHERE outreach_status = 'new' OR outreach_status IS NULL"),
      seoQuery<{ count: string }>("SELECT COUNT(*) as count FROM competitor_referring_domains WHERE we_have_link = FALSE AND is_ignored = FALSE"),
      seoQuery<{ count: string }>("SELECT COUNT(*) as count FROM emf_serp_results WHERE is_our_domain = FALSE"),
      seoQuery<{ count: string }>("SELECT COUNT(*) as count FROM emf_forum_posts WHERE is_ignored = FALSE"),
    ]);

    return {
      broken_backlinks: parseInt(brokenBacklinks[0]?.count || '0'),
      competitor_referring_domains: parseInt(referringDomains[0]?.count || '0'),
      emf_serp_results: parseInt(serpResults[0]?.count || '0'),
      forum_posts: parseInt(forumPosts[0]?.count || '0'),
    };
  }
}

export const seoDataService = new SeoDataService();
export default seoDataService;
