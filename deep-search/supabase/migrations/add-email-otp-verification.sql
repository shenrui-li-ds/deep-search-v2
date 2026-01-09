-- Migration: Add email OTP verification for CAPTCHA fallback
-- Run this in Supabase SQL Editor
-- This provides a fallback verification method when Turnstile is blocked (e.g., in China)

-- ============================================
-- STEP 1: CREATE EMAIL VERIFICATION CODES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT -- For rate limiting
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose
ON email_verification_codes (email, purpose, verified);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_otp_expires
ON email_verification_codes (expires_at);

-- ============================================
-- STEP 2: CREATE OTP GENERATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_email_otp(
  p_email TEXT,
  p_purpose TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_code TEXT;
  v_expires_at TIMESTAMPTZ;
  v_recent_count INTEGER;
  v_otp_id UUID;
BEGIN
  -- Rate limiting: max 3 OTP requests per email per 10 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM email_verification_codes
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND created_at > NOW() - INTERVAL '10 minutes';

  IF v_recent_count >= 3 THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Too many verification requests. Please wait 10 minutes.',
      'retry_after', 600
    );
  END IF;

  -- Rate limiting by IP: max 10 OTP requests per IP per hour
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM email_verification_codes
    WHERE ip_address = p_ip_address
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_count >= 10 THEN
      RETURN json_build_object(
        'success', FALSE,
        'error', 'Too many requests from your location. Please try again later.',
        'retry_after', 3600
      );
    END IF;
  END IF;

  -- Invalidate any existing unused codes for this email/purpose
  UPDATE email_verification_codes
  SET verified = TRUE
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND verified = FALSE;

  -- Generate 6-digit code
  v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

  -- Set expiry (10 minutes)
  v_expires_at := NOW() + INTERVAL '10 minutes';

  -- Insert new code
  INSERT INTO email_verification_codes (email, code, purpose, expires_at, ip_address)
  VALUES (LOWER(p_email), v_code, p_purpose, v_expires_at, p_ip_address)
  RETURNING id INTO v_otp_id;

  RETURN json_build_object(
    'success', TRUE,
    'otp_id', v_otp_id,
    'code', v_code,
    'expires_at', v_expires_at,
    'expires_in', 600
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.generate_email_otp(TEXT, TEXT, TEXT) SET search_path = public;

-- ============================================
-- STEP 3: CREATE OTP VERIFICATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_email_otp(
  p_email TEXT,
  p_code TEXT,
  p_purpose TEXT
)
RETURNS JSON AS $$
DECLARE
  v_otp_record RECORD;
BEGIN
  -- Find the most recent unverified code for this email/purpose
  SELECT * INTO v_otp_record
  FROM email_verification_codes
  WHERE email = LOWER(p_email)
    AND purpose = p_purpose
    AND verified = FALSE
  ORDER BY created_at DESC
  LIMIT 1;

  -- No code found
  IF v_otp_record IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'No verification code found. Please request a new one.'
    );
  END IF;

  -- Code expired
  IF v_otp_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Verification code expired. Please request a new one.'
    );
  END IF;

  -- Too many attempts (max 5)
  IF v_otp_record.attempts >= 5 THEN
    -- Mark as verified to prevent further attempts
    UPDATE email_verification_codes
    SET verified = TRUE
    WHERE id = v_otp_record.id;

    RETURN json_build_object(
      'success', FALSE,
      'error', 'Too many incorrect attempts. Please request a new code.'
    );
  END IF;

  -- Increment attempts
  UPDATE email_verification_codes
  SET attempts = attempts + 1
  WHERE id = v_otp_record.id;

  -- Check code
  IF v_otp_record.code != p_code THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Incorrect verification code.',
      'attempts_remaining', 4 - v_otp_record.attempts
    );
  END IF;

  -- Success! Mark as verified
  UPDATE email_verification_codes
  SET verified = TRUE
  WHERE id = v_otp_record.id;

  RETURN json_build_object(
    'success', TRUE,
    'verified_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.verify_email_otp(TEXT, TEXT, TEXT) SET search_path = public;

-- ============================================
-- STEP 4: CLEANUP FUNCTION (for pg_cron)
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_expired_otp_codes()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete codes older than 1 hour (expired + buffer)
  DELETE FROM email_verification_codes
  WHERE expires_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 5: SCHEDULE CLEANUP (if pg_cron available)
-- ============================================

-- Uncomment if you have pg_cron enabled:
-- SELECT cron.schedule(
--   'cleanup-expired-otp',
--   '0 * * * *',  -- Every hour
--   'SELECT public.cleanup_expired_otp_codes()'
-- );

-- ============================================
-- STEP 6: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

-- Only allow access via functions (SECURITY DEFINER)
-- No direct table access for users
CREATE POLICY "No direct access to OTP codes"
ON email_verification_codes
FOR ALL
USING (FALSE);

-- ============================================
-- VERIFICATION
-- ============================================

-- Test the functions work:
-- SELECT generate_email_otp('test@example.com', 'signup', '127.0.0.1');
-- SELECT verify_email_otp('test@example.com', '123456', 'signup');
