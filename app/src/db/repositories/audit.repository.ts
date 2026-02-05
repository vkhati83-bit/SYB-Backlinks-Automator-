import { BaseRepository } from './base.repository.js';
import { AuditLog, AuditAction } from '../../types/index.js';

export interface CreateAuditLogInput {
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  user_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
}

export class AuditRepository extends BaseRepository<AuditLog> {
  constructor() {
    super('audit_log');
  }

  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    const result = await this.queryOne<AuditLog>(`
      INSERT INTO audit_log (action, entity_type, entity_id, user_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      input.action,
      input.entity_type,
      input.entity_id || null,
      input.user_id || null,
      input.details || {},
      input.ip_address || null,
    ]);
    return result!;
  }

  // Convenience methods for common actions
  async logProspectCreated(prospectId: string, details?: Record<string, unknown>): Promise<void> {
    await this.log({ action: 'prospect_created', entity_type: 'prospect', entity_id: prospectId, details });
  }

  async logContactFound(contactId: string, prospectId: string): Promise<void> {
    await this.log({ action: 'contact_found', entity_type: 'contact', entity_id: contactId, details: { prospect_id: prospectId } });
  }

  async logEmailGenerated(emailId: string, prospectId: string): Promise<void> {
    await this.log({ action: 'email_generated', entity_type: 'email', entity_id: emailId, details: { prospect_id: prospectId } });
  }

  async logEmailApproved(emailId: string, userId: string): Promise<void> {
    await this.log({ action: 'email_approved', entity_type: 'email', entity_id: emailId, user_id: userId });
  }

  async logEmailRejected(emailId: string, userId: string, reason: string): Promise<void> {
    await this.log({ action: 'email_rejected', entity_type: 'email', entity_id: emailId, user_id: userId, details: { reason } });
  }

  async logEmailEdited(emailId: string, userId: string, changes: Record<string, unknown>): Promise<void> {
    await this.log({ action: 'email_edited', entity_type: 'email', entity_id: emailId, user_id: userId, details: changes });
  }

  async logEmailSent(emailId: string, recipientEmail: string): Promise<void> {
    await this.log({ action: 'email_sent', entity_type: 'email', entity_id: emailId, details: { recipient: recipientEmail } });
  }

  async logFollowupSent(emailId: string, step: number): Promise<void> {
    await this.log({ action: 'followup_sent', entity_type: 'email', entity_id: emailId, details: { step } });
  }

  async logResponseReceived(responseId: string, emailId: string, category?: string): Promise<void> {
    await this.log({ action: 'response_received', entity_type: 'response', entity_id: responseId, details: { email_id: emailId, category } });
  }

  async logLinkVerified(prospectId: string, linkStatus: string): Promise<void> {
    await this.log({ action: 'link_verified', entity_type: 'prospect', entity_id: prospectId, details: { status: linkStatus } });
  }

  async logBlocklistAdded(type: string, value: string, userId?: string): Promise<void> {
    await this.log({ action: 'blocklist_added', entity_type: 'blocklist', user_id: userId, details: { type, value } });
  }

  async logSettingsChanged(userId: string, changes: Record<string, unknown>): Promise<void> {
    await this.log({ action: 'settings_changed', entity_type: 'settings', user_id: userId, details: changes });
  }

  // CRM Enhancement Methods
  async logProspectApproved(prospectId: string, userId?: string): Promise<void> {
    await this.log({ action: 'prospect_approved', entity_type: 'prospect', entity_id: prospectId, user_id: userId });
  }

  async logProspectRejected(prospectId: string, userId?: string): Promise<void> {
    await this.log({ action: 'prospect_rejected', entity_type: 'prospect', entity_id: prospectId, user_id: userId });
  }

  async logProspectBulkAction(action: string, ids: string[], count: number): Promise<void> {
    await this.log({ action: 'prospect_bulk_action', entity_type: 'prospect', details: { action, ids, count } });
  }

  async logOutcomeTagged(prospectId: string, outcomeTag: string | null): Promise<void> {
    await this.log({ action: 'outcome_tagged', entity_type: 'prospect', entity_id: prospectId, details: { outcome_tag: outcomeTag } });
  }

  async logContactSetPrimary(contactId: string, prospectId: string): Promise<void> {
    await this.log({ action: 'contact_set_primary', entity_type: 'contact', entity_id: contactId, details: { prospect_id: prospectId } });
  }

  async logContactQueued(contactId: string, prospectId: string, position: number): Promise<void> {
    await this.log({ action: 'contact_queued', entity_type: 'contact', entity_id: contactId, details: { prospect_id: prospectId, position } });
  }

  async logContactRemovedFromQueue(contactId: string, prospectId: string): Promise<void> {
    await this.log({ action: 'contact_removed_from_queue', entity_type: 'contact', entity_id: contactId, details: { prospect_id: prospectId } });
  }

  async logKeywordAdded(keywordId: string, keyword: string, niche?: string): Promise<void> {
    await this.log({ action: 'keyword_added', entity_type: 'keyword', entity_id: keywordId, details: { keyword, niche } });
  }

  async logKeywordRemoved(keywordId: string, keyword: string): Promise<void> {
    await this.log({ action: 'keyword_removed', entity_type: 'keyword', entity_id: keywordId, details: { keyword } });
  }

  // Query methods
  async findByEntity(entityType: string, entityId: string, limit = 50): Promise<AuditLog[]> {
    return this.query<AuditLog>(
      'SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3',
      [entityType, entityId, limit]
    );
  }

  async findByUser(userId: string, limit = 50): Promise<AuditLog[]> {
    return this.query<AuditLog>(
      'SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
  }

  async findByAction(action: AuditAction, limit = 50): Promise<AuditLog[]> {
    return this.query<AuditLog>(
      'SELECT * FROM audit_log WHERE action = $1 ORDER BY created_at DESC LIMIT $2',
      [action, limit]
    );
  }

  async findRecent(limit = 100): Promise<AuditLog[]> {
    return this.query<AuditLog>(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
  }
}

export const auditRepository = new AuditRepository();
export default auditRepository;
