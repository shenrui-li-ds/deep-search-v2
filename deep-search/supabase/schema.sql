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
  bookmarked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by user
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);
-- Index for fast queries on bookmarked searches
CREATE INDEX IF NOT EXISTS idx_search_history_bookmarked ON search_history(user_id, bookmarked) WHERE bookmarked = true;

-- Row Level Security (RLS) - Users can only see their own history
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own search history"
  ON search_history FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own search history"
  ON search_history FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

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
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own API usage"
  ON api_usage FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- USER LIMITS TABLE (for guard rails)
-- ============================================
CREATE TABLE IF NOT EXISTS user_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Daily limits
  daily_search_limit INTEGER DEFAULT 50,
  daily_searches_used INTEGER DEFAULT 0,
  daily_token_limit INTEGER DEFAULT 100000,
  daily_tokens_used INTEGER DEFAULT 0,
  -- Monthly limits
  monthly_search_limit INTEGER DEFAULT 1000,
  monthly_searches_used INTEGER DEFAULT 0,
  monthly_token_limit INTEGER DEFAULT 500000,
  monthly_tokens_used INTEGER DEFAULT 0,
  -- Tracking
  last_daily_reset DATE DEFAULT CURRENT_DATE,
  last_monthly_reset DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for user limits
ALTER TABLE user_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own limits"
  ON user_limits FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own usage counts"
  ON user_limits FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to create user limits and preferences on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_limits (user_id)
  VALUES (NEW.id);
  INSERT INTO public.user_preferences (user_id)
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
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE last_daily_reset < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset monthly counters (call via cron on 1st of month)
CREATE OR REPLACE FUNCTION public.reset_monthly_limits()
RETURNS void AS $$
BEGIN
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and increment search usage (checks both daily and monthly limits)
CREATE OR REPLACE FUNCTION public.check_and_increment_search()
RETURNS BOOLEAN AS $$
DECLARE
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_monthly_limit INTEGER;
  v_monthly_used INTEGER;
BEGIN
  -- Reset daily counter if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = auth.uid()
    AND last_daily_reset < CURRENT_DATE;

  -- Reset monthly counter if needed
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = auth.uid()
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get current limits
  SELECT daily_search_limit, daily_searches_used, monthly_search_limit, monthly_searches_used
  INTO v_daily_limit, v_daily_used, v_monthly_limit, v_monthly_used
  FROM user_limits
  WHERE user_id = auth.uid();

  -- Check if under daily limit
  IF v_daily_used >= v_daily_limit THEN
    RETURN FALSE;
  END IF;

  -- Check if under monthly limit
  IF v_monthly_used >= v_monthly_limit THEN
    RETURN FALSE;
  END IF;

  -- Increment both daily and monthly usage
  UPDATE user_limits
  SET daily_searches_used = daily_searches_used + 1,
      monthly_searches_used = monthly_searches_used + 1,
      updated_at = NOW()
  WHERE user_id = auth.uid();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optimized version that returns JSON with all limit data (eliminates extra query)
CREATE OR REPLACE FUNCTION public.check_and_increment_search_v2()
RETURNS JSON AS $$
DECLARE
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_monthly_limit INTEGER;
  v_monthly_used INTEGER;
  v_allowed BOOLEAN;
  v_reason TEXT;
