"use client";

import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { localeNames, type Locale } from '@/i18n/config';

interface LanguageToggleProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LanguageToggle: React.FC<LanguageToggleProps> = ({ className = '', size = 'md' }) => {
  const { locale, setLocale, isLoading } = useLanguage();

  const toggleLanguage = () => {
    const newLocale: Locale = locale === 'en' ? 'zh' : 'en';
    setLocale(newLocale);
  };

  const currentName = localeNames[locale];
  const nextLocale: Locale = locale === 'en' ? 'zh' : 'en';
  const nextName = localeNames[nextLocale];

  // Fixed label showing both languages with current one highlighted
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1.5',
    lg: 'text-base px-3 py-2',
  };

  return (
    <button
      onClick={toggleLanguage}
      disabled={isLoading}
      className={`rounded-lg transition-colors hover:bg-[var(--card-hover)] disabled:opacity-50 font-medium ${sizeClasses[size]} ${className}`}
      title={`Switch to ${nextName}`}
      aria-label={`Current language: ${currentName}. Click to switch to ${nextName}`}
    >
      <span className={locale === 'en' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
        EN
      </span>
      <span className="text-[var(--text-muted)] mx-0.5">/</span>
      <span className={locale === 'zh' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
        中文
      </span>
    </button>
  );
};

export default LanguageToggle;
