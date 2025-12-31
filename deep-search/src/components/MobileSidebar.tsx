"use client";

import React, { useEffect, useCallback, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '@/lib/supabase/auth-context';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}

const NavItem = ({ href, icon, label, isActive, onClick }: NavItemProps) => (
  <Link
    href={href}
    onClick={onClick}
    className={`w-full flex items-center gap-3 py-3 px-4 rounded-xl transition-colors ${
      isActive
        ? 'text-[var(--accent)] bg-[var(--accent)]/10'
        : 'text-[var(--text-secondary)] hover:bg-[var(--card)]'
    }`}
  >
    <div className="w-6 h-6 flex items-center justify-center">
      {icon}
    </div>
    <span className="text-sm font-medium">{label}</span>
  </Link>
);

const MobileSidebar: React.FC<MobileSidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [isClosing, setIsClosing] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Touch handling for swipe gesture
  const sidebarRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Handle open/close state transitions
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setIsClosing(false);
    }
  }, [isOpen]);

  // Close with animation
  const handleClose = useCallback((skipAnimation = false) => {
    if (skipAnimation) {
      // Immediate close (used for swipe gesture)
      setShouldRender(false);
      onClose();
    } else {
      // Animated close (used for button/backdrop click)
      setIsClosing(true);
      setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
        onClose();
      }, 200); // Match animation duration
    }
  }, [onClose]);

  // Close on escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  // Touch handlers for swipe gesture
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.touches[0].clientX;

    const deltaX = touchCurrentX.current - touchStartX.current;

    // Only allow dragging left (negative delta)
    if (deltaX < 0 && sidebarRef.current) {
      // Apply transform directly for smooth dragging
      sidebarRef.current.style.transform = `translateX(${deltaX}px)`;
      sidebarRef.current.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const deltaX = touchCurrentX.current - touchStartX.current;
    const threshold = -80; // Swipe distance needed to close

    if (deltaX < threshold) {
      // Swipe was far enough - animate to fully closed position, then remove
      if (sidebarRef.current) {
        sidebarRef.current.style.transition = 'transform 0.15s ease-out';
        sidebarRef.current.style.transform = 'translateX(-100%)';
      }
      // Wait for animation to complete, then close without additional animation
      setTimeout(() => {
        handleClose(true);
      }, 150);
    } else {
      // Swipe wasn't far enough - snap back to open position
      if (sidebarRef.current) {
        sidebarRef.current.style.transition = 'transform 0.15s ease-out';
        sidebarRef.current.style.transform = 'translateX(0)';
        // Clean up after snap-back animation
        setTimeout(() => {
          if (sidebarRef.current) {
            sidebarRef.current.style.transform = '';
            sidebarRef.current.style.transition = '';
          }
        }, 150);
      }
    }
  }, [handleClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (shouldRender && !isClosing) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [shouldRender, isClosing, handleKeyDown]);

  const handleSignOut = async () => {
    await signOut();
    handleClose();
  };

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={() => handleClose()}
      />

      {/* Sidebar - compact width */}
      <div
        ref={sidebarRef}
        className={`absolute top-0 left-0 bottom-0 w-56 bg-[var(--background)] shadow-xl flex flex-col ${
          isClosing ? 'animate-slide-out-left' : 'animate-slide-in-left'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator */}
        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-12 bg-[var(--border)] rounded-full opacity-50" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <Link href="/" onClick={() => handleClose()} className="flex items-center gap-2">
            <Image
              src="/owl_google.svg"
              alt="Athenius"
              width={28}
              height={28}
              className="w-7 h-7"
            />
            <span className="text-lg font-semibold text-[var(--text-primary)]">Athenius</span>
          </Link>
          <button
            onClick={() => handleClose()}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--card)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem
            href="/"
            label="Home"
            isActive={pathname === '/'}
            onClick={() => handleClose()}
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
            onClick={() => handleClose()}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
          />

          <NavItem
            href="/account"
            label="Account"
            isActive={pathname === '/account'}
            onClick={() => handleClose()}
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
          />
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] space-y-3">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-sm text-[var(--text-secondary)]">Theme</span>
            <ThemeToggle />
          </div>

          {/* User info / Sign out */}
          {user && (
            <div className="px-4 py-2">
              <p className="text-xs text-[var(--text-muted)] truncate mb-2">{user.email}</p>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 text-sm text-[var(--text-secondary)] bg-[var(--card)] hover:bg-[var(--card-hover)] rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MobileSidebar;
