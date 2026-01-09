/**
 * @jest-environment node
 */

/**
 * CAPTCHA fallback integration tests.
 * Tests the Turnstile → hCaptcha fallback logic and timeout bypass scenarios.
 *
 * Scenarios:
 * 1. Only Turnstile configured → times out → button enabled
 * 2. Both configured → Turnstile times out → hCaptcha shows
 * 3. Both configured → both time out → button enabled
 * 4. Whitelisted email → button enabled regardless of CAPTCHA state
 */

interface CaptchaState {
  turnstileToken: string | null;
  turnstileTimedOut: boolean;
  hcaptchaToken: string | null;
  hcaptchaTimedOut: boolean;
  isWhitelisted: boolean;
}

interface EnvConfig {
  turnstileSiteKey: string | null;
  hcaptchaSiteKey: string | null;
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
  const {
    turnstileToken,
    turnstileTimedOut,
    hcaptchaToken,
    hcaptchaTimedOut,
    isWhitelisted,
  } = state;

  const { turnstileSiteKey, hcaptchaSiteKey } = env;

  if (loading) return true;

  // CAPTCHA requirement check
  const captchaRequired = !!(turnstileSiteKey || hcaptchaSiteKey);

  if (!captchaRequired) return false;

  // Has valid token
  if (turnstileToken || hcaptchaToken) return false;

  // All available CAPTCHAs timed out (fail-open)
  // Allow if: both timed out, OR turnstile timed out and no hCaptcha configured
  if (turnstileTimedOut && (hcaptchaTimedOut || !hcaptchaSiteKey)) return false;

  // Whitelisted
  if (isWhitelisted) return false;

  // Button should be disabled - waiting for CAPTCHA
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
  const {
    turnstileToken,
    turnstileTimedOut,
    hcaptchaToken,
    hcaptchaTimedOut,
    isWhitelisted,
  } = state;

  const { turnstileSiteKey, hcaptchaSiteKey } = env;

  // Whitelisted users bypass CAPTCHA
  if (isWhitelisted) {
    return { canSubmit: true, bypassType: 'whitelist' };
  }

  // No CAPTCHA configured
  if (!turnstileSiteKey && !hcaptchaSiteKey) {
    return { canSubmit: true, bypassType: 'no-captcha-configured' };
  }

  // Has Turnstile token
  if (turnstileToken) {
    return { canSubmit: true, bypassType: 'turnstile-token' };
  }

  // Turnstile timed out, has hCaptcha token
  if (turnstileTimedOut && hcaptchaToken) {
    return { canSubmit: true, bypassType: 'hcaptcha-token' };
  }

  // All available CAPTCHAs timed out (fail-open for UX)
  if (turnstileTimedOut && (hcaptchaTimedOut || !hcaptchaSiteKey)) {
    return { canSubmit: true, bypassType: 'timeout-bypass' };
  }

  // No valid token yet
  return { canSubmit: false, reason: 'Please complete the security verification' };
}

/**
 * Determines if hCaptcha fallback should be shown.
 */
function shouldShowHCaptchaFallback(
  state: CaptchaState,
  env: EnvConfig
): boolean {
  const { turnstileTimedOut, hcaptchaToken, hcaptchaTimedOut, isWhitelisted } = state;
  const { hcaptchaSiteKey } = env;

  // Don't show if whitelisted
  if (isWhitelisted) return false;

  // Don't show if hCaptcha not configured
  if (!hcaptchaSiteKey) return false;

  // Don't show if Turnstile hasn't timed out yet
  if (!turnstileTimedOut) return false;

  // Don't show if already have hCaptcha token
  if (hcaptchaToken) return false;

  // Don't show if hCaptcha also timed out
  if (hcaptchaTimedOut) return false;

  return true;
}

