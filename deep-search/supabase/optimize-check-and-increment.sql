-- Migration: Optimize check_and_increment_search to return full limit data
-- This eliminates one database round-trip by returning limits in the same call

-- Create a new function that returns JSON with all limit data
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
    v_allowed := FALSE;
    v_reason := 'Daily search limit reached (' || v_daily_limit || ' searches). Resets at midnight.';
    RETURN json_build_object(
      'allowed', v_allowed,
      'reason', v_reason,
      'daily_limit', v_daily_limit,
      'daily_used', v_daily_used,
      'monthly_limit', v_monthly_limit,
      'monthly_used', v_monthly_used
    );
  END IF;

  -- Check if under monthly limit
  IF v_monthly_used >= v_monthly_limit THEN
    v_allowed := FALSE;
    v_reason := 'Monthly search limit reached (' || v_monthly_limit || ' searches). Resets on the 1st.';
    RETURN json_build_object(
      'allowed', v_allowed,
      'reason', v_reason,
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

  -- Return success with UPDATED counts (after increment)
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

-- Set search path for security
ALTER FUNCTION public.check_and_increment_search_v2() SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_and_increment_search_v2() TO authenticated;
