-- ============================================
-- Soft Delete with 90-Day Trash
-- Created: 2026-02-12
-- Purpose: Implement soft delete with trash system and restore capability
-- ============================================

-- Add soft delete columns to prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Performance-critical filtered index (only indexes active prospects)
CREATE INDEX IF NOT EXISTS idx_prospects_active ON prospects(id, domain)
  WHERE deleted_at IS NULL;

-- Index for trash queries
CREATE INDEX IF NOT EXISTS idx_prospects_deleted ON prospects(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Index for cleanup job (just index deleted_at for trash queries)
CREATE INDEX IF NOT EXISTS idx_prospects_trash_cleanup ON prospects(deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN prospects.deleted_at IS 'Soft delete timestamp - NULL = active, NOT NULL = in trash';
COMMENT ON COLUMN prospects.deleted_reason IS 'Reason for deletion (user-provided or automated)';
COMMENT ON COLUMN prospects.deleted_by IS 'User who deleted the prospect (NULL = system deleted)';

-- View for active prospects only (convenience)
CREATE OR REPLACE VIEW active_prospects AS
SELECT * FROM prospects WHERE deleted_at IS NULL;

-- View for trash
CREATE OR REPLACE VIEW trashed_prospects AS
SELECT * FROM prospects WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- View for prospects ready for permanent deletion (90+ days in trash)
CREATE OR REPLACE VIEW prospects_ready_for_permanent_deletion AS
SELECT * FROM prospects
WHERE deleted_at IS NOT NULL
  AND deleted_at < (NOW() - INTERVAL '90 days')
ORDER BY deleted_at ASC;
