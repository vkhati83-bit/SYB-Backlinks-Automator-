import { BaseRepository } from './base.repository.js';
import { Contact, ContactConfidenceTier, QueueStatus } from '../../types/index.js';

export interface CreateContactInput {
  prospect_id: string;
  email: string;
  name?: string;
  role?: string;
  confidence_tier?: ContactConfidenceTier;
  source: 'scraped' | 'pattern' | 'linkedin' | 'manual';
  linkedin_url?: string;
  twitter_handle?: string;
  is_primary?: boolean;
}

export interface UpdateContactInput {
  name?: string;
  role?: string;
  confidence_tier?: ContactConfidenceTier;
  verified?: boolean;
  linkedin_url?: string;
  twitter_handle?: string;
  is_primary?: boolean;
  queue_position?: number | null;
  queue_status?: QueueStatus | null;
}

export class ContactRepository extends BaseRepository<Contact> {
  constructor() {
    super('contacts');
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const result = await this.queryOne<Contact>(`
      INSERT INTO contacts (
        prospect_id, email, name, role, confidence_tier,
        source, linkedin_url, twitter_handle
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (prospect_id, email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, contacts.name),
        role = COALESCE(EXCLUDED.role, contacts.role),
        confidence_tier = CASE
          WHEN EXCLUDED.confidence_tier < contacts.confidence_tier
          THEN EXCLUDED.confidence_tier
          ELSE contacts.confidence_tier
        END
      RETURNING *
    `, [
      input.prospect_id,
      input.email.toLowerCase(),
      input.name || null,
      input.role || null,
      input.confidence_tier || 'D',
      input.source,
      input.linkedin_url || null,
      input.twitter_handle || null,
    ]);
    return result!;
  }

  async update(id: string, input: UpdateContactInput): Promise<Contact | null> {
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
    return this.queryOne<Contact>(`
      UPDATE contacts SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
  }

  async findByProspect(prospectId: string): Promise<Contact[]> {
    return this.query<Contact>(
      `SELECT * FROM contacts WHERE prospect_id = $1
       ORDER BY confidence_tier ASC, created_at DESC`,
      [prospectId]
    );
  }

  async findByEmail(email: string): Promise<Contact[]> {
    return this.query<Contact>(
      'SELECT * FROM contacts WHERE email = $1',
      [email.toLowerCase()]
    );
  }

  async findBestContact(prospectId: string): Promise<Contact | null> {
    return this.queryOne<Contact>(`
      SELECT * FROM contacts
      WHERE prospect_id = $1
      ORDER BY confidence_tier ASC, verified DESC, created_at DESC
      LIMIT 1
    `, [prospectId]);
  }

  async markVerified(id: string): Promise<Contact | null> {
    return this.update(id, { verified: true });
  }

  async isEmailBlocked(email: string): Promise<boolean> {
    const result = await this.queryOne<{ exists: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM blocklist WHERE type = 'email' AND value = $1
      ) as exists
    `, [email.toLowerCase()]);
    return result?.exists || false;
  }

  async getContactWithProspect(contactId: string): Promise<(Contact & { prospect_url: string; prospect_domain: string }) | null> {
    return this.queryOne(`
      SELECT c.*, p.url as prospect_url, p.domain as prospect_domain
      FROM contacts c
      JOIN prospects p ON c.prospect_id = p.id
      WHERE c.id = $1
    `, [contactId]);
  }

  // ============================================
  // EMAIL QUEUE METHODS
  // ============================================

  async setPrimary(prospectId: string, contactId: string): Promise<Contact | null> {
    // First, unset any existing primary contact for this prospect
    await this.queryOne(`
      UPDATE contacts
      SET is_primary = FALSE
      WHERE prospect_id = $1 AND is_primary = TRUE
    `, [prospectId]);

    // Then set the new primary
    return this.queryOne<Contact>(`
      UPDATE contacts
      SET is_primary = TRUE
      WHERE id = $1 AND prospect_id = $2
      RETURNING *
    `, [contactId, prospectId]);
  }

  async getPrimaryContact(prospectId: string): Promise<Contact | null> {
    return this.queryOne<Contact>(`
      SELECT * FROM contacts
      WHERE prospect_id = $1 AND is_primary = TRUE
    `, [prospectId]);
  }

  async addToQueue(prospectId: string, contactId: string): Promise<Contact | null> {
    // Get the next queue position
    const maxPos = await this.queryOne<{ max_pos: number | null }>(`
      SELECT MAX(queue_position) as max_pos
      FROM contacts
      WHERE prospect_id = $1 AND queue_status = 'queued'
    `, [prospectId]);

    const nextPosition = (maxPos?.max_pos ?? 0) + 1;

    return this.queryOne<Contact>(`
      UPDATE contacts
      SET queue_status = 'queued', queue_position = $3
      WHERE id = $1 AND prospect_id = $2
      RETURNING *
    `, [contactId, prospectId, nextPosition]);
  }

  async removeFromQueue(prospectId: string, contactId: string): Promise<Contact | null> {
    const contact = await this.queryOne<Contact>(`
      UPDATE contacts
      SET queue_status = NULL, queue_position = NULL
      WHERE id = $1 AND prospect_id = $2
      RETURNING *
    `, [contactId, prospectId]);

    // Reorder remaining queue
    if (contact) {
      await this.reorderQueue(prospectId);
    }

    return contact;
  }

  async reorderQueue(prospectId: string): Promise<void> {
    await this.queryOne(`
      WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
        FROM contacts
        WHERE prospect_id = $1 AND queue_status = 'queued'
      )
      UPDATE contacts c
      SET queue_position = o.new_pos
      FROM ordered o
      WHERE c.id = o.id
    `, [prospectId]);
  }

  async updateQueuePosition(prospectId: string, contactId: string, newPosition: number): Promise<Contact | null> {
    return this.queryOne<Contact>(`
      UPDATE contacts
      SET queue_position = $3
      WHERE id = $1 AND prospect_id = $2 AND queue_status = 'queued'
      RETURNING *
    `, [contactId, prospectId, newPosition]);
  }

  async getQueue(prospectId: string): Promise<Contact[]> {
    return this.query<Contact>(`
      SELECT * FROM contacts
      WHERE prospect_id = $1 AND queue_status = 'queued'
      ORDER BY queue_position ASC
    `, [prospectId]);
  }

  async updateQueueStatus(contactId: string, status: QueueStatus): Promise<Contact | null> {
    return this.queryOne<Contact>(`
      UPDATE contacts
      SET queue_status = $2
      WHERE id = $1
      RETURNING *
    `, [contactId, status]);
  }

  async getNextInQueue(prospectId: string): Promise<Contact | null> {
    return this.queryOne<Contact>(`
      SELECT * FROM contacts
      WHERE prospect_id = $1 AND queue_status = 'queued'
      ORDER BY queue_position ASC
      LIMIT 1
    `, [prospectId]);
  }
}

export const contactRepository = new ContactRepository();
export default contactRepository;
