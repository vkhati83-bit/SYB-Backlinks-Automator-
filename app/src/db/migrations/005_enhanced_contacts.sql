-- ============================================
-- Enhanced Contacts - Multi-Source Intelligence
-- Created: 2026-02-12
-- Purpose: Support multi-source contact finding with quality scoring
-- ============================================

-- Add enhanced metadata to contacts table
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'valid', 'invalid', 'risky', 'unknown')),
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS api_cost_cents INTEGER DEFAULT 0;

-- Create contact API logs table to track costs and usage
CREATE TABLE IF NOT EXISTS contact_api_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  api_provider VARCHAR(50) NOT NULL,  -- 'hunter', 'clearbit', 'google_search', 'scraper', 'claude'
  endpoint VARCHAR(100) NOT NULL,
  request_data JSONB DEFAULT '{}',
  response_data JSONB DEFAULT '{}',
  cost_cents INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  cached BOOLEAN DEFAULT FALSE,
  cache_hit BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for contact lookups and analytics
CREATE INDEX IF NOT EXISTS idx_contacts_confidence ON contacts(confidence_score DESC) WHERE confidence_score > 0;
CREATE INDEX IF NOT EXISTS idx_contacts_verification ON contacts(verification_status);
CREATE INDEX IF NOT EXISTS idx_contacts_title ON contacts(title) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_api_logs_prospect ON contact_api_logs(prospect_id);
CREATE INDEX IF NOT EXISTS idx_contact_api_logs_provider ON contact_api_logs(api_provider);
CREATE INDEX IF NOT EXISTS idx_contact_api_logs_created ON contact_api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_contact_api_logs_cost ON contact_api_logs(cost_cents) WHERE cost_cents > 0;

-- Add comments for documentation
COMMENT ON COLUMN contacts.confidence_score IS 'Quality score 0-100: <30=poor, 30-49=fair, 50-69=good, 70-89=excellent, 90+=verified decision-maker';
COMMENT ON COLUMN contacts.verification_status IS 'Email deliverability status from validation API';
COMMENT ON COLUMN contacts.source_metadata IS 'JSON metadata from API providers (LinkedIn URL, Hunter data, etc.)';
COMMENT ON COLUMN contacts.api_cost_cents IS 'Total API cost in cents to find/verify this contact';

COMMENT ON TABLE contact_api_logs IS 'Tracks all API calls made for contact finding and verification';
COMMENT ON COLUMN contact_api_logs.cached IS 'Whether result was cached for future use';
COMMENT ON COLUMN contact_api_logs.cache_hit IS 'Whether this request used cached data';

-- Create view for high-quality contacts
CREATE OR REPLACE VIEW high_quality_contacts AS
SELECT
  c.*,
  p.domain,
  p.url,
  p.opportunity_type,
  p.approval_status
FROM contacts c
JOIN prospects p ON p.id = c.prospect_id
WHERE c.confidence_score >= 70
  AND c.verification_status IN ('valid', 'unverified')
ORDER BY c.confidence_score DESC;

-- Create view for contact finding costs summary
CREATE OR REPLACE VIEW contact_api_costs_summary AS
SELECT
  api_provider,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE success = TRUE) as successful_calls,
  COUNT(*) FILTER (WHERE cache_hit = TRUE) as cache_hits,
  SUM(cost_cents) as total_cost_cents,
  ROUND(AVG(cost_cents), 2) as avg_cost_cents,
  DATE_TRUNC('day', created_at) as date
FROM contact_api_logs
GROUP BY api_provider, DATE_TRUNC('day', created_at)
ORDER BY date DESC, total_cost_cents DESC;
