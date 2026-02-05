import { BaseRepository } from './base.repository.js';
import { Prospect, ProspectStatus, ApprovalStatus, OutcomeTag, GroupedProspects } from '../../types/index.js';

export interface CreateProspectInput {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  domain_authority?: number;
  spam_score?: number;
  monthly_traffic?: number;
  quality_score?: number;
  opportunity_type: 'research_citation' | 'broken_link' | 'guest_post';
  campaign_id?: string;
  source?: string;
  page_content?: string;
  niche?: string;
}

export interface UpdateProspectInput {
  title?: string;
  description?: string;
  domain_authority?: number;
  spam_score?: number;
  monthly_traffic?: number;
  quality_score?: number;
  status?: ProspectStatus;
  page_content?: string;
  last_crawled_at?: Date;
  niche?: string;
  approval_status?: ApprovalStatus;
  outcome_tag?: OutcomeTag | null;
}

export interface ProspectFilters {
  status?: ProspectStatus;
  campaign_id?: string;
  opportunity_type?: string;
  min_quality_score?: number;
  min_domain_authority?: number;
  max_spam_score?: number;
  approval_status?: ApprovalStatus;
  niche?: string;
  outcome_tag?: OutcomeTag;
}

export class ProspectRepository extends BaseRepository<Prospect> {
  constructor() {
    super('prospects');
  }