BEGIN
  -- Reset daily counter if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = auth.uid()
    AND last_daily_reset < CURRENT_DATE;

  -- Reset monthly counter if needed
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = auth.uid()
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get current limits
  SELECT daily_search_limit, daily_searches_used, monthly_search_limit, monthly_searches_used
  INTO v_daily_limit, v_daily_used, v_monthly_limit, v_monthly_used
  FROM user_limits
  WHERE user_id = auth.uid();

  -- Check if under daily limit
  IF v_daily_used >= v_daily_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'reason', 'Daily search limit reached (' || v_daily_limit || ' searches). Resets at midnight.',
      'daily_limit', v_daily_limit,
      'daily_used', v_daily_used,
      'monthly_limit', v_monthly_limit,
      'monthly_used', v_monthly_used
    );
  END IF;

  -- Check if under monthly limit
  IF v_monthly_used >= v_monthly_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'reason', 'Monthly search limit reached (' || v_monthly_limit || ' searches). Resets on the 1st.',
      'daily_limit', v_daily_limit,
      'daily_used', v_daily_used,
      'monthly_limit', v_monthly_limit,
      'monthly_used', v_monthly_used
    );
  END IF;

  -- Increment both daily and monthly usage
  UPDATE user_limits
  SET daily_searches_used = daily_searches_used + 1,
      monthly_searches_used = monthly_searches_used + 1,
      updated_at = NOW()
  WHERE user_id = auth.uid();

  -- Return success with updated counts
  RETURN json_build_object(
    'allowed', TRUE,
    'reason', NULL,
    'daily_limit', v_daily_limit,
    'daily_used', v_daily_used + 1,
    'monthly_limit', v_monthly_limit,
    'monthly_used', v_monthly_used + 1
  );
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

-- Function to increment token usage atomically (updates both daily and monthly)
CREATE OR REPLACE FUNCTION public.increment_token_usage(p_user_id UUID, p_tokens INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE user_limits
  SET daily_tokens_used = daily_tokens_used + p_tokens,
      monthly_tokens_used = monthly_tokens_used + p_tokens,
      updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is within token limits (returns TRUE if under limits)
CREATE OR REPLACE FUNCTION public.check_token_limits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_monthly_limit INTEGER;
  v_monthly_used INTEGER;
BEGIN
  SELECT daily_token_limit, daily_tokens_used, monthly_token_limit, monthly_tokens_used
  INTO v_daily_limit, v_daily_used, v_monthly_limit, v_monthly_used
  FROM user_limits
  WHERE user_id = p_user_id;

  -- Check daily limit
  IF v_daily_used >= v_daily_limit THEN
    RETURN FALSE;
  END IF;

  -- Check monthly limit
  IF v_monthly_used >= v_monthly_limit THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- USER PREFERENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_provider TEXT DEFAULT 'deepseek' CHECK (default_provider IN ('deepseek', 'openai', 'grok', 'claude', 'gemini')),
  default_mode TEXT DEFAULT 'web' CHECK (default_mode IN ('web', 'pro', 'brainstorm')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for user preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Function to upsert user preferences
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_default_provider TEXT DEFAULT NULL,
  p_default_mode TEXT DEFAULT NULL
)
RETURNS user_preferences AS $$
DECLARE
  v_user_id UUID;
  v_result user_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_preferences (user_id, default_provider, default_mode, updated_at)
  VALUES (
    v_user_id,
    COALESCE(p_default_provider, 'deepseek'),
    COALESCE(p_default_mode, 'web'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_provider = COALESCE(p_default_provider, user_preferences.default_provider),
    default_mode = COALESCE(p_default_mode, user_preferences.default_mode),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
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

-- RLS for cache - permissive policy for authenticated users (shared cache)
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON search_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can write cache"
  ON search_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cache"
  ON search_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cache"
  ON search_cache FOR DELETE
  TO authenticated
  USING (true);

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
GRANT EXECUTE ON FUNCTION public.check_and_increment_search_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_token_usage(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_token_limits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_preferences(TEXT, TEXT) TO authenticated;

-- ============================================
-- SCHEDULED JOBS (requires pg_cron extension)
-- ============================================
-- Uncomment and run after enabling pg_cron in Supabase Dashboard:
--
-- Daily reset at midnight UTC:
-- SELECT cron.schedule('reset-daily-limits', '0 0 * * *', $$SELECT public.reset_daily_limits()$$);
--
-- Monthly reset on 1st of each month at midnight UTC:
-- SELECT cron.schedule('reset-monthly-limits', '0 0 1 * *', $$SELECT public.reset_monthly_limits()$$);
--
-- Cache cleanup at 3am UTC daily:
-- SELECT cron.schedule('cleanup-cache', '0 3 * * *', $$SELECT public.cleanup_expired_cache()$$);
--
-- History cleanup weekly on Sunday at 4am UTC:
-- SELECT cron.schedule('cleanup-history', '0 4 * * 0', $$SELECT public.cleanup_old_history()$$);

