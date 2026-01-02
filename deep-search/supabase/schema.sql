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
  -- Credit system
  monthly_free_credits INTEGER DEFAULT 1000,
  free_credits_used INTEGER DEFAULT 0,
  purchased_credits INTEGER DEFAULT 0,
  lifetime_credits_purchased INTEGER DEFAULT 0,
  -- Legacy: Daily limits (kept for visualization)
  daily_search_limit INTEGER DEFAULT 50,
  daily_searches_used INTEGER DEFAULT 0,
  daily_token_limit INTEGER DEFAULT 100000,
  daily_tokens_used INTEGER DEFAULT 0,
  -- Legacy: Monthly limits (kept for visualization)
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
-- CREDIT PURCHASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  pack_type TEXT NOT NULL CHECK (pack_type IN ('starter', 'plus', 'pro')),
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for credit_purchases
ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON credit_purchases FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Only service role can insert/update (via Stripe webhooks)
CREATE POLICY "Service role can manage purchases"
  ON credit_purchases FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_stripe_session ON credit_purchases(stripe_session_id);

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
-- CREDIT SYSTEM FUNCTIONS
-- ============================================

-- Check if user has enough credits and deduct them
-- Uses free credits first, then purchased credits
-- Returns JSON: { allowed: boolean, source: 'free'|'purchased'|null, remaining_free: number, remaining_purchased: number }
CREATE OR REPLACE FUNCTION public.check_and_use_credits(p_credits_needed INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_source TEXT;
  v_last_reset DATE;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get or create user limits
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current credit state
  SELECT
    monthly_free_credits,
    free_credits_used,
    purchased_credits,
    last_monthly_reset
  INTO v_monthly_free, v_free_used, v_purchased, v_last_reset
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Check if monthly reset is needed (first of month)
  IF v_last_reset IS NULL OR v_last_reset < date_trunc('month', CURRENT_DATE)::DATE THEN
    v_free_used := 0;
    UPDATE user_limits
    SET free_credits_used = 0,
        last_monthly_reset = CURRENT_DATE
    WHERE user_id = v_user_id;
  END IF;

  -- Calculate available free credits
  v_free_available := v_monthly_free - v_free_used;

  -- Check if we have enough credits
  IF v_free_available >= p_credits_needed THEN
    -- Use free credits
    UPDATE user_limits
    SET free_credits_used = free_credits_used + p_credits_needed
    WHERE user_id = v_user_id;

    v_source := 'free';
    v_free_available := v_free_available - p_credits_needed;

  ELSIF v_purchased >= p_credits_needed THEN
    -- Use purchased credits
    UPDATE user_limits
    SET purchased_credits = purchased_credits - p_credits_needed
    WHERE user_id = v_user_id;

    v_source := 'purchased';
    v_purchased := v_purchased - p_credits_needed;

  ELSE
    -- Not enough credits
    RETURN json_build_object(
      'allowed', FALSE,
      'error', 'Insufficient credits',
      'needed', p_credits_needed,
      'remaining_free', v_free_available,
      'remaining_purchased', v_purchased
    );
  END IF;

  RETURN json_build_object(
    'allowed', TRUE,
    'source', v_source,
    'credits_used', p_credits_needed,
    'remaining_free', v_free_available,
    'remaining_purchased', v_purchased
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set search_path for security
ALTER FUNCTION public.check_and_use_credits(INTEGER) SET search_path = public;

-- Get current credit balances (read-only, no side effects)
CREATE OR REPLACE FUNCTION public.get_user_credits()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_last_reset DATE;
  v_free_available INTEGER;
  v_days_until_reset INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Get or create user limits
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    monthly_free_credits,
    free_credits_used,
    purchased_credits,
    last_monthly_reset
  INTO v_monthly_free, v_free_used, v_purchased, v_last_reset
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Check if monthly reset is needed
  IF v_last_reset IS NULL OR v_last_reset < date_trunc('month', CURRENT_DATE)::DATE THEN
    v_free_used := 0;
  END IF;

  v_free_available := v_monthly_free - v_free_used;

  -- Calculate days until next reset (first of next month)
  v_days_until_reset := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::DATE - CURRENT_DATE;

  RETURN json_build_object(
    'monthly_free_credits', v_monthly_free,
    'free_credits_used', v_free_used,
    'free_credits_remaining', v_free_available,
    'purchased_credits', v_purchased,
    'total_available', v_free_available + v_purchased,
    'days_until_reset', v_days_until_reset
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_user_credits() SET search_path = public;

-- Add purchased credits to user account (for Stripe webhooks)
CREATE OR REPLACE FUNCTION public.add_purchased_credits(
  p_user_id UUID,
  p_credits INTEGER
)
RETURNS JSON AS $$
BEGIN
  UPDATE user_limits
  SET
    purchased_credits = purchased_credits + p_credits,
    lifetime_credits_purchased = lifetime_credits_purchased + p_credits
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_limits (user_id, purchased_credits, lifetime_credits_purchased)
    VALUES (p_user_id, p_credits, p_credits);
  END IF;

  RETURN json_build_object('success', TRUE, 'credits_added', p_credits);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.add_purchased_credits(UUID, INTEGER) SET search_path = public;

-- ============================================
-- USER PREFERENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_provider TEXT DEFAULT 'deepseek' CHECK (default_provider IN ('deepseek', 'openai', 'grok', 'claude', 'gemini', 'vercel-gateway')),
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
-- LOGIN ATTEMPTS TABLE (Brute Force Protection)
-- ============================================
CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts INTEGER DEFAULT 0,
  first_failed_at TIMESTAMP WITH TIME ZONE,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Only service role can directly access
-- (Regular users access via SECURITY DEFINER functions which bypass RLS)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON login_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Check if a user is currently locked out
-- Returns: { locked: boolean, locked_until: timestamp, remaining_seconds: number }
CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_remaining_seconds INTEGER;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  -- User not found - don't reveal this, just say not locked
  IF v_user_id IS NULL THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'remaining_seconds', 0);
  END IF;

  -- Check lockout status
  SELECT locked_until INTO v_locked_until
  FROM login_attempts
  WHERE user_id = v_user_id;

  -- No record or no lockout
  IF v_locked_until IS NULL OR v_locked_until <= NOW() THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'remaining_seconds', 0);
  END IF;

  -- Calculate remaining seconds
  v_remaining_seconds := EXTRACT(EPOCH FROM (v_locked_until - NOW()))::INTEGER;

  RETURN json_build_object(
    'locked', TRUE,
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a failed login attempt and apply lockout if needed
-- Returns: { locked: boolean, locked_until: timestamp, attempts: number }
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_attempts INTEGER;
  v_first_failed TIMESTAMP WITH TIME ZONE;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_lock_duration INTERVAL;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  -- User not found - don't reveal this
  IF v_user_id IS NULL THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'attempts', 0);
  END IF;

  -- Get or create login_attempts record
  INSERT INTO login_attempts (user_id, failed_attempts, first_failed_at, updated_at)
  VALUES (v_user_id, 0, NULL, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current state
  SELECT failed_attempts, first_failed_at, locked_until
  INTO v_attempts, v_first_failed, v_locked_until
  FROM login_attempts
  WHERE user_id = v_user_id;

  -- If currently locked, just return locked status
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN json_build_object(
      'locked', TRUE,
      'locked_until', v_locked_until,
      'attempts', v_attempts
    );
  END IF;

  -- Reset counter if first failure was more than 1 hour ago
  IF v_first_failed IS NULL OR v_first_failed < NOW() - INTERVAL '1 hour' THEN
    v_attempts := 0;
    v_first_failed := NOW();
  END IF;

  -- Increment attempts
  v_attempts := v_attempts + 1;

  -- Determine lockout duration based on attempts
  -- 5 attempts in 15 min -> 5 min lock
  -- 10 attempts in 1 hour -> 30 min lock
  -- 15+ attempts in 1 hour -> 1 hour lock
  IF v_attempts >= 15 THEN
    v_lock_duration := INTERVAL '1 hour';
  ELSIF v_attempts >= 10 THEN
    v_lock_duration := INTERVAL '30 minutes';
  ELSIF v_attempts >= 5 AND v_first_failed > NOW() - INTERVAL '15 minutes' THEN
    v_lock_duration := INTERVAL '5 minutes';
  ELSE
    v_lock_duration := NULL;
  END IF;

  -- Calculate locked_until
  IF v_lock_duration IS NOT NULL THEN
    v_locked_until := NOW() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;

  -- Update record
  UPDATE login_attempts
  SET failed_attempts = v_attempts,
      first_failed_at = v_first_failed,
      locked_until = v_locked_until,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN json_build_object(
    'locked', v_locked_until IS NOT NULL,
    'locked_until', v_locked_until,
    'attempts', v_attempts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset login attempts after successful login
CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_email TEXT)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    UPDATE login_attempts
    SET failed_attempts = 0,
        first_failed_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set search_path for security
ALTER FUNCTION public.check_login_lockout(TEXT) SET search_path = public;
ALTER FUNCTION public.record_failed_login(TEXT) SET search_path = public;
ALTER FUNCTION public.reset_login_attempts(TEXT) SET search_path = public;

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

-- Credit system functions
GRANT EXECUTE ON FUNCTION public.check_and_use_credits(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;
-- Only service role can add credits (via Stripe webhooks)
GRANT EXECUTE ON FUNCTION public.add_purchased_credits(UUID, INTEGER) TO service_role;

-- Login lockout functions need to be callable from client during login
GRANT EXECUTE ON FUNCTION public.check_login_lockout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(TEXT) TO anon, authenticated;

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