describe('CAPTCHA Fallback Logic', () => {
  describe('Button Disabled State', () => {
    describe('No CAPTCHA configured', () => {
      const env: EnvConfig = { turnstileSiteKey: null, hcaptchaSiteKey: null };

      it('should enable button when no CAPTCHA is configured', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Only Turnstile configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: null };

      it('should disable button initially (waiting for Turnstile)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when Turnstile token received', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should enable button when Turnstile times out (no hCaptcha configured)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false, // hCaptcha timeout doesn't matter if not configured
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should enable button for whitelisted email even without token', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: true,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Both Turnstile and hCaptcha configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: 'hcaptcha-key' };

      it('should disable button initially (waiting for Turnstile)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when Turnstile token received', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should DISABLE button when only Turnstile times out (waiting for hCaptcha)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        // When both are configured and only Turnstile timed out,
        // we should wait for hCaptcha (show fallback UI)
        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when hCaptcha token received after Turnstile timeout', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: 'hcaptcha-token',
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should enable button when BOTH Turnstile and hCaptcha time out', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: true,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });

      it('should enable button for whitelisted email even without any token', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: true,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Only hCaptcha configured (edge case)', () => {
      const env: EnvConfig = { turnstileSiteKey: null, hcaptchaSiteKey: 'hcaptcha-key' };

      it('should disable button initially (waiting for hCaptcha)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(true);
      });

      it('should enable button when hCaptcha token received', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: 'hcaptcha-token',
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(isButtonDisabled(state, env)).toBe(false);
      });
    });

    describe('Loading state', () => {
      it('should always disable button when loading', () => {
        const env: EnvConfig = { turnstileSiteKey: 'key', hcaptchaSiteKey: null };
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: true,
        };

        expect(isButtonDisabled(state, env, true)).toBe(true);
      });
    });
  });

  describe('Form Submission Validation', () => {
    describe('Only Turnstile configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: null };

      it('should allow submission with Turnstile token', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('turnstile-token');
      });

      it('should allow submission when Turnstile times out (fail-open)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('timeout-bypass');
      });

      it('should reject submission without token or timeout', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(false);
        expect(result.reason).toBeDefined();
      });
    });

    describe('Both Turnstile and hCaptcha configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: 'hcaptcha-key' };

      it('should allow submission with Turnstile token', () => {
        const state: CaptchaState = {
          turnstileToken: 'valid-token',
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('turnstile-token');
      });

      it('should allow submission with hCaptcha token after Turnstile timeout', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: 'hcaptcha-token',
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('hcaptcha-token');
      });

      it('should REJECT submission when only Turnstile times out (wait for hCaptcha)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(false);
        expect(result.reason).toBeDefined();
      });

      it('should allow submission when BOTH time out (fail-open)', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: true,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('timeout-bypass');
      });
    });

    describe('Whitelist bypass', () => {
      it('should allow whitelisted users without any token', () => {
        const env: EnvConfig = { turnstileSiteKey: 'key', hcaptchaSiteKey: 'key' };
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: true,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('whitelist');
      });
    });

    describe('No CAPTCHA configured', () => {
      it('should allow submission when no CAPTCHA is configured', () => {
        const env: EnvConfig = { turnstileSiteKey: null, hcaptchaSiteKey: null };
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        const result = validateCaptchaForSubmission(state, env);
        expect(result.canSubmit).toBe(true);
        expect(result.bypassType).toBe('no-captcha-configured');
      });
    });
  });

  describe('hCaptcha Fallback UI Visibility', () => {
    describe('When both Turnstile and hCaptcha configured', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: 'hcaptcha-key' };

      it('should NOT show hCaptcha initially', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: false,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(false);
      });

      it('should show hCaptcha when Turnstile times out', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(true);
      });

      it('should NOT show hCaptcha when token already received', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: 'token',
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(false);
      });

      it('should NOT show hCaptcha when it also times out', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: true,
          isWhitelisted: false,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(false);
      });

      it('should NOT show hCaptcha for whitelisted users', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: true,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(false);
      });
    });

    describe('When only Turnstile configured (no hCaptcha)', () => {
      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: null };

      it('should NEVER show hCaptcha even after Turnstile timeout', () => {
        const state: CaptchaState = {
          turnstileToken: null,
          turnstileTimedOut: true,
          hcaptchaToken: null,
          hcaptchaTimedOut: false,
          isWhitelisted: false,
        };

        expect(shouldShowHCaptchaFallback(state, env)).toBe(false);
      });
    });
  });

  describe('China User Scenario (The Bug We Fixed)', () => {
    it('should enable button for Chinese user when Turnstile times out (no hCaptcha configured)', () => {
      // This is the specific bug scenario:
      // - User is in China (Turnstile blocked by GFW)
      // - Only Turnstile is configured (no hCaptcha fallback)
      // - After 15s timeout, button should be enabled

      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: null };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: true,
        hcaptchaToken: null,
        hcaptchaTimedOut: false, // hCaptcha timeout never triggers if not configured
        isWhitelisted: false,
      };

      // Button should be enabled
      expect(isButtonDisabled(state, env)).toBe(false);

      // Form submission should be allowed
      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(true);
      expect(result.bypassType).toBe('timeout-bypass');
    });

    it('should enable button for whitelisted Chinese user immediately', () => {
      // Whitelisted users in China should see button enabled immediately
      // without waiting for any timeout

      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: null };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: false, // Before timeout
        hcaptchaToken: null,
        hcaptchaTimedOut: false,
        isWhitelisted: true,
      };

      expect(isButtonDisabled(state, env)).toBe(false);

      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(true);
      expect(result.bypassType).toBe('whitelist');
    });

    it('should wait for hCaptcha when both are configured and only Turnstile times out', () => {
      // When hCaptcha IS configured as fallback:
      // - Turnstile times out
      // - Button should remain DISABLED while waiting for hCaptcha
      // - hCaptcha widget should be shown

      const env: EnvConfig = { turnstileSiteKey: 'turnstile-key', hcaptchaSiteKey: 'hcaptcha-key' };
      const state: CaptchaState = {
        turnstileToken: null,
        turnstileTimedOut: true,
        hcaptchaToken: null,
        hcaptchaTimedOut: false,
        isWhitelisted: false,
      };

      // Button should still be disabled (waiting for hCaptcha)
      expect(isButtonDisabled(state, env)).toBe(true);

      // hCaptcha fallback should be shown
      expect(shouldShowHCaptchaFallback(state, env)).toBe(true);

      // Form submission should be rejected
      const result = validateCaptchaForSubmission(state, env);
      expect(result.canSubmit).toBe(false);
    });
  });
});
