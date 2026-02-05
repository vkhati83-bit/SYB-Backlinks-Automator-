-- ============================================
-- Enhanced CRM Migration
-- Created: 2026-01-29
-- ============================================

-- ============================================
-- 1. ENHANCE PROSPECTS TABLE
-- ============================================
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS niche VARCHAR(100),
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS outcome_tag VARCHAR(50) DEFAULT NULL
    CHECK (outcome_tag IS NULL OR outcome_tag IN ('partner', 'not_interested', 'follow_up_later', 'no_response', 'bounced', 'unsubscribed'));

CREATE INDEX IF NOT EXISTS idx_prospects_approval_status ON prospects(approval_status);
CREATE INDEX IF NOT EXISTS idx_prospects_niche ON prospects(niche);
CREATE INDEX IF NOT EXISTS idx_prospects_outcome_tag ON prospects(outcome_tag) WHERE outcome_tag IS NOT NULL;

-- ============================================
-- 2. ENHANCE CONTACTS TABLE (Email Queue)
-- ============================================
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS queue_position INTEGER,
ADD COLUMN IF NOT EXISTS queue_status VARCHAR(50) DEFAULT NULL
    CHECK (queue_status IS NULL OR queue_status IN ('queued', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_contacts_is_primary ON contacts(prospect_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_queue ON contacts(prospect_id, queue_position) WHERE queue_status = 'queued';

-- ============================================
-- 3. SEARCH KEYWORDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS search_keywords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword VARCHAR(255) NOT NULL UNIQUE,
    niche VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    match_count INTEGER DEFAULT 0,
    last_searched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_keywords_niche ON search_keywords(niche);
CREATE INDEX IF NOT EXISTS idx_search_keywords_active ON search_keywords(is_active) WHERE is_active = TRUE;

-- ============================================
-- 4. NICHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS niches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    keywords TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_niches_active ON niches(is_active) WHERE is_active = TRUE;

-- Apply updated_at trigger to niches
CREATE TRIGGER update_niches_updated_at BEFORE UPDATE ON niches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. DEFAULT NICHES DATA
-- ============================================
INSERT INTO niches (name, description, keywords) VALUES
    ('EMF Health', 'EMF exposure and radiation protection', ARRAY['emf', 'electromagnetic', 'radiation', '5g', 'wifi safety']),
    ('Wellness', 'General health and wellness', ARRAY['health', 'wellness', 'natural', 'holistic']),
    ('Parenting', 'Family and child safety', ARRAY['parenting', 'family', 'kids', 'baby', 'child safety']),
    ('Tech Health', 'Technology impact on health', ARRAY['tech', 'digital wellness', 'screen time', 'blue light'])
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. ADDITIONAL AUDIT ACTIONS
-- ============================================
-- Note: Audit log table already exists with flexible action column
-- New actions we'll log:
-- - prospect_approved
-- - prospect_rejected
-- - prospect_bulk_action
-- - contact_set_primary
-- - contact_queued
-- - contact_removed_from_queue
-- - outcome_tagged
-- - keyword_added
-- - keyword_removed
