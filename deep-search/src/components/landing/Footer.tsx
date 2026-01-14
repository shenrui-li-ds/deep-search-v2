'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { APP_ICON } from '@/lib/branding';

const GITHUB_URL = 'https://github.com/shenrui-li-ds/athenius-search';

export function Footer() {
  const t = useTranslations('landing');

  return (
    <footer className="relative py-12 px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image
            src={APP_ICON}
            alt="Athenius"
            width={28}
            height={28}
            className="app-icon opacity-60"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <span className="text-gray-400">Athenius</span>
        </div>
        <div className="flex items-center gap-8 text-sm text-gray-500">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            GitHub
          </a>
          <Link href="/auth/login" className="hover:text-gray-300 transition-colors">{t('footer.signIn')}</Link>
          <Link href="/auth/signup" className="hover:text-gray-300 transition-colors">{t('footer.signUp')}</Link>
        </div>
        <p className="text-sm text-gray-600">
          &copy; {new Date().getFullYear()} Athenius. {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
