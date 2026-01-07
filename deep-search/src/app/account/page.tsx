'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { useAuth } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { getUserPreferences, updateUserPreferences, getUserLimits, getUserCredits, getPurchaseHistory, getUsageStats, getApiUsageWithCosts, MAX_CREDITS, type UserPreferences, type UserLimits, type UserCredits, type CreditPurchase, type UsageStats, type ApiUsageWithCosts } from '@/lib/supabase/database';

// Tab types
type TabId = 'profile' | 'preferences' | 'billing' | 'usage';

// Security cooldown: 15 minutes after login before sensitive actions
const SECURITY_COOLDOWN_SECONDS = 15 * 60; // 15 minutes

function getSecurityCooldownRemaining(): number {
  if (typeof window === 'undefined') return 0;
  const sessionStart = localStorage.getItem('session_start_time');
  if (!sessionStart) return 0;

  const elapsed = Math.floor((Date.now() - parseInt(sessionStart)) / 1000);
  return Math.max(0, SECURITY_COOLDOWN_SECONDS - elapsed);
}

function formatCooldownTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Change Password Modal Component
function ChangePasswordModal({
  isOpen,
  onClose,
  userEmail
}: {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const t = useTranslations('account');
  const tAuth = useTranslations('auth');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (newPassword.length < 10) {
      setError(tAuth('errors.passwordLength'));
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError(tAuth('errors.passwordLowercase'));
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError(tAuth('errors.passwordUppercase'));
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError(tAuth('errors.passwordDigit'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordsMismatch'));
      return;
    }

    if (currentPassword === newPassword) {
      setError(t('newPasswordDifferent'));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // First, verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });

      if (signInError) {
        setError(t('currentPasswordIncorrect'));
        setIsLoading(false);
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return;
      }

      // Success
      setSuccess(true);
      setTimeout(() => {
        onClose();
        // Reset form state after close
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(false);
      }, 1500);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('changePasswordTitle')}</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {success ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">{t('passwordChanged')}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('currentPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder={t('enterCurrentPassword')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  >
                    {showCurrentPassword ? (
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

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('newPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={10}
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder={t('minCharsHint')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  >
                    {showNewPassword ? (
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
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {t('passwordHint')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('confirmNewPassword')}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder={t('confirmNewPasswordPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                  >
                    {showConfirmPassword ? (
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
                {confirmPassword && (
                  <p className={`text-xs mt-1.5 flex items-center gap-1 ${newPassword === confirmPassword ? 'text-green-500' : 'text-rose-500'}`}>
                    {newPassword === confirmPassword ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {t('passwordsMatch')}
                      </>
                    ) : (
                      t('passwordsMismatch')
                    )}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
                  className="flex-1 py-2.5 px-4 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('updating')}
                    </>
                  ) : (
                    t('updatePassword')
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

// Reset Password via Email Modal
function ResetPasswordEmailModal({
  isOpen,
  onClose,
  userEmail
}: {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const t = useTranslations('account');

  // Check cooldown when modal opens
  useEffect(() => {
    if (isOpen) {
      const remaining = getSecurityCooldownRemaining();
      setCooldownRemaining(remaining);

      if (remaining > 0) {
        const timer = setInterval(() => {
          const newRemaining = getSecurityCooldownRemaining();
          setCooldownRemaining(newRemaining);
          if (newRemaining <= 0) {
            clearInterval(timer);
          }
        }, 1000);
        return () => clearInterval(timer);
      }
    }
  }, [isOpen]);

  const handleSendResetLink = async () => {
    // Double-check cooldown
    const remaining = getSecurityCooldownRemaining();
    if (remaining > 0) {
      setError(`Please wait ${formatCooldownTime(remaining)} before resetting your password`);
      setCooldownRemaining(remaining);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md mx-4 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('resetPasswordTitle')}</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
              {error}
            </div>
          )}

          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">{t('resetLinkSent')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">{t('checkEmailForReset')}</p>
            </div>
          ) : cooldownRemaining > 0 ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">{t('securityCooldown')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {t('securityCooldownDesc', { time: formatCooldownTime(cooldownRemaining) })}
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors"
              >
                {t('close')}
              </button>
            </div>
          ) : (
            <>
              <p className="text-[var(--text-secondary)] mb-4">
                {t('sendResetLinkDesc')}
              </p>
              <p className="text-[var(--text-primary)] font-medium mb-4 p-3 bg-[var(--card)] rounded-lg">
                {userEmail}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleSendResetLink}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('sending')}
                    </>
                  ) : (
                    t('sendResetLink')
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Change Email Modal
function ChangeEmailModal({
  isOpen,
  onClose,
  currentEmail
}: {
  isOpen: boolean;
  onClose: () => void;
  currentEmail: string;
}) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const t = useTranslations('account');

  // Check cooldown when modal opens
  useEffect(() => {
    if (isOpen) {
      const remaining = getSecurityCooldownRemaining();
      setCooldownRemaining(remaining);

      if (remaining > 0) {
        const timer = setInterval(() => {
          const newRemaining = getSecurityCooldownRemaining();
          setCooldownRemaining(newRemaining);
          if (newRemaining <= 0) {
            clearInterval(timer);
          }
        }, 1000);
        return () => clearInterval(timer);
      }
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Double-check cooldown
    const remaining = getSecurityCooldownRemaining();
    if (remaining > 0) {
      setError(`Please wait ${formatCooldownTime(remaining)} before changing your email`);
      setCooldownRemaining(remaining);
      return;
    }

    if (!password) {
      setError('Please enter your password');
      return;
    }

    if (!newEmail) {
      setError('Please enter a new email address');
      return;
    }

    if (newEmail === currentEmail) {
      setError(t('newEmailDifferent'));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // First verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: password,
      });

      if (signInError) {
        setError(t('incorrectPassword'));
        setIsLoading(false);
        return;
      }

      // Password verified, now update email
      const { error } = await supabase.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: `${window.location.origin}/auth/callback` }
      );

      if (error) {
        setError(error.message);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setPassword('');
      setShowPassword(false);
      setNewEmail('');
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-md mx-4 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('changeEmailTitle')}</h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm">
              {error}
            </div>
          )}

          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">{t('verificationSent')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {t('verificationSentDesc', { email: newEmail })}
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                {t('done')}
              </button>
            </div>
          ) : cooldownRemaining > 0 ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">{t('securityCooldown')}</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {t('securityCooldownEmail', { time: formatCooldownTime(cooldownRemaining) })}
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors"
              >
                {t('close')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('currentEmail')}
                </label>
                <p className="p-3 bg-[var(--card)] rounded-lg text-[var(--text-muted)]">
                  {currentEmail}
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="changeEmailPassword" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('passwordVerify')}
                </label>
                <div className="relative">
                  <input
                    id="changeEmailPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-3 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder={t('enterPasswordVerify')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
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

              <div className="mb-4">
                <label htmlFor="newEmail" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  {t('newEmailAddress')}
                </label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                  placeholder={t('enterNewEmail')}
                  required
                />
              </div>

              <p className="text-xs text-[var(--text-muted)] mb-4">
                {t('verificationEmailNote')}
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !password || !newEmail}
                  className="flex-1 py-2.5 px-4 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('verifying')}
                    </>
                  ) : (
                    t('sendVerification')
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Profile Tab Content
function ProfileTab({
  user,
  onChangePassword,
  onResetPassword,
  onChangeEmail,
  onSignOut
}: {
  user: { email?: string; created_at?: string; email_confirmed_at?: string; id?: string } | null;
  onChangePassword: () => void;
  onResetPassword: () => void;
  onChangeEmail: () => void;
  onSignOut: () => void;
}) {
  const t = useTranslations('account');
  return (
    <div className="space-y-6">
      {/* User Info Card */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-[var(--accent)]/20 flex items-center justify-center">
            <span className="text-xl font-semibold text-[var(--accent)]">
              {user?.email?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--text-primary)]">
              {user?.email || 'Unknown User'}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {t('memberSince')} {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{t('accountDetails')}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t('email')}</span>
              <span className="text-[var(--text-primary)]">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t('emailVerified')}</span>
              <span className={user?.email_confirmed_at ? 'text-green-500' : 'text-yellow-500'}>
                {user?.email_confirmed_at ? t('yes') : t('pending')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">{t('userId')}</span>
              <span className="text-[var(--text-primary)] font-mono text-xs">{user?.id?.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('accountSecurity')}</h3>
        <div className="space-y-4">
          {/* Change Password */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[var(--text-primary)] font-medium">{t('password')}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {t('changePasswordDesc')}
              </p>
            </div>
            <button
              onClick={onChangePassword}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              {t('change')}
            </button>
          </div>

          {/* Reset Password via Email */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
            <div>
              <p className="text-[var(--text-primary)] font-medium">{t('resetPasswordTitle')}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {t('resetPasswordDesc')}
              </p>
            </div>
            <button
              onClick={onResetPassword}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              {t('reset')}
            </button>
          </div>

          {/* Change Email */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
            <div>
              <p className="text-[var(--text-primary)] font-medium">{t('emailAddress')}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {t('updateEmailDesc')}
              </p>
            </div>
            <button
              onClick={onChangeEmail}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              {t('update')}
            </button>
          </div>
        </div>
      </div>

      {/* Sign Out Button */}
      <button
        onClick={onSignOut}
        className="w-full py-3 px-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg font-medium hover:bg-rose-500/20 transition-colors"
      >
        {t('signOut')}
      </button>
    </div>
  );
}

// Grouped model providers structure for preferences
type ModelId = 'gemini' | 'gemini-pro' | 'openai' | 'openai-mini' | 'deepseek' | 'grok' | 'claude' | 'vercel-gateway';

interface ModelOption {
  id: ModelId;
  label: string;
  description?: string;
  tag?: string;
}

interface ProviderGroup {
  provider: string;
  models: ModelOption[];
  experimental?: boolean;
}

const modelProviderGroups: ProviderGroup[] = [
  {
    provider: 'Google',
    models: [
      { id: 'gemini', label: 'Gemini 3 Flash', description: 'Latest & fast', tag: 'Recommended' },
      { id: 'gemini-pro', label: 'Gemini 3 Pro', description: 'Higher quality' },
    ],
  },
  {
    provider: 'Anthropic',
    models: [
      { id: 'claude', label: 'Claude Haiku 4.5', description: 'Latest & fast' },
    ],
  },
  {
    provider: 'DeepSeek',
    models: [
      { id: 'deepseek', label: 'DeepSeek Chat', description: 'Cost-effective' },
    ],
  },
  {
    provider: 'OpenAI',
    models: [
      { id: 'openai-mini', label: 'GPT-5 mini', description: 'Cost-effective' },
      { id: 'openai', label: 'GPT-5.2', description: 'Higher quality', tag: 'Reference' },
    ],
  },
  {
    provider: 'xAI',
    models: [
      { id: 'grok', label: 'Grok 4.1 Fast', description: 'Latest & fast' },
    ],
  },
  {
    provider: 'Vercel Gateway',
    models: [
      { id: 'vercel-gateway', label: 'Qwen 3 Max', description: 'Fallback' },
    ],
    experimental: true,
  },
];

// Preferences Tab Content
function PreferencesTab() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const t = useTranslations('account');

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getUserPreferences();
        setPreferences(prefs);
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPreferences();
  }, []);

  const handleModelChange = async (modelId: ModelId) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      await updateUserPreferences({ default_provider: modelId });
      setPreferences({ ...preferences, default_provider: modelId });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to update model:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleModeChange = async (mode: UserPreferences['default_mode']) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      await updateUserPreferences({ default_mode: mode });
      setPreferences({ ...preferences, default_mode: mode });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to update mode:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const modes = [
    { id: 'web', nameKey: 'webSearchName', descKey: 'webSearchDesc' },
    { id: 'pro', nameKey: 'researchName', descKey: 'researchDesc' },
    { id: 'brainstorm', nameKey: 'brainstormName', descKey: 'brainstormDesc' },
  ] as const;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 bg-[var(--border)] rounded" />
            <div className="h-10 w-full bg-[var(--border)] rounded" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save indicator */}
      {(isSaving || saveSuccess) && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          saveSuccess
            ? 'bg-green-500/20 text-green-500 border border-green-500/20'
            : 'bg-[var(--card)] text-[var(--text-muted)] border border-[var(--border)]'
        }`}>
          {saveSuccess ? t('saved') : t('saving')}
        </div>
      )}

      {/* Default Model */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-1">{t('defaultModel')}</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {t('defaultModelDesc')}
        </p>
        <div className="space-y-4">
          {modelProviderGroups.map((group) => (
            <div key={group.provider}>
              {/* Provider header */}
              <div className={`text-xs font-medium uppercase tracking-wider mb-2 ${group.experimental ? 'text-[var(--text-muted)]/60' : 'text-[var(--text-muted)]'}`}>
                {group.provider}
              </div>
              {/* Models in this provider group */}
              <div className="grid gap-2">
                {group.models.map((model) => {
                  const isSelected = preferences?.default_provider === model.id;
                  const borderColor = group.experimental
                    ? (isSelected ? 'border-[var(--text-muted)]/50' : 'border-[var(--border)] hover:border-[var(--text-muted)]/30')
                    : (isSelected ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--text-muted)]');
                  const bgColor = group.experimental
                    ? (isSelected ? 'bg-[var(--text-muted)]/5' : '')
                    : (isSelected ? 'bg-[var(--accent)]/5' : '');

                  return (
                    <button
                      key={model.id}
                      onClick={() => handleModelChange(model.id)}
                      disabled={isSaving}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${borderColor} ${bgColor} disabled:opacity-50`}
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <p className={`font-medium ${group.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                            {model.label}
                          </p>
                          {model.description && (
                            <p className={`text-xs ${group.experimental ? 'text-[var(--text-muted)]/60' : 'text-[var(--text-muted)]'}`}>
                              {model.description}
                            </p>
                          )}
                        </div>
                        {model.tag && (
                          <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                            model.tag === 'Recommended'
                              ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                              : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)]'
                          }`}>
                            {model.tag === 'Recommended' ? t('recommended') : t('reference')}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 flex-shrink-0 ${group.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Default Search Mode */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-1">{t('defaultSearchMode')}</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {t('defaultModeDesc')}
        </p>
        <div className="grid gap-2">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleModeChange(mode.id)}
              disabled={isSaving}
              className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                preferences?.default_mode === mode.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                  : 'border-[var(--border)] hover:border-[var(--text-muted)]'
              } disabled:opacity-50`}
            >
              <div>
                <p className="font-medium text-[var(--text-primary)]">{t(mode.nameKey)}</p>
                <p className="text-xs text-[var(--text-muted)]">{t(mode.descKey)}</p>
              </div>
              {preferences?.default_mode === mode.id && (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Billing Tab Content
function BillingTab() {
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('account');

  useEffect(() => {
    const loadBillingData = async () => {
      try {
        const [creditsData, purchasesData] = await Promise.all([
          getUserCredits(),
          getPurchaseHistory(),
        ]);
        setCredits(creditsData);
        setPurchases(purchasesData);
      } catch (error) {
        console.error('Failed to load billing data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadBillingData();
  }, []);

  const creditPacks = [
    { id: 'starter', name: 'Getting Started', credits: 500, price: '$5', pricePerCredit: '$0.01/credit' },
    { id: 'plus', name: 'I Like It', credits: 2000, price: '$15', pricePerCredit: '$0.0075/credit', bonus: '33% bonus' },
    { id: 'pro', name: 'Power User', credits: 6000, price: '$40', pricePerCredit: '$0.0067/credit', bonus: '50% bonus' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 bg-[var(--border)] rounded" />
            <div className="h-10 w-full bg-[var(--border)] rounded" />
          </div>
        </div>
      </div>
    );
  }

  const totalAvailable = credits?.total_available ?? 0;
  const freeRemaining = credits?.free_credits_remaining ?? 0;
  const purchasedCredits = credits?.purchased_credits ?? 0;
  const daysUntilReset = credits?.days_until_reset ?? 0;
  const userTier = credits?.user_tier ?? 'free';

  const tierConfig = {
    free: { labelKey: 'tiers.free' as const, color: 'bg-gray-500', textColor: 'text-gray-100' },
    pro: {
      labelKey: 'tiers.pro' as const,
      color: '',
      textColor: 'text-white',
      customStyle: {
        background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        boxShadow: '0 0 12px rgba(59, 130, 246, 0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
      }
    },
    admin: { labelKey: 'tiers.admin' as const, color: 'bg-amber-500', textColor: 'text-amber-100' },
  };

  const currentTier = tierConfig[userTier] || tierConfig.free;

  return (
    <div className="space-y-6">
      {/* Credit Balance */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{t('creditBalance')}</h3>
          <span
            className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${currentTier.color} ${currentTier.textColor}`}
            style={'customStyle' in currentTier ? currentTier.customStyle as React.CSSProperties : undefined}
          >
            {t(currentTier.labelKey)}
          </span>
        </div>

        {/* Total Credits Display */}
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-[var(--text-primary)]">{totalAvailable.toLocaleString()}</span>
            <span className="text-sm text-[var(--text-muted)]">{t('creditsAvailable')}</span>
          </div>
        </div>

        {/* Credit Breakdown */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              <span className="text-xs text-[var(--text-muted)]">{t('freeCredits')}</span>
            </div>
            <span className="text-xl font-semibold text-[var(--text-primary)]">{freeRemaining.toLocaleString()}</span>
            <span className="text-xs text-[var(--text-muted)] ml-1">/ {(credits?.monthly_free_credits ?? 1000).toLocaleString()}</span>
          </div>
          <div className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-[var(--text-muted)]">{t('purchasedCredits')}</span>
            </div>
            <span className="text-xl font-semibold text-[var(--text-primary)]">{purchasedCredits.toLocaleString()}</span>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          {t('freeCreditsReset', { days: daysUntilReset })}
        </p>
      </div>

      {/* Credit Costs Info */}
      <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{t('creditsPerSearch')}</h4>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {t('creditsPerSearchDesc')}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">{t('webSearch')}:</span>
            <span className="font-medium text-[var(--text-primary)]">{MAX_CREDITS.web} {t('credit')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">{t('research')}:</span>
            <span className="font-medium text-[var(--text-primary)]">3-{MAX_CREDITS.pro} {t('credits_plural')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)]">{t('brainstorm')}:</span>
            <span className="font-medium text-[var(--text-primary)]">4-{MAX_CREDITS.brainstorm} {t('credits_plural')}</span>
          </div>
        </div>
      </div>

      {/* Credit Packs */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{t('purchaseCredits')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {creditPacks.map((pack) => (
            <div
              key={pack.id}
              className="relative p-5 rounded-lg bg-[var(--card)] border border-[var(--border)] opacity-60"
            >
              {pack.bonus && (
                <div className="absolute -top-2 right-4 px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-500 rounded-full border border-emerald-500/30">
                  {pack.bonus}
                </div>
              )}
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{pack.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-2xl font-bold text-[var(--text-primary)]">{pack.credits.toLocaleString()}</span>
                <span className="text-sm text-[var(--text-muted)]">{t('credits_plural')}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xl font-semibold text-[var(--accent)]">{pack.price}</span>
                <span className="text-xs text-[var(--text-muted)]">{pack.pricePerCredit}</span>
              </div>
              <button
                disabled
                className="w-full py-2.5 px-4 bg-[var(--accent)]/50 text-white/70 rounded-lg font-medium cursor-not-allowed"
              >
                {t('comingSoon')}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-3 text-center">
          {t('purchasesComingSoon')}
        </p>
      </div>

      {/* Purchase History */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{t('purchaseHistory')}</h2>
        <div className="rounded-lg bg-[var(--card)] border border-[var(--border)] overflow-hidden">
          {purchases.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--border)] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-muted)]">{t('noPurchases')}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('purchaseHistoryDesc')}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--text-primary)] capitalize">{purchase.pack_type}</span>
                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                        purchase.status === 'completed' ? 'bg-green-500/20 text-green-500' :
                        purchase.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' :
                        purchase.status === 'refunded' ? 'bg-blue-500/20 text-blue-500' :
                        'bg-red-500/20 text-red-500'
                      }`}>
                        {purchase.status}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(purchase.created_at).toLocaleDateString()} • {purchase.credits.toLocaleString()} credits
                    </p>
                  </div>
                  <span className="font-medium text-[var(--text-primary)]">
                    ${(purchase.amount_cents / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Usage Progress Bar Component
function UsageProgressBar({
  label,
  used,
  limit,
  resetText,
  formatValue = (v: number) => v.toString(),
}: {
  label: string;
  used: number;
  limit: number;
  resetText: string;
  formatValue?: (value: number) => string;
}) {
  const percent = limit > 0 ? (used / limit) * 100 : 0;

  return (
    <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">{label}</h3>
        <span className="text-sm text-[var(--text-muted)]">
          {formatValue(used)} / {formatValue(limit)}
        </span>
      </div>
      <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percent >= 90 ? 'bg-rose-500' : percent >= 70 ? 'bg-yellow-500' : 'bg-[var(--accent)]'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-[var(--text-muted)] mt-2">{resetText}</p>
    </div>
  );
}

// Simple horizontal bar chart component
function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  formatLabel,
  emptyLabel,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  formatLabel?: (label: string) => string;
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-[var(--text-muted)]">
        {emptyLabel || 'No data yet'}
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d[valueKey] as number));
  const total = data.reduce((sum, d) => sum + (d[valueKey] as number), 0);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const label = item[labelKey] as string;
        const value = item[valueKey] as number;
        const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;
        const displayLabel = formatLabel ? formatLabel(label) : label;

        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-primary)]">{displayLabel}</span>
              <span className="text-[var(--text-muted)]">
                {value.toLocaleString()} ({total > 0 ? Math.round((value / total) * 100) : 0}%)
              </span>
            </div>
            <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-[var(--accent)]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Mini activity chart (last 30 days)
function ActivityChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const last7Days = data.slice(-7);

  return (
    <div className="flex items-end gap-1 h-16">
      {last7Days.map((day, i) => {
        const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
        const isToday = i === last7Days.length - 1;

        return (
          <div
            key={day.date}
            className="flex-1 flex flex-col items-center gap-1"
            title={`${new Date(day.date).toLocaleDateString()}: ${day.count} searches`}
          >
            <div className="w-full flex items-end justify-center" style={{ height: '48px' }}>
              <div
                className={`w-full rounded-t transition-all ${
                  isToday ? 'bg-[var(--accent)]' : 'bg-[var(--accent)]/50'
                }`}
                style={{ height: `${Math.max(height, 4)}%`, minHeight: day.count > 0 ? '4px' : '2px' }}
              />
            </div>
            <span className="text-[10px] text-[var(--text-muted)]">
              {new Date(day.date).toLocaleDateString('en-US', { weekday: 'narrow' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Usage Tab Content
function UsageTab() {
  const [limits, setLimits] = useState<UserLimits | null>(null);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [apiCosts, setApiCosts] = useState<ApiUsageWithCosts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('account');
  const tSearch = useTranslations('search');
  const tProviders = useTranslations('providers');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [userLimits, usageStats, usageCosts] = await Promise.all([
          getUserLimits(),
          getUsageStats(30),
          getApiUsageWithCosts(30),
        ]);
        setLimits(userLimits);
        setStats(usageStats);
        setApiCosts(usageCosts);
      } catch (error) {
        console.error('Failed to load usage data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-32 bg-[var(--border)] rounded" />
            <div className="h-4 w-full bg-[var(--border)] rounded" />
          </div>
        </div>
      </div>
    );
  }

  const formatNumber = (n: number) => n.toLocaleString();

  const getModeLabel = (mode: string): string => {
    const modeKeys: Record<string, string> = {
      web: 'modes.web',
      pro: 'modes.pro',
      brainstorm: 'modes.brainstorm',
    };
    return tSearch(modeKeys[mode] || mode);
  };

  const getProviderLabel = (provider: string): string => {
    const providerKeys: Record<string, string> = {
      deepseek: 'deepseek',
      openai: 'openai',
      'openai-mini': 'openaiMini',
      grok: 'grok',
      claude: 'claude',
      gemini: 'gemini',
      'gemini-pro': 'geminiPro',
      'vercel-gateway': 'vercelGateway',
    };
    return tProviders(providerKeys[provider] || provider);
  };

  // Format currency (USD)
  const formatCurrency = (amount: number) => {
    if (amount < 0.01 && amount > 0) {
      return '<$0.01';
    }
    return `$${amount.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('totalSearches30d')}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{stats?.totalSearches.toLocaleString() || 0}</p>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('todaysSearches')}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {stats?.todaySearches || 0}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('thisMonth')}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {stats?.thisMonthSearches || 0}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)] mb-1">{t('estimatedApiCost')}</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">
            {formatCurrency(apiCosts?.totalCostUsd || 0)}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{t('last30Days')}</p>
        </div>
      </div>

      {/* Weekly Activity */}
      {stats && stats.last30Days.length > 0 && (
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('weeklyActivity')}</h3>
          <ActivityChart data={stats.last30Days} />
        </div>
      )}

      {/* Breakdown Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* By Search Mode */}
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('bySearchMode')}</h3>
          <HorizontalBarChart
            data={stats?.byMode || []}
            labelKey="mode"
            valueKey="count"
            formatLabel={getModeLabel}
            emptyLabel={t('noDataYet')}
          />
        </div>

        {/* By Provider */}
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('byProvider')}</h3>
          <HorizontalBarChart
            data={stats?.byProvider || []}
            labelKey="provider"
            valueKey="count"
            formatLabel={getProviderLabel}
            emptyLabel={t('noDataYet')}
          />
        </div>
      </div>

      {/* API Cost Breakdown by Provider */}
      {apiCosts && apiCosts.byProvider.length > 0 && (
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">{t('costBreakdown')}</h3>
          <div className="space-y-3">
            {apiCosts.byProvider.map((provider) => (
              <div key={provider.provider} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{getProviderLabel(provider.provider)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatNumber(provider.total_prompt_tokens)} {t('inputTokens')} + {formatNumber(provider.total_completion_tokens)} {t('outputTokens')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{formatCurrency(provider.estimated_cost_usd)}</p>
                  <p className="text-xs text-[var(--text-muted)]">{provider.total_requests} {t('requests')}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t('totalCost')}</p>
              <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(apiCosts.totalCostUsd)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Token Usage Bars */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{t('tokenUsage')}</h2>
        <div className="space-y-4">
          <UsageProgressBar
            label={t('dailyTokens')}
            used={limits?.daily_tokens_used || 0}
            limit={limits?.daily_token_limit || 100000}
            resetText={t('dailyTokensReset')}
            formatValue={formatNumber}
          />
          <UsageProgressBar
            label={t('monthlyTokens')}
            used={limits?.monthly_tokens_used || 0}
            limit={limits?.monthly_token_limit || 500000}
            resetText={t('monthlyTokensReset')}
            formatValue={formatNumber}
          />
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isChangeEmailModalOpen, setIsChangeEmailModalOpen] = useState(false);
  const t = useTranslations('account');

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-32 bg-[var(--card)] rounded mb-4" />
            <div className="h-4 w-48 bg-[var(--card)] rounded" />
          </div>
        </div>
      </MainLayout>
    );
  }

  const tabs = [
    { id: 'profile' as const, labelKey: 'profile', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    )},
    { id: 'preferences' as const, labelKey: 'preferences', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'billing' as const, labelKey: 'billing', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
      </svg>
    )},
    { id: 'usage' as const, labelKey: 'usage', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    )},
  ];

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{t('title')}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {t('subtitle')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 mb-6 border-b border-[var(--border)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium transition-colors relative border-b-2 ${
                activeTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {tab.icon}
                {t(tab.labelKey)}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <ProfileTab
            user={user}
            onChangePassword={() => setIsPasswordModalOpen(true)}
            onResetPassword={() => setIsResetPasswordModalOpen(true)}
            onChangeEmail={() => setIsChangeEmailModalOpen(true)}
            onSignOut={handleSignOut}
          />
        )}
        {activeTab === 'preferences' && <PreferencesTab />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'usage' && <UsageTab />}
      </div>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        userEmail={user?.email || ''}
      />

      {/* Reset Password via Email Modal */}
      <ResetPasswordEmailModal
        isOpen={isResetPasswordModalOpen}
        onClose={() => setIsResetPasswordModalOpen(false)}
        userEmail={user?.email || ''}
      />

      {/* Change Email Modal */}
      <ChangeEmailModal
        isOpen={isChangeEmailModalOpen}
        onClose={() => setIsChangeEmailModalOpen(false)}
        currentEmail={user?.email || ''}
      />
    </MainLayout>
  );
}
