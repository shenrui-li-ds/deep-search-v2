-- Migration: Rename VIP tier to PRO
-- Run this in Supabase SQL Editor to update the database
-- This migration is idempotent (safe to run multiple times)

-- ============================================
-- STEP 1: DROP OLD CONSTRAINT FIRST
-- ============================================

-- Must drop constraint before updating data, otherwise UPDATE fails
ALTER TABLE user_limits DROP CONSTRAINT IF EXISTS user_limits_user_tier_check;

-- ============================================
-- STEP 2: UPDATE EXISTING DATA
-- ============================================

-- Update any existing 'vip' users to 'pro'
UPDATE user_limits SET user_tier = 'pro' WHERE user_tier = 'vip';

-- ============================================
-- STEP 3: ADD NEW CHECK CONSTRAINT
-- ============================================

-- Add new constraint with 'pro' instead of 'vip'
ALTER TABLE user_limits ADD CONSTRAINT user_limits_user_tier_check
  CHECK (user_tier IN ('free', 'pro', 'admin'));

-- ============================================
-- STEP 4: UPDATE TIER CREDITS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.get_tier_free_credits(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 10000
    WHEN 'pro' THEN 2000
    ELSE 1000  -- 'free' tier
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_free_credits(TEXT) SET search_path = public;

-- ============================================
-- STEP 5: UPDATE SET_USER_TIER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.set_user_tier(
  p_user_email TEXT,
  p_tier TEXT
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_new_free_credits INTEGER;
BEGIN
  -- Validate tier (now uses 'pro' instead of 'vip')
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

  -- Ensure user_limits row exists and update tier
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
REVOKE ALL ON FUNCTION public.set_user_tier(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_tier(TEXT, TEXT) TO service_role;

-- ============================================
-- STEP 6: UPDATE GET_USER_CREDITS FUNCTION
-- ============================================

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
    v_monthly_free := 1000;
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
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;

-- ============================================
-- STEP 7: UPDATE RESERVE_CREDITS FUNCTION
-- ============================================

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
  IF v_monthly_free = 1000 AND v_tier != 'free' THEN
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

-- ============================================
-- STEP 8: UPDATE ADMIN LIST FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_list_user_credits(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  email TEXT,
  user_tier TEXT,
  monthly_free_credits INTEGER,
  free_credits_used INTEGER,
  purchased_credits INTEGER,
  total_available INTEGER,
  last_monthly_reset DATE,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.email::TEXT,
    COALESCE(ul.user_tier, 'free')::TEXT,
    COALESCE(ul.monthly_free_credits, 1000),
    COALESCE(ul.free_credits_used, 0),
    COALESCE(ul.purchased_credits, 0),
    (COALESCE(ul.monthly_free_credits, 1000) - COALESCE(ul.free_credits_used, 0) + COALESCE(ul.purchased_credits, 0)),
    ul.last_monthly_reset,
    ul.updated_at
  FROM auth.users u
  LEFT JOIN user_limits ul ON u.id = ul.user_id
  ORDER BY ul.updated_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.admin_list_user_credits(INTEGER) SET search_path = public;
REVOKE ALL ON FUNCTION public.admin_list_user_credits(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_credits(INTEGER) TO service_role;

-- ============================================
-- VERIFICATION
-- ============================================

-- Verify the constraint is updated
DO $$
BEGIN
  RAISE NOTICE 'Migration complete: VIP tier renamed to PRO';
  RAISE NOTICE 'Tier values now allowed: free, pro, admin';
END $$;
