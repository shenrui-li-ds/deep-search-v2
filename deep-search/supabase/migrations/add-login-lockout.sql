-- Migration: Add login attempt tracking and account lockout
-- Protects against brute force password attacks

-- ============================================
-- LOGIN ATTEMPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS login_attempts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_attempts INTEGER DEFAULT 0,
  first_failed_at TIMESTAMP WITH TIME ZONE,
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Only service role can directly access
-- (Regular users access via SECURITY DEFINER functions which bypass RLS)
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON login_attempts
  FOR ALL
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check if a user is currently locked out
-- Returns: { locked: boolean, locked_until: timestamp, remaining_seconds: number }
CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_remaining_seconds INTEGER;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  -- User not found - don't reveal this, just say not locked
  IF v_user_id IS NULL THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'remaining_seconds', 0);
  END IF;

  -- Check lockout status
  SELECT locked_until INTO v_locked_until
  FROM login_attempts
  WHERE user_id = v_user_id;

  -- No record or no lockout
  IF v_locked_until IS NULL OR v_locked_until <= NOW() THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'remaining_seconds', 0);
  END IF;

  -- Calculate remaining seconds
  v_remaining_seconds := EXTRACT(EPOCH FROM (v_locked_until - NOW()))::INTEGER;

  RETURN json_build_object(
    'locked', TRUE,
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a failed login attempt and apply lockout if needed
-- Returns: { locked: boolean, locked_until: timestamp, attempts: number }
CREATE OR REPLACE FUNCTION public.record_failed_login(p_email TEXT)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_attempts INTEGER;
  v_first_failed TIMESTAMP WITH TIME ZONE;
  v_locked_until TIMESTAMP WITH TIME ZONE;
  v_lock_duration INTERVAL;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  -- User not found - don't reveal this
  IF v_user_id IS NULL THEN
    RETURN json_build_object('locked', FALSE, 'locked_until', NULL, 'attempts', 0);
  END IF;

  -- Get or create login_attempts record
  INSERT INTO login_attempts (user_id, failed_attempts, first_failed_at, updated_at)
  VALUES (v_user_id, 0, NULL, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current state
  SELECT failed_attempts, first_failed_at, locked_until
  INTO v_attempts, v_first_failed, v_locked_until
  FROM login_attempts
  WHERE user_id = v_user_id;

  -- If currently locked, just return locked status
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN json_build_object(
      'locked', TRUE,
      'locked_until', v_locked_until,
      'attempts', v_attempts
    );
  END IF;

  -- Reset counter if first failure was more than 1 hour ago
  IF v_first_failed IS NULL OR v_first_failed < NOW() - INTERVAL '1 hour' THEN
    v_attempts := 0;
    v_first_failed := NOW();
  END IF;

  -- Increment attempts
  v_attempts := v_attempts + 1;

  -- Determine lockout duration based on attempts
  -- 5 attempts in 15 min -> 5 min lock
  -- 10 attempts in 1 hour -> 30 min lock
  -- 15+ attempts in 1 hour -> 1 hour lock
  IF v_attempts >= 15 THEN
    v_lock_duration := INTERVAL '1 hour';
  ELSIF v_attempts >= 10 THEN
    v_lock_duration := INTERVAL '30 minutes';
  ELSIF v_attempts >= 5 AND v_first_failed > NOW() - INTERVAL '15 minutes' THEN
    v_lock_duration := INTERVAL '5 minutes';
  ELSE
    v_lock_duration := NULL;
  END IF;

  -- Calculate locked_until
  IF v_lock_duration IS NOT NULL THEN
    v_locked_until := NOW() + v_lock_duration;
  ELSE
    v_locked_until := NULL;
  END IF;

  -- Update record
  UPDATE login_attempts
  SET failed_attempts = v_attempts,
      first_failed_at = v_first_failed,
      locked_until = v_locked_until,
      updated_at = NOW()
  WHERE user_id = v_user_id;

  RETURN json_build_object(
    'locked', v_locked_until IS NOT NULL,
    'locked_until', v_locked_until,
    'attempts', v_attempts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset login attempts after successful login
CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_email TEXT)
RETURNS void AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    UPDATE login_attempts
    SET failed_attempts = 0,
        first_failed_at = NULL,
        locked_until = NULL,
        updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- These functions need to be callable from the client during login
GRANT EXECUTE ON FUNCTION public.check_login_lockout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_login_attempts(TEXT) TO anon, authenticated;

-- Set search_path for security
ALTER FUNCTION public.check_login_lockout(TEXT) SET search_path = public;
ALTER FUNCTION public.record_failed_login(TEXT) SET search_path = public;
ALTER FUNCTION public.reset_login_attempts(TEXT) SET search_path = public;
