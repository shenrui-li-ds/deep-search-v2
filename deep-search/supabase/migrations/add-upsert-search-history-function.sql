-- Migration: Add upsert_search_history function
-- Run this in Supabase SQL Editor
--
-- Purpose: Optimizes the "add to history" flow by combining the duplicate check
-- and insert/update into a single database call. This eliminates one round trip
-- when saving search history, especially important for bookmarked entries.
--
-- Behavior:
-- 1. If a BOOKMARKED entry with same (user_id, query, provider, mode) exists:
--    → Updates that entry's sources_count, refined_query, and created_at
-- 2. Otherwise:
--    → Inserts a new entry (bookmarked = false by default)
--
-- This prevents duplicate entries when users re-run bookmarked searches.

-- Create or replace the function
CREATE OR REPLACE FUNCTION public.upsert_search_history(
  p_user_id UUID,
  p_query TEXT,
  p_provider TEXT,
  p_mode TEXT,
  p_sources_count INTEGER,
  p_refined_query TEXT DEFAULT NULL,
  p_deep BOOLEAN DEFAULT false
)
RETURNS SETOF public.search_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_result public.search_history;
BEGIN
  -- First, try to find an existing BOOKMARKED entry with same query/provider/mode
  SELECT id INTO v_existing_id
  FROM public.search_history
  WHERE user_id = p_user_id
    AND query = p_query
    AND provider = p_provider
    AND mode = p_mode
    AND bookmarked = true
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update the existing bookmarked entry (move it to top of history)
    UPDATE public.search_history
    SET sources_count = p_sources_count,
        refined_query = p_refined_query,
        deep = p_deep,
        created_at = NOW()
    WHERE id = v_existing_id
    RETURNING * INTO v_result;
  ELSE
    -- No bookmarked entry exists, insert new entry
    INSERT INTO public.search_history (user_id, query, provider, mode, sources_count, refined_query, deep)
    VALUES (p_user_id, p_query, p_provider, p_mode, p_sources_count, p_refined_query, p_deep)
    RETURNING * INTO v_result;
  END IF;

  RETURN NEXT v_result;
END;
$$;

-- Set search_path for security (prevents search_path injection attacks)
ALTER FUNCTION public.upsert_search_history(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) SET search_path = public;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_search_history TO authenticated;

-- Add index to speed up the bookmarked entry lookup (if not exists)
-- This index is specifically for the function's query pattern
CREATE INDEX IF NOT EXISTS idx_search_history_bookmarked_lookup
ON public.search_history(user_id, query, provider, mode)
WHERE bookmarked = true;

-- Add comment for documentation
COMMENT ON FUNCTION public.upsert_search_history IS
'Upserts a search history entry. If a bookmarked entry with the same query/provider/mode exists,
updates it instead of creating a duplicate. Called from the client via supabase.rpc().
Parameters include p_deep (boolean) for deep research mode tracking.';
