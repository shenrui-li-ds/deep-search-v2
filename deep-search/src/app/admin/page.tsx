'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { useAuth } from '@/lib/supabase/auth-context';
import { getUserCredits, type UserCredits } from '@/lib/supabase/database';

// Debug tool result type
interface DebugResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Debug tool states
  const [sentryTestLoading, setSentryTestLoading] = useState(false);
  const [sentryTestResult, setSentryTestResult] = useState<DebugResult | null>(null);

  useEffect(() => {
    async function checkAdminAccess() {
      if (authLoading) return;

      if (!user) {
        router.push('/auth/login');
        return;
      }

      const userCredits = await getUserCredits();
      setCredits(userCredits);

      if (userCredits?.user_tier === 'admin') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }

      setLoading(false);
    }

    checkAdminAccess();
  }, [user, authLoading, router]);

  const handleSentryTest = async () => {
    setSentryTestLoading(true);
    setSentryTestResult(null);

    try {
      const response = await fetch('/api/admin/test-sentry');
      const data = await response.json();

      if (response.ok) {
        setSentryTestResult({
          success: true,
          message: data.message,
          details: data.details,
          timestamp: new Date().toISOString(),
        });
      } else {
        setSentryTestResult({
          success: false,
          message: data.error || 'Failed to trigger test error',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      setSentryTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Network error',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setSentryTestLoading(false);
    }
  };

  // Loading state
  if (loading || authLoading) {
    return (
      <MainLayout pageTitle="Admin">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-[var(--card)] rounded w-48 mb-4"></div>
            <div className="h-64 bg-[var(--card)] rounded"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Not admin
  if (isAdmin === false) {
    return (
      <MainLayout pageTitle="Admin">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h1 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h1>
            <p className="text-[var(--text-secondary)] mb-4">
              This page is only accessible to administrators.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Your current tier: <span className="font-medium">{credits?.user_tier || 'free'}</span>
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-6 px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Go Home
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Admin">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Admin Dashboard</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Debug tools and system administration
          </p>
        </div>

        {/* Admin Info Card */}
        <div className="bg-[var(--card)] rounded-xl p-6 mb-6 border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-[var(--text-primary)]">Admin Access</h2>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-[var(--text-muted)]">Tier:</span>{' '}
              <span className="text-amber-500 font-medium">Admin</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Credits:</span>{' '}
              <span className="text-[var(--text-primary)]">{credits?.total_available ?? 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Debug Tools Section */}
        <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Debug Tools</h2>

          {/* Sentry Test */}
          <div className="border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-[var(--text-primary)]">Test Sentry Integration</h3>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Trigger a test error to verify Sentry is capturing errors correctly.
                </p>
              </div>
              <button
                onClick={handleSentryTest}
                disabled={sentryTestLoading}
                className="ml-4 px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sentryTestLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Trigger Test Error
                  </>
                )}
              </button>
            </div>

            {/* Result */}
            {sentryTestResult && (
              <div className={`mt-4 p-3 rounded-lg ${sentryTestResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <div className="flex items-start gap-2">
                  {sentryTestResult.success ? (
                    <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <p className={`font-medium ${sentryTestResult.success ? 'text-green-500' : 'text-red-500'}`}>
                      {sentryTestResult.message}
                    </p>
                    {sentryTestResult.details && (
                      <pre className="mt-2 text-xs text-[var(--text-muted)] bg-[var(--background)] p-2 rounded overflow-x-auto">
                        {JSON.stringify(sentryTestResult.details, null, 2)}
                      </pre>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {new Date(sentryTestResult.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Placeholder for more tools */}
          <div className="mt-4 border border-dashed border-[var(--border)] rounded-lg p-4 text-center">
            <p className="text-sm text-[var(--text-muted)]">
              More debug tools coming soon...
            </p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-6 flex gap-4 text-sm">
          <a
            href="https://sentry.io"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            Sentry Dashboard
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline flex items-center gap-1"
          >
            Supabase Dashboard
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </MainLayout>
  );
}
