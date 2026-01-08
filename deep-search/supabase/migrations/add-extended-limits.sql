-- Migration: Add daily token and monthly search limits
-- Run this in Supabase SQL Editor if you already have the user_limits table

-- ============================================
-- ADD NEW COLUMNS TO USER_LIMITS TABLE
-- ============================================

-- Add daily token tracking
ALTER TABLE user_limits
ADD COLUMN IF NOT EXISTS daily_token_limit INTEGER DEFAULT 100000,
ADD COLUMN IF NOT EXISTS daily_tokens_used INTEGER DEFAULT 0;

-- Add monthly search tracking
ALTER TABLE user_limits
ADD COLUMN IF NOT EXISTS monthly_search_limit INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS monthly_searches_used INTEGER DEFAULT 0;

-- Rename last_reset_date to last_daily_reset for clarity
ALTER TABLE user_limits
RENAME COLUMN last_reset_date TO last_daily_reset;

-- Add monthly reset tracking
ALTER TABLE user_limits
ADD COLUMN IF NOT EXISTS last_monthly_reset DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE;

-- ============================================
-- UPDATE FUNCTIONS
-- ============================================

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

-- Grant execute permission for new function
GRANT EXECUTE ON FUNCTION public.check_token_limits(UUID) TO authenticated;
