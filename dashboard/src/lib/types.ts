export interface Prospect {
  id: string;
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  domain_authority: number | null;
  quality_score: number | null;
  opportunity_type: string;
  status: string;
  niche: string | null;
  approval_status: string;
  outcome_tag: string | null;
  contact_count: number;
  suggested_article_url?: string | null;
  suggested_article_title?: string | null;
  match_reason?: string | null;
  broken_url?: string | null;
  outbound_link_context?: string | null;
  broken_url_status_code?: number | null;
  broken_url_verified_at?: string | null;
  page_authority?: number | null;
  spam_score?: number | null;
  is_dofollow?: boolean | null;
  filter_status?: string | null;
  filter_reasons?: string[] | null;
  first_seen?: string | null;
  last_seen?: string | null;
}
