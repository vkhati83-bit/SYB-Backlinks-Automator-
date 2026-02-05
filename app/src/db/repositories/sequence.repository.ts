import { BaseRepository } from './base.repository.js';
import { Sequence, SequenceStatus } from '../../types/index.js';
import env from '../../config/env.js';

export interface CreateSequenceInput {
  email_id: string;
  prospect_id: string;
  contact_id: string;
  max_steps?: number;
}

export class SequenceRepository extends BaseRepository<Sequence> {
  constructor() {
    super('sequences');
  }

  async create(input: CreateSequenceInput): Promise<Sequence> {
    const nextFollowupAt = new Date();
    nextFollowupAt.setDate(nextFollowupAt.getDate() + env.FOLLOWUP_1_DELAY_DAYS);

    const result = await this.queryOne<Sequence>(`
      INSERT INTO sequences (
        email_id, prospect_id, contact_id, max_steps, next_followup_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      input.email_id,
      input.prospect_id,
      input.contact_id,
      input.max_steps || 3,
      nextFollowupAt,
    ]);
    return result!;
  }

  async updateStatus(id: string, status: SequenceStatus, reason?: string): Promise<Sequence | null> {
    return this.queryOne<Sequence>(`
      UPDATE sequences SET
        status = $1,
        stopped_reason = $2,
        next_followup_at = CASE WHEN $1 IN ('completed', 'stopped') THEN NULL ELSE next_followup_at END
      WHERE id = $3
      RETURNING *
    `, [status, reason || null, id]);
  }

  async advanceStep(id: string): Promise<Sequence | null> {
    const sequence = await this.findById(id);
    if (!sequence) return null;

    const nextStep = sequence.current_step + 1;

    if (nextStep > sequence.max_steps) {
      return this.updateStatus(id, 'completed', 'All follow-ups sent');
    }

    // Calculate next follow-up time
    const delayDays = nextStep === 2 ? env.FOLLOWUP_2_DELAY_DAYS : env.FOLLOWUP_1_DELAY_DAYS;
    const nextFollowupAt = new Date();
    nextFollowupAt.setDate(nextFollowupAt.getDate() + delayDays);

    return this.queryOne<Sequence>(`
      UPDATE sequences SET
        current_step = $1,
        next_followup_at = $2
      WHERE id = $3
      RETURNING *
    `, [nextStep, nextFollowupAt, id]);
  }

  async stop(id: string, reason: string): Promise<Sequence | null> {
    return this.updateStatus(id, 'stopped', reason);
  }

  async stopByEmailId(emailId: string, reason: string): Promise<Sequence | null> {
    return this.queryOne<Sequence>(`
      UPDATE sequences SET
        status = 'stopped',
        stopped_reason = $1,
        next_followup_at = NULL
      WHERE email_id = $2 AND status = 'active'
      RETURNING *
    `, [reason, emailId]);
  }

  async findByEmail(emailId: string): Promise<Sequence | null> {
    return this.queryOne<Sequence>(
      'SELECT * FROM sequences WHERE email_id = $1',
      [emailId]
    );
  }

  async findDueForFollowup(limit = 50): Promise<Sequence[]> {
    return this.query<Sequence>(`
      SELECT s.*, c.email as contact_email, c.name as contact_name,
             p.url as prospect_url, p.domain as prospect_domain
      FROM sequences s
      JOIN contacts c ON s.contact_id = c.id
      JOIN prospects p ON s.prospect_id = p.id
      WHERE s.status = 'active'
        AND s.next_followup_at <= NOW()
      ORDER BY s.next_followup_at ASC
      LIMIT $1
    `, [limit]);
  }

  async findActive(): Promise<Sequence[]> {
    return this.query<Sequence>(
      'SELECT * FROM sequences WHERE status = $1 ORDER BY next_followup_at ASC',
      ['active']
    );
  }

  async countActive(): Promise<number> {
    return this.count("status = 'active'");
  }
}

export const sequenceRepository = new SequenceRepository();
export default sequenceRepository;
