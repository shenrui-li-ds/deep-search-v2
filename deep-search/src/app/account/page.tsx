'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { useAuth } from '@/lib/supabase/auth-context';
import { createClient } from '@/lib/supabase/client';
import { getUserPreferences, updateUserPreferences, getUserLimits, type UserPreferences, type UserLimits } from '@/lib/supabase/database';

// Tab types
type TabId = 'profile' | 'preferences' | 'usage';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (newPassword.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one digit');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
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
        setError('Current password is incorrect');
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
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Change Password</h2>
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
              <p className="text-[var(--text-primary)] font-medium">Password changed successfully!</p>
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
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder="Enter current password"
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
                  New Password
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
                    placeholder="Min 10 chars, uppercase, lowercase, digit"
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
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full px-3 py-2.5 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder="Confirm new password"
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
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50"
                >
                  Cancel
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
                      Updating...
                    </>
                  ) : (
                    'Update Password'
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
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Reset Password</h2>
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
              <p className="text-[var(--text-primary)] font-medium">Reset link sent!</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">Check your email for the reset link.</p>
            </div>
          ) : cooldownRemaining > 0 ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">Security cooldown active</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                For your security, please wait <span className="font-medium text-[var(--text-primary)]">{formatCooldownTime(cooldownRemaining)}</span> before resetting your password.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <p className="text-[var(--text-secondary)] mb-4">
                We&apos;ll send a password reset link to:
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
                  Cancel
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
                      Sending...
                    </>
                  ) : (
                    'Send Reset Link'
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
      setError('New email must be different from current email');
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
        setError('Incorrect password');
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
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Change Email Address</h2>
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
              <p className="text-[var(--text-primary)] font-medium">Verification email sent!</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Please check <span className="font-medium text-[var(--text-primary)]">{newEmail}</span> to confirm your new email address.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          ) : cooldownRemaining > 0 ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-primary)] font-medium">Security cooldown active</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                For your security, please wait <span className="font-medium text-[var(--text-primary)]">{formatCooldownTime(cooldownRemaining)}</span> before changing your email address.
              </p>
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Current Email
                </label>
                <p className="p-3 bg-[var(--card)] rounded-lg text-[var(--text-muted)]">
                  {currentEmail}
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="changeEmailPassword" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="changeEmailPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-3 pr-10 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-xs placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                    placeholder="Enter your password to verify"
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
                  New Email Address
                </label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent disabled:opacity-50"
                  placeholder="Enter new email address"
                  required
                />
              </div>

              <p className="text-xs text-[var(--text-muted)] mb-4">
                We&apos;ll send a verification email to your new address. Your email won&apos;t change until you verify it.
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--card-hover)] transition-colors disabled:opacity-50"
                >
                  Cancel
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
                      Verifying...
                    </>
                  ) : (
                    'Send Verification'
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
              Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
            </p>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Account Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Email</span>
              <span className="text-[var(--text-primary)]">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Email verified</span>
              <span className={user?.email_confirmed_at ? 'text-green-500' : 'text-yellow-500'}>
                {user?.email_confirmed_at ? 'Yes' : 'Pending'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">User ID</span>
              <span className="text-[var(--text-primary)] font-mono text-xs">{user?.id?.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Account Security</h3>
        <div className="space-y-4">
          {/* Change Password */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[var(--text-primary)] font-medium">Password</p>
              <p className="text-sm text-[var(--text-muted)]">
                Change your account password
              </p>
            </div>
            <button
              onClick={onChangePassword}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              Change
            </button>
          </div>

          {/* Reset Password via Email */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
            <div>
              <p className="text-[var(--text-primary)] font-medium">Reset Password</p>
              <p className="text-sm text-[var(--text-muted)]">
                Send a password reset link to your email
              </p>
            </div>
            <button
              onClick={onResetPassword}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Change Email */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
            <div>
              <p className="text-[var(--text-primary)] font-medium">Email Address</p>
              <p className="text-sm text-[var(--text-muted)]">
                Update your email address
              </p>
            </div>
            <button
              onClick={onChangeEmail}
              className="px-4 py-2 bg-[var(--background)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg text-sm font-medium hover:bg-[var(--card-hover)] transition-colors"
            >
              Update
            </button>
          </div>
        </div>
      </div>

      {/* Sign Out Button */}
      <button
        onClick={onSignOut}
        className="w-full py-3 px-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg font-medium hover:bg-rose-500/20 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}

// Preferences Tab Content
function PreferencesTab() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  const handleProviderChange = async (provider: UserPreferences['default_provider']) => {
    if (!preferences) return;
    setIsSaving(true);
    try {
      await updateUserPreferences({ default_provider: provider });
      setPreferences({ ...preferences, default_provider: provider });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to update provider:', error);
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

  const providers = [
    { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek Chat v3.2', experimental: false },
    { id: 'openai', name: 'OpenAI', description: 'GPT-4.1 mini', experimental: false },
    { id: 'grok', name: 'Grok', description: 'Grok 4.1 Fast', experimental: false },
    { id: 'claude', name: 'Claude', description: 'Claude Haiku 4.5', experimental: false },
    { id: 'gemini', name: 'Gemini', description: 'Gemini 3 Flash', experimental: false },
    { id: 'vercel-gateway', name: 'Vercel Gateway', description: 'Experimental', experimental: true },
  ] as const;

  const modes = [
    { id: 'web', name: 'Web', description: 'Quick search with summary' },
    { id: 'pro', name: 'Research', description: 'Multi-angle comprehensive research' },
    { id: 'brainstorm', name: 'Brainstorm', description: 'Creative ideation with cross-domain inspiration' },
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
          {saveSuccess ? 'Saved!' : 'Saving...'}
        </div>
      )}

      {/* Default Provider */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-1">Default Provider</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Choose which AI provider to use by default when starting a new search
        </p>
        <div className="grid gap-2">
          {providers.map((provider) => {
            const isSelected = preferences?.default_provider === provider.id;
            const borderColor = provider.experimental
              ? (isSelected ? 'border-[var(--text-muted)]/50' : 'border-[var(--border)] hover:border-[var(--text-muted)]/30')
              : (isSelected ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--text-muted)]');
            const bgColor = provider.experimental
              ? (isSelected ? 'bg-[var(--text-muted)]/5' : '')
              : (isSelected ? 'bg-[var(--accent)]/5' : '');

            return (
              <button
                key={provider.id}
                onClick={() => handleProviderChange(provider.id)}
                disabled={isSaving}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${borderColor} ${bgColor} disabled:opacity-50`}
              >
                <div>
                  <p className={`font-medium ${provider.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                    {provider.name}
                  </p>
                  <p className={`text-xs ${provider.experimental ? 'text-[var(--text-muted)]/60' : 'text-[var(--text-muted)]'}`}>
                    {provider.description}
                  </p>
                </div>
                {isSelected && (
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${provider.experimental ? 'text-[var(--text-muted)]' : 'text-[var(--accent)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Default Search Mode */}
      <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)]">
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-1">Default Search Mode</h3>
        <p className="text-xs text-[var(--text-muted)] mb-4">
          Choose which search mode to use by default
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
                <p className="font-medium text-[var(--text-primary)]">{mode.name}</p>
                <p className="text-xs text-[var(--text-muted)]">{mode.description}</p>
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

// Usage Tab Content
function UsageTab() {
  const [limits, setLimits] = useState<UserLimits | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLimits = async () => {
      try {
        const userLimits = await getUserLimits();
        setLimits(userLimits);
      } catch (error) {
        console.error('Failed to load usage limits:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadLimits();
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

  return (
    <div className="space-y-6">
      {/* Daily Usage Section */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Daily Usage</h2>
        <div className="space-y-4">
          <UsageProgressBar
            label="Searches"
            used={limits?.daily_searches_used || 0}
            limit={limits?.daily_search_limit || 50}
            resetText="Resets daily at midnight"
          />
          <UsageProgressBar
            label="Tokens"
            used={limits?.daily_tokens_used || 0}
            limit={limits?.daily_token_limit || 100000}
            resetText="Resets daily at midnight"
            formatValue={formatNumber}
          />
        </div>
      </div>

      {/* Monthly Usage Section */}
      <div>
        <h2 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Monthly Usage</h2>
        <div className="space-y-4">
          <UsageProgressBar
            label="Searches"
            used={limits?.monthly_searches_used || 0}
            limit={limits?.monthly_search_limit || 1000}
            resetText="Resets on the 1st of each month"
          />
          <UsageProgressBar
            label="Tokens"
            used={limits?.monthly_tokens_used || 0}
            limit={limits?.monthly_token_limit || 500000}
            resetText="Resets on the 1st of each month"
            formatValue={formatNumber}
          />
        </div>
      </div>

      {/* Reset Info */}
      {limits && (
        <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-[var(--text-muted)]">Daily reset: </span>
              <span className="text-[var(--text-primary)]">
                {limits.last_daily_reset ? new Date(limits.last_daily_reset).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="w-px h-4 bg-[var(--border)]" />
            <div>
              <span className="text-[var(--text-muted)]">Monthly reset: </span>
              <span className="text-[var(--text-primary)]">
                {limits.last_monthly_reset ? new Date(limits.last_monthly_reset).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}
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
    { id: 'profile' as const, label: 'Profile', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    )},
    { id: 'preferences' as const, label: 'Preferences', icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { id: 'usage' as const, label: 'Usage', icon: (
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
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Account</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage your account settings and preferences
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
                {tab.label}
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
