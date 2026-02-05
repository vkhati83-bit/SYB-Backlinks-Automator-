import { BaseRepository } from './base.repository.js';
import { Response, ResponseCategory } from '../../types/index.js';

export interface CreateResponseInput {
  email_id?: string;
  prospect_id: string;
  contact_id: string;
  sequence_id?: string;
  subject?: string;
  body: string;
  received_at: Date;
  ai_classification?: ResponseCategory;
  sentiment_score?: number;
}

export class ResponseRepository extends BaseRepository<Response> {
  constructor() {
    super('responses');
  }

  async create(input: CreateResponseInput): Promise<Response> {
    const result = await this.queryOne<Response>(`
      INSERT INTO responses (
        email_id, prospect_id, contact_id, sequence_id,
        subject, body, received_at, ai_classification, sentiment_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      input.email_id || null,
      input.prospect_id,
      input.contact_id,
      input.sequence_id || null,
      input.subject || null,
      input.body,
      input.received_at,
      input.ai_classification || null,
      input.sentiment_score || null,
    ]);
    return result!;
  }

  async classify(id: string, category: ResponseCategory, isHuman = false): Promise<Response | null> {
    const field = isHuman ? 'human_classification' : 'ai_classification';
    return this.queryOne<Response>(`
      UPDATE responses SET
        ${field} = $1,
        category = COALESCE(human_classification, $1),
        is_processed = TRUE,
        processed_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [category, id]);
  }

  async findUnprocessed(limit = 50): Promise<Response[]> {
    return this.query<Response>(`
      SELECT r.*, p.url as prospect_url, p.domain as prospect_domain,
             c.email as contact_email, c.name as contact_name
      FROM responses r
      JOIN prospects p ON r.prospect_id = p.id
      JOIN contacts c ON r.contact_id = c.id
      WHERE r.is_processed = FALSE
      ORDER BY r.received_at DESC
      LIMIT $1
    `, [limit]);
  }

  async findByCategory(category: ResponseCategory, limit = 100): Promise<Response[]> {
    return this.query<Response>(
      'SELECT * FROM responses WHERE category = $1 ORDER BY received_at DESC LIMIT $2',
      [category, limit]
    );
  }

  async findPositive(limit = 100): Promise<Response[]> {
    return this.query<Response>(`
      SELECT r.*, p.url as prospect_url, p.domain as prospect_domain,
             c.email as contact_email, c.name as contact_name
      FROM responses r
      JOIN prospects p ON r.prospect_id = p.id
      JOIN contacts c ON r.contact_id = c.id
      WHERE r.category IN ('positive_will_link', 'positive_needs_info')
      ORDER BY r.received_at DESC
      LIMIT $1
    `, [limit]);
  }

  async findByProspect(prospectId: string): Promise<Response[]> {
    return this.query<Response>(
      'SELECT * FROM responses WHERE prospect_id = $1 ORDER BY received_at DESC',
      [prospectId]
    );
  }

  async findByEmail(emailId: string): Promise<Response[]> {
    return this.query<Response>(
      'SELECT * FROM responses WHERE email_id = $1 ORDER BY received_at DESC',
      [emailId]
    );
  }

  async getStats(days = 30): Promise<{
    total: number;
    by_category: Record<string, number>;
    positive_rate: number;
  }> {
    const [total, byCategory] = await Promise.all([
      this.queryOne<{ count: string }>(`
        SELECT COUNT(*) as count FROM responses
        WHERE received_at >= NOW() - INTERVAL '${days} days'
      `),
      this.query<{ category: string; count: string }>(`
        SELECT category, COUNT(*) as count FROM responses
        WHERE received_at >= NOW() - INTERVAL '${days} days'
        GROUP BY category
      `),
    ]);

    const totalCount = parseInt(total?.count || '0', 10);
    const categoryMap = Object.fromEntries(byCategory.map(r => [r.category, parseInt(r.count)]));
    const positiveCount = (categoryMap['positive_will_link'] || 0) + (categoryMap['positive_needs_info'] || 0);

    return {
      total: totalCount,
      by_category: categoryMap,
      positive_rate: totalCount > 0 ? (positiveCount / totalCount) * 100 : 0,
    };
  }
}

export const responseRepository = new ResponseRepository();
export default responseRepository;
