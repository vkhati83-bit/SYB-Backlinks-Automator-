import { BaseRepository } from './base.repository.js';
import { SearchKeyword, Niche } from '../../types/index.js';

export interface CreateKeywordInput {
  keyword: string;
  niche?: string;
  is_active?: boolean;
}

export interface UpdateKeywordInput {
  keyword?: string;
  niche?: string;
  is_active?: boolean;
  match_count?: number;
  last_searched_at?: Date;
}

export interface CreateNicheInput {
  name: string;
  description?: string;
  keywords?: string[];
  is_active?: boolean;
}

export interface UpdateNicheInput {
  name?: string;
  description?: string;
  keywords?: string[];
  is_active?: boolean;
}

export class KeywordRepository extends BaseRepository<SearchKeyword> {
  constructor() {
    super('search_keywords');
  }

  async create(input: CreateKeywordInput): Promise<SearchKeyword> {
    const result = await this.queryOne<SearchKeyword>(`
      INSERT INTO search_keywords (keyword, niche, is_active)
      VALUES ($1, $2, $3)
      ON CONFLICT (keyword) DO UPDATE SET
        niche = COALESCE(EXCLUDED.niche, search_keywords.niche),
        is_active = EXCLUDED.is_active
      RETURNING *
    `, [
      input.keyword.toLowerCase().trim(),
      input.niche || null,
      input.is_active ?? true,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateKeywordInput): Promise<SearchKeyword | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return this.queryOne<SearchKeyword>(`
      UPDATE search_keywords SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async findByKeyword(keyword: string): Promise<SearchKeyword | null> {
    return this.queryOne<SearchKeyword>(
      'SELECT * FROM search_keywords WHERE keyword = $1',
      [keyword.toLowerCase().trim()]
    );
  }

  async findActive(limit = 100): Promise<SearchKeyword[]> {
    return this.query<SearchKeyword>(
      'SELECT * FROM search_keywords WHERE is_active = TRUE ORDER BY match_count DESC, created_at DESC LIMIT $1',
      [limit]
    );
  }

  async findByNiche(niche: string): Promise<SearchKeyword[]> {
    return this.query<SearchKeyword>(
      'SELECT * FROM search_keywords WHERE niche = $1 AND is_active = TRUE ORDER BY match_count DESC',
      [niche]
    );
  }

  async incrementMatchCount(id: string): Promise<SearchKeyword | null> {
    return this.queryOne<SearchKeyword>(`
      UPDATE search_keywords
      SET match_count = match_count + 1, last_searched_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
  }

  async updateLastSearched(id: string): Promise<void> {
    await this.queryOne(`
      UPDATE search_keywords SET last_searched_at = NOW()
      WHERE id = $1
    `, [id]);
  }

  async setActive(id: string, isActive: boolean): Promise<SearchKeyword | null> {
    return this.update(id, { is_active: isActive });
  }
}

export class NicheRepository extends BaseRepository<Niche> {
  constructor() {
    super('niches');
  }

  async create(input: CreateNicheInput): Promise<Niche> {
    const result = await this.queryOne<Niche>(`
      INSERT INTO niches (name, description, keywords, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (name) DO UPDATE SET
        description = COALESCE(EXCLUDED.description, niches.description),
        keywords = COALESCE(EXCLUDED.keywords, niches.keywords),
        is_active = EXCLUDED.is_active
      RETURNING *
    `, [
      input.name,
      input.description || null,
      input.keywords || [],
      input.is_active ?? true,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateNicheInput): Promise<Niche | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    return this.queryOne<Niche>(`
      UPDATE niches SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async findByName(name: string): Promise<Niche | null> {
    return this.queryOne<Niche>(
      'SELECT * FROM niches WHERE name = $1',
      [name]
    );
  }

  async findActive(): Promise<Niche[]> {
    return this.query<Niche>(
      'SELECT * FROM niches WHERE is_active = TRUE ORDER BY name ASC'
    );
  }

  async addKeyword(id: string, keyword: string): Promise<Niche | null> {
    return this.queryOne<Niche>(`
      UPDATE niches
      SET keywords = array_append(keywords, $2)
      WHERE id = $1 AND NOT ($2 = ANY(keywords))
      RETURNING *
    `, [id, keyword]);
  }

  async removeKeyword(id: string, keyword: string): Promise<Niche | null> {
    return this.queryOne<Niche>(`
      UPDATE niches
      SET keywords = array_remove(keywords, $2)
      WHERE id = $1
      RETURNING *
    `, [id, keyword]);
  }
}

export const keywordRepository = new KeywordRepository();
export const nicheRepository = new NicheRepository();
export default keywordRepository;
