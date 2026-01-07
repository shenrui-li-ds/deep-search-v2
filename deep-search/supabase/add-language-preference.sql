-- Migration: Add language preference to user_preferences
-- Run this in Supabase SQL Editor

-- Add language column to user_preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en' CHECK (language IN ('en', 'zh'));

COMMENT ON COLUMN user_preferences.language IS 'UI language preference: en (English), zh (Chinese)';

-- Update the upsert function to include language
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_default_provider TEXT DEFAULT NULL,
  p_default_mode TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL
)
RETURNS user_preferences AS $$
DECLARE
  v_user_id UUID;
  v_result user_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO user_preferences (user_id, default_provider, default_mode, language, updated_at)
  VALUES (
    v_user_id,
    COALESCE(p_default_provider, 'deepseek'),
    COALESCE(p_default_mode, 'web'),
    COALESCE(p_language, 'en'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_provider = COALESCE(p_default_provider, user_preferences.default_provider),
    default_mode = COALESCE(p_default_mode, user_preferences.default_mode),
    language = COALESCE(p_language, user_preferences.language),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission (re-grant in case function was replaced)
GRANT EXECUTE ON FUNCTION public.upsert_user_preferences(TEXT, TEXT, TEXT) TO authenticated;
