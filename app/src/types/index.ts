// ============================================
// PROSPECT TYPES
// ============================================

export type ProspectStatus =
  | 'new'
  | 'contact_found'
  | 'email_generated'
  | 'email_sent'
  | 'replied'
  | 'link_placed'
  | 'rejected'
  | 'bounced';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type OutcomeTag =
  | 'partner'
  | 'not_interested'
  | 'follow_up_later'
  | 'no_response'
  | 'bounced'
  | 'unsubscribed';

export interface Prospect {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  domain_authority: number | null;
  spam_score: number | null;
  monthly_traffic: number | null;
  quality_score: number | null;
  filter_score: number | null;
  filter_status: string | null;
  opportunity_type: 'research_citation' | 'broken_link' | 'guest_post';
  status: ProspectStatus;
  campaign_id: string | null;
  source: string | null;
  niche: string | null;
  approval_status: ApprovalStatus;
  outcome_tag: OutcomeTag | null;
  suggested_article_url: string | null;
  suggested_article_title: string | null;
  match_reason: string | null;
  broken_url: string | null;
  outbound_link_context: string | null;
  broken_url_status_code: number | null;
  broken_url_verified_at: Date | null;
  page_authority: number | null;
  is_dofollow: boolean | null;
  first_seen: Date | null;
  last_seen: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// CONTACT TYPES
// ============================================

export type ContactConfidenceTier = 'A' | 'B' | 'C' | 'D';

export type QueueStatus = 'queued' | 'sent' | 'failed';

export interface Contact {
  id: string;
  prospect_id: string;
  email: string;
  name: string | null;
  role: string | null;
  confidence_tier: ContactConfidenceTier;
  source: 'scraped' | 'pattern' | 'linkedin' | 'manual' | 'snov_domain_search' | 'snov_email_finder';
  verified: boolean;
  is_primary: boolean;
  queue_position: number | null;
  queue_status: QueueStatus | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// EMAIL TYPES
// ============================================

export type EmailStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained';

export interface Email {
  id: string;
  prospect_id: string;
  contact_id: string;
  campaign_id: string | null;
  template_id: string | null;
  ab_test_id: string | null;
  ab_variant: string | null;
  subject: string;
  body: string;
  edited_subject: string | null;
  edited_body: string | null;
  status: EmailStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  resend_id: string | null;
  sent_at: Date | null;
  opened_at: Date | null;
  clicked_at: Date | null;
  open_count: number;
  click_count: number;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// SEQUENCE TYPES
// ============================================

export type SequenceStatus = 'active' | 'paused' | 'completed' | 'stopped';

export interface Sequence {
  id: string;
  email_id: string;
  prospect_id: string;
  contact_id: string;
  status: SequenceStatus;
  current_step: number;
  max_steps: number;
  next_followup_at: Date | null;
  stopped_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// RESPONSE TYPES
// ============================================

export type ResponseCategory =
  | 'positive_will_link'
  | 'positive_needs_info'
  | 'conditional_guest_post'
  | 'conditional_reciprocal'
  | 'negative_not_interested'
  | 'negative_unsubscribe'
  | 'auto_reply'
  | 'uncategorized';

export interface Response {
  id: string;
  email_id: string;
  prospect_id: string;
  contact_id: string;
  sequence_id: string | null;
  subject: string;
  body: string;
  category: ResponseCategory;
  sentiment_score: number | null;
  ai_classification: ResponseCategory | null;
  human_classification: ResponseCategory | null;
  received_at: Date;
  processed_at: Date | null;
  created_at: Date;
}

// ============================================
// CAMPAIGN TYPES
// ============================================

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  opportunity_type: 'research_citation' | 'broken_link' | 'guest_post';
  target_count: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// LINK CHECK TYPES
// ============================================

export type LinkStatus = 'not_found' | 'found_dofollow' | 'found_nofollow' | 'removed';

export interface LinkCheck {
  id: string;
  prospect_id: string;
  target_url: string;
  link_url: string;
  anchor_text: string | null;
  link_status: LinkStatus;
  first_found_at: Date | null;
  last_checked_at: Date;
  check_count: number;
  created_at: Date;
}

// ============================================
// A/B TEST TYPES
// ============================================

export interface ABTest {
  id: string;
  campaign_id: string;
  name: string;
  test_type: 'subject' | 'body' | 'send_time';
  variants: ABVariant[];
  winner_variant: string | null;
  status: 'running' | 'completed';
  min_sample_size: number;
  created_at: Date;
  completed_at: Date | null;
}

export interface ABVariant {
  id: string;
  name: string;
  content: string;
  sent_count: number;
  open_count: number;
  reply_count: number;
  conversion_rate: number;
}

// ============================================
// BLOCKLIST TYPES
// ============================================

export type BlocklistType = 'domain' | 'email' | 'keyword';

export interface BlocklistEntry {
  id: string;
  type: BlocklistType;
  value: string;
  reason: string | null;
  added_by: string | null;
  created_at: Date;
}

// ============================================
// AUDIT LOG TYPES
// ============================================

export type AuditAction =
  | 'prospect_created'
  | 'prospect_approved'
  | 'prospect_rejected'
  | 'prospect_bulk_action'
  | 'prospect_bulk_review'
  | 'prospect_soft_deleted'
  | 'prospect_bulk_delete'
  | 'prospect_restored'
  | 'prospect_bulk_restore'
  | 'prospect_permanent_delete'
  | 'outcome_tagged'
  | 'contact_found'
  | 'contact_set_primary'
  | 'contact_queued'
  | 'contact_removed_from_queue'
  | 'contact_selected_for_outreach'
  | 'email_generated'
  | 'email_approved'
  | 'email_rejected'
  | 'email_edited'
  | 'email_sent'
  | 'followup_sent'
  | 'response_received'
  | 'response_categorized'
  | 'response_handled'
  | 'link_verified'
  | 'link_removed'
  | 'blocklist_added'
  | 'blocklist_removed'
  | 'settings_changed'
  | 'factory_reset'
  | 'campaign_created'
  | 'campaign_updated'
  | 'campaign_activated'
  | 'campaign_paused'
  | 'keyword_added'
  | 'keyword_removed';

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
}

// ============================================
// USER TYPES
// ============================================

export type UserRole = 'admin' | 'reviewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// SETTINGS TYPES
// ============================================

export interface Settings {
  sender_name: string;
  sender_email: string;
  daily_send_limit: number;
  followup_1_delay_days: number;
  followup_2_delay_days: number;
  followup_mode: 'manual' | 'smart_auto' | 'full_auto';
  min_domain_authority: number;
  max_spam_score: number;
  min_monthly_traffic: number;
  claude_model: string;
  warmup_enabled: boolean;
  warmup_week: number;
  email_signature?: string;   // Appended to every generated email
  sender_title?: string;      // e.g. "EMF Research Specialist"
  email_template_research?: string;
  email_template_broken_link?: string;
  email_template_followup_1?: string;
  email_template_followup_2?: string;
}

// ============================================
// METRICS TYPES
// ============================================

export interface DashboardMetrics {
  emails_sent_today: number;
  emails_sent_week: number;
  emails_sent_month: number;
  pending_review_count: number;
  open_rate_7d: number;
  reply_rate_7d: number;
  positive_replies_count: number;
  links_placed_count: number;
  cost_per_link: number;
}

export interface CampaignMetrics {
  campaign_id: string;
  prospects_count: number;
  contacts_found: number;
  emails_generated: number;
  emails_sent: number;
  emails_opened: number;
  replies_received: number;
  positive_replies: number;
  links_placed: number;
  conversion_rate: number;
}

// ============================================
// SEARCH KEYWORD TYPES
// ============================================

export interface SearchKeyword {
  id: string;
  keyword: string;
  niche: string | null;
  is_active: boolean;
  match_count: number;
  last_searched_at: Date | null;
  created_at: Date;
}

// ============================================
// NICHE TYPES
// ============================================

export interface Niche {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// GROUPED PROSPECTS TYPE
// ============================================

export interface GroupedProspects {
  broken_link: Prospect[];
  research_citation: Prospect[];
  guest_post: Prospect[];
}
