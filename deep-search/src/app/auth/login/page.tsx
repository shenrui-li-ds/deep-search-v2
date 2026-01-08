'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import Turnstile from '@/components/Turnstile';
import LanguageToggle from '@/components/LanguageToggle';
import { useTranslations } from 'next-intl';

interface LockoutStatus {
  locked: boolean;
  locked_until: string | null;
  remaining_seconds: number;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0); // For resetting widget
  const [turnstileTimedOut, setTurnstileTimedOut] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const t = useTranslations('auth');

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds > 0) {
      const timer = setInterval(() => {
        setLockoutSeconds((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutSeconds]);

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

  // Timeout for Turnstile - if stuck for 15s (e.g., blocked in China), allow form submission
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || turnstileToken || turnstileTimedOut) return;

    const timeout = setTimeout(() => {
      setTurnstileTimedOut(true);
      console.log('Turnstile verification timed out - allowing email-based bypass');
    }, 15000); // 15 seconds

    return () => clearTimeout(timeout);
  }, [turnstileToken, turnstileTimedOut, turnstileKey]);

  // Verify turnstile token server-side (also supports email whitelist bypass)
  const verifyTurnstileToken = async (token: string | null, userEmail: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: userEmail }),
      });
      if (!response.ok) {
        console.error('Turnstile verification failed:', response.status, response.statusText);
        return false;
      }
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error('Turnstile verification request failed:', error);
      return false;
    }
  };

  const handleGitHubLogin = async () => {
    setOauthLoading(true);
    setError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setOauthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Verify turnstile token first (if configured)
    // Supports email whitelist bypass for users in regions where Turnstile is blocked (e.g., China)
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (siteKey) {
      // If Turnstile timed out, try email whitelist bypass
      if (!turnstileToken && !turnstileTimedOut) {
        setError(t('errors.completeVerification'));
        setLoading(false);
        return;
      }

      const isValid = await verifyTurnstileToken(turnstileToken, email);
      if (!isValid) {
        setError(t('errors.securityFailed'));
        resetTurnstile();
        setLoading(false);
        return;
      }
    }

    const supabase = createClient();

    // Check if account is locked out
    try {
      const { data: lockoutData } = await supabase.rpc('check_login_lockout', { p_email: email });
      if (lockoutData) {
        const status = lockoutData as LockoutStatus;
        if (status.locked && status.remaining_seconds > 0) {
          setLockoutSeconds(status.remaining_seconds);
          setError(t('accountLockedTime', { time: formatTime(status.remaining_seconds) }));
          setLoading(false);
          return;
        }
      }
    } catch {
      // If lockout check fails (function doesn't exist), continue with login
      console.warn('Lockout check failed, continuing with login');
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Record failed attempt
      try {
        const { data: failData } = await supabase.rpc('record_failed_login', { p_email: email });
        if (failData) {
          const result = failData as { locked: boolean; attempts: number; locked_until: string | null };
          if (result.locked && result.locked_until) {
            const remaining = Math.ceil((new Date(result.locked_until).getTime() - Date.now()) / 1000);
            setLockoutSeconds(remaining);
            setError(t('tooManyFailedTime', { time: formatTime(remaining) }));
            setLoading(false);
            return;
          }
        }
      } catch {
        // If recording fails, just show the error
        console.warn('Failed to record login attempt');
      }

      setError(error.message);
      resetTurnstile();
      setLoading(false);
      return;
    }

    // Reset failed attempts on successful login
    try {
      await supabase.rpc('reset_login_attempts', { p_email: email });
    } catch {
      // Non-critical, continue
    }

    // Store session start time for security cooldown on sensitive actions
    localStorage.setItem('session_start_time', Date.now().toString());

    router.push(redirectTo);
    router.refresh();
  };

  // Format seconds to human-readable time
  const formatTime = (seconds: number): string => {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    } else if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    return `${seconds}s`;
  };

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
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('welcomeBack')}</h1>
          <p className="text-[var(--text-muted)] mt-2">{t('signInToAccount')}</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">
                {t('password')}
              </label>
              <Link href="/auth/forgot-password" className="text-sm text-[var(--accent)] hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 pr-12 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                placeholder={t('passwordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Turnstile Bot Protection */}
          {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
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

          <button
            type="submit"
            disabled={loading || oauthLoading || lockoutSeconds > 0 || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken && !turnstileTimedOut)}
            className="w-full py-3 px-4 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('signingIn') : lockoutSeconds > 0 ? t('lockedTime', { time: formatTime(lockoutSeconds) }) : t('signIn')}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--border)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-[var(--background)] text-[var(--text-muted)]">{t('orContinueWith')}</span>
          </div>
        </div>

        {/* GitHub OAuth */}
        <button
          onClick={handleGitHubLogin}
          disabled={loading || oauthLoading}
          className="w-full py-3 px-4 bg-[var(--card)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
          {oauthLoading ? t('redirecting') : t('github')}
        </button>

        {/* Sign up link */}
        <p className="text-center mt-6 text-[var(--text-muted)]">
          {t('noAccount')}{' '}
          <Link href="/auth/signup" className="text-[var(--accent)] hover:underline">
            {t('signup')}
          </Link>
        </p>
      </div>
    </div>
  );
}
