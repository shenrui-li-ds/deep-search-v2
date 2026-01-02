-- Migration: Add explicit RLS policy for login_attempts table
-- This silences the Supabase warning while maintaining the same security posture.
-- The table is intentionally accessed only through SECURITY DEFINER functions.

-- Policy: Only service_role can directly access this table
-- (Regular users access via SECURITY DEFINER functions which bypass RLS)
CREATE POLICY "Service role only"
  ON login_attempts
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');
