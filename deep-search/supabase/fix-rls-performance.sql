-- Migration: Fix RLS policy performance
-- Replaces auth.uid() with (select auth.uid()) for better query performance
-- This caches the auth value once per query instead of re-evaluating for each row

-- ============================================
-- USER_PREFERENCES TABLE
-- ============================================

DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- SEARCH_HISTORY TABLE (in case these also need fixing)
-- ============================================

DROP POLICY IF EXISTS "Users can view their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can insert their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can delete their own search history" ON search_history;
DROP POLICY IF EXISTS "Users can update their own search history" ON search_history;

CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own search history"
  ON search_history FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own search history"
  ON search_history FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- API_USAGE TABLE
-- ============================================

DROP POLICY IF EXISTS "Users can view their own API usage" ON api_usage;
DROP POLICY IF EXISTS "Users can insert their own API usage" ON api_usage;

CREATE POLICY "Users can view their own API usage"
  ON api_usage FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own API usage"
  ON api_usage FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- ============================================
-- USER_LIMITS TABLE
-- ============================================

DROP POLICY IF EXISTS "Users can view their own limits" ON user_limits;
DROP POLICY IF EXISTS "Users can update their own usage counts" ON user_limits;

CREATE POLICY "Users can view their own limits"
  ON user_limits FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own usage counts"
  ON user_limits FOR UPDATE
  USING ((select auth.uid()) = user_id);
