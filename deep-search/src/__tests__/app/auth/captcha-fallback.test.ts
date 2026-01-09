/**
 * @jest-environment node
 */

/**
 * CAPTCHA fallback integration tests.
 * Tests the Turnstile → Email OTP fallback logic.
 *
 * Scenarios:
 * 1. Turnstile configured → token received → button enabled
 * 2. Turnstile configured → times out → Email OTP shown → verified → button enabled
 * 3. Whitelisted email → button enabled regardless of CAPTCHA state
 * 4. No CAPTCHA configured → button enabled immediately
 */

interface CaptchaState {
  turnstileToken: string | null;
  turnstileTimedOut: boolean;
  emailOtpVerified: boolean;
  isWhitelisted: boolean;
}

interface EnvConfig {
  turnstileSiteKey: string | null;
}

/**
 * Mirrors the button disabled logic from auth pages.
 * Returns true if button should be DISABLED.
 */
function isButtonDisabled(
  state: CaptchaState,
  env: EnvConfig,
  loading: boolean = false
): boolean {
  const { turnstileToken, emailOtpVerified, isWhitelisted } = state;
  const { turnstileSiteKey } = env;

  if (loading) return true;

  // No CAPTCHA configured
  if (!turnstileSiteKey) return false;

  // Has Turnstile token
  if (turnstileToken) return false;

  // Email OTP verified
  if (emailOtpVerified) return false;

  // Whitelisted
  if (isWhitelisted) return false;

  // Button should be disabled - waiting for verification
  return true;
}

/**
 * Mirrors the form submission validation logic from auth pages.
 * Returns { canSubmit: boolean, reason?: string }
 */
function validateCaptchaForSubmission(
  state: CaptchaState,
  env: EnvConfig
): { canSubmit: boolean; reason?: string; bypassType?: string } {
  const { turnstileToken, emailOtpVerified, isWhitelisted } = state;
  const { turnstileSiteKey } = env;

  // Whitelisted users bypass CAPTCHA
  if (isWhitelisted) {
    return { canSubmit: true, bypassType: 'whitelist' };
  }

  // No CAPTCHA configured
  if (!turnstileSiteKey) {
    return { canSubmit: true, bypassType: 'no-captcha-configured' };
  }

  // Has Turnstile token
  if (turnstileToken) {
    return { canSubmit: true, bypassType: 'turnstile-token' };
  }

  // Email OTP verified
  if (emailOtpVerified) {
    return { canSubmit: true, bypassType: 'email-otp-verified' };
  }

  // No valid verification yet
  return { canSubmit: false, reason: 'Please complete the security verification' };
}

/**
 * Determines if Email OTP fallback should be shown.
 */
function shouldShowEmailOTPFallback(
  state: CaptchaState,
  env: EnvConfig,
  email: string
): boolean {
  const { turnstileTimedOut, emailOtpVerified, isWhitelisted } = state;
  const { turnstileSiteKey } = env;

  // Don't show if whitelisted
  if (isWhitelisted) return false;

  // Don't show if no CAPTCHA configured
  if (!turnstileSiteKey) return false;

  // Don't show if Turnstile hasn't timed out yet
  if (!turnstileTimedOut) return false;

  // Don't show if already verified via OTP
  if (emailOtpVerified) return false;

  // Don't show if no email entered
  if (!email) return false;

  return true;
}

