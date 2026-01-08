-- ============================================
-- FIX CREDIT REFUND BUG
-- ============================================
--
-- BUG: Credits were always refunded to purchased_credits, even when
-- they were originally taken from free credits. This caused a "leak"
-- from free credits to purchased credits over time.
--
-- FIX: Refund to free_credits_used first (decrease it), only overflow
-- to purchased_credits if free_credits_used would go negative.
--
-- Run this migration in Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. FIX finalize_credits FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.finalize_credits(
  p_reservation_id UUID,
  p_actual_credits INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_reservation RECORD;
  v_refund INTEGER;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
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

  -- Refund unused credits - give back to free first, then purchased
  IF v_refund > 0 THEN
    -- Get current free_credits_used
    SELECT free_credits_used INTO v_free_used
    FROM user_limits
    WHERE user_id = v_user_id;

    -- Calculate how much can go back to free vs purchased
    -- We can only reduce free_credits_used down to 0
    v_refund_to_free := LEAST(v_refund, COALESCE(v_free_used, 0));
    v_refund_to_purchased := v_refund - v_refund_to_free;

    UPDATE user_limits
    SET free_credits_used = free_credits_used - v_refund_to_free,
        purchased_credits = purchased_credits + v_refund_to_purchased,
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

-- ============================================
-- 2. FIX cancel_reservation FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_reservation RECORD;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
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

  -- Get current free_credits_used
  SELECT free_credits_used INTO v_free_used
  FROM user_limits
  WHERE user_id = v_user_id;

  -- Calculate how much can go back to free vs purchased
  v_refund_to_free := LEAST(v_reservation.reserved_credits, COALESCE(v_free_used, 0));
  v_refund_to_purchased := v_reservation.reserved_credits - v_refund_to_free;

  -- Full refund - give back to free first, then purchased
  UPDATE user_limits
  SET free_credits_used = free_credits_used - v_refund_to_free,
      purchased_credits = purchased_credits + v_refund_to_purchased,
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

-- ============================================
-- 3. FIX cleanup_expired_reservations FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_reservation RECORD;
  v_free_used INTEGER;
  v_refund_to_free INTEGER;
  v_refund_to_purchased INTEGER;
BEGIN
  FOR v_reservation IN
    SELECT * FROM credit_reservations
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
    FOR UPDATE
  LOOP
    -- Get current free_credits_used for this user
    SELECT free_credits_used INTO v_free_used
    FROM user_limits
    WHERE user_id = v_reservation.user_id;

    -- Calculate how much can go back to free vs purchased
    v_refund_to_free := LEAST(v_reservation.reserved_credits, COALESCE(v_free_used, 0));
    v_refund_to_purchased := v_reservation.reserved_credits - v_refund_to_free;

    -- Refund credits - give back to free first, then purchased
    UPDATE user_limits
    SET free_credits_used = free_credits_used - v_refund_to_free,
        purchased_credits = purchased_credits + v_refund_to_purchased,
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

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to check if your admin account has incorrect purchased_credits:
--
-- SELECT
--   au.email,
--   ul.monthly_free_credits,
--   ul.free_credits_used,
--   ul.purchased_credits,
--   (ul.monthly_free_credits - ul.free_credits_used) as free_remaining,
--   (ul.monthly_free_credits - ul.free_credits_used + ul.purchased_credits) as total_available
-- FROM user_limits ul
-- JOIN auth.users au ON ul.user_id = au.id
-- WHERE ul.purchased_credits > 0;
--
-- ============================================
-- MANUAL FIX FOR AFFECTED ACCOUNTS
-- ============================================
-- If you want to reset the leaked purchased_credits back to 0 for accounts
-- that never actually purchased credits, run:
--
-- UPDATE user_limits
-- SET purchased_credits = 0,
--     free_credits_used = GREATEST(0, free_credits_used - purchased_credits)
-- WHERE user_id IN (
--   SELECT user_id FROM user_limits
--   WHERE purchased_credits > 0
--   AND user_id NOT IN (
--     SELECT DISTINCT user_id FROM credit_purchases WHERE status = 'completed'
--   )
-- );
--
-- NOTE: Adjust the above query based on your actual purchase tracking table.
-- If you don't have a credit_purchases table, you may need to manually
-- identify which accounts should have purchased_credits reset.
