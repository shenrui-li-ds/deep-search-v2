-- Add soft delete support for search_history
-- Run this migration in Supabase SQL Editor

-- Step 1: Add deleted_at column
ALTER TABLE search_history
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Step 2: Add index for efficient filtering of non-deleted records
CREATE INDEX IF NOT EXISTS idx_search_history_deleted_at
ON search_history(deleted_at)
WHERE deleted_at IS NULL;

-- Step 3: Add index for efficient querying of deleted records
CREATE INDEX IF NOT EXISTS idx_search_history_deleted_at_not_null
ON search_history(user_id, deleted_at)
WHERE deleted_at IS NOT NULL;

-- Step 4: Update the upsert_search_history function to handle deleted_at
CREATE OR REPLACE FUNCTION upsert_search_history(
  p_query TEXT,
  p_refined_query TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT 'deepseek',
  p_mode TEXT DEFAULT 'web',
  p_sources_count INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if a non-deleted entry with the same query exists for this user
  SELECT id INTO v_result_id
  FROM search_history
  WHERE user_id = v_user_id
    AND query = p_query
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_result_id IS NOT NULL THEN
    -- Update existing entry (touch created_at to move it to top)
    UPDATE search_history
    SET
      refined_query = COALESCE(p_refined_query, refined_query),
      provider = p_provider,
      mode = p_mode,
      sources_count = p_sources_count,
      created_at = NOW()
    WHERE id = v_result_id;
  ELSE
    -- Insert new entry
    INSERT INTO search_history (user_id, query, refined_query, provider, mode, sources_count)
    VALUES (v_user_id, p_query, p_refined_query, p_provider, p_mode, p_sources_count)
    RETURNING id INTO v_result_id;
  END IF;

  RETURN v_result_id;
END;
$$;

-- Step 5: Create function to soft delete a search entry
CREATE OR REPLACE FUNCTION soft_delete_search(p_search_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NOW()
  WHERE id = p_search_id
    AND user_id = v_user_id
    AND deleted_at IS NULL;

  RETURN FOUND;
END;
$$;

-- Step 6: Create function to recover a deleted search entry
CREATE OR REPLACE FUNCTION recover_search(p_search_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NULL
  WHERE id = p_search_id
    AND user_id = v_user_id
    AND deleted_at IS NOT NULL;

  RETURN FOUND;
END;
$$;

-- Step 7: Create function to soft delete all search history for a user
CREATE OR REPLACE FUNCTION soft_delete_all_searches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE search_history
  SET deleted_at = NOW()
  WHERE user_id = v_user_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Step 8: Create function to permanently delete old soft-deleted records (cleanup)
-- This should be called by a scheduled job (pg_cron) monthly
CREATE OR REPLACE FUNCTION cleanup_deleted_searches(p_days_old INTEGER DEFAULT 365)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM search_history
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Step 9: Schedule monthly cleanup (run in pg_cron if available)
-- This deletes soft-deleted records older than 1 year
-- SELECT cron.schedule('cleanup-deleted-searches', '0 4 1 * *', 'SELECT cleanup_deleted_searches(365)');

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION soft_delete_search(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION recover_search(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION soft_delete_all_searches() TO authenticated;
