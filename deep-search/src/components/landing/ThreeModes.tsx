'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ModeCard } from './shared';

export function ThreeModes() {
  const t = useTranslations('landing');

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            {t('modes.title')}
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {t('modes.subtitle')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <ModeCard
            icon={
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            }
            title={t('modes.web.title')}
            description={t('modes.web.description')}
            gradient="from-cyan-500 to-cyan-600"
            delay={0}
          />
          <ModeCard
            icon={
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
            title={t('modes.research.title')}
            description={t('modes.research.description')}
            gradient="from-purple-500 to-purple-600"
            delay={100}
          />
          <ModeCard
            icon={
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
            title={t('modes.brainstorm.title')}
            description={t('modes.brainstorm.description')}
            gradient="from-orange-500 to-orange-600"
            delay={200}
          />
        </div>
      </div>
    </section>
  );
}
