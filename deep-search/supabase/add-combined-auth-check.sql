-- Migration: Combined authorization check (rate limits + credits)
-- Optimizes check-limit from 2 database calls to 1

-- ============================================
-- COMBINED CHECK AND AUTHORIZE FUNCTION
-- ============================================

-- Single function that checks rate limits AND credits atomically
-- Returns JSON with full authorization result
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

  -- ========================================
  -- PHASE 1: RATE LIMITS (Security)
  -- ========================================

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

  -- ========================================
  -- PHASE 2: CREDITS (Billing)
  -- ========================================

  -- Calculate available free credits
  v_free_available := COALESCE(v_monthly_free, 1000) - COALESCE(v_free_used, 0);

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

  -- ========================================
  -- SUCCESS: Both checks passed
  -- ========================================

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

-- Set search_path for security
ALTER FUNCTION public.check_and_authorize_search(INTEGER) SET search_path = public;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.check_and_authorize_search(INTEGER) TO authenticated;
