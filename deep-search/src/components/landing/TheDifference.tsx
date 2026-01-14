'use client';

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { APP_ICON } from '@/lib/branding';
import { GlassCard } from './shared';

export function TheDifference() {
  const t = useTranslations('landing');

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            {t('difference.title.before')}{' '}
            <span className="text-gray-500 line-through">{t('difference.title.strikethrough')}</span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {t('difference.subtitle')}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Traditional search */}
          <GlassCard className="p-8 opacity-50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="text-gray-400 font-medium">{t('difference.traditional.title')}</span>
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-gray-600" />
                  <div className="h-3 bg-gray-700/50 rounded flex-1" style={{ width: `${70 + Math.random() * 30}%` }} />
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-sm mt-6">{t('difference.traditional.description')}</p>
          </GlassCard>

          {/* Athenius */}
          <GlassCard className="p-8 border-cyan-500/20 shadow-lg shadow-cyan-500/10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                <Image src={APP_ICON} alt="Athenius" width={24} height={24} className="app-icon" style={{ filter: 'brightness(0) invert(1)' }} />
              </div>
              <span className="text-cyan-400 font-medium">{t('difference.athenius.title')}</span>
            </div>
            <div className="space-y-4">
              <p className="text-white leading-relaxed">
                {t('difference.athenius.preview')}
              </p>
              <div className="flex flex-wrap gap-2">
                {['Nature', 'MIT', 'ArXiv'].map((source) => (
                  <span key={source} className="px-2 py-1 text-xs rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {source}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-cyan-400/70 text-sm mt-6">{t('difference.athenius.description')}</p>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
