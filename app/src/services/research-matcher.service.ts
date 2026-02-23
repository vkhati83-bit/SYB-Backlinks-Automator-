import { researchDb } from '../db/index.js';
import logger from '../utils/logger.js';

export interface ResearchMatch {
  searchTerm: string;
  studyCount: number;
  researchUrl: string;
}

const BASE_URL = 'https://www.shieldyourbody.com/research/studies';
const MIN_STUDIES = 3;

// Extract candidate search terms from article content, ordered specific → general
function extractCandidateTerms(title: string, keyword: string, url: string): string[] {
  const text = `${title} ${keyword} ${url}`.toLowerCase();
  const terms: string[] = [];

  // Specific device/product names
  const devices = [
    'fitbit', 'apple watch', 'airpods', 'garmin', 'whoop', 'oura',
    'earbuds', 'headphones', 'baby monitor', 'smart meter', 'tesla',
    'electric vehicle', 'ev charging',
  ];
  for (const d of devices) {
    if (text.includes(d)) terms.push(d);
  }

  // Technology / emission types
  const techTerms = [
    'bluetooth', '5g', 'wifi', '4g', 'lte', 'nfc', 'rfid',
    'cell phone', 'mobile phone', 'smartphone',
    'smart meter', 'power line', 'microwave', 'radar',
    'laptop', 'tablet', 'computer', 'router',
    'airplane mode', 'flight mode',
    'pemf', 'pulsed electromagnetic', 'transcranial',
    'wireless radiation', 'radiofrequency radiation',
  ];
  for (const t of techTerms) {
    if (text.includes(t)) terms.push(t);
  }

  // Health / biological topics
  const healthTerms = [
    'cancer', 'tumor', 'brain', 'sleep', 'fertility', 'pregnancy',
    'dna', 'oxidative stress', 'cardiovascular', 'heart', 'immune',
    'children', 'sperm', 'anxiety', 'depression', 'headache', 'fatigue',
  ];
  for (const h of healthTerms) {
    if (text.includes(h)) terms.push(h);
  }

  // Extract meaningful words directly from the article title
  const stopwords = new Set([
    'with', 'from', 'that', 'this', 'your', 'they', 'have', 'been',
    'more', 'than', 'when', 'will', 'what', 'about', 'which', 'those',
    'these', 'where', 'level', 'highest', 'phone', 'study', 'review',
    'article', 'blog', 'guide', 'tips', 'ways', 'best', 'does', 'into',
    // verb/adverb fragments that appear in titles but mean nothing in a study search
    'longer', 'protects', 'against', 'using', 'while', 'after', 'before',
    'under', 'other', 'every', 'always', 'never', 'still', 'should',
    'their', 'there', 'really', 'right', 'wrong', 'cause', 'causes',
    'could', 'would', 'might', 'helps', 'affect', 'effects', 'effect',
    'health', 'risks', 'risk', 'safe', 'safety', 'know', 'explains',
  ]);
  const titleWords = title.toLowerCase()
    .split(/[\s\-_,.:!?()\[\]"]+/)
    .filter(w => w.length > 4 && !stopwords.has(w));
  terms.push(...titleWords);

  // Broad EMF fallbacks — always last
  terms.push('sar', 'radiation', 'radiofrequency');

  // Deduplicate while preserving order
  return [...new Set(terms)];
}

// Count studies matching a term across title, objective, and conclusions
async function countStudies(term: string): Promise<number> {
  if (!researchDb) return 0;
  const like = `%${term}%`;
  const r = await researchDb.query(
    `SELECT COUNT(*) FROM studies
     WHERE lower(title) ILIKE $1
        OR lower(objective) ILIKE $1
        OR lower(conclusions) ILIKE $1`,
    [like]
  );
  return parseInt(r.rows[0].count, 10);
}

// Find the most specific research search term that has studies, and return the URL
export async function findResearchMatch(
  keyword: string,
  title: string,
  url: string
): Promise<ResearchMatch | null> {
  if (!researchDb) {
    logger.warn('findResearchMatch: researchDb is null, skipping');
    return null;
  }

  try {
    const candidates = extractCandidateTerms(title, keyword, url);
    logger.info(`Research match candidates for "${title.substring(0, 60)}": ${candidates.slice(0, 10).join(', ')}`);

    for (const term of candidates) {
      const count = await countStudies(term);
      if (count >= MIN_STUDIES) {
        const q = term.replace(/ /g, '+');
        const researchUrl = `${BASE_URL}?q=${q}`;
        logger.info(`Research match: "${term}" → ${count} studies → ${researchUrl}`);
        return { searchTerm: term, studyCount: count, researchUrl };
      }
    }

    // Should never happen since 'radiofrequency' always has 649+ studies
    logger.warn(`Research match: no term found for "${title}", using generic fallback`);
    return {
      searchTerm: 'radiofrequency',
      studyCount: 649,
      researchUrl: `${BASE_URL}?q=radiofrequency`,
    };
  } catch (error) {
    logger.error('Research match lookup failed:', error);
    return null;
  }
}

// Keep old export name as alias so existing imports don't break
export const findResearchCategory = findResearchMatch;
