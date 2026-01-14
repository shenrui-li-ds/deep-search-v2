'use client';

import React from 'react';
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

  const toggleLanguage = () => {
    const newLocale: Locale = locale === 'en' ? 'zh' : 'en';
    setLocale(newLocale);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrollY > 50 ? 'bg-[#050508]/80 backdrop-blur-xl border-b border-white/[0.05]' : ''
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={APP_ICON}
            alt="Athenius"
            width={36}
            height={36}
            className="app-icon"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span className="text-xl font-semibold tracking-tight text-white">Athenius</span>
        </Link>
        <div className="flex items-center gap-4">
          {/* Language Toggle */}
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
      </div>
    </nav>
  );
}
