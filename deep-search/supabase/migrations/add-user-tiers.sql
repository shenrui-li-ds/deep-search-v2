-- Migration: Add user tier system and admin functions
-- Allows Pro users to have higher monthly free credits
-- Provides admin functions to manage user tiers and grant bonus credits

-- ============================================
-- ADD USER TIER COLUMN
-- ============================================

-- Add tier column to user_limits (default 'free')
ALTER TABLE user_limits
ADD COLUMN IF NOT EXISTS user_tier TEXT DEFAULT 'free'
CHECK (user_tier IN ('free', 'pro', 'admin'));

-- Index for tier lookups
CREATE INDEX IF NOT EXISTS idx_user_limits_tier ON user_limits(user_tier) WHERE user_tier != 'free';

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
    ELSE 1000  -- 'free' tier
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

  -- Ensure user_limits row exists
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

-- ============================================
-- UPDATE: RESERVE_CREDITS (tier-aware)
-- ============================================

-- Update reserve_credits to use tier-based monthly_free_credits
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
-- UPDATE: GET_USER_CREDITS (include tier)
-- ============================================

-- Update get_user_credits to return tier information
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

  -- Get current state
  SELECT
    COALESCE(user_tier, 'free'),
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0),
    last_monthly_reset
  INTO v_tier, v_monthly_free, v_free_used, v_purchased, v_last_reset
  FROM user_limits
  WHERE user_id = v_user_id;

  RETURN json_build_object(
    'user_tier', v_tier,
    'monthly_free_credits', v_monthly_free,
    'free_credits_used', v_free_used,
    'free_credits_remaining', v_monthly_free - v_free_used,
    'purchased_credits', v_purchased,
    'total_available', (v_monthly_free - v_free_used) + v_purchased,
    'days_until_reset', (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - CURRENT_DATE)::INTEGER
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_user_credits() SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;

-- ============================================
-- HELPER: VIEW ALL USERS WITH TIERS (admin)
-- ============================================

-- View to see all users and their tiers (for admin dashboard)
CREATE OR REPLACE VIEW admin_user_credits AS
SELECT
  u.email,
  ul.user_tier,
  ul.monthly_free_credits,
  ul.free_credits_used,
  ul.purchased_credits,
  (COALESCE(ul.monthly_free_credits, 1000) - COALESCE(ul.free_credits_used, 0) + COALESCE(ul.purchased_credits, 0)) as total_available,
  ul.last_monthly_reset,
  ul.updated_at
FROM auth.users u
LEFT JOIN user_limits ul ON u.id = ul.user_id
ORDER BY ul.updated_at DESC NULLS LAST;

-- Only service_role can access this view
REVOKE ALL ON admin_user_credits FROM PUBLIC;
GRANT SELECT ON admin_user_credits TO service_role;
