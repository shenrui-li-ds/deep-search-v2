'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GlassCard } from './shared';

export function FinalCTA() {
  const t = useTranslations('landing');

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <GlassCard className="p-12 md:p-16" hover={false}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            {t('cta.title')}
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-xl mx-auto">
            {t('cta.subtitle')}
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-semibold text-lg hover:shadow-xl hover:shadow-cyan-500/30 transition-all duration-300"
          >
            {t('cta.button')}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <p className="text-gray-500 text-sm mt-6">{t('cta.note')}</p>
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl blur-3xl -z-10" />
        </GlassCard>
      </div>
    </section>
  );
}
