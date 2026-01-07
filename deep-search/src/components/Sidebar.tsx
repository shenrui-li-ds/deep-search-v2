"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import { getUserCredits } from '@/lib/supabase/database';

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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const credits = await getUserCredits();
      setIsAdmin(credits?.user_tier === 'admin');
    }
    checkAdmin();
  }, []);

  return (
    <div className="hidden md:flex w-[72px] h-screen bg-[var(--background)] border-r border-[var(--border)] flex-col items-center py-4 fixed left-0 top-0 z-50">
      {/* Logo */}
      <Link href="/" className="mb-4">
        <div className="w-10 h-10 flex items-center justify-center">
          <Image
            src="/owl_google.svg"
            alt="Athenius"
            width={28}
            height={28}
            className="w-7 h-7"
          />
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
        <span className="text-[10px] mt-1 font-medium">New</span>
      </Link>

      {/* Navigation Items */}
      <nav className="w-full flex flex-col items-center space-y-1 px-2">
        <NavItem
          href="/"
          label="Home"
          isActive={pathname === '/'}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          }
        />

        <NavItem
          href="/library"
          label="Library"
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
        <div className="w-full flex flex-col items-center justify-center py-2 px-1">
          <ThemeToggle />
          <span className="text-[10px] mt-1 font-medium text-[var(--text-muted)]">Theme</span>
        </div>

        {/* Admin link - only visible to admin users */}
        {isAdmin && (
          <NavItem
            href="/admin"
            label="Admin"
            isActive={pathname === '/admin'}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
        )}

        <NavItem
          href="/account"
          label="Account"
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
