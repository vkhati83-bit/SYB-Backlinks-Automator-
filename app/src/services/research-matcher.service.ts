import { researchDb } from '../db/index.js';
import logger from '../utils/logger.js';

export interface ResearchCategoryMatch {
  category_name: string;
  study_count: number;
  ai_synthesis: string | null;
  slug: string;
}

// EMF topic keywords mapped to actual research DB category slugs
const TOPIC_KEYWORD_MAP: Record<string, string[]> = {
  'sar': ['sar-device-absorption', 'radio-frequency'],
  'cell phone': ['sar-device-absorption', 'radio-frequency'],
  'mobile phone': ['sar-device-absorption', 'radio-frequency'],
  'smartphone': ['sar-device-absorption', 'radio-frequency'],
  '5g': ['radio-frequency', 'cellular-effects'],
  'wifi': ['radio-frequency', 'cellular-effects'],
  'bluetooth': ['radio-frequency', 'cellular-effects'],
  'wireless': ['radio-frequency', 'cellular-effects'],
  'microwave': ['radio-frequency', 'cellular-effects'],
  'smart meter': ['radio-frequency', 'magnetic-fields-elf'],
  'airplane mode': ['sar-device-absorption', 'radio-frequency'],
  'radiation': ['radio-frequency', 'whole-body-general'],
  'cancer': ['cancer-tumors', 'cellular-effects'],
  'tumor': ['cancer-tumors', 'cellular-effects'],
  'brain': ['brain-nervous-system', 'cellular-effects'],
  'neurolog': ['brain-nervous-system'],
  'sleep': ['sleep-circadian', 'brain-nervous-system'],
  'circadian': ['sleep-circadian'],
  'dna': ['dna-genetic-damage'],
  'genetic': ['dna-genetic-damage'],
  'fertility': ['reproductive-health'],
  'pregnancy': ['reproductive-health'],
  'reproductive': ['reproductive-health'],
  'sperm': ['reproductive-health'],
  'oxidative': ['oxidative-stress'],
  'cardiovascular': ['cardiovascular'],
  'heart': ['cardiovascular'],
  'immune': ['immune-system'],
  'electric field': ['electric-fields'],
  'elf': ['magnetic-fields-elf'],
  'magnetic': ['magnetic-fields-elf'],
  'sensitivity': ['symptoms-sensitivity'],
  'headache': ['symptoms-sensitivity'],
  'emf': ['whole-body-general', 'cellular-effects'],
};

// Match prospect content to a research category
export async function findResearchCategory(
  keyword: string,
  title: string,
  url: string
): Promise<ResearchCategoryMatch | null> {
  if (!researchDb) {
    logger.warn('findResearchCategory: researchDb is null, skipping');
    return null;
  }

  try {
    const text = `${keyword} ${title} ${url}`.toLowerCase();

    // Try keyword map first
    let bestSlug: string | null = null;
    for (const [topic, slugs] of Object.entries(TOPIC_KEYWORD_MAP)) {
      if (text.includes(topic)) {
        bestSlug = slugs[0];
        logger.info(`Research category: matched topic "${topic}" → slug "${bestSlug}"`);
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
      logger.info(`Research category slug query rows: ${result.rows.length}`);
    }

    // Fallback: text search on category names
    if (!result || result.rows.length === 0) {
      const words = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      logger.info(`Research category: slug miss, trying text search with words: ${JSON.stringify(words)}`);
      if (words.length > 0) {
        result = await researchDb.query(`
          SELECT name, slug, study_count, ai_synthesis
          FROM categories
          WHERE study_count > 10
            AND lower(name) ILIKE ANY($1::text[])
          ORDER BY study_count DESC
          LIMIT 1
        `, [words.map(w => `%${w}%`)]);
        logger.info(`Research category text search rows: ${result.rows.length}`);
      }
    }

    // Final fallback: return largest general category
    if (!result || result.rows.length === 0) {
      logger.info('Research category: using final fallback (largest category)');
      result = await researchDb.query(`
        SELECT name, slug, study_count, ai_synthesis
        FROM categories
        WHERE study_count > 50
        ORDER BY study_count DESC
        LIMIT 1
      `);
      logger.info(`Research category final fallback rows: ${result.rows.length}`);
    }

    if (!result || result.rows.length === 0) {
      logger.warn('Research category: no category found at all');
      return null;
    }

    const row = result.rows[0];
    logger.info(`Research category matched: ${row.name} (${row.slug}), ${row.study_count} studies`);
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
