-- ============================================
-- Backlinks Gen - Initial Schema
-- Created: 2026-01-29
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CAMPAIGNS TABLE
-- ============================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    opportunity_type VARCHAR(50) NOT NULL CHECK (opportunity_type IN ('research_citation', 'broken_link', 'guest_post')),
    target_count INTEGER,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PROSPECTS TABLE
-- ============================================
CREATE TABLE prospects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    title TEXT,
    description TEXT,
    domain_authority INTEGER,
    spam_score INTEGER,
    monthly_traffic INTEGER,
    quality_score DECIMAL(5,2),
    opportunity_type VARCHAR(50) NOT NULL CHECK (opportunity_type IN ('research_citation', 'broken_link', 'guest_post')),
    status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contact_found', 'email_generated', 'email_sent', 'replied', 'link_placed', 'rejected', 'bounced')),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    source VARCHAR(100),
    page_content TEXT,
    last_crawled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(url)
);

CREATE INDEX idx_prospects_domain ON prospects(domain);
CREATE INDEX idx_prospects_status ON prospects(status);
CREATE INDEX idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX idx_prospects_quality_score ON prospects(quality_score DESC);

-- ============================================
-- CONTACTS TABLE
-- ============================================
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(100),
    confidence_tier CHAR(1) NOT NULL DEFAULT 'D' CHECK (confidence_tier IN ('A', 'B', 'C', 'D')),
    source VARCHAR(50) NOT NULL CHECK (source IN ('scraped', 'pattern', 'linkedin', 'manual')),
    verified BOOLEAN DEFAULT FALSE,
    linkedin_url TEXT,
    twitter_handle VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(prospect_id, email)
);

CREATE INDEX idx_contacts_prospect ON contacts(prospect_id);
CREATE INDEX idx_contacts_email ON contacts(email);

-- ============================================
-- TEMPLATES TABLE
-- ============================================
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    opportunity_type VARCHAR(50) NOT NULL CHECK (opportunity_type IN ('research_citation', 'broken_link', 'guest_post')),
    subject_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    success_rate DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AB TESTS TABLE
-- ============================================
CREATE TABLE ab_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    test_type VARCHAR(50) NOT NULL CHECK (test_type IN ('subject', 'body', 'send_time')),
    variants JSONB NOT NULL DEFAULT '[]',
    winner_variant VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed')),
    min_sample_size INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- EMAILS TABLE
-- ============================================
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    ab_test_id UUID REFERENCES ab_tests(id) ON DELETE SET NULL,
    ab_variant VARCHAR(100),
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    edited_subject VARCHAR(500),
    edited_body TEXT,
    resend_id VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_emails_prospect ON emails(prospect_id);
CREATE INDEX idx_emails_contact ON emails(contact_id);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_campaign ON emails(campaign_id);
CREATE INDEX idx_emails_sent_at ON emails(sent_at);

-- ============================================
-- SEQUENCES TABLE (Follow-up tracking)
-- ============================================
CREATE TABLE sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'stopped')),
    current_step INTEGER NOT NULL DEFAULT 1,
    max_steps INTEGER NOT NULL DEFAULT 3,
    next_followup_at TIMESTAMP WITH TIME ZONE,
    stopped_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sequences_status ON sequences(status);
CREATE INDEX idx_sequences_next_followup ON sequences(next_followup_at) WHERE status = 'active';

-- ============================================
-- FOLLOWUP EMAILS TABLE
-- ============================================
CREATE TABLE followup_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    resend_id VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_followup_sequence ON followup_emails(sequence_id);

-- ============================================
-- RESPONSES TABLE
-- ============================================
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'uncategorized' CHECK (category IN (
        'positive_will_link', 'positive_needs_info',
        'conditional_guest_post', 'conditional_reciprocal',
        'negative_not_interested', 'negative_unsubscribe',
        'auto_reply', 'uncategorized'
    )),
    sentiment_score DECIMAL(3,2),
    ai_classification VARCHAR(50),
    human_classification VARCHAR(50),
    is_processed BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_responses_prospect ON responses(prospect_id);
CREATE INDEX idx_responses_category ON responses(category);
CREATE INDEX idx_responses_received ON responses(received_at);

-- ============================================
-- LINK CHECKS TABLE
-- ============================================
CREATE TABLE link_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    link_url TEXT,
    anchor_text TEXT,
    link_status VARCHAR(50) NOT NULL DEFAULT 'not_found' CHECK (link_status IN ('not_found', 'found_dofollow', 'found_nofollow', 'removed')),
    first_found_at TIMESTAMP WITH TIME ZONE,
    last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMP WITH TIME ZONE,
    check_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_link_checks_prospect ON link_checks(prospect_id);
CREATE INDEX idx_link_checks_status ON link_checks(link_status);

-- ============================================
-- BLOCKLIST TABLE
-- ============================================
CREATE TABLE blocklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('domain', 'email', 'keyword')),
    value VARCHAR(255) NOT NULL,
    reason TEXT,
    added_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(type, value)
);

CREATE INDEX idx_blocklist_type ON blocklist(type);
CREATE INDEX idx_blocklist_value ON blocklist(value);

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin', 'reviewer')),
    active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- AUDIT LOG TABLE
-- ============================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
    ('sender_name', '"SYB Research Team"', 'Name shown in outreach emails'),
    ('sender_email', '"outreach@mail.shieldyourbody.com"', 'Email address for outreach'),
    ('daily_send_limit', '20', 'Maximum emails to send per day'),
    ('followup_1_delay_days', '4', 'Days to wait before first follow-up'),
    ('followup_2_delay_days', '8', 'Days to wait before second follow-up'),
    ('followup_mode', '"manual"', 'Follow-up mode: manual, smart_auto, full_auto'),
    ('min_domain_authority', '20', 'Minimum DA for prospects'),
    ('max_spam_score', '30', 'Maximum spam score for prospects'),
    ('min_monthly_traffic', '1000', 'Minimum monthly traffic for prospects'),
    ('claude_model', '"claude-sonnet-4-20250514"', 'Claude model for email generation'),
    ('warmup_enabled', 'true', 'Whether email warmup is enabled'),
    ('warmup_week', '1', 'Current warmup week (1-7)');

-- ============================================
-- DAILY METRICS TABLE (for analytics)
-- ============================================
CREATE TABLE daily_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL UNIQUE,
    emails_sent INTEGER DEFAULT 0,
    emails_delivered INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    emails_clicked INTEGER DEFAULT 0,
    emails_bounced INTEGER DEFAULT 0,
    emails_complained INTEGER DEFAULT 0,
    replies_received INTEGER DEFAULT 0,
    positive_replies INTEGER DEFAULT 0,
    links_placed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_daily_metrics_date ON daily_metrics(date);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prospects_updated_at BEFORE UPDATE ON prospects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_emails_updated_at BEFORE UPDATE ON emails FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sequences_updated_at BEFORE UPDATE ON sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
