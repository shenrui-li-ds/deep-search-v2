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
              <path d="M480-80q-155 0-269-103T82-440h81q15 121 105.5 200.5T480-160q134 0 227-93t93-227q0-134-93-227t-227-93q-86 0-159.5 42.5T204-640h116v80H88q29-140 139-230t253-90q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm112-232L440-464v-216h80v184l128 128-56 56Z" />
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
