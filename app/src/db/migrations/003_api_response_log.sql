-- ============================================
-- API Response Log - Never Lose Data
-- Created: 2026-02-02
-- ============================================

-- Store ALL external API responses (DataForSEO, Claude, Resend, etc.)
CREATE TABLE IF NOT EXISTS api_response_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Request info
    service VARCHAR(50) NOT NULL,  -- 'dataforseo', 'claude', 'resend', 'scraper'
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'POST',
    request_body JSONB,

    -- Response info
    status_code INTEGER,
    response_body JSONB,
    response_headers JSONB,

    -- Metadata
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    duration_ms INTEGER,
    cost DECIMAL(10,6),  -- API cost if applicable

    -- Context
    job_id VARCHAR(255),  -- BullMQ job ID if from worker
    prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_api_log_service ON api_response_log(service);
CREATE INDEX IF NOT EXISTS idx_api_log_created ON api_response_log(created_at);
CREATE INDEX IF NOT EXISTS idx_api_log_success ON api_response_log(success);
CREATE INDEX IF NOT EXISTS idx_api_log_prospect ON api_response_log(prospect_id);

-- ============================================
-- Scheduler Jobs Table
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(100) NOT NULL,  -- 'followup_check', 'link_check', 'prospecting'
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    is_running BOOLEAN DEFAULT false,
    run_count INTEGER DEFAULT 0,
    last_error TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs(job_type);

-- Insert default scheduled jobs
INSERT INTO scheduled_jobs (job_type, config) VALUES
    ('followup_check', '{"interval_minutes": 60}'),
    ('link_check', '{"interval_minutes": 360}'),
    ('daily_metrics', '{"run_at_hour": 2}')
ON CONFLICT (job_type) DO NOTHING;

-- Apply updated_at trigger
CREATE TRIGGER update_scheduled_jobs_updated_at
    BEFORE UPDATE ON scheduled_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
