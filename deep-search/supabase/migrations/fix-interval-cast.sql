-- Fix: Cannot cast interval to integer in get_user_credits
-- The days_until_reset calculation was incorrectly casting an interval

CREATE OR REPLACE FUNCTION public.get_user_credits()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_tier TEXT;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_last_reset DATE;
  v_days_until_reset INTEGER;
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
    v_monthly_free := 1000;
    v_free_used := 0;
    v_purchased := 0;
  END IF;

  -- Calculate days until reset (first of next month - today)
  -- This returns an integer directly (date - date = integer in PostgreSQL)
  v_days_until_reset := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE - CURRENT_DATE;

  RETURN json_build_object(
    'user_tier', v_tier,
    'monthly_free_credits', v_monthly_free,
    'free_credits_used', v_free_used,
    'free_credits_remaining', v_monthly_free - v_free_used,
    'purchased_credits', v_purchased,
    'total_available', (v_monthly_free - v_free_used) + v_purchased,
    'days_until_reset', v_days_until_reset
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_user_credits() SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;
