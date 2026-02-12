-- ============================================
-- Blog Analysis - Personalized Outreach
-- Created: 2026-02-12
-- Purpose: Store blog analysis for highly personalized emails
-- ============================================

-- Create blog analyses table
CREATE TABLE IF NOT EXISTS blog_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain VARCHAR(255) NOT NULL,

  -- Analysis results
  main_topics TEXT[],
  writing_style VARCHAR(100),
  target_audience TEXT,
  recent_article_titles TEXT[],
  relevant_syb_articles JSONB DEFAULT '[]',

  -- Metadata
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  token_cost INTEGER DEFAULT 0,
  cache_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),

  UNIQUE(prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_analyses_domain ON blog_analyses(domain);
CREATE INDEX IF NOT EXISTS idx_blog_analyses_expires ON blog_analyses(cache_expires_at);

COMMENT ON TABLE blog_analyses IS 'Stores blog analysis results for personalized email generation (cached 30 days)';
COMMENT ON COLUMN blog_analyses.relevant_syb_articles IS 'Array of {url, title, relevance_score, match_reason} objects';