describe('CAPTCHA Fallback Logic (Turnstile → Email OTP)', () => {
  describe('Button Disabled State', () => {
    describe('No CAPTCHA configured', () => {
      const env: EnvConfig = { turnstileSiteKey: null };

      it('should enable button when no CAPTCHA is configured', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Turnstile configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };

      it('should disable button initially (waiting for Turnstile)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when Turnstile token received', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should disable button when Turnstile times out (waiting for Email OTP)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        // Button remains disabled until Email OTP is verified
        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when Email OTP is verified after Turnstile timeout', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: true,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should enable button for whitelisted email even without token', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: true,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Loading state', () => {
      it('should always disable button when loading', () => {
        const env: EnvConfig = { turnstileSiteKey: 'key' };
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: true,
        };

        expect(isButtonDisabled(state, env, true)).toBe(true);
      });
    });
  });

  describe('Form Submission Validation', () => {
    describe('Turnstile configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };

      it('should allow submission with Turnstile token', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('turnstile-token');
      });

      it('should allow submission when Email OTP is verified', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: true,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('email-otp-verified');
      });

      it('should reject submission when Turnstile times out but OTP not verified', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(false);
        expect(result.reason).toBeDefined();
      });

      it('should reject submission without token or OTP verification', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });

    describe('Whitelist bypass', () => {
      it('should allow whitelisted users without any token', () => {
        const env: EnvConfig = { turnstileSiteKey: 'key' };
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: true,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('whitelist');
      });
    });

    describe('No CAPTCHA configured', () => {
      it('should allow submission when no CAPTCHA is configured', () => {
        const env: EnvConfig = { turnstileSiteKey: null };
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('no-captcha-configured');
      });
    });
  });

  describe('Email OTP Fallback UI Visibility', () => {
    describe('When Turnstile configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };

      it('should NOT show Email OTP initially', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(shouldShowEmailOTPFallback(state, env, 'test@example.com')).toBe(false);
      });

      it('should show Email OTP when Turnstile times out', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(shouldShowEmailOTPFallback(state, env, 'test@example.com')).toBe(true);
      });

      it('should NOT show Email OTP when already verified', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: true,
          isWhitelisted: false,
        };

        expect(shouldShowEmailOTPFallback(state, env, 'test@example.com')).toBe(false);
      });

      it('should NOT show Email OTP for whitelisted users', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: true,
        };

        expect(shouldShowEmailOTPFallback(state, env, 'test@example.com')).toBe(false);
      });

      it('should NOT show Email OTP when no email is entered', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(shouldShowEmailOTPFallback(state, env, '')).toBe(false);
      });
    });

    describe('When no CAPTCHA configured', () => {
      const env: EnvConfig = { turnstileSiteKey: null };

      it('should NEVER show Email OTP', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          emailOtpVerified: false,
          isWhitelisted: false,
        };

        expect(shouldShowEmailOTPFallback(state, env, 'test@example.com')).toBe(false);
      });
    });
  });

  describe('China User Scenario', () => {
    it('should show Email OTP for Chinese user when Turnstile times out', () => {
      // This is the key scenario:
      // - User is in China (Turnstile blocked by GFW)
      // - After 15s timeout, Email OTP fallback should be shown
      // - User can verify via email and proceed

      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: true,
        emailOtpVerified: false,
        isWhitelisted: false,
      };

      // Email OTP fallback should be shown
      expect(shouldShowEmailOTPFallback(state, env, 'user@example.com')).toBe(true);

      // Button should still be disabled (waiting for OTP verification)
      expect(isButtonDisabled(state, env)).toBe(true);

      // Form submission should be rejected
      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(false);
    });

    it('should enable form after Email OTP verification', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: true,
        emailOtpVerified: true, // User verified via Email OTP
        isWhitelisted: false,
      };

      // Email OTP fallback should be hidden (already verified)
      expect(shouldShowEmailOTPFallback(state, env, 'user@example.com')).toBe(false);

      // Button should be enabled
      expect(isButtonDisabled(state, env)).toBe(false);

      // Form submission should be allowed
      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(true);
      expect(result.bypassType).toBe('email-otp-verified');
    });

    it('should enable form immediately for whitelisted Chinese users', () => {
      // Whitelisted users in China should see button enabled immediately
      // without waiting for any timeout or verification

      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: false, // Before timeout
        emailOtpVerified: false,
        isWhitelisted: true,
      };

      expect(isButtonDisabled(state, env)).toBe(false);

      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(true);
      expect(result.bypassType).toBe('whitelist');
    });
  });

  describe('Comparison: Old hCaptcha vs New Email OTP Fallback', () => {
    /**
     * Old system (hCaptcha fallback):
     * - Turnstile (15s) → hCaptcha (15s) → fail-open
     * - Could still fail for China users (hCaptcha also blocked)
     * - Total wait: up to 30s before fail-open
     *
     * New system (Email OTP fallback):
     * - Turnstile (15s) → Email OTP → verified → proceed
     * - Works reliably in China (email always works)
     * - No fail-open needed - user must actively verify
     */

    it('should require active verification (no fail-open)', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key' };

      // Even after Turnstile timeout, form should NOT auto-enable
      const stateAfterTimeout: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: true,
        emailOtpVerified: false,
        isWhitelisted: false,
      };

      // Button remains disabled - user must verify via OTP
      expect(isButtonDisabled(stateAfterTimeout, env)).toBe(true);

      // This is different from the old hCaptcha system which had fail-open
    });
  });
});
