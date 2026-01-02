-- Migration: Add credit reservation system for dynamic billing
-- Allows reserving credits before search, then charging actual usage

-- ============================================
-- CREDIT RESERVATIONS TABLE
-- ============================================

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
-- RESERVE CREDITS FUNCTION
-- ============================================

-- Reserve credits for a search (blocks them from being used elsewhere)
-- Returns: { allowed: boolean, reservation_id: uuid, reserved: number, error?: string }
CREATE OR REPLACE FUNCTION public.reserve_credits(p_max_credits INTEGER)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_monthly_free INTEGER;
  v_free_used INTEGER;
  v_purchased INTEGER;
  v_free_available INTEGER;
  v_total_available INTEGER;
  v_reservation_id UUID;
  v_last_reset DATE;
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
    monthly_free_credits,
    free_credits_used,
    purchased_credits
  INTO v_monthly_free, v_free_used, v_purchased
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate available credits
  v_free_available := COALESCE(v_monthly_free, 1000) - COALESCE(v_free_used, 0);
  v_total_available := v_free_available + COALESCE(v_purchased, 0);

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
-- FINALIZE CREDITS FUNCTION
-- ============================================

-- Finalize a reservation: charge actual usage, refund unused
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

  -- Refund unused credits (add back to purchased first, then reduce free_used)
  IF v_refund > 0 THEN
    UPDATE user_limits
    SET purchased_credits = purchased_credits + v_refund,
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

-- ============================================
-- CANCEL RESERVATION FUNCTION
-- ============================================

-- Cancel a reservation (full refund) - used if search fails
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_reservation RECORD;
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

  -- Full refund
  UPDATE user_limits
  SET purchased_credits = purchased_credits + v_reservation.reserved_credits,
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

-- ============================================
-- CLEANUP EXPIRED RESERVATIONS
-- ============================================

-- Expire stale reservations (older than 5 minutes) and refund credits
CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_reservation RECORD;
BEGIN
  FOR v_reservation IN
    SELECT * FROM credit_reservations
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
    FOR UPDATE
  LOOP
    -- Refund credits
    UPDATE user_limits
    SET purchased_credits = purchased_credits + v_reservation.reserved_credits,
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
