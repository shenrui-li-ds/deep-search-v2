"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface MobileHeaderProps {
  onMenuClick: () => void;
  title?: string;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ onMenuClick, title }) => {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[var(--background)] border-b border-[var(--border)]">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Hamburger menu */}
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--card)] transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo / Title */}
        <Link href="/" className="flex items-center gap-2">
          {title ? (
            <span className="text-base font-medium text-[var(--text-primary)] truncate max-w-[200px]">
              {title}
            </span>
          ) : (
            <>
              <Image
                src="/owl_google.svg"
                alt="Athenius"
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <span className="text-base font-semibold text-[var(--text-primary)]">Athenius</span>
            </>
          )}
        </Link>

        {/* New search button */}
        <Link
          href="/"
          className="p-2 -mr-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--card)] transition-colors"
          aria-label="New search"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </Link>
      </div>
    </header>
  );
};

export default MobileHeader;
