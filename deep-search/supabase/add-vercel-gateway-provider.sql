-- Migration: Add vercel-gateway to user_preferences provider options
-- Run this on existing databases to allow vercel-gateway as a provider choice

-- Update the CHECK constraint to include vercel-gateway
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_default_provider_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_default_provider_check
  CHECK (default_provider IN ('deepseek', 'openai', 'grok', 'claude', 'gemini', 'vercel-gateway'));
