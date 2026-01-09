-- Migration: Reduce free tier credits from 1000 to 500
-- Run this in Supabase SQL Editor to update the database
-- This migration is idempotent (safe to run multiple times)

-- ============================================
-- STEP 1: UPDATE get_tier_free_credits FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.get_tier_free_credits(p_tier TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE p_tier
    WHEN 'admin' THEN 10000
    WHEN 'pro' THEN 2000
    ELSE 500  -- 'free' tier (reduced from 1000)
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER FUNCTION public.get_tier_free_credits(TEXT) SET search_path = public;

-- ============================================
-- STEP 2: UPDATE COLUMN DEFAULT
-- ============================================

ALTER TABLE user_limits ALTER COLUMN monthly_free_credits SET DEFAULT 500;

-- ============================================
-- STEP 3: UPDATE EXISTING FREE TIER USERS
-- ============================================

-- Only update users who:
-- 1. Are on the 'free' tier (or NULL tier, which defaults to free)
-- 2. Still have the old 1000 credit limit
-- This preserves any manually adjusted values

UPDATE user_limits
SET
  monthly_free_credits = 500,
  updated_at = NOW()
WHERE
  (user_tier IS NULL OR user_tier = 'free')
  AND monthly_free_credits = 1000;

-- ============================================
-- STEP 4: UPDATE reserve_credits FUNCTION
-- ============================================

-- Update the COALESCE default from 1000 to 500 in reserve_credits
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_mode TEXT,
  p_max_credits INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_total_available INTEGER;
  v_reservation_id UUID;
  v_tier TEXT;
BEGIN
  -- Get current credit state with tier
  SELECT
    monthly_free_credits,
    free_credits_used,
    purchased_credits,
    COALESCE(user_tier, 'free')
  INTO v_monthly_free, v_free_used, v_purchased, v_tier
  FROM user_limits
  WHERE user_id = p_user_id;

  -- If user has no limits record yet, use tier defaults
  IF v_monthly_free IS NULL THEN
    v_monthly_free := get_tier_free_credits('free');
    v_free_used := 0;
    v_purchased := 0;
    v_tier := 'free';
  END IF;

  -- Calculate available credits
  v_free_available := COALESCE(v_monthly_free, 500) - COALESCE(v_free_used, 0);
  v_total_available := v_free_available + COALESCE(v_purchased, 0);

  -- Check if user has enough credits
  IF v_total_available < p_max_credits THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Insufficient credits',
      'available', v_total_available,
      'required', p_max_credits,
      'tier', v_tier
    );
  END IF;

  -- Create reservation
  INSERT INTO credit_reservations (user_id, mode, max_credits)
  VALUES (p_user_id, p_mode, p_max_credits)
  RETURNING id INTO v_reservation_id;

  RETURN json_build_object(
    'success', TRUE,
    'reservation_id', v_reservation_id,
    'available_before', v_total_available,
    'reserved', p_max_credits,
    'tier', v_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.reserve_credits(UUID, TEXT, INTEGER) SET search_path = public;

-- ============================================
-- STEP 5: UPDATE get_user_credits FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_credits()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_tier TEXT;
  v_last_reset DATE;
  v_days_until_reset INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Get credit info with tier
  SELECT
    COALESCE(monthly_free_credits, get_tier_free_credits(COALESCE(user_tier, 'free'))),
    COALESCE(free_credits_used, 0),
    COALESCE(purchased_credits, 0),
    COALESCE(user_tier, 'free'),
    last_monthly_reset
  INTO v_monthly_free, v_free_used, v_purchased, v_tier, v_last_reset
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Handle case where user has no limits record
  IF v_monthly_free IS NULL THEN
    v_monthly_free := get_tier_free_credits('free');
    v_free_used := 0;
    v_purchased := 0;
    v_tier := 'free';
    v_last_reset := DATE_TRUNC('month', CURRENT_DATE)::DATE;
  END IF;

  -- Calculate days until next reset (1st of next month)
  v_days_until_reset := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::DATE - CURRENT_DATE;

  RETURN json_build_object(
    'monthly_free_credits', v_monthly_free,
    'free_credits_used', v_free_used,
    'free_credits_remaining', GREATEST(0, v_monthly_free - v_free_used),
    'purchased_credits', v_purchased,
    'total_available', GREATEST(0, v_monthly_free - v_free_used) + v_purchased,
    'days_until_reset', v_days_until_reset,
    'tier', v_tier
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_user_credits() SET search_path = public;

-- ============================================
-- VERIFICATION
-- ============================================

-- Check free tier default
SELECT column_default
FROM information_schema.columns
WHERE table_name = 'user_limits' AND column_name = 'monthly_free_credits';

-- Check get_tier_free_credits returns 500 for free
SELECT get_tier_free_credits('free') as free_tier_credits;

-- Count affected users
SELECT
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE monthly_free_credits = 500) as users_with_500,
  COUNT(*) FILTER (WHERE monthly_free_credits = 1000) as users_with_1000,
  COUNT(*) FILTER (WHERE user_tier = 'free' OR user_tier IS NULL) as free_tier_users
FROM user_limits;
