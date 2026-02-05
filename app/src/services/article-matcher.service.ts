import { seoDb } from '../db/index.js';
import logger from '../utils/logger.js';

interface SYBArticle {
  url: string;
  title: string;
  h1: string | null;
  word_count: number;
}

interface MatchResult {
  article: SYBArticle;
  score: number;
  reason: string;
}

// Keywords mapped to relevant SYB articles
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'emf-meters': ['emf meter', 'emf detector', 'emf reader', 'measure emf', 'detect emf', 'emf measurement', 'gaussmeter', 'rf meter'],
  'cell-phone-health': ['cell phone radiation', 'phone health', 'mobile phone danger', 'cellphone cancer', 'phone emf', 'smartphone radiation'],
  '5g-health': ['5g', '5g health', '5g danger', '5g safety', '5g radiation', '5g tower', '5g network'],
  'emf-protection': ['emf protection', 'emf shield', 'emf blocking', 'radiation protection', 'emf safety'],
  'children-emf': ['children emf', 'kids radiation', 'child phone', 'kids screen', 'children screen time', 'baby emf'],
  'wifi-radiation': ['wifi radiation', 'wifi health', 'wireless radiation', 'router radiation', 'wifi danger'],
  'emf-testing': ['emf testing', 'emf test', 'test emf', 'measure radiation'],
  'blue-light': ['blue light', 'screen light', 'computer eye', 'digital eye'],
  'sleep-emf': ['sleep emf', 'bedroom emf', 'sleep sanctuary', 'emf sleep'],
  'grounding': ['grounding', 'earthing', 'ground yourself'],
  'phone-case': ['phone case', 'emf case', 'radiation case', 'protective case'],
};

// Direct URL keyword to article mapping
const URL_TO_ARTICLE: Record<string, string> = {
  'emf-meter': 'https://www.shieldyourbody.com/best-emf-meters-detectors/',
  'emf-detector': 'https://www.shieldyourbody.com/best-emf-meters-detectors/',
  'cell-phone-radiation': 'https://www.shieldyourbody.com/health-risk-cell-phones/',
  'phone-radiation': 'https://www.shieldyourbody.com/health-risk-cell-phones/',
  '5g-health': 'https://www.shieldyourbody.com/5g-health-risks/',
  '5g-danger': 'https://www.shieldyourbody.com/5g-health-risks/',
  '5g-tower': 'https://www.shieldyourbody.com/5g-cell-towers/',
  '5g-safety': 'https://www.shieldyourbody.com/5g-safety-protection/',
  'emf-protection': 'https://www.shieldyourbody.com/emf-shielding-materials/',
  'emf-shield': 'https://www.shieldyourbody.com/emf-shielding-materials/',
  'children-emf': 'https://www.shieldyourbody.com/children-emf/',
  'kids-screen': 'https://www.shieldyourbody.com/35-no-wifi-offline-games/',
  'child-smartphone': 'https://www.shieldyourbody.com/child-smartphone/',
  'emf-testing': 'https://www.shieldyourbody.com/emf-testing/',
  'blue-light': 'https://www.shieldyourbody.com/blue-light/',
  'grounding': 'https://www.shieldyourbody.com/grounding-benefits/',
  'earthing': 'https://www.shieldyourbody.com/grounding-benefits/',
  'phone-case': 'https://www.shieldyourbody.com/best-emf-protection-phone-case/',
  'cancer': 'https://www.shieldyourbody.com/cell-phone-cancer/',
  'sleep': 'https://www.shieldyourbody.com/sleep-sanctuary/',
  'body-voltage': 'https://www.shieldyourbody.com/body-voltage/',
};

/**
 * Get all SYB articles from the database
 */
async function getSYBArticles(): Promise<SYBArticle[]> {
  try {
    const result = await seoDb.query(`
      SELECT url, title, h1, word_count
      FROM content_pages
      WHERE domain = 'www.shieldyourbody.com'
      AND status_code = 200
      AND content_type IN ('blog_post', 'article', 'page')
      AND title IS NOT NULL
      AND word_count > 500
      ORDER BY word_count DESC
    `);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching SYB articles:', error);
    return [];
  }
}

/**
 * Calculate text similarity (simple keyword matching)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 3));

  let matches = 0;
  words1.forEach(word => {
    if (words2.has(word)) matches++;
  });

  return matches / Math.max(words1.size, 1);
}

/**
 * Find the best matching SYB article for a broken link
 */
export async function findMatchingArticle(
  anchorText: string,
  brokenUrl: string,
  pageTitle?: string
): Promise<MatchResult | null> {
  const combinedText = `${anchorText} ${brokenUrl} ${pageTitle || ''}`.toLowerCase();

  // First, try direct URL keyword matching
  for (const [keyword, articleUrl] of Object.entries(URL_TO_ARTICLE)) {
    if (combinedText.includes(keyword.replace('-', ' ')) || combinedText.includes(keyword)) {
      const articles = await getSYBArticles();
      const article = articles.find(a => a.url === articleUrl);
      if (article) {
        return {
          article,
          score: 100,
          reason: `Direct keyword match: "${keyword}"`,
        };
      }
    }
  }

  // Second, try topic keyword matching
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (combinedText.includes(keyword)) {
        const articleUrl = URL_TO_ARTICLE[topic];
        if (articleUrl) {
          const articles = await getSYBArticles();
          const article = articles.find(a => a.url === articleUrl);
          if (article) {
            return {
              article,
              score: 80,
              reason: `Topic match: "${keyword}" → ${topic}`,
            };
          }
        }
      }
    }
  }

  // Third, fallback to text similarity matching
  const articles = await getSYBArticles();
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const article of articles) {
    const articleText = `${article.title} ${article.h1 || ''}`;
    const similarity = calculateSimilarity(combinedText, articleText);

    if (similarity > bestScore && similarity > 0.1) {
      bestScore = similarity;
      bestMatch = {
        article,
        score: Math.round(similarity * 100),
        reason: `Text similarity: ${Math.round(similarity * 100)}% match`,
      };
    }
  }

  // If no good match, suggest the most comprehensive general article
  if (!bestMatch || bestMatch.score < 20) {
    // Default to the EMF health risks article as it's the most comprehensive
    const defaultArticle = articles.find(a =>
      a.url.includes('health-risk-cell-phones') || a.url.includes('emf-shielding')
    );
    if (defaultArticle) {
      return {
        article: defaultArticle,
        score: 10,
        reason: 'General EMF resource (no specific match found)',
      };
    }
  }

  return bestMatch;
}

/**
 * Find matching articles for multiple broken links
 */
export async function findMatchingArticles(
  links: Array<{ anchorText: string; brokenUrl: string; pageTitle?: string }>
): Promise<Map<string, MatchResult | null>> {
  const results = new Map<string, MatchResult | null>();

  for (const link of links) {
    const key = `${link.brokenUrl}|${link.anchorText}`;
    const match = await findMatchingArticle(link.anchorText, link.brokenUrl, link.pageTitle);
    results.set(key, match);
  }

  return results;
}

export default {
  findMatchingArticle,
  findMatchingArticles,
};
