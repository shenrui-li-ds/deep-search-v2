'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import Turnstile from '@/components/Turnstile';
import HCaptcha from '@/components/HCaptcha';
import LanguageToggle from '@/components/LanguageToggle';
import { useTranslations } from 'next-intl';

// Rate limiting: track last request time in sessionStorage
const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileTimedOut, setTurnstileTimedOut] = useState(false);
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);
  const [hcaptchaKey, setHcaptchaKey] = useState(0);
  const [hcaptchaTimedOut, setHcaptchaTimedOut] = useState(false);
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');

  // Turnstile callbacks
  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken(null);
    setError(t('errors.securityFailed'));
  }, [t]);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileTimedOut(false);
    setTurnstileKey((prev) => prev + 1);
  }, []);

  // hCaptcha callbacks (fallback for China users)
  const handleHCaptchaVerify = useCallback((token: string) => {
    setHcaptchaToken(token);
  }, []);

  const handleHCaptchaError = useCallback(() => {
    setHcaptchaToken(null);
  }, []);

  const handleHCaptchaExpire = useCallback(() => {
    setHcaptchaToken(null);
  }, []);

  const resetHCaptcha = useCallback(() => {
    setHcaptchaToken(null);
    setHcaptchaTimedOut(false);
    setHcaptchaKey((prev) => prev + 1);
  }, []);

  const resetAllCaptcha = useCallback(() => {
    resetTurnstile();
    resetHCaptcha();
  }, [resetTurnstile, resetHCaptcha]);

  // Timeout for Turnstile - if stuck for 15s (e.g., blocked in China), show hCaptcha fallback
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || turnstileToken || turnstileTimedOut) return;

    const timeout = setTimeout(() => {
      setTurnstileTimedOut(true);
      console.log('Turnstile verification timed out - showing hCaptcha fallback');
    }, 15000); // 15 seconds

    return () => clearTimeout(timeout);
  }, [turnstileToken, turnstileTimedOut, turnstileKey]);

  // Timeout for hCaptcha - if also stuck for 15s, allow email whitelist bypass
  useEffect(() => {
    const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
    if (!hcaptchaSiteKey || !turnstileTimedOut || hcaptchaToken || hcaptchaTimedOut) return;

    const timeout = setTimeout(() => {
      setHcaptchaTimedOut(true);
      console.log('hCaptcha verification timed out - allowing email whitelist bypass');
    }, 15000); // 15 seconds

    return () => clearTimeout(timeout);
  }, [turnstileTimedOut, hcaptchaToken, hcaptchaTimedOut, hcaptchaKey]);

  // Verify captcha token server-side (supports both Turnstile and hCaptcha)
  const verifyCaptchaToken = async (
    token: string | null,
    userEmail: string,
    provider: 'turnstile' | 'hcaptcha'
  ): Promise<boolean> => {
    try {
      const endpoint = provider === 'turnstile'
        ? '/api/auth/verify-turnstile'
        : '/api/auth/verify-hcaptcha';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: userEmail }),
      });
      const data = await response.json();
      return data.success === true;
    } catch {
      console.error(`${provider} verification request failed`);
      return false;
    }
  };

  // Check cooldown on mount and update timer
  useEffect(() => {
    const checkCooldown = () => {
      const lastRequest = sessionStorage.getItem('forgot_password_last_request');
      if (lastRequest) {
        const elapsed = Math.floor((Date.now() - parseInt(lastRequest)) / 1000);
        const remaining = Math.max(0, COOLDOWN_SECONDS - elapsed);
        setCooldownRemaining(remaining);
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check cooldown
    if (cooldownRemaining > 0) {
      setError(t('waitSeconds', { seconds: cooldownRemaining }));
      return;
    }

    setLoading(true);
    setError(null);

    // Verify CAPTCHA token (Turnstile primary, hCaptcha fallback, email whitelist last resort)
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const hcaptchaSiteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

    if (turnstileSiteKey || hcaptchaSiteKey) {
      let isValid = false;

      // Try Turnstile first (if token available)
      if (turnstileToken) {
        isValid = await verifyCaptchaToken(turnstileToken, email, 'turnstile');
      }
      // Try hCaptcha fallback (if Turnstile timed out and hCaptcha token available)
      else if (turnstileTimedOut && hcaptchaToken) {
        isValid = await verifyCaptchaToken(hcaptchaToken, email, 'hcaptcha');
      }
      // Try email whitelist bypass (if both CAPTCHAs timed out)
      else if (turnstileTimedOut && hcaptchaTimedOut) {
        isValid = await verifyCaptchaToken(null, email, 'hcaptcha'); // Will check whitelist
      }
      // No valid token yet
      else {
        setError(t('errors.completeVerification'));
        setLoading(false);
        return;
      }

      if (!isValid) {
        setError(t('errors.securityFailed'));
        resetAllCaptcha();
        setLoading(false);
        return;
      }
    }

    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    if (error) {
      setError(error.message);
      resetAllCaptcha();
      setLoading(false);
      return;
    }

    // Set cooldown
    sessionStorage.setItem('forgot_password_last_request', Date.now().toString());
    setCooldownRemaining(COOLDOWN_SECONDS);

    // Reset CAPTCHA for next attempt
    resetAllCaptcha();

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 relative">
        {/* Language Toggle */}
        <div className="absolute top-4 right-4">
          <LanguageToggle size="md" className="bg-[var(--card)] border border-[var(--border)] shadow-sm" />
        </div>

        <div className="w-full max-w-md text-center">
          {/* Logo */}
          <div className="mb-8">
            <Link href="/" className="inline-block">
              <Image
                src="/owl_google.svg"
                alt="Athenius"
                width={48}
                height={48}
                className="mx-auto mb-4"
              />
            </Link>
          </div>

          {/* Success Message */}
          <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t('checkYourEmail')}</h1>
            <p className="text-[var(--text-muted)] mb-4">
              {t('sentConfirmation')} <span className="text-[var(--text-primary)] font-medium">{email}</span>
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {t('checkInbox')}{' '}
              <button
                onClick={() => setSuccess(false)}
                className="text-[var(--accent)] hover:underline"
              >
                {tCommon('retry')}
              </button>
            </p>
          </div>

          <p className="mt-6 text-[var(--text-muted)]">
            <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 relative">
      {/* Language Toggle */}
      <div className="absolute top-4 right-4">
        <LanguageToggle size="md" className="bg-[var(--card)] border border-[var(--border)] shadow-sm" />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/owl_google.svg"
              alt="Athenius"
              width={48}
              height={48}
              className="mx-auto mb-4"
            />
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('resetYourPassword')}</h1>
          <p className="text-[var(--text-muted)] mt-2">{t('enterEmailForReset')}</p>
        </div>

        {/* Reset Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
              {t('email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          {/* CAPTCHA Bot Protection - Turnstile primary, hCaptcha fallback */}
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileTimedOut && (
            <div className="flex justify-center">
              <Turnstile
                key={turnstileKey}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
                theme="auto"
              />
            </div>
          )}

          {/* hCaptcha Fallback - shown when Turnstile times out but before hCaptcha times out */}
          {turnstileTimedOut && process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY && !hcaptchaToken && !hcaptchaTimedOut && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-[var(--text-muted)]">{t('errors.tryingAlternative') || 'Trying alternative verification...'}</p>
              <HCaptcha
                key={hcaptchaKey}
                siteKey={process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY}
                onVerify={handleHCaptchaVerify}
                onError={handleHCaptchaError}
                onExpire={handleHCaptchaExpire}
                theme="light"
              />
            </div>
          )}

          {/* Whitelist bypass indicator - shown when both CAPTCHAs timed out */}
          {turnstileTimedOut && hcaptchaTimedOut && !turnstileToken && !hcaptchaToken && (
            <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{t('errors.captchaUnavailable') || 'Security check unavailable in your region'}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              cooldownRemaining > 0 ||
              // Require CAPTCHA verification: Turnstile token, OR hCaptcha token, OR both timed out (whitelist bypass)
              (
                (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || !!process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY) &&
                !turnstileToken &&
                !hcaptchaToken &&
                !(turnstileTimedOut && hcaptchaTimedOut)
              )
            }
            className="w-full py-3 px-4 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('sending') : cooldownRemaining > 0 ? t('waitSeconds', { seconds: cooldownRemaining }) : t('sendResetLink')}
          </button>
        </form>

        {/* Back to login */}
        <p className="text-center mt-6 text-[var(--text-muted)]">
          {t('rememberPassword')}{' '}
          <Link href="/auth/login" className="text-[var(--accent)] hover:underline">
            {t('signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
