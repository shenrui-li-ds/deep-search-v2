-- Migration: Add token breakdown and provider pricing
-- Run this in Supabase SQL Editor
-- Last updated: 2025-01-07

-- ============================================
-- 1. Add token columns to api_usage
-- ============================================

ALTER TABLE api_usage
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;

COMMENT ON COLUMN api_usage.prompt_tokens IS 'Input tokens from LLM provider (actual count if available)';
COMMENT ON COLUMN api_usage.completion_tokens IS 'Output tokens from LLM provider (actual count if available)';
COMMENT ON COLUMN api_usage.tokens_used IS 'Total tokens (prompt + completion, or estimated if actual not available)';

-- Index for cost analysis queries
CREATE INDEX IF NOT EXISTS idx_api_usage_provider_date
ON api_usage(provider, created_at);

-- ============================================
-- 2. Create provider_pricing table
-- ============================================

CREATE TABLE IF NOT EXISTS provider_pricing (
  provider TEXT PRIMARY KEY,
  input_per_1m NUMERIC(10, 4) NOT NULL,        -- Price per 1M input tokens
  cached_input_per_1m NUMERIC(10, 4) NOT NULL, -- Price per 1M cached input tokens
  output_per_1m NUMERIC(10, 4) NOT NULL,       -- Price per 1M output tokens
  updated_at DATE NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE provider_pricing IS 'LLM provider pricing per 1M tokens (synced from src/lib/pricing.ts)';

-- ============================================
-- 3. Insert/Update pricing data
-- ============================================
-- Prices last updated: 2025-01-07

INSERT INTO provider_pricing (provider, input_per_1m, cached_input_per_1m, output_per_1m, updated_at)
VALUES
  ('openai', 1.75, 0.175, 14.00, '2025-01-07'),
  ('gemini', 0.50, 0.05, 3.00, '2025-01-07'),
  ('grok', 0.20, 0.05, 0.50, '2025-01-07'),
  ('vercel-gateway', 1.20, 0.24, 6.00, '2025-01-07'),
  ('deepseek', 0.28, 0.028, 0.42, '2025-01-07'),
  ('claude', 1.00, 0.10, 5.00, '2025-01-07')
ON CONFLICT (provider) DO UPDATE SET
  input_per_1m = EXCLUDED.input_per_1m,
  cached_input_per_1m = EXCLUDED.cached_input_per_1m,
  output_per_1m = EXCLUDED.output_per_1m,
  updated_at = EXCLUDED.updated_at;

-- ============================================
-- 4. Create view for usage with costs
-- ============================================

-- Drop existing view first (column structure changed)
DROP VIEW IF EXISTS api_usage_with_costs CASCADE;

CREATE VIEW api_usage_with_costs AS
SELECT
  u.id,
  u.user_id,
  u.provider,
  u.request_type,
  u.prompt_tokens,
  u.completion_tokens,
  u.tokens_used,
  u.created_at,
  p.input_per_1m,
  p.output_per_1m,
  -- Cost estimation in USD (assumes non-cached for now)
  COALESCE(
    (u.prompt_tokens * p.input_per_1m + u.completion_tokens * p.output_per_1m) / 1000000,
    u.tokens_used * 1.00 / 1000000  -- Fallback if no pricing found
  ) AS estimated_cost_usd
FROM api_usage u
LEFT JOIN provider_pricing p ON u.provider = p.provider;

-- Grant access to the view
GRANT SELECT ON api_usage_with_costs TO authenticated;

-- ============================================
-- 5. Usage summary function
-- ============================================

CREATE OR REPLACE FUNCTION get_usage_summary(
  p_user_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  provider TEXT,
  total_requests BIGINT,
  total_prompt_tokens BIGINT,
  total_completion_tokens BIGINT,
  total_tokens BIGINT,
  estimated_cost_usd NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.provider,
    COUNT(*)::BIGINT as total_requests,
    COALESCE(SUM(u.prompt_tokens), 0)::BIGINT as total_prompt_tokens,
    COALESCE(SUM(u.completion_tokens), 0)::BIGINT as total_completion_tokens,
    COALESCE(SUM(u.tokens_used), 0)::BIGINT as total_tokens,
    COALESCE(SUM(uc.estimated_cost_usd), 0)::NUMERIC as estimated_cost_usd
  FROM api_usage u
  LEFT JOIN api_usage_with_costs uc ON u.id = uc.id
  WHERE u.user_id = p_user_id
    AND u.created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY u.provider
  ORDER BY total_tokens DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_usage_summary(UUID, INTEGER) TO authenticated;

-- ============================================
-- 6. Function to update pricing (for admin use)
-- ============================================

CREATE OR REPLACE FUNCTION update_provider_pricing(
  p_provider TEXT,
  p_input_per_1m NUMERIC,
  p_cached_input_per_1m NUMERIC,
  p_output_per_1m NUMERIC
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO provider_pricing (provider, input_per_1m, cached_input_per_1m, output_per_1m, updated_at)
  VALUES (p_provider, p_input_per_1m, p_cached_input_per_1m, p_output_per_1m, CURRENT_DATE)
  ON CONFLICT (provider) DO UPDATE SET
    input_per_1m = EXCLUDED.input_per_1m,
    cached_input_per_1m = EXCLUDED.cached_input_per_1m,
    output_per_1m = EXCLUDED.output_per_1m,
    updated_at = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only allow service_role to update pricing
REVOKE EXECUTE ON FUNCTION update_provider_pricing(TEXT, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_provider_pricing(TEXT, NUMERIC, NUMERIC, NUMERIC) FROM authenticated;

-- ============================================
-- 7. View current pricing (for debugging)
-- ============================================

DROP VIEW IF EXISTS current_pricing;

CREATE VIEW current_pricing AS
SELECT
  provider,
  input_per_1m || ' USD' as input_price,
  cached_input_per_1m || ' USD' as cached_input_price,
  output_per_1m || ' USD' as output_price,
  updated_at
FROM provider_pricing
ORDER BY provider;

GRANT SELECT ON current_pricing TO authenticated;
