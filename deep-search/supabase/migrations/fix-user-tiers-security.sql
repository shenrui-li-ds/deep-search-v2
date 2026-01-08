-- Fix: Remove admin_user_credits view that triggers security warnings
-- The view exposes auth.users and has SECURITY DEFINER issues
-- Use direct SQL queries instead for admin tasks

-- Drop the problematic view
DROP VIEW IF EXISTS admin_user_credits;

-- Alternative: Create a secure function for admin to list users (service_role only)
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

-- Verify get_tier_free_credits exists (required by other functions)
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

-- Ensure user_tier column exists with proper default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_limits' AND column_name = 'user_tier'
  ) THEN
    ALTER TABLE user_limits ADD COLUMN user_tier TEXT DEFAULT 'free';
  END IF;
END $$;

-- Add check constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'user_limits_user_tier_check'
  ) THEN
    ALTER TABLE user_limits ADD CONSTRAINT user_limits_user_tier_check
    CHECK (user_tier IN ('free', 'pro', 'admin'));
  END IF;
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists, ignore
  NULL;
END $$;

-- Recreate get_user_credits with better error handling
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
    'days_until_reset', (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - CURRENT_DATE)::INTEGER
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_user_credits() SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;