  async create(input: CreateProspectInput): Promise<Prospect> {
    const result = await this.queryOne<Prospect>(`
      INSERT INTO prospects (
        url, domain, title, description, domain_authority,
        spam_score, monthly_traffic, quality_score, opportunity_type,
        campaign_id, source, page_content, niche
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      input.url,
      input.domain,
      input.title || null,
      input.description || null,
      input.domain_authority || null,
      input.spam_score || null,
      input.monthly_traffic || null,
      input.quality_score || null,
      input.opportunity_type,
      input.campaign_id || null,
      input.source || null,
      input.page_content || null,
      input.niche || null,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateProspectInput): Promise<Prospect | null> {
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
    return this.queryOne<Prospect>(`
      UPDATE prospects SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async updateStatus(id: string, status: ProspectStatus): Promise<Prospect | null> {
    return this.update(id, { status });
  }

  async findByUrl(url: string): Promise<Prospect | null> {
    return this.queryOne<Prospect>(
      'SELECT * FROM prospects WHERE url = $1',
      [url]
    );
  }

  async findByDomain(domain: string): Promise<Prospect[]> {
    return this.query<Prospect>(
      'SELECT * FROM prospects WHERE domain = $1 ORDER BY created_at DESC',
      [domain]
    );
  }

  async findByStatus(status: ProspectStatus, limit = 100): Promise<Prospect[]> {
    return this.query<Prospect>(
      'SELECT * FROM prospects WHERE status = $1 ORDER BY quality_score DESC NULLS LAST LIMIT $2',
      [status, limit]
    );
  }

  async findByCampaign(campaignId: string): Promise<Prospect[]> {
    return this.query<Prospect>(
      'SELECT * FROM prospects WHERE campaign_id = $1 ORDER BY created_at DESC',
      [campaignId]
    );
  }

  async findFiltered(filters: ProspectFilters, limit = 100, offset = 0): Promise<Prospect[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.campaign_id) {
      conditions.push(`campaign_id = $${paramIndex++}`);
      values.push(filters.campaign_id);
    }
    if (filters.opportunity_type) {
      conditions.push(`opportunity_type = $${paramIndex++}`);
      values.push(filters.opportunity_type);
    }
    if (filters.min_quality_score !== undefined) {
      conditions.push(`quality_score >= $${paramIndex++}`);
      values.push(filters.min_quality_score);
    }
    if (filters.min_domain_authority !== undefined) {
      conditions.push(`domain_authority >= $${paramIndex++}`);
      values.push(filters.min_domain_authority);
    }
    if (filters.max_spam_score !== undefined) {
      conditions.push(`spam_score <= $${paramIndex++}`);
      values.push(filters.max_spam_score);
    }
    if (filters.approval_status) {
      conditions.push(`approval_status = $${paramIndex++}`);
      values.push(filters.approval_status);
    }
    if (filters.niche) {
      conditions.push(`niche = $${paramIndex++}`);
      values.push(filters.niche);
    }
    if (filters.outcome_tag) {
      conditions.push(`outcome_tag = $${paramIndex++}`);
      values.push(filters.outcome_tag);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit, offset);

    return this.query<Prospect>(`
      SELECT * FROM prospects
      ${whereClause}
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, values);
  }

  async isDomainBlocked(domain: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM blocklist WHERE type = 'domain' AND value = $1
      ) as exists
    `, [domain]);
    return result?.exists || false;
  }

  async getStats(): Promise<{
    total: number;
    by_status: Record<string, number>;
    by_opportunity_type: Record<string, number>;
    by_approval_status: Record<string, number>;
  }> {
    const [total, byStatus, byType, byApproval] = await Promise.all([
      this.count(),
      this.query<{ status: string; count: string }>(`
        SELECT status, COUNT(*) as count FROM prospects GROUP BY status
      `),
      this.query<{ opportunity_type: string; count: string }>(`
        SELECT opportunity_type, COUNT(*) as count FROM prospects GROUP BY opportunity_type
      `),
      this.query<{ approval_status: string; count: string }>(`
        SELECT approval_status, COUNT(*) as count FROM prospects GROUP BY approval_status
      `),
    ]);

    return {
      total,
      by_status: Object.fromEntries(byStatus.map(r => [r.status, parseInt(r.count)])),
      by_opportunity_type: Object.fromEntries(byType.map(r => [r.opportunity_type, parseInt(r.count)])),
      by_approval_status: Object.fromEntries(byApproval.map(r => [r.approval_status, parseInt(r.count)])),
    };
  }

  // ============================================
  // CRM ENHANCEMENT METHODS
  // ============================================

  async findGrouped(approvalStatus: ApprovalStatus = 'pending'): Promise<GroupedProspects> {
    const prospects = await this.query<Prospect>(`
      SELECT * FROM prospects
      WHERE approval_status = $1
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
    `, [approvalStatus]);

    return {
      broken_link: prospects.filter(p => p.opportunity_type === 'broken_link'),
      research_citation: prospects.filter(p => p.opportunity_type === 'research_citation'),
      guest_post: prospects.filter(p => p.opportunity_type === 'guest_post'),
    };
  }

  async findByApprovalStatus(approvalStatus: ApprovalStatus, limit = 100, offset = 0): Promise<Prospect[]> {
    return this.query<Prospect>(`
      SELECT * FROM prospects
      WHERE approval_status = $1
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT $2 OFFSET $3
    `, [approvalStatus, limit, offset]);
  }

  async findApproved(limit = 100, offset = 0): Promise<Prospect[]> {
    return this.findByApprovalStatus('approved', limit, offset);
  }

  async findCompleted(limit = 100, offset = 0): Promise<Prospect[]> {
    return this.query<Prospect>(`
      SELECT * FROM prospects
      WHERE outcome_tag IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
  }

  async updateApprovalStatus(id: string, approvalStatus: ApprovalStatus): Promise<Prospect | null> {
    return this.update(id, { approval_status: approvalStatus });
  }

  async bulkUpdateApprovalStatus(ids: string[], approvalStatus: ApprovalStatus): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.query<{ id: string }>(`
      UPDATE prospects
      SET approval_status = $1
      WHERE id = ANY($2::uuid[])
      RETURNING id
    `, [approvalStatus, ids]);

    return result.length;
  }

  async setOutcomeTag(id: string, outcomeTag: OutcomeTag | null): Promise<Prospect | null> {
    return this.update(id, { outcome_tag: outcomeTag });
  }

  async bulkSetOutcomeTag(ids: string[], outcomeTag: OutcomeTag): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.query<{ id: string }>(`
      UPDATE prospects
      SET outcome_tag = $1
      WHERE id = ANY($2::uuid[])
      RETURNING id
    `, [outcomeTag, ids]);

    return result.length;
  }

  async setNiche(id: string, niche: string | null): Promise<Prospect | null> {
    return this.update(id, { niche });
  }

  async findByNiche(niche: string, limit = 100): Promise<Prospect[]> {
    return this.query<Prospect>(`
      SELECT * FROM prospects
      WHERE niche = $1
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT $2
    `, [niche, limit]);
  }
}

export const prospectRepository = new ProspectRepository();
export default prospectRepository;
