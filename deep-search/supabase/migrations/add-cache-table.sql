-- Migration: Add search_cache table for two-tier caching
-- Run this in Supabase SQL Editor if you already have the other tables

-- ============================================
-- SEARCH CACHE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS search_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  cache_type TEXT NOT NULL CHECK (cache_type IN ('search', 'refine', 'summary', 'related', 'plan')),
  query TEXT NOT NULL,
  response JSONB NOT NULL,
  provider TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  hit_count INTEGER DEFAULT 0
);

-- Indexes for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_search_cache_key ON search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_type ON search_cache(cache_type);

-- RLS for cache - permissive policy for authenticated users (shared cache)
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cache"
  ON search_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can write cache"
  ON search_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update cache"
  ON search_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete cache"
  ON search_cache FOR DELETE
  TO authenticated
  USING (true);

-- Function to cleanup expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM search_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count > 0 THEN
    RAISE NOTICE 'Cleaned up % expired cache entries', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission for cleanup function
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO authenticated;

-- ============================================
-- SCHEDULE CACHE CLEANUP (run after enabling pg_cron)
-- ============================================
-- Uncomment and run this after pg_cron is enabled:
-- SELECT cron.schedule('cleanup-cache', '0 3 * * *', $$SELECT public.cleanup_expired_cache()$$);
