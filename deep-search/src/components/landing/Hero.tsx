'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GlassCard } from './shared';

export function Hero() {
  const t = useTranslations('landing');

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 pt-20">
      <div className="max-w-5xl mx-auto text-center">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.1] mb-8 opacity-0 landing-fade-in"
          style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm text-gray-300">{t('hero.badge')}</span>
        </div>

        {/* Main headline */}
        <h1
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-8 opacity-0 landing-fade-in"
          style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}
        >
          <span className="bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
            {t('hero.headline1')}
          </span>
          <br />
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            {t('hero.headline2')}
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed opacity-0 landing-fade-in"
          style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}
        >
          {t('hero.subheadline')}
        </p>

        {/* CTA buttons */}
        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 opacity-0 landing-fade-in"
          style={{ animationDelay: '800ms', animationFillMode: 'forwards' }}
        >
          <Link
            href="/auth/signup"
            className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-semibold text-lg hover:shadow-xl hover:shadow-cyan-500/30 transition-all duration-300 flex items-center gap-2"
          >
            {t('hero.cta.primary')}
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <a
            href="#how-it-works"
            className="px-8 py-4 rounded-xl font-semibold text-lg border border-white/[0.1] hover:bg-white/[0.05] transition-all duration-300"
          >
            {t('hero.cta.secondary')}
          </a>
        </div>

        {/* Animated search preview */}
        <div
          className="relative max-w-2xl mx-auto opacity-0 landing-fade-in-up"
          style={{ animationDelay: '1000ms', animationFillMode: 'forwards' }}
        >
          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <div className="text-white font-medium">{t('hero.preview.query')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                {t('hero.preview.step1')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {t('hero.preview.step2')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                {t('hero.preview.step3')}
              </span>
            </div>
          </GlassCard>
          {/* Glow effect */}
          <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 rounded-3xl blur-2xl -z-10" />
        </div>
      </div>
    </section>
  );
}
