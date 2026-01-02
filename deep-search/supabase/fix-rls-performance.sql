-- Migration: Fix RLS policy performance issues
-- 1. Use (SELECT auth.function()) instead of auth.function() for better performance
-- 2. Fix overlapping policies on credit_purchases table

-- ============================================
-- FIX login_attempts RLS
-- ============================================

-- Drop and recreate with optimized auth check
DROP POLICY IF EXISTS "Service role only" ON login_attempts;

CREATE POLICY "Service role only"
  ON login_attempts
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- FIX credit_purchases RLS
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own purchases" ON credit_purchases;
DROP POLICY IF EXISTS "Service role can manage purchases" ON credit_purchases;

-- Recreate with optimized auth checks and no overlapping
-- Users can only SELECT their own purchases
CREATE POLICY "Users can view own purchases"
  ON credit_purchases
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Service role can INSERT, UPDATE, DELETE (not SELECT to avoid overlap)
-- Note: Service role bypasses RLS anyway, but explicit policy avoids warnings
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
