-- Migration: Add user_preferences table
-- Run this in Supabase SQL Editor
--
-- Purpose: Store user preferences for default provider and search mode.
-- These preferences are applied when the user starts a new search from the landing page.

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_provider TEXT DEFAULT 'deepseek' CHECK (default_provider IN ('deepseek', 'openai', 'grok', 'claude', 'gemini')),
  default_mode TEXT DEFAULT 'web' CHECK (default_mode IN ('web', 'pro', 'brainstorm')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own preferences
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to auto-create preferences for new users (optional)
-- This trigger creates default preferences when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Create trigger for new users (if not already exists for user_limits)
-- Note: If you already have a trigger on auth.users, you may want to add this insert to that existing function instead
DROP TRIGGER IF EXISTS on_auth_user_created_preferences ON auth.users;
CREATE TRIGGER on_auth_user_created_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_preferences();

-- Function to upsert preferences (for the UI to call)
CREATE OR REPLACE FUNCTION public.upsert_user_preferences(
  p_default_provider TEXT DEFAULT NULL,
  p_default_mode TEXT DEFAULT NULL
)
RETURNS public.user_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result public.user_preferences;
BEGIN
  -- Get current user
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Upsert preferences
  INSERT INTO public.user_preferences (user_id, default_provider, default_mode, updated_at)
  VALUES (
    v_user_id,
    COALESCE(p_default_provider, 'deepseek'),
    COALESCE(p_default_mode, 'web'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    default_provider = COALESCE(p_default_provider, user_preferences.default_provider),
    default_mode = COALESCE(p_default_mode, user_preferences.default_mode),
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.upsert_user_preferences TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.user_preferences IS 'Stores user preferences for default LLM provider and search mode';
COMMENT ON FUNCTION public.upsert_user_preferences IS 'Upserts user preferences. Called from the client via supabase.rpc()';
