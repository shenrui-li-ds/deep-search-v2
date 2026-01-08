"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth-context';

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

const NavItem = ({ href, icon, label, isActive }: NavItemProps) => (
  <Link
    href={href}
    className={`w-full flex flex-col items-center justify-center py-2 px-1 rounded-lg transition-colors ${
      isActive
        ? 'text-[var(--accent)] bg-[var(--card)]'
        : 'text-[var(--text-muted)] hover:bg-[var(--card)] hover:text-[var(--text-secondary)]'
    }`}
  >
    <div className="w-6 h-6 flex items-center justify-center">
      {icon}
    </div>
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </Link>
);

const Sidebar = () => {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const { user } = useAuth();
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="hidden md:flex w-[72px] h-screen bg-[var(--background)] border-r border-[var(--border)] flex-col items-center py-4 fixed left-0 top-0 z-50">
      {/* User Avatar - links to account */}
      <Link href="/account" className="mb-4" title={t('account')}>
        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-[var(--accent)]/20 hover:ring-2 hover:ring-[var(--accent)]/50 transition-all">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-[var(--accent)]">
              {user?.email?.charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </div>
      </Link>

      {/* New Search Button */}
      <Link
        href="/"
        className="w-full flex flex-col items-center justify-center py-2 px-1 text-[var(--text-muted)] hover:bg-[var(--card)] hover:text-[var(--text-secondary)] rounded-lg transition-colors mb-2"
      >
        <div className="w-6 h-6 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-[10px] mt-1 font-medium">{t('newSearch')}</span>
      </Link>

      {/* Navigation Items */}
      <nav className="w-full flex flex-col items-center space-y-1 px-2">
        <NavItem
          href="/"
          label={t('home')}
          isActive={pathname === '/'}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
        />

        <NavItem
          href="/library"
          label={t('library')}
          isActive={pathname === '/library' || pathname.startsWith('/library/')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />
      </nav>

      {/* Bottom Items */}
      <div className="mt-auto w-full flex flex-col items-center space-y-1 px-2">
        {/* Language Toggle */}
        <div className="w-full flex flex-col items-center justify-center py-2 px-1">
          <LanguageToggle size="sm" />
        </div>

        {/* Theme Toggle */}
        <div className="w-full flex flex-col items-center justify-center py-2 px-1">
          <ThemeToggle />
          <span className="text-[10px] mt-1 font-medium text-[var(--text-muted)]">{t('theme')}</span>
        </div>

        <NavItem
          href="/account"
          label={t('account')}
          isActive={pathname === '/account'}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />
      </div>
    </div>
  );
};

export default Sidebar;
