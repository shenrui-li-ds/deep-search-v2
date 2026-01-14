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
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 -960 960 960" fill="currentColor">
              <path d="M120-560v-240h80v94q51-64 124.5-99T480-840q150 0 255 105t105 255h-80q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120Zm2 120h82q12 93 76.5 157.5T435-204l48 84q-138 0-242-91.5T122-440Zm412 70-94-94v-216h80v184l56 56-42 70ZM719 0l-12-60q-12-5-22.5-10.5T663-84l-58 18-40-68 46-40q-2-13-2-26t2-26l-46-40 40-68 58 18q11-8 21.5-13.5T707-340l12-60h80l12 60q12 5 23 11.5t21 14.5l58-20 40 70-46 40q2 13 2 25t-2 25l46 40-40 68-58-18q-11 8-21.5 13.5T811-60L799 0h-80Zm40-120q33 0 56.5-23.5T839-200q0-33-23.5-56.5T759-280q-33 0-56.5 23.5T679-200q0 33 23.5 56.5T759-120Z" />
            </svg>
          }
        />

        <NavItem
          href="/files"
          label={t('files')}
          isActive={pathname === '/files' || pathname.startsWith('/files/')}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
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
