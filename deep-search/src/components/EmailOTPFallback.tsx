'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface EmailOTPFallbackProps {
  email: string;
  purpose: 'signup' | 'login' | 'reset';
  onVerified: () => void;
  className?: string;
}

export default function EmailOTPFallback({
  email,
  purpose,
  onVerified,
  className = '',
}: EmailOTPFallbackProps) {
  const [step, setStep] = useState<'initial' | 'code-sent' | 'verified'>('initial');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const t = useTranslations('auth');

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Expiry countdown
  useEffect(() => {
    if (expiresIn > 0) {
      const timer = setTimeout(() => setExpiresIn(expiresIn - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [expiresIn]);

  const sendCode = useCallback(async () => {
    if (!email || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || t('errors.otpSendFailed'));
        if (data.retry_after) {
          setCountdown(Math.ceil(data.retry_after / 60) * 60); // Round to minutes
        }
        return;
      }

      setStep('code-sent');
      setCode(['', '', '', '', '', '']);
      setCountdown(60); // 60 second cooldown for resend
      setExpiresIn(data.expires_in || 600);

      // Focus first input
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError(t('errors.networkError'));
    } finally {
      setLoading(false);
    }
  }, [email, purpose, loading, t]);

  const verifyCode = useCallback(async (fullCode: string) => {
    if (fullCode.length !== 6 || loading) return;

    setLoading(true);
    setError(null);

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: fullCode, purpose }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!data.success) {
        setError(data.error || t('errors.otpVerifyFailed'));
        // Clear code on error
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }

      setStep('verified');
      onVerified();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        setError(t('errors.requestTimeout'));
      } else {
        setError(t('errors.networkError'));
      }
      // Clear code on error for retry
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [email, purpose, loading, t, onVerified]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    // Auto-advance to next input
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    const fullCode = newCode.join('');
    if (fullCode.length === 6 && newCode.every(d => d)) {
      verifyCode(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    // Handle paste via keyboard shortcut
    if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
      // Only use clipboard API if available (requires HTTPS or localhost)
      if (navigator.clipboard?.readText) {
        e.preventDefault();
        navigator.clipboard.readText().then(text => {
          const digits = text.replace(/\D/g, '').slice(0, 6).split('');
          if (digits.length > 0) {
            const newCode = [...code];
            digits.forEach((d, i) => {
              if (i < 6) newCode[i] = d;
            });
            setCode(newCode);
            // Focus appropriate input
            const nextEmpty = newCode.findIndex(d => !d);
            if (nextEmpty >= 0) {
              inputRefs.current[nextEmpty]?.focus();
            } else {
              // All filled, verify
              verifyCode(newCode.join(''));
            }
          }
        }).catch(() => {
          // Clipboard access denied, let browser handle paste via onPaste
        });
      }
      // If clipboard API unavailable, let browser's native paste trigger onPaste handler
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length > 0) {
      const newCode = [...code];
      digits.forEach((d, i) => {
        if (i < 6) newCode[i] = d;
      });
      setCode(newCode);
      // Focus appropriate input or verify
      const nextEmpty = newCode.findIndex(d => !d);
      if (nextEmpty >= 0) {
        inputRefs.current[nextEmpty]?.focus();
      } else if (newCode.every(d => d)) {
        verifyCode(newCode.join(''));
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  if (step === 'verified') {
    return (
      <div className={`flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm ${className}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span>{t('otp.verified')}</span>
      </div>
    );
  }

  if (step === 'initial') {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{t('otp.captchaUnavailable')}</span>
        </div>

        {error && (
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={sendCode}
          disabled={loading || !email || countdown > 0}
          className="w-full py-2.5 px-4 bg-[var(--card)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {loading ? t('otp.sending') : countdown > 0 ? t('otp.resendIn', { time: formatTime(countdown) }) : t('otp.sendCode')}
        </button>
      </div>
    );
  }

  // step === 'code-sent'
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-center">
        <p className="text-sm text-[var(--text-secondary)]">
          {t('otp.codeSentTo')} <strong className="text-[var(--text-primary)]">{email}</strong>
        </p>
        {expiresIn > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t('otp.expiresIn', { time: formatTime(expiresIn) })}
          </p>
        )}
      </div>

      {error && (
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs text-center">
          {error}
        </div>
      )}

      {/* 6-digit code input */}
      <div className="flex justify-center gap-2">
        {code.map((digit, index) => (
          <input
            key={index}
            ref={el => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={loading}
            className="w-10 h-12 text-center text-lg font-semibold bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
            autoComplete="one-time-code"
          />
        ))}
      </div>

      {/* Resend button */}
      <div className="text-center">
        <button
          type="button"
          onClick={sendCode}
          disabled={loading || countdown > 0}
          className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {countdown > 0 ? t('otp.resendIn', { time: formatTime(countdown) }) : t('otp.resendCode')}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center">
          <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
