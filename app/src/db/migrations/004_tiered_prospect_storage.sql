-- ============================================
-- Tiered Prospect Storage - Zero Data Loss
-- Created: 2026-02-12
-- Purpose: Save ALL prospects with filter status instead of discarding them
-- ============================================

-- Add filtering metadata to prospects table
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS filter_status VARCHAR(50) DEFAULT 'auto_approved'
    CHECK (filter_status IN ('auto_approved', 'needs_review', 'auto_rejected')),
  ADD COLUMN IF NOT EXISTS filter_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS filter_score INTEGER DEFAULT 100;

-- Add broken link verification columns
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS broken_url TEXT,
  ADD COLUMN IF NOT EXISTS broken_url_status_code INTEGER,
  ADD COLUMN IF NOT EXISTS broken_url_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS outbound_link_context TEXT;

-- Add article matching columns
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS suggested_article_url TEXT,
  ADD COLUMN IF NOT EXISTS suggested_article_title TEXT,
  ADD COLUMN IF NOT EXISTS match_reason TEXT;

-- Create filter log table to track filtering decisions per batch
CREATE TABLE IF NOT EXISTS prospect_filter_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL,
  fetch_type VARCHAR(50) NOT NULL,  -- 'research_citations', 'broken_links', 'backlinks_to_url'
  total_found INTEGER NOT NULL DEFAULT 0,
  auto_approved INTEGER NOT NULL DEFAULT 0,
  needs_review INTEGER NOT NULL DEFAULT 0,
  auto_rejected INTEGER NOT NULL DEFAULT 0,
  filter_breakdown JSONB DEFAULT '{}',  -- Detailed breakdown by filter reason
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for filtering queries
CREATE INDEX IF NOT EXISTS idx_prospects_filter_status ON prospects(filter_status);
CREATE INDEX IF NOT EXISTS idx_prospects_filter_score ON prospects(filter_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_filter_status_campaign ON prospects(filter_status, campaign_id);
CREATE INDEX IF NOT EXISTS idx_prospect_filter_log_batch ON prospect_filter_log(batch_id);
CREATE INDEX IF NOT EXISTS idx_prospect_filter_log_created ON prospect_filter_log(created_at);

-- Performance-critical: Filter out auto_rejected from main queries by default
-- This allows us to save everything but still show only quality prospects by default
CREATE INDEX IF NOT EXISTS idx_prospects_approved_only ON prospects(id, domain, quality_score DESC)
  WHERE filter_status IN ('auto_approved', 'needs_review');

COMMENT ON COLUMN prospects.filter_status IS 'Categorizes prospects: auto_approved (70+), needs_review (30-69), auto_rejected (<30)';
COMMENT ON COLUMN prospects.filter_reasons IS 'Array of filter flags: duplicate_domain, domain_blocklist, exclude_keywords, no_health_keywords, etc.';
COMMENT ON COLUMN prospects.filter_score IS 'Cumulative score based on quality and filter penalties (0-100)';
COMMENT ON TABLE prospect_filter_log IS 'Tracks filtering decisions per batch to monitor data loss and filter effectiveness';
