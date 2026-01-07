"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type Locale, defaultLocale, locales } from '@/i18n/config';
import { updateUserPreferences } from '@/lib/supabase/database';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Cookie helpers
function getLocaleCookie(): Locale | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
  const value = match?.[1];
  return value && locales.includes(value as Locale) ? (value as Locale) : null;
}

function setLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  // Set cookie with 1 year expiry, accessible across the site
  document.cookie = `locale=${locale}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
}

// Detect browser language and map to supported locale
function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return defaultLocale;

  // Get browser languages (ordered by preference)
  const browserLanguages = navigator.languages || [navigator.language];

  for (const lang of browserLanguages) {
    const langLower = lang.toLowerCase();
    // Check for Chinese variants
    if (langLower.startsWith('zh')) {
      return 'zh';
    }
    // Check for English
    if (langLower.startsWith('en')) {
      return 'en';
    }
  }

  return defaultLocale;
}

interface LanguageProviderProps {
  children: React.ReactNode;
  initialLocale?: Locale;
}

export function LanguageProvider({ children, initialLocale }: LanguageProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || defaultLocale);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from cookie on mount, or auto-detect on first visit
  useEffect(() => {
    const cookieLocale = getLocaleCookie();
    if (cookieLocale) {
      // Use saved preference
      setLocaleState(cookieLocale);
    } else {
      // First visit: auto-detect from browser and save
      const detectedLocale = detectBrowserLocale();
      setLocaleState(detectedLocale);
      setLocaleCookie(detectedLocale);
    }
    setIsLoading(false);
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    setLocaleCookie(newLocale);

    // Persist to database (fire and forget)
    updateUserPreferences({ language: newLocale }).catch((err) => {
      console.error('Failed to save language preference:', err);
    });

    // Reload the page to apply the new locale to server components
    // This is necessary because next-intl reads from cookies on the server
    window.location.reload();
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
