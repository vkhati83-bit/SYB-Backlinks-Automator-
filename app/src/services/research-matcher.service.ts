import { researchDb } from '../db/index.js';
import logger from '../utils/logger.js';

export interface ResearchCategoryMatch {
  category_name: string;
  study_count: number;
  ai_synthesis: string | null;
  slug: string;
}

// EMF topic keywords mapped to research category slugs (best guesses — DB will verify)
const TOPIC_KEYWORD_MAP: Record<string, string[]> = {
  '5g': ['5g', 'radiofrequency', 'mobile-phones'],
  'wifi': ['wifi', 'radiofrequency'],
  'cell phone': ['mobile-phones', 'radiofrequency'],
  'mobile phone': ['mobile-phones', 'radiofrequency'],
  'emf': ['emf-general', 'radiofrequency'],
  'radiation': ['emf-general', 'radiofrequency'],
  'cancer': ['cancer', 'emf-general'],
  'brain': ['brain-health', 'mobile-phones'],
  'sleep': ['sleep', 'emf-general'],
  'children': ['children', 'emf-general'],
  'fertility': ['fertility', 'emf-general'],
  'pregnancy': ['pregnancy', 'fertility'],
  'smart meter': ['smart-meters', 'radiofrequency'],
  'bluetooth': ['bluetooth', 'radiofrequency'],
};

// Match prospect content to a research category
export async function findResearchCategory(
  keyword: string,
  title: string,
  url: string
): Promise<ResearchCategoryMatch | null> {
  if (!researchDb) {
    return null;
  }

  try {
    const text = `${keyword} ${title} ${url}`.toLowerCase();

    // Try keyword map first
    let bestSlug: string | null = null;
    for (const [topic, slugs] of Object.entries(TOPIC_KEYWORD_MAP)) {
      if (text.includes(topic)) {
        bestSlug = slugs[0];
        break;
      }
    }

    let result;
    if (bestSlug) {
      result = await researchDb.query(`
        SELECT name, slug, study_count, ai_synthesis
        FROM categories
        WHERE slug = $1 AND study_count > 0
        LIMIT 1
      `, [bestSlug]);
    }

    // Fallback: text search on category names
    if (!result || result.rows.length === 0) {
      const words = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (words.length > 0) {
        result = await researchDb.query(`
          SELECT name, slug, study_count, ai_synthesis
          FROM categories
          WHERE study_count > 10
            AND lower(name) ILIKE ANY($1::text[])
          ORDER BY study_count DESC
          LIMIT 1
        `, [words.map(w => `%${w}%`)]);
      }
    }

    // Final fallback: return largest general category
    if (!result || result.rows.length === 0) {
      result = await researchDb.query(`
        SELECT name, slug, study_count, ai_synthesis
        FROM categories
        WHERE study_count > 50
        ORDER BY study_count DESC
        LIMIT 1
      `);
    }

    if (!result || result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      category_name: row.name,
      study_count: row.study_count,
      ai_synthesis: row.ai_synthesis,
      slug: row.slug,
    };
  } catch (error) {
    logger.error('Research category lookup failed:', error);
    return null;
  }
}
