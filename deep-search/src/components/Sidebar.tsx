"use client";

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';

const Sidebar = () => {
  return (
    <div className="w-16 h-screen bg-[var(--background)] border-r border-[var(--border)] flex flex-col items-center py-4 fixed left-0 top-0 z-50">
      {/* Logo */}
      <Link href="/" className="mb-6">
        <div className="w-10 h-10 flex items-center justify-center">
          <Image
            src="/owl_google.svg"
            alt="Deep Search"
            width={28}
            height={28}
            className="w-7 h-7"
          />
        </div>
      </Link>

      {/* New Thread */}
      <button className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg mb-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Navigation Items */}
      <nav className="flex flex-col items-center space-y-1">
        <Link href="/" className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg" title="Home">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>

        <Link href="/discover" className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg" title="Discover">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </Link>

        <Link href="/spaces" className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg" title="Spaces">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </Link>

        <Link href="/library" className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg" title="Library">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </Link>
      </nav>

      {/* Bottom Items */}
      <div className="mt-auto flex flex-col items-center space-y-1">
        <ThemeToggle />
        <button className="w-10 h-10 flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] rounded-lg" title="Account">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
