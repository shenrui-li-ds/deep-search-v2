-- Migration: Add deep column to search_history
-- Run this in Supabase SQL Editor if you have an existing database
--
-- This adds support for tracking whether a search used "deep research" mode

-- Add the deep column if it doesn't exist
ALTER TABLE search_history
ADD COLUMN IF NOT EXISTS deep BOOLEAN DEFAULT false;

-- Update the upsert_search_history function to accept p_deep parameter
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upsert_search_history TO authenticated;
