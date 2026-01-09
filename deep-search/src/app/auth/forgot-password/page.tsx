'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import Turnstile from '@/components/Turnstile';
import EmailOTPFallback from '@/components/EmailOTPFallback';
import LanguageToggle from '@/components/LanguageToggle';
import { useTranslations } from 'next-intl';
import { APP_ICON } from '@/lib/branding';

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
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [captchaElapsedSeconds, setCaptchaElapsedSeconds] = useState(0);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [checkingWhitelist, setCheckingWhitelist] = useState(false);
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
    setEmailOtpVerified(false);
    setTurnstileKey((prev) => prev + 1);
  }, []);

  // Timeout for Turnstile - if stuck for 15s (e.g., blocked in China), show email OTP fallback
  const CAPTCHA_MAX_TIMEOUT = 15; // Show email OTP fallback after 15 seconds
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || turnstileToken || turnstileTimedOut || emailOtpVerified) return;

    const timeout = setTimeout(() => {
      setTurnstileTimedOut(true);
      console.log('Turnstile verification timed out - showing email OTP fallback');
    }, 15000); // 15 seconds

    return () => clearTimeout(timeout);
  }, [turnstileToken, turnstileTimedOut, emailOtpVerified, turnstileKey]);

  // Visual progress indicator - tracks elapsed time during Turnstile loading
  useEffect(() => {
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    // Only run timer if Turnstile is configured and we don't have verification yet
    const isVerified = !!(turnstileToken || emailOtpVerified);

    if (!turnstileSiteKey || isVerified || isWhitelisted || turnstileTimedOut) {
      setCaptchaElapsedSeconds(0);
      return;
    }

    // Start/continue the elapsed time counter
    const interval = setInterval(() => {
      setCaptchaElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [turnstileToken, emailOtpVerified, turnstileTimedOut, isWhitelisted, turnstileKey]);

  // Proactively check whitelist when email changes (debounced)
  useEffect(() => {
    // Reset whitelist status when email changes
    setIsWhitelisted(false);

    // Only check if email looks valid
    if (!email || !email.includes('@') || !email.includes('.')) return;

    setCheckingWhitelist(true);
    const debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch('/api/auth/check-whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await response.json();
        setIsWhitelisted(data.whitelisted === true);
      } catch {
        setIsWhitelisted(false);
      } finally {
        setCheckingWhitelist(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(debounceTimer);
  }, [email]);

  // Check if email is in whitelist (bypasses CAPTCHA)
  const checkEmailWhitelist = async (userEmail: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/check-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await response.json();
      return data.whitelisted === true;
    } catch {
      return false;
    }
  };

  // Verify Turnstile token server-side
  const verifyTurnstileToken = async (
    token: string | null,
    userEmail: string
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: userEmail }),
      });
      const data = await response.json();
      return data.success === true;
    } catch {
      console.error('Turnstile verification request failed');
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

    // Check whitelist FIRST (fastest path for whitelisted users)
    const isWhitelisted = await checkEmailWhitelist(email);

    // Verify CAPTCHA/OTP (only if not whitelisted)
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!isWhitelisted && turnstileSiteKey) {
      let isValid = false;

      // Try Turnstile first (if token available)
      if (turnstileToken) {
        isValid = await verifyTurnstileToken(turnstileToken, email);
      }
      // Email OTP verified (fallback for China users)
      else if (emailOtpVerified) {
        isValid = true;
      }
      // No valid verification yet
      else {
        setError(t('errors.completeVerification'));
        setLoading(false);
        return;
      }

      if (!isValid) {
        setError(t('errors.securityFailed'));
        resetTurnstile();
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
      resetTurnstile();
      setLoading(false);
      return;
    }

    // Set cooldown
    sessionStorage.setItem('forgot_password_last_request', Date.now().toString());
    setCooldownRemaining(COOLDOWN_SECONDS);

    // Reset CAPTCHA for next attempt
    resetTurnstile();

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
                src={APP_ICON}
                alt="Athenius"
                width={48}
                height={48}
                className="mx-auto mb-4 app-icon"
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
              src={APP_ICON}
              alt="Athenius"
              width={48}
              height={48}
              className="mx-auto mb-4 app-icon"
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
            {/* Whitelist indicator - shows when email is verified as whitelisted */}
            {isWhitelisted && !checkingWhitelist && (
              <div className="flex items-center gap-1.5 mt-1.5 text-emerald-500 text-xs">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>{t('whitelistedEmail')}</span>
              </div>
            )}
          </div>

          {/* CAPTCHA Bot Protection - Turnstile primary, Email OTP fallback (hidden if whitelisted) */}
          {!isWhitelisted && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileTimedOut && !emailOtpVerified && (
            <div className="flex flex-col items-center gap-2">
              <Turnstile
                key={turnstileKey}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onVerify={handleTurnstileVerify}
                onError={handleTurnstileError}
                onExpire={handleTurnstileExpire}
                theme="auto"
              />
              {captchaElapsedSeconds > 3 && (
                <p className="text-xs text-center text-[var(--text-muted)]">
                  {t('errors.verifyingIdentity')} ({CAPTCHA_MAX_TIMEOUT - captchaElapsedSeconds}s)
                </p>
              )}
            </div>
          )}

          {/* Email OTP Fallback - shown when Turnstile times out (hidden if whitelisted) */}
          {!isWhitelisted && turnstileTimedOut && !emailOtpVerified && email && (
            <EmailOTPFallback
              email={email}
              purpose="reset"
              onVerified={() => setEmailOtpVerified(true)}
            />
          )}

          <button
            type="submit"
            disabled={
              loading ||
              cooldownRemaining > 0 ||
              // Require CAPTCHA verification unless whitelisted: Turnstile token OR email OTP verified OR whitelisted
              (
                !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
                !turnstileToken &&
                !emailOtpVerified &&
                !isWhitelisted
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
