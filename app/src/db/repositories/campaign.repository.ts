import { BaseRepository } from './base.repository.js';
import { Campaign, CampaignStatus, CampaignMetrics } from '../../types/index.js';

export interface CreateCampaignInput {
  name: string;
  description?: string;
  opportunity_type: 'research_citation' | 'broken_link' | 'guest_post';
  target_count?: number;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  status?: CampaignStatus;
  target_count?: number;
  started_at?: Date;
  completed_at?: Date;
}

export class CampaignRepository extends BaseRepository<Campaign> {
  constructor() {
    super('campaigns');
  }

  async create(input: CreateCampaignInput): Promise<Campaign> {
    const result = await this.queryOne<Campaign>(`
      INSERT INTO campaigns (name, description, opportunity_type, target_count)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [
      input.name,
      input.description || null,
      input.opportunity_type,
      input.target_count || null,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateCampaignInput): Promise<Campaign | null> {
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
    return this.queryOne<Campaign>(`
      UPDATE campaigns SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async start(id: string): Promise<Campaign | null> {
    return this.update(id, { status: 'active', started_at: new Date() });
  }

  async pause(id: string): Promise<Campaign | null> {
    return this.update(id, { status: 'paused' });
  }

  async complete(id: string): Promise<Campaign | null> {
    return this.update(id, { status: 'completed', completed_at: new Date() });
  }

  async findByStatus(status: CampaignStatus): Promise<Campaign[]> {
    return this.query<Campaign>(
      'SELECT * FROM campaigns WHERE status = $1 ORDER BY created_at DESC',
      [status]
    );
  }

  async findActive(): Promise<Campaign[]> {
    return this.findByStatus('active');
  }

  async getMetrics(campaignId: string): Promise<CampaignMetrics> {
    const result = await this.queryOne<{
      prospects_count: string;
      contacts_found: string;
      emails_generated: string;
      emails_sent: string;
      emails_opened: string;
      replies_received: string;
      positive_replies: string;
      links_placed: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM prospects WHERE campaign_id = $1) as prospects_count,
        (SELECT COUNT(*) FROM contacts c JOIN prospects p ON c.prospect_id = p.id WHERE p.campaign_id = $1) as contacts_found,
        (SELECT COUNT(*) FROM emails WHERE campaign_id = $1) as emails_generated,
        (SELECT COUNT(*) FROM emails WHERE campaign_id = $1 AND sent_at IS NOT NULL) as emails_sent,
        (SELECT COUNT(*) FROM emails WHERE campaign_id = $1 AND opened_at IS NOT NULL) as emails_opened,
        (SELECT COUNT(*) FROM responses r JOIN emails e ON r.email_id = e.id WHERE e.campaign_id = $1) as replies_received,
        (SELECT COUNT(*) FROM responses r JOIN emails e ON r.email_id = e.id WHERE e.campaign_id = $1 AND r.category IN ('positive_will_link', 'positive_needs_info')) as positive_replies,
        (SELECT COUNT(*) FROM link_checks lc JOIN prospects p ON lc.prospect_id = p.id WHERE p.campaign_id = $1 AND lc.link_status IN ('found_dofollow', 'found_nofollow')) as links_placed
    `, [campaignId]);

    const prospectsCount = parseInt(result?.prospects_count || '0', 10);
    const emailsSent = parseInt(result?.emails_sent || '0', 10);
    const linksPlaced = parseInt(result?.links_placed || '0', 10);

    return {
      campaign_id: campaignId,
      prospects_count: prospectsCount,
      contacts_found: parseInt(result?.contacts_found || '0', 10),
      emails_generated: parseInt(result?.emails_generated || '0', 10),
      emails_sent: emailsSent,
      emails_opened: parseInt(result?.emails_opened || '0', 10),
      replies_received: parseInt(result?.replies_received || '0', 10),
      positive_replies: parseInt(result?.positive_replies || '0', 10),
      links_placed: linksPlaced,
      conversion_rate: emailsSent > 0 ? (linksPlaced / emailsSent) * 100 : 0,
    };
  }
}

export const campaignRepository = new CampaignRepository();
export default campaignRepository;
