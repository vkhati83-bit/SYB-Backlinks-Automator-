-- ============================================
-- Add Snov.io source types to contacts table
-- Created: 2026-02-24
-- Purpose: Allow 'snov_domain_search' and 'snov_email_finder' as contact sources
-- ============================================

-- Drop and recreate the CHECK constraint on source column
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check
  CHECK (source IN ('scraped', 'pattern', 'linkedin', 'manual', 'snov_domain_search', 'snov_email_finder'));
