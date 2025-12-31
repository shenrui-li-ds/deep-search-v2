-- Migration: Add bookmarked column to search_history table
-- Run this in Supabase SQL Editor

-- Add bookmarked column with default value of false
ALTER TABLE public.search_history
ADD COLUMN IF NOT EXISTS bookmarked BOOLEAN DEFAULT false;

-- Create index for faster queries on bookmarked searches
CREATE INDEX IF NOT EXISTS idx_search_history_bookmarked
ON public.search_history(user_id, bookmarked)
WHERE bookmarked = true;

-- Add UPDATE policy for search_history (needed for toggling bookmarks)
-- Drop first in case it already exists
DROP POLICY IF EXISTS "Users can update their own search history" ON public.search_history;

CREATE POLICY "Users can update their own search history"
  ON public.search_history FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
