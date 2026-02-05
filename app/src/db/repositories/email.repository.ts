import { BaseRepository } from './base.repository.js';
import { Email, EmailStatus } from '../../types/index.js';

export interface CreateEmailInput {
  prospect_id: string;
  contact_id: string;
  campaign_id?: string;
  template_id?: string;
  ab_test_id?: string;
  ab_variant?: string;
  subject: string;
  body: string;
}

export interface UpdateEmailInput {
  subject?: string;
  body?: string;
  status?: EmailStatus;
  reviewed_by?: string;
  reviewed_at?: Date;
  rejection_reason?: string;
  edited_subject?: string;
  edited_body?: string;
  resend_id?: string;
  sent_at?: Date;
  delivered_at?: Date;
  opened_at?: Date;
  clicked_at?: Date;
  open_count?: number;
  click_count?: number;
}

export class EmailRepository extends BaseRepository<Email> {
  constructor() {
    super('emails');
  }

  async create(input: CreateEmailInput): Promise<Email> {
    const result = await this.queryOne<Email>(`
      INSERT INTO emails (
        prospect_id, contact_id, campaign_id, template_id,
        ab_test_id, ab_variant, subject, body
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      input.prospect_id,
      input.contact_id,
      input.campaign_id || null,
      input.template_id || null,
      input.ab_test_id || null,
      input.ab_variant || null,
      input.subject,
      input.body,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateEmailInput): Promise<Email | null> {
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
    return this.queryOne<Email>(`
      UPDATE emails SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async updateStatus(id: string, status: EmailStatus): Promise<Email | null> {
    return this.update(id, { status });
  }

  async approve(id: string, reviewerId: string, editedSubject?: string, editedBody?: string): Promise<Email | null> {
    return this.update(id, {
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
      edited_subject: editedSubject,
      edited_body: editedBody,
    });
  }

  async reject(id: string, reviewerId: string, reason: string): Promise<Email | null> {
    return this.update(id, {
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
      rejection_reason: reason,
    });
  }

  async markSent(id: string, resendId: string): Promise<Email | null> {
    return this.update(id, {
      status: 'sent',
      resend_id: resendId,
      sent_at: new Date(),
    });
  }

  async markOpened(id: string): Promise<Email | null> {
    const email = await this.findById(id);
    if (!email) return null;

    return this.update(id, {
      status: email.status === 'sent' || email.status === 'delivered' ? 'opened' : email.status,
      opened_at: email.opened_at || new Date(),
      open_count: (email.open_count || 0) + 1,
    });
  }

  async markClicked(id: string): Promise<Email | null> {
    const email = await this.findById(id);
    if (!email) return null;

    return this.update(id, {
      status: 'clicked',
      clicked_at: email.clicked_at || new Date(),
      click_count: (email.click_count || 0) + 1,
    });
  }

  async findPendingReview(limit = 50): Promise<Email[]> {
    return this.query<Email>(`
      SELECT e.*, p.url as prospect_url, p.domain as prospect_domain,
             p.domain_authority, p.quality_score,
             c.email as contact_email, c.name as contact_name
      FROM emails e
      JOIN prospects p ON e.prospect_id = p.id
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.status = 'pending_review'
      ORDER BY p.quality_score DESC NULLS LAST, e.created_at ASC
      LIMIT $1
    `, [limit]);
  }

  async findApprovedToSend(limit = 50): Promise<Email[]> {
    return this.query<Email>(`
      SELECT e.*, c.email as contact_email, c.name as contact_name
      FROM emails e
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.status = 'approved'
      ORDER BY e.reviewed_at ASC
      LIMIT $1
    `, [limit]);
  }

  async findByProspect(prospectId: string): Promise<Email[]> {
    return this.query<Email>(
      'SELECT * FROM emails WHERE prospect_id = $1 ORDER BY created_at DESC',
      [prospectId]
    );
  }

  async findByResendId(resendId: string): Promise<Email | null> {
    return this.queryOne<Email>(
      'SELECT * FROM emails WHERE resend_id = $1',
      [resendId]
    );
  }

  async countSentToday(): Promise<number> {
    const result = await this.queryOne<{ count: string }>(`
      SELECT COUNT(*) as count FROM emails
      WHERE sent_at >= CURRENT_DATE AND sent_at < CURRENT_DATE + INTERVAL '1 day'
    `);
    return parseInt(result?.count || '0', 10);
  }

  async getStats(days = 30): Promise<{
    total_sent: number;
    total_opened: number;
    total_clicked: number;
    total_replied: number;
    open_rate: number;
    click_rate: number;
  }> {
    const result = await this.queryOne<{
      total_sent: string;
      total_opened: string;
      total_clicked: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')) as total_sent,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as total_opened,
        COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as total_clicked
      FROM emails
      WHERE sent_at >= NOW() - INTERVAL '${days} days'
    `);

    const totalSent = parseInt(result?.total_sent || '0', 10);
    const totalOpened = parseInt(result?.total_opened || '0', 10);
    const totalClicked = parseInt(result?.total_clicked || '0', 10);

    // Get reply count from responses table
    const replyResult = await this.queryOne<{ count: string }>(`
      SELECT COUNT(DISTINCT email_id) as count FROM responses
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `);
    const totalReplied = parseInt(replyResult?.count || '0', 10);

    return {
      total_sent: totalSent,
      total_opened: totalOpened,
      total_clicked: totalClicked,
      total_replied: totalReplied,
      open_rate: totalSent > 0 ? (totalOpened / totalSent) * 100 : 0,
      click_rate: totalSent > 0 ? (totalClicked / totalSent) * 100 : 0,
    };
  }
}

export const emailRepository = new EmailRepository();
export default emailRepository;
