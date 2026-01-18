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
  deep BOOLEAN DEFAULT false,
  sources_count INTEGER DEFAULT 0,
  bookmarked BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast queries by user
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at DESC);
-- Index for fast queries on bookmarked searches
CREATE INDEX IF NOT EXISTS idx_search_history_bookmarked ON search_history(user_id, bookmarked) WHERE bookmarked = true;
-- Index for efficient filtering of non-deleted records
CREATE INDEX IF NOT EXISTS idx_search_history_deleted_at ON search_history(deleted_at) WHERE deleted_at IS NULL;
-- Index for efficient querying of deleted records
CREATE INDEX IF NOT EXISTS idx_search_history_deleted_at_not_null ON search_history(user_id, deleted_at) WHERE deleted_at IS NOT NULL;

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
  -- User tier (free, pro, admin)
  user_tier TEXT DEFAULT 'free' CHECK (user_tier IN ('free', 'pro', 'admin')),
  -- Credit system
  monthly_free_credits INTEGER DEFAULT 500,
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

-- Index for tier lookups
CREATE INDEX IF NOT EXISTS idx_user_limits_tier ON user_limits(user_tier) WHERE user_tier != 'free';

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

-- Users can only SELECT their own purchases
CREATE POLICY "Users can view own purchases"
  ON credit_purchases
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Service role can INSERT, UPDATE, DELETE (separate policies to avoid overlap)
CREATE POLICY "Service role can insert purchases"
  ON credit_purchases
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update purchases"
  ON credit_purchases
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete purchases"
  ON credit_purchases
  FOR DELETE
  TO service_role
  USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id ON credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_stripe_session ON credit_purchases(stripe_session_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- ============================================
-- TIER CONFIGURATION
-- ============================================

-- Function to get monthly free credits based on tier
CREATE OR REPLACE FUNCTION public.get_tier_free_credits(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 10000
    WHEN 'pro' THEN 2000
    ELSE 500  -- 'free' tier
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_free_credits(TEXT) SET search_path = public;

-- ============================================
-- ADMIN: SET USER TIER
-- ============================================

-- Set a user's tier by email (admin only, uses service_role)
-- Usage: SELECT set_user_tier('user@example.com', 'pro');
CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_email TEXT,
  p_tier TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_new_free_credits INTEGER;
BEGIN
  -- Validate tier
  IF p_tier NOT IN ('free', 'pro', 'admin') THEN
    RETURN json_build_object('success', FALSE, 'error', 'Invalid tier. Must be: free, pro, or admin');
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'User not found');
  END IF;

  -- Get new free credits for this tier
  v_new_free_credits := get_tier_free_credits(p_tier);

  -- Ensure user_limits row exists and update
  INSERT INTO user_limits (user_id, user_tier, monthly_free_credits)
  VALUES (v_user_id, p_tier, v_new_free_credits)
  ON CONFLICT (user_id) DO UPDATE SET
    user_tier = p_tier,
    monthly_free_credits = v_new_free_credits,
    updated_at = NOW();

  RETURN json_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'email', p_user_email,
    'tier', p_tier,
    'monthly_free_credits', v_new_free_credits
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.set_user_tier(TEXT, TEXT) SET search_path = public;
-- Only service_role can call this (admin function)
REVOKE ALL ON FUNCTION public.set_user_tier(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_tier(TEXT, TEXT) TO service_role;

-- ============================================
-- ADMIN: GRANT BONUS CREDITS
-- ============================================

-- Grant one-time bonus credits to a user (added to purchased_credits)
-- Usage: SELECT grant_bonus_credits('user@example.com', 500);
CREATE OR REPLACE FUNCTION public.grant_bonus_credits(
  p_user_email TEXT,
  p_credits INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_new_purchased INTEGER;
BEGIN
  -- Validate credits
  IF p_credits <= 0 THEN
    RETURN json_build_object('success', FALSE, 'error', 'Credits must be positive');
  END IF;

  -- Find user by email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'User not found');
  END IF;

  -- Ensure user_limits row exists and add credits
  INSERT INTO user_limits (user_id, purchased_credits)
  VALUES (v_user_id, p_credits)
  ON CONFLICT (user_id) DO UPDATE SET
    purchased_credits = user_limits.purchased_credits + p_credits,
    updated_at = NOW()
  RETURNING purchased_credits INTO v_new_purchased;

  RETURN json_build_object(
    'success', TRUE,
    'user_id', v_user_id,
    'email', p_user_email,
    'credits_granted', p_credits,
    'new_purchased_total', v_new_purchased
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.grant_bonus_credits(TEXT, INTEGER) SET search_path = public;
-- Only service_role can call this (admin function)
REVOKE ALL ON FUNCTION public.grant_bonus_credits(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_bonus_credits(TEXT, INTEGER) TO service_role;

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

-- ============================================
-- SOFT DELETE FUNCTIONS
-- ============================================

-- Function to soft delete a search entry
CREATE OR REPLACE FUNCTION soft_delete_search(p_search_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NOW()
  WHERE id = p_search_id
    AND user_id = v_user_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Function to recover a deleted search entry
CREATE OR REPLACE FUNCTION recover_search(p_search_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NULL
  WHERE id = p_search_id
    AND user_id = v_user_id
    AND deleted_at IS NOT NULL;

  RETURN FOUND;
END;
$$;

-- Function to soft delete all search history for a user
CREATE OR REPLACE FUNCTION soft_delete_all_searches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NOW()
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function to permanently delete old soft-deleted records (cleanup)
-- This should be called by a scheduled job (pg_cron) monthly
CREATE OR REPLACE FUNCTION cleanup_deleted_searches(p_days_old INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM search_history
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

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

-- Combined check: rate limits + credits in single call (optimized)
-- Reduces latency by ~30-50ms compared to two separate calls
CREATE OR REPLACE FUNCTION public.check_and_authorize_search(p_credits_needed INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  -- Rate limit variables
  v_daily_limit INTEGER;
  v_daily_used INTEGER;
  v_monthly_limit INTEGER;
  v_monthly_used INTEGER;
  -- Credit variables
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_source TEXT;
  v_last_monthly_reset DATE;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Ensure user_limits row exists
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset daily counter if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_daily_reset < CURRENT_DATE;

  -- Reset monthly counters if needed (both rate limits and credits)
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      free_credits_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get current limits and credits
  SELECT
    daily_search_limit,
    daily_searches_used,
    monthly_search_limit,
    monthly_searches_used,
    monthly_free_credits,
    free_credits_used,
    purchased_credits
  INTO
    v_daily_limit,
    v_daily_used,
    v_monthly_limit,
    v_monthly_used,
    v_monthly_free,
    v_free_used,
    v_purchased
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Check daily rate limit
  IF v_daily_used >= v_daily_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'phase', 'rate_limit',
      'reason', 'Daily search limit reached (' || v_daily_limit || ' searches). Resets at midnight.',
      'daily_limit', v_daily_limit,
      'daily_used', v_daily_used
    );
  END IF;

  -- Check monthly rate limit
  IF v_monthly_used >= v_monthly_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'phase', 'rate_limit',
      'reason', 'Monthly search limit reached (' || v_monthly_limit || ' searches). Resets on the 1st.',
      'monthly_limit', v_monthly_limit,
      'monthly_used', v_monthly_used
    );
  END IF;

  -- Calculate available free credits
  v_free_available := COALESCE(v_monthly_free, 500) - COALESCE(v_free_used, 0);

  -- Check if we have enough credits
  IF v_free_available >= p_credits_needed THEN
    -- Use free credits
    UPDATE user_limits
    SET free_credits_used = free_credits_used + p_credits_needed,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    v_source := 'free';
    v_free_available := v_free_available - p_credits_needed;

  ELSIF COALESCE(v_purchased, 0) >= p_credits_needed THEN
    -- Use purchased credits
    UPDATE user_limits
    SET purchased_credits = purchased_credits - p_credits_needed,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    v_source := 'purchased';
    v_purchased := v_purchased - p_credits_needed;

  ELSE
    -- Not enough credits
    RETURN json_build_object(
      'allowed', FALSE,
      'phase', 'credits',
      'reason', 'Insufficient credits. Purchase more credits to continue.',
      'needed', p_credits_needed,
      'remaining_free', v_free_available,
      'remaining_purchased', COALESCE(v_purchased, 0)
    );
  END IF;

  -- Success: Both checks passed
  RETURN json_build_object(
    'allowed', TRUE,
    'source', v_source,
    'credits_used', p_credits_needed,
    'remaining_free', v_free_available,
    'remaining_purchased', COALESCE(v_purchased, 0),
    'daily_limit', v_daily_limit,
    'daily_used', v_daily_used + 1,
    'monthly_limit', v_monthly_limit,
    'monthly_used', v_monthly_used + 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.check_and_authorize_search(INTEGER) SET search_path = public;

-- Get current credit balances (read-only, no side effects)
-- Returns user tier along with credit information
CREATE OR REPLACE FUNCTION public.get_user_credits()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_last_reset DATE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Ensure user_limits row exists
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset monthly counters if needed
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      free_credits_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get current state with safe defaults
  SELECT
    COALESCE(user_tier, 'free'),
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0),
    last_monthly_reset
  INTO v_tier, v_monthly_free, v_free_used, v_purchased, v_last_reset
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Handle case where row doesn't exist yet
  IF v_tier IS NULL THEN
    v_tier := 'free';
    v_monthly_free := 500;
    v_free_used := 0;
    v_purchased := 0;
  END IF;

  RETURN json_build_object(
    'user_tier', v_tier,
    'monthly_free_credits', v_monthly_free,
    'free_credits_used', v_free_used,
    'free_credits_remaining', v_monthly_free - v_free_used,
    'purchased_credits', v_purchased,
    'total_available', (v_monthly_free - v_free_used) + v_purchased,
    'days_until_reset', EXTRACT(DAY FROM (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - CURRENT_DATE))::INTEGER
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
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'zh')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN user_preferences.language IS 'UI language preference: en (English), zh (Chinese)';

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

-- ============================================
-- CREDIT RESERVATIONS TABLE
-- ============================================
-- For dynamic billing: reserve credits before search, charge actual usage after

CREATE TABLE IF NOT EXISTS credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reserved_credits INTEGER NOT NULL,
  actual_credits INTEGER,  -- NULL until finalized
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'finalized', 'cancelled', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  finalized_at TIMESTAMP WITH TIME ZONE
);

-- RLS for credit_reservations
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reservations"
  ON credit_reservations
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Index for faster lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_id ON credit_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_reservations_status ON credit_reservations(status) WHERE status = 'pending';

-- ============================================
-- EMAIL VERIFICATION CODES TABLE (OTP for CAPTCHA fallback)
-- ============================================
-- Provides fallback verification when Turnstile is blocked (e.g., in China)

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT -- For rate limiting
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON email_verification_codes (email, purpose, verified);
-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_otp_expires ON email_verification_codes (expires_at);

-- RLS: Only allow access via functions (SECURITY DEFINER)
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to OTP codes"
ON email_verification_codes
FOR ALL
USING (FALSE);

-- ============================================
-- CREDIT RESERVATION FUNCTIONS
-- ============================================

-- Reserve credits for a search (blocks them from being used elsewhere)
-- Returns: { allowed: boolean, reservation_id: uuid, reserved: number, error?: string }
CREATE OR REPLACE FUNCTION public.reserve_credits(p_max_credits INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_total_available INTEGER;
  v_reservation_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Ensure user_limits row exists with default tier
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get user's tier and set appropriate monthly_free_credits if not set
  SELECT user_tier, monthly_free_credits INTO v_tier, v_monthly_free
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Update monthly_free_credits based on tier if it's still default
  IF v_monthly_free = 500 AND v_tier != 'free' THEN
    v_monthly_free := get_tier_free_credits(v_tier);
    UPDATE user_limits SET monthly_free_credits = v_monthly_free WHERE user_id = v_user_id;
  END IF;

  -- Reset monthly counters if needed
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      free_credits_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get current credit state
  SELECT
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0)
  INTO v_monthly_free, v_free_used, v_purchased
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate available credits
  v_free_available := v_monthly_free - v_free_used;
  v_total_available := v_free_available + v_purchased;

  -- Check if we have enough credits to reserve
  IF v_total_available < p_max_credits THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error', 'Insufficient credits',
      'needed', p_max_credits,
      'available', v_total_available
    );
  END IF;

  -- Create reservation record
  INSERT INTO credit_reservations (user_id, reserved_credits, status)
  VALUES (v_user_id, p_max_credits, 'pending')
  RETURNING id INTO v_reservation_id;

  -- Reserve credits: temporarily deduct from available pool
  -- First use free credits, then purchased
  IF v_free_available >= p_max_credits THEN
    UPDATE user_limits
    SET free_credits_used = free_credits_used + p_max_credits,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSIF v_free_available > 0 THEN
    -- Use all remaining free credits + some purchased
    UPDATE user_limits
    SET free_credits_used = monthly_free_credits,
        purchased_credits = purchased_credits - (p_max_credits - v_free_available),
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSE
    -- All from purchased
    UPDATE user_limits
    SET purchased_credits = purchased_credits - p_max_credits,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  RETURN json_build_object(
    'allowed', TRUE,
    'reservation_id', v_reservation_id,
    'reserved', p_max_credits,
    'remaining_after_reserve', v_total_available - p_max_credits
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.reserve_credits(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.reserve_credits(INTEGER) TO authenticated;

-- Finalize a reservation: charge actual usage, refund unused
-- Uses fixed refund logic: refunds to free_credits first, then purchased
-- Returns: { success: boolean, charged: number, refunded: number, error?: string }
CREATE OR REPLACE FUNCTION public.finalize_credits(
  p_reservation_id UUID,
  p_actual_credits INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_reservation RECORD;
  v_refund INTEGER;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get and lock the reservation
  SELECT * INTO v_reservation
  FROM credit_reservations
  WHERE id = p_reservation_id
    AND user_id = v_user_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_reservation IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Reservation not found or already finalized');
  END IF;

  -- Calculate refund (reserved - actual)
  v_refund := v_reservation.reserved_credits - p_actual_credits;

  IF v_refund < 0 THEN
    -- Shouldn't happen, but cap at reserved amount
    p_actual_credits := v_reservation.reserved_credits;
    v_refund := 0;
  END IF;

  -- Refund unused credits - give back to free first, then purchased
  IF v_refund > 0 THEN
    -- Get current free_credits_used
    SELECT free_credits_used INTO v_free_used
    FROM user_limits
    WHERE user_id = v_user_id;

    -- Calculate how much can go back to free vs purchased
    -- We can only reduce free_credits_used down to 0
    v_refund_to_free := LEAST(v_refund, COALESCE(v_free_used, 0));
    v_refund_to_purchased := v_refund - v_refund_to_free;

    UPDATE user_limits
    SET free_credits_used = free_credits_used - v_refund_to_free,
        purchased_credits = purchased_credits + v_refund_to_purchased,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- Mark reservation as finalized
  UPDATE credit_reservations
  SET status = 'finalized',
      actual_credits = p_actual_credits,
      finalized_at = NOW()
  WHERE id = p_reservation_id;

  RETURN json_build_object(
    'success', TRUE,
    'charged', p_actual_credits,
    'refunded', v_refund
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.finalize_credits(UUID, INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.finalize_credits(UUID, INTEGER) TO authenticated;

-- Cancel a reservation (full refund) - used if search fails
-- Uses fixed refund logic: refunds to free_credits first, then purchased
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_reservation RECORD;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Not authenticated');
  END IF;

  -- Get and lock the reservation
  SELECT * INTO v_reservation
  FROM credit_reservations
  WHERE id = p_reservation_id
    AND user_id = v_user_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_reservation IS NULL THEN
    RETURN json_build_object('success', FALSE, 'error', 'Reservation not found or already processed');
  END IF;

  -- Get current free_credits_used
  SELECT free_credits_used INTO v_free_used
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate how much can go back to free vs purchased
  v_refund_to_free := LEAST(v_reservation.reserved_credits, COALESCE(v_free_used, 0));
  v_refund_to_purchased := v_reservation.reserved_credits - v_refund_to_free;

  -- Full refund - give back to free first, then purchased
  UPDATE user_limits
  SET free_credits_used = free_credits_used - v_refund_to_free,
      purchased_credits = purchased_credits + v_refund_to_purchased,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Mark as cancelled
  UPDATE credit_reservations
  SET status = 'cancelled',
      actual_credits = 0,
      finalized_at = NOW()
  WHERE id = p_reservation_id;

  RETURN json_build_object(
    'success', TRUE,
    'refunded', v_reservation.reserved_credits
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.cancel_reservation(UUID) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.cancel_reservation(UUID) TO authenticated;

-- Expire stale reservations (older than 5 minutes) and refund credits
-- Uses fixed refund logic: refunds to free_credits first, then purchased
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_reservation RECORD;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
BEGIN
  FOR v_reservation IN
    SELECT * FROM credit_reservations
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
    FOR UPDATE
  LOOP
    -- Get current free_credits_used for this user
    SELECT free_credits_used INTO v_free_used
    FROM user_limits
    WHERE user_id = v_reservation.user_id;

    -- Calculate how much can go back to free vs purchased
    v_refund_to_free := LEAST(v_reservation.reserved_credits, COALESCE(v_free_used, 0));
    v_refund_to_purchased := v_reservation.reserved_credits - v_refund_to_free;

    -- Refund credits - give back to free first, then purchased
    UPDATE user_limits
    SET free_credits_used = free_credits_used - v_refund_to_free,
        purchased_credits = purchased_credits + v_refund_to_purchased,
        updated_at = NOW()
    WHERE user_id = v_reservation.user_id;

    -- Mark as expired
    UPDATE credit_reservations
    SET status = 'expired',
        actual_credits = 0,
        finalized_at = NOW()
    WHERE id = v_reservation.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.cleanup_expired_reservations() SET search_path = public;
-- Only service role should run cleanup
GRANT EXECUTE ON FUNCTION public.cleanup_expired_reservations() TO service_role;

-- ============================================
-- EMAIL OTP FUNCTIONS
-- ============================================

-- Generate OTP for email verification
CREATE OR REPLACE FUNCTION public.generate_email_otp(
  p_email TEXT,
  p_purpose TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_code TEXT;
  v_expires_at TIMESTAMPTZ;
  v_recent_count INTEGER;
  v_otp_id UUID;
BEGIN
  -- Rate limiting: max 3 OTP requests per email per purpose in 10 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM email_verification_codes
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND created_at > NOW() - INTERVAL '10 minutes';

  IF v_recent_count >= 3 THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Too many verification requests. Please wait 10 minutes.',
      'retry_after', 600
    );
  END IF;

  -- Rate limiting by IP: max 10 OTP requests per IP per hour
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM email_verification_codes
    WHERE ip_address = p_ip_address
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_count >= 10 THEN
      RETURN json_build_object(
        'success', FALSE,
        'error', 'Too many requests from your location. Please try again later.',
        'retry_after', 3600
      );
    END IF;
  END IF;

  -- Invalidate any existing unused codes for this email/purpose
  UPDATE email_verification_codes
  SET verified = TRUE
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND verified = FALSE;

  -- Generate 6-digit code
  v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

  -- Set expiry (10 minutes)
  v_expires_at := NOW() + INTERVAL '10 minutes';

  -- Insert new code
  INSERT INTO email_verification_codes (email, code, purpose, expires_at, ip_address)
  VALUES (LOWER(p_email), v_code, p_purpose, v_expires_at, p_ip_address)
  RETURNING id INTO v_otp_id;

  RETURN json_build_object(
    'success', TRUE,
    'otp_id', v_otp_id,
    'code', v_code,
    'expires_at', v_expires_at,
    'expires_in', 600
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.generate_email_otp(TEXT, TEXT, TEXT) SET search_path = public;

-- Verify OTP code
CREATE OR REPLACE FUNCTION public.verify_email_otp(
  p_email TEXT,
  p_code TEXT,
  p_purpose TEXT
)
RETURNS JSON AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  -- Find the most recent unverified code for this email/purpose
  SELECT * INTO v_otp_record
  FROM email_verification_codes
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND verified = FALSE
  ORDER BY created_at DESC
  LIMIT 1;

  -- No code found
  IF v_otp_record IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'No verification code found. Please request a new one.'
    );
  END IF;

  -- Code expired
  IF v_otp_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Verification code expired. Please request a new one.'
    );
  END IF;

  -- Too many attempts (max 5)
  IF v_otp_record.attempts >= 5 THEN
    -- Mark as verified to prevent further attempts
    UPDATE email_verification_codes
    SET verified = TRUE
    WHERE id = v_otp_record.id;

    RETURN json_build_object(
      'success', FALSE,
      'error', 'Too many incorrect attempts. Please request a new code.'
    );
  END IF;

  -- Increment attempts
  UPDATE email_verification_codes
  SET attempts = attempts + 1
  WHERE id = v_otp_record.id;

  -- Check code
  IF v_otp_record.code != p_code THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Incorrect verification code.',
      'attempts_remaining', 4 - v_otp_record.attempts
    );
  END IF;

  -- Success! Mark as verified
  UPDATE email_verification_codes
  SET verified = TRUE
  WHERE id = v_otp_record.id;

  RETURN json_build_object(
    'success', TRUE,
    'verified_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.verify_email_otp(TEXT, TEXT, TEXT) SET search_path = public;

-- Cleanup expired OTP codes (for pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_codes()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete codes older than 1 hour (expired + buffer)
  DELETE FROM email_verification_codes
  WHERE expires_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.cleanup_expired_otp_codes() SET search_path = public;

-- Function to upsert user preferences (with language support)
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_default_provider TEXT DEFAULT NULL,
  p_default_mode TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL
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

  INSERT INTO user_preferences (user_id, default_provider, default_mode, language, updated_at)
  VALUES (
    v_user_id,
    COALESCE(p_default_provider, 'deepseek'),
    COALESCE(p_default_mode, 'web'),
    COALESCE(p_language, 'en'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_provider = COALESCE(p_default_provider, user_preferences.default_provider),
    default_mode = COALESCE(p_default_mode, user_preferences.default_mode),
    language = COALESCE(p_language, user_preferences.language),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upsert_user_preferences(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================
-- UPSERT SEARCH HISTORY FUNCTION
-- ============================================
-- Optimizes the "add to history" flow by combining the duplicate check
-- and insert/update into a single database call.
-- If a BOOKMARKED entry with same (user_id, query, provider, mode) exists,
-- updates that entry instead of creating a duplicate.

CREATE OR REPLACE FUNCTION public.upsert_search_history(
  p_user_id UUID,
  p_query TEXT,
  p_provider TEXT,
  p_mode TEXT,
  p_sources_count INTEGER,
  p_refined_query TEXT DEFAULT NULL,
  p_deep BOOLEAN DEFAULT false
)
RETURNS SETOF public.search_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_result public.search_history;
BEGIN
  -- First, try to find an existing BOOKMARKED entry with same query/provider/mode
  SELECT id INTO v_existing_id
  FROM public.search_history
  WHERE user_id = p_user_id
    AND query = p_query
    AND provider = p_provider
    AND mode = p_mode
    AND bookmarked = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update the existing bookmarked entry (move it to top of history)
    UPDATE public.search_history
    SET sources_count = p_sources_count,
        refined_query = p_refined_query,
        deep = p_deep,
        created_at = NOW()
    WHERE id = v_existing_id
    RETURNING * INTO v_result;
  ELSE
    -- No bookmarked entry exists, insert new entry
    INSERT INTO public.search_history (user_id, query, provider, mode, sources_count, refined_query, deep)
    VALUES (p_user_id, p_query, p_provider, p_mode, p_sources_count, p_refined_query, p_deep)
    RETURNING * INTO v_result;
  END IF;

  RETURN NEXT v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_search_history TO authenticated;

-- Add index to speed up the bookmarked entry lookup
CREATE INDEX IF NOT EXISTS idx_search_history_bookmarked_lookup
ON public.search_history(user_id, query, provider, mode)
WHERE bookmarked = true;

COMMENT ON FUNCTION public.upsert_search_history IS
'Upserts a search history entry. If a bookmarked entry with the same query/provider/mode exists,
updates it instead of creating a duplicate. Called from the client via supabase.rpc().
Parameters include p_deep (boolean) for deep research mode tracking.';

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
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

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
-- ADMIN VIEW: USER CREDITS
-- ============================================
-- View to see all users and their tiers (for admin dashboard)

CREATE OR REPLACE VIEW admin_user_credits AS
SELECT
  u.email,
  ul.user_tier,
  ul.monthly_free_credits,
  ul.free_credits_used,
  ul.purchased_credits,
  (COALESCE(ul.monthly_free_credits, 500) - COALESCE(ul.free_credits_used, 0) + COALESCE(ul.purchased_credits, 0)) as total_available,
  ul.last_monthly_reset,
  ul.updated_at
FROM auth.users u
LEFT JOIN user_limits ul ON u.id = ul.user_id
ORDER BY ul.updated_at DESC NULLS LAST;

-- Only service_role can access this view
REVOKE ALL ON admin_user_credits FROM PUBLIC;
GRANT SELECT ON admin_user_credits TO service_role;

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

-- Tier functions (get_tier_free_credits is already granted via its definition)
GRANT EXECUTE ON FUNCTION public.get_tier_free_credits(TEXT) TO authenticated;

-- Credit system functions
GRANT EXECUTE ON FUNCTION public.check_and_use_credits(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_authorize_search(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;
-- Only service role can add credits (via Stripe webhooks)
GRANT EXECUTE ON FUNCTION public.add_purchased_credits(UUID, INTEGER) TO service_role;

-- Soft delete functions
GRANT EXECUTE ON FUNCTION public.soft_delete_search(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_search(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_all_searches() TO authenticated;

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
--
-- Cleanup soft-deleted searches after 1 year (1st of month at 4am UTC):
-- SELECT cron.schedule('cleanup-deleted-searches', '0 4 1 * *', $$SELECT public.cleanup_deleted_searches(365)$$);
--
-- Cleanup expired reservations every 5 minutes:
-- SELECT cron.schedule('cleanup-expired-reservations', '*/5 * * * *', $$SELECT public.cleanup_expired_reservations()$$);
--
-- Cleanup expired OTP codes every hour:
-- SELECT cron.schedule('cleanup-expired-otp', '0 * * * *', $$SELECT public.cleanup_expired_otp_codes()$$);

-- ============================================
-- AVATAR STORAGE BUCKET (run separately)
-- ============================================
-- This creates a public storage bucket for user avatars.
-- Run this SEPARATELY in Supabase SQL Editor after creating tables:
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'avatars',
--   'avatars',
--   true,  -- Public bucket so avatars can be displayed without auth
--   307200,  -- 300KB max file size
--   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   public = true,
--   file_size_limit = 307200,
--   allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
--
-- RLS Policies for avatars bucket:
--
-- -- Allow authenticated users to upload their own avatar
-- CREATE POLICY "Users can upload their own avatar"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- -- Allow authenticated users to update their own avatar
-- CREATE POLICY "Users can update their own avatar"
-- ON storage.objects FOR UPDATE TO authenticated
-- USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
-- WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- -- Allow authenticated users to delete their own avatar
-- CREATE POLICY "Users can delete their own avatar"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
--
-- -- Allow public read access (since bucket is public)
-- CREATE POLICY "Public read access for avatars"
-- ON storage.objects FOR SELECT TO public
-- USING (bucket_id = 'avatars');

-- ============================================
-- API RATE LIMITS TABLE
-- For serverless-safe API-level rate limiting
-- ============================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start);

-- RLS: Allow service role full access
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to rate limits"
  ON api_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- API RATE LIMIT FUNCTION
-- Atomic check-and-increment for API throttling
-- ============================================

-- Check and increment API rate limit
-- Returns: { allowed: boolean, count: number, reset_in_seconds: number }
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_window_cutoff TIMESTAMPTZ;
  v_reset_in INTEGER;
BEGIN
  v_window_cutoff := v_now - (p_window_seconds || ' seconds')::INTERVAL;

  -- Upsert with conditional reset
  INSERT INTO api_rate_limits (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN api_rate_limits.window_start < v_window_cutoff
      THEN 1
      ELSE api_rate_limits.count + 1
    END,
    window_start = CASE
      WHEN api_rate_limits.window_start < v_window_cutoff
      THEN v_now
      ELSE api_rate_limits.window_start
    END
  RETURNING count, window_start INTO v_count, v_window_start;

  -- Calculate seconds until window reset
  v_reset_in := GREATEST(0, EXTRACT(EPOCH FROM (v_window_start + (p_window_seconds || ' seconds')::INTERVAL - v_now))::INTEGER);

  RETURN json_build_object(
    'allowed', v_count <= p_max_requests,
    'count', v_count,
    'limit', p_max_requests,
    'reset_in_seconds', v_reset_in
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.check_api_rate_limit(TEXT, INTEGER, INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Cleanup old rate limit entries (for pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_api_rate_limits(p_older_than_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM api_rate_limits
  WHERE window_start < NOW() - (p_older_than_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.cleanup_api_rate_limits(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.cleanup_api_rate_limits(INTEGER) TO service_role;

-- ============================================
-- TIER-BASED DAILY TOKEN LIMIT FUNCTION
-- ============================================

-- Get daily token limit based on tier
CREATE OR REPLACE FUNCTION public.get_tier_daily_token_limit(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 2147483647  -- Max INT (effectively unlimited)
    WHEN 'pro' THEN 200000
    ELSE 50000  -- 'free' tier
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_daily_token_limit(TEXT) SET search_path = public;

-- Get monthly token limit based on tier
CREATE OR REPLACE FUNCTION public.get_tier_monthly_token_limit(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 2147483647  -- Max INT (effectively unlimited)
    WHEN 'pro' THEN 5000000  -- 5M tokens/month
    ELSE 500000  -- 'free' tier: 500K tokens/month
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_monthly_token_limit(TEXT) SET search_path = public;

-- ============================================
-- UNIFIED RESERVE AND AUTHORIZE SEARCH
-- Single RPC that checks ALL limits and reserves credits
-- ============================================

-- Unified function: checks all limits and reserves credits in single call
-- Checks: daily search limit, monthly search limit, daily token limit, monthly token limit, credit availability
-- Returns detailed error info on failure
CREATE OR REPLACE FUNCTION public.reserve_and_authorize_search(p_max_credits INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
  -- Search limits
  v_daily_search_limit INTEGER;
  v_daily_searches_used INTEGER;
  v_monthly_search_limit INTEGER;
  v_monthly_searches_used INTEGER;
  -- Token limits
  v_daily_token_limit INTEGER;
  v_daily_tokens_used INTEGER;
  v_monthly_token_limit INTEGER;
  v_monthly_tokens_used INTEGER;
  -- Credit variables
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_total_available INTEGER;
  v_reservation_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('allowed', FALSE, 'error', 'Not authenticated', 'error_type', 'auth');
  END IF;

  -- Ensure user_limits row exists
  INSERT INTO user_limits (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset daily counters if needed
  UPDATE user_limits
  SET daily_searches_used = 0,
      daily_tokens_used = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_daily_reset < CURRENT_DATE;

  -- Reset monthly counters if needed (including free credits)
  UPDATE user_limits
  SET monthly_searches_used = 0,
      monthly_tokens_used = 0,
      free_credits_used = 0,
      last_monthly_reset = DATE_TRUNC('month', CURRENT_DATE)::DATE,
      updated_at = NOW()
  WHERE user_id = v_user_id
    AND last_monthly_reset < DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Get all limits and current usage in one query
  SELECT
    COALESCE(user_tier, 'free'),
    COALESCE(daily_search_limit, 50),
    COALESCE(daily_searches_used, 0),
    COALESCE(monthly_search_limit, 1000),
    COALESCE(monthly_searches_used, 0),
    COALESCE(daily_tokens_used, 0),
    COALESCE(monthly_tokens_used, 0),
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0)
  INTO
    v_tier,
    v_daily_search_limit,
    v_daily_searches_used,
    v_monthly_search_limit,
    v_monthly_searches_used,
    v_daily_tokens_used,
    v_monthly_tokens_used,
    v_monthly_free,
    v_free_used,
    v_purchased
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate token limits based on tier
  v_daily_token_limit := get_tier_daily_token_limit(v_tier);
  v_monthly_token_limit := get_tier_monthly_token_limit(v_tier);

  -- Check 1: Daily search limit
  IF v_daily_searches_used >= v_daily_search_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'daily_search_limit',
      'reason', 'Daily search limit reached (' || v_daily_search_limit || ' searches). Resets at midnight.',
      'daily_searches_used', v_daily_searches_used,
      'daily_search_limit', v_daily_search_limit
    );
  END IF;

  -- Check 2: Monthly search limit
  IF v_monthly_searches_used >= v_monthly_search_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'monthly_search_limit',
      'reason', 'Monthly search limit reached (' || v_monthly_search_limit || ' searches). Resets on the 1st.',
      'monthly_searches_used', v_monthly_searches_used,
      'monthly_search_limit', v_monthly_search_limit
    );
  END IF;

  -- Check 3: Daily token limit (skip for admin)
  IF v_tier != 'admin' AND v_daily_tokens_used >= v_daily_token_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'daily_token_limit',
      'reason', 'Daily token limit reached (' || v_daily_tokens_used || ' / ' || v_daily_token_limit || '). Resets at midnight.',
      'daily_tokens_used', v_daily_tokens_used,
      'daily_token_limit', v_daily_token_limit
    );
  END IF;

  -- Check 4: Monthly token limit (skip for admin)
  IF v_tier != 'admin' AND v_monthly_tokens_used >= v_monthly_token_limit THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'monthly_token_limit',
      'reason', 'Monthly token limit reached (' || v_monthly_tokens_used || ' / ' || v_monthly_token_limit || '). Resets on the 1st.',
      'monthly_tokens_used', v_monthly_tokens_used,
      'monthly_token_limit', v_monthly_token_limit
    );
  END IF;

  -- Check 5: Credit availability
  v_free_available := v_monthly_free - v_free_used;
  v_total_available := v_free_available + v_purchased;

  IF v_total_available < p_max_credits THEN
    RETURN json_build_object(
      'allowed', FALSE,
      'error_type', 'insufficient_credits',
      'reason', 'You need ' || p_max_credits || ' credits but only have ' || v_total_available || '. Purchase more credits to continue.',
      'credits_needed', p_max_credits,
      'credits_available', v_total_available,
      'free_remaining', v_free_available,
      'purchased_remaining', v_purchased
    );
  END IF;

  -- All checks passed - create reservation and increment search counters
  INSERT INTO credit_reservations (user_id, reserved_credits, status)
  VALUES (v_user_id, p_max_credits, 'pending')
  RETURNING id INTO v_reservation_id;

  -- Reserve credits and increment search counters atomically
  IF v_free_available >= p_max_credits THEN
    -- All from free credits
    UPDATE user_limits
    SET free_credits_used = free_credits_used + p_max_credits,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSIF v_free_available > 0 THEN
    -- Use all remaining free + some purchased
    UPDATE user_limits
    SET free_credits_used = monthly_free_credits,
        purchased_credits = purchased_credits - (p_max_credits - v_free_available),
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  ELSE
    -- All from purchased
    UPDATE user_limits
    SET purchased_credits = purchased_credits - p_max_credits,
        daily_searches_used = daily_searches_used + 1,
        monthly_searches_used = monthly_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  -- Success
  RETURN json_build_object(
    'allowed', TRUE,
    'reservation_id', v_reservation_id,
    'reserved', p_max_credits,
    'remaining_after_reserve', v_total_available - p_max_credits,
    'user_tier', v_tier,
    'daily_searches_used', v_daily_searches_used + 1,
    'daily_search_limit', v_daily_search_limit,
    'monthly_searches_used', v_monthly_searches_used + 1,
    'monthly_search_limit', v_monthly_search_limit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.reserve_and_authorize_search(INTEGER) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.reserve_and_authorize_search(INTEGER) TO authenticated;

-- ============================================
-- SCHEDULED JOB FOR API RATE LIMIT CLEANUP
-- ============================================
-- Run this after enabling pg_cron:
-- SELECT cron.schedule('cleanup-api-rate-limits', '0 * * * *', $$SELECT public.cleanup_api_rate_limits(24)$$);

