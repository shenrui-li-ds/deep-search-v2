'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useLanguage } from '@/context/LanguageContext';
import { APP_ICON } from '@/lib/branding';
import type { Locale } from '@/i18n/config';

interface NavbarProps {
  scrollY: number;
}

export function Navbar({ scrollY }: NavbarProps) {
  const t = useTranslations('landing');
  const { locale, setLocale } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleLanguage = () => {
    const newLocale: Locale = locale === 'en' ? 'zh' : 'en';
    setLocale(newLocale);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrollY > 50 || mobileMenuOpen ? 'bg-[#050508]/95 backdrop-blur-xl border-b border-white/[0.05]' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Image
            src={APP_ICON}
            alt="Athenius"
            width={36}
            height={36}
            className="app-icon w-8 h-8 sm:w-9 sm:h-9"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span className="text-lg sm:text-xl font-semibold tracking-tight text-white">Athenius</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden sm:flex items-center gap-4">
          <button
            onClick={toggleLanguage}
            className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-white/[0.05] transition-colors"
            title={locale === 'en' ? 'Switch to Chinese' : 'Switch to English'}
          >
            <span className={locale === 'en' ? 'text-white' : 'text-gray-500'}>EN</span>
            <span className="text-gray-500 mx-1">/</span>
            <span className={locale === 'zh' ? 'text-white' : 'text-gray-500'}>中文</span>
          </button>
          <Link
            href="/auth/login"
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            {t('nav.signIn')}
          </Link>
          <Link
            href="/auth/signup"
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300"
          >
            {t('nav.getStarted')}
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="sm:hidden p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-white/[0.05] bg-[#050508]/95 backdrop-blur-xl">
          <div className="px-4 py-4 space-y-3">
            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              <span className="text-gray-400">{locale === 'en' ? 'Language' : '语言'}</span>
              <span>
                <span className={locale === 'en' ? 'text-white' : 'text-gray-500'}>EN</span>
                <span className="text-gray-500 mx-1">/</span>
                <span className={locale === 'zh' ? 'text-white' : 'text-gray-500'}>中文</span>
              </span>
            </button>

            {/* Sign In */}
            <Link
              href="/auth/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
            >
              {t('nav.signIn')}
            </Link>

            {/* Get Started */}
            <Link
              href="/auth/signup"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2.5 text-sm text-center bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-all duration-300"
            >
              {t('nav.getStarted')}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
