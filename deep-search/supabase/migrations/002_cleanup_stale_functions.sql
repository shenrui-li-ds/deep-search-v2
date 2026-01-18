-- Migration: Cleanup Stale Functions
-- Removes unused functions that have been superseded by newer implementations

-- ============================================
-- DROP UNUSED FUNCTIONS
-- ============================================

-- check_and_increment_search: Older version, replaced by v2, never called in codebase
DROP FUNCTION IF EXISTS public.check_and_increment_search();

-- check_and_increment_search_v2: Never called - daily/monthly search limits
-- are now enforced by reserve_and_authorize_search()
DROP FUNCTION IF EXISTS public.check_and_increment_search_v2();

-- check_token_limits: Never called - token limits are checked differently
-- (via get_user_credits + manual comparison)
DROP FUNCTION IF EXISTS public.check_token_limits(UUID);

-- ============================================
-- UPDATE GRANTS
-- Remove grants for dropped functions
-- ============================================

-- Note: Grants are automatically dropped when functions are dropped

-- ============================================
-- DEPRECATION NOTICE
-- The following functions are kept for backwards compatibility
-- but will be removed in a future migration:
--
-- 1. check_and_use_credits(INTEGER) - Used as fallback in check-limit
-- 2. check_and_authorize_search(INTEGER) - Used as fallback in check-limit
--
-- New code should use: reserve_and_authorize_search(INTEGER)
-- ============================================
