-- ============================================
-- Page Authority & Dofollow tracking
-- Created: 2026-02-16
-- Purpose: Store page_from_rank and dofollow status from DataForSEO backlinks API
-- ============================================

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS page_authority INTEGER,
  ADD COLUMN IF NOT EXISTS is_dofollow BOOLEAN,
  ADD COLUMN IF NOT EXISTS first_seen TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN prospects.page_authority IS 'Page Authority (page_from_rank from DataForSEO)';
COMMENT ON COLUMN prospects.is_dofollow IS 'Whether the backlink is dofollow';
COMMENT ON COLUMN prospects.first_seen IS 'When the backlink was first seen by DataForSEO';
COMMENT ON COLUMN prospects.last_seen IS 'When the backlink was last seen by DataForSEO';
