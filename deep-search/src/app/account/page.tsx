'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import { useAuth } from '@/lib/supabase/auth-context';

export default function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

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

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Account</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage your account settings
          </p>
        </div>

        {/* User Info Card */}
        <div className="p-6 rounded-lg bg-[var(--card)] border border-[var(--border)] mb-6">
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

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 px-4 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg font-medium hover:bg-rose-500/20 transition-colors"
        >
          Sign out
        </button>

        {/* Feature preview */}
        <div className="mt-12">
          <h3 className="text-lg font-medium text-[var(--text-primary)] mb-4">Coming Soon</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Sync History</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Access your search history across all your devices
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Save Favorites</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Bookmark important searches for quick access
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Preferences</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Customize default providers and search settings
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Usage Stats</h4>
              <p className="text-sm text-[var(--text-muted)]">
                View your search statistics and API usage
              </p>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
