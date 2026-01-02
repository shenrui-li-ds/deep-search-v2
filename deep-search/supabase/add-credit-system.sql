-- Migration: Add credit-based billing system
-- Replaces search/token limits with unified credit system

-- ============================================
-- EXTEND USER_LIMITS TABLE FOR CREDITS
-- ============================================

-- Add credit columns to user_limits
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS monthly_free_credits INTEGER DEFAULT 1000;
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS free_credits_used INTEGER DEFAULT 0;
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS purchased_credits INTEGER DEFAULT 0;
ALTER TABLE user_limits ADD COLUMN IF NOT EXISTS lifetime_credits_purchased INTEGER DEFAULT 0;

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
-- CREDIT CHECK AND USE FUNCTION
-- ============================================

-- Check if user has enough credits and deduct them
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.check_and_use_credits(INTEGER) TO authenticated;

-- ============================================
-- GET USER CREDITS FUNCTION
-- ============================================

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
GRANT EXECUTE ON FUNCTION public.get_user_credits() TO authenticated;

-- ============================================
-- ADD CREDITS FUNCTION (for Stripe webhooks)
-- ============================================

-- Add purchased credits to user account
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
-- Only service role can add credits
GRANT EXECUTE ON FUNCTION public.add_purchased_credits(UUID, INTEGER) TO service_role;
