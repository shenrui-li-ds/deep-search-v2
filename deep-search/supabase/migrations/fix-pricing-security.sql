-- Migration: Fix security issues for pricing tables
-- Run this in Supabase SQL Editor after add-token-breakdown.sql

-- ============================================
-- 1. Enable RLS on provider_pricing (read-only for users)
-- ============================================

ALTER TABLE provider_pricing ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read pricing (it's public info)
DROP POLICY IF EXISTS "Anyone can read pricing" ON provider_pricing;
CREATE POLICY "Anyone can read pricing"
  ON provider_pricing
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Updates only via service_role (server-side) or update_provider_pricing function

-- ============================================
-- 2. Recreate views with SECURITY INVOKER
-- ============================================
-- This makes views respect the querying user's permissions
-- rather than the view creator's permissions

DROP VIEW IF EXISTS api_usage_with_costs CASCADE;
DROP VIEW IF EXISTS current_pricing;

-- Recreate api_usage_with_costs with SECURITY INVOKER
CREATE VIEW api_usage_with_costs
WITH (security_invoker = true)
AS
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

GRANT SELECT ON api_usage_with_costs TO authenticated;

-- Recreate current_pricing with SECURITY INVOKER
CREATE VIEW current_pricing
WITH (security_invoker = true)
AS
SELECT
  provider,
  input_per_1m || ' USD' as input_price,
  cached_input_per_1m || ' USD' as cached_input_price,
  output_per_1m || ' USD' as output_price,
  updated_at
FROM provider_pricing
ORDER BY provider;

GRANT SELECT ON current_pricing TO authenticated;

-- ============================================
-- 3. Fix search_cache RLS policies
-- ============================================
-- Cache is shared across users for efficiency.
-- Restrict write/update/delete to service_role (server-side API routes only).
-- Keep read access for all authenticated users.

DROP POLICY IF EXISTS "Authenticated users can write cache" ON search_cache;
DROP POLICY IF EXISTS "Authenticated users can update cache" ON search_cache;
DROP POLICY IF EXISTS "Authenticated users can delete cache" ON search_cache;

-- Only service_role can write (server-side API routes use service_role key)
CREATE POLICY "Service role can write cache"
  ON search_cache
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update cache"
  ON search_cache
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete cache"
  ON search_cache
  FOR DELETE
  TO service_role
  USING (true);

-- Read access for authenticated users remains via existing SELECT policy
-- (SELECT with USING(true) is acceptable for shared cache reads)

-- ============================================
-- 4. Recreate get_usage_summary function
-- ============================================
-- (Needed because we dropped api_usage_with_costs with CASCADE)

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
