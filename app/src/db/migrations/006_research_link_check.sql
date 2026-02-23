-- Add research link check columns to prospects table
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS research_link_found BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS research_link_last_checked_at TIMESTAMPTZ DEFAULT NULL;

-- Index for quick lookup of unchecked prospects
CREATE INDEX IF NOT EXISTS idx_prospects_link_check
  ON prospects (research_link_last_checked_at)
  WHERE research_link_last_checked_at IS NULL;
