-- Supabase Schema for Athenius
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SEARCH HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS search_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  refined_query TEXT,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('web', 'pro', 'brainstorm')),
  sources_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by user
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);

-- Row Level Security (RLS) - Users can only see their own history
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search history"
  ON search_history FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- API USAGE TRACKING TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  request_type TEXT NOT NULL, -- 'refine', 'summarize', 'proofread', 'research'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for usage queries
CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);

-- RLS for API usage
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API usage"
  ON api_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API usage"
  ON api_usage FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- USER LIMITS TABLE (for guard rails)
-- ============================================
CREATE TABLE IF NOT EXISTS user_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_search_limit INTEGER DEFAULT 50,
  daily_searches_used INTEGER DEFAULT 0,
  monthly_token_limit INTEGER DEFAULT 500000,
  monthly_tokens_used INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for user limits
ALTER TABLE user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own limits"
  ON user_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage counts"
  ON user_limits FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to create user limits on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_limits (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create limits for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to reset daily counters (call via cron)
CREATE OR REPLACE FUNCTION public.reset_daily_limits()
RETURNS void AS $$
BEGIN
  UPDATE user_limits
  SET daily_searches_used = 0,
      last_reset_date = CURRENT_DATE,
      updated_at = NOW()
  WHERE last_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly counters (call via cron on 1st of month)
CREATE OR REPLACE FUNCTION public.reset_monthly_limits()
RETURNS void AS $$
BEGIN
  UPDATE user_limits
  SET monthly_tokens_used = 0,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and increment search usage
CREATE OR REPLACE FUNCTION public.check_and_increment_search()
RETURNS BOOLEAN AS $$
DECLARE
  current_limit INTEGER;
  current_used INTEGER;
BEGIN
  -- Reset daily counter if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      last_reset_date = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = auth.uid()
    AND last_reset_date < CURRENT_DATE;

  -- Get current limits
  SELECT daily_search_limit, daily_searches_used
  INTO current_limit, current_used
  FROM user_limits
  WHERE user_id = auth.uid();

  -- Check if under limit
  IF current_used >= current_limit THEN
    RETURN FALSE;
  END IF;

  -- Increment usage
  UPDATE user_limits
  SET daily_searches_used = daily_searches_used + 1,
      updated_at = NOW()
  WHERE user_id = auth.uid();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old search history (keep last 100 per user)
CREATE OR REPLACE FUNCTION public.cleanup_old_history()
RETURNS void AS $$
BEGIN
  DELETE FROM search_history
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM search_history
    ) ranked
    WHERE rn > 100
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment token usage atomically
CREATE OR REPLACE FUNCTION public.increment_token_usage(p_user_id UUID, p_tokens INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE user_limits
  SET monthly_tokens_used = monthly_tokens_used + p_tokens,
      updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEARCH CACHE TABLE (Two-tier caching)
-- ============================================
CREATE TABLE IF NOT EXISTS search_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  cache_type TEXT NOT NULL CHECK (cache_type IN ('search', 'refine', 'summary', 'related', 'plan')),
  query TEXT NOT NULL,
  response JSONB NOT NULL,
  provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  hit_count INTEGER DEFAULT 0
);

-- Indexes for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_type ON search_cache(cache_type);

-- No RLS on cache - it's shared across all users for efficiency
-- Cache entries are keyed by query hash, not user-specific

-- Function to cleanup expired cache entries (call via pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM search_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % expired cache entries', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant usage on the functions to authenticated users
GRANT EXECUTE ON FUNCTION public.check_and_increment_search() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_token_usage(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO authenticated;

-- Grant cache table access (for reading/writing cache)
GRANT SELECT, INSERT, UPDATE, DELETE ON search_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON search_cache TO anon;
