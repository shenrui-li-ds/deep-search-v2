'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { GlassCard } from './shared';

export function ThinkingPanel() {
  const t = useTranslations('landing');

  const researchPlan = [
    { type: 'product_discovery', query: t('thinking.plan.item1') },
    { type: 'feature_comparison', query: t('thinking.plan.item2') },
    { type: 'expert_reviews', query: t('thinking.plan.item3') },
    { type: 'user_experiences', query: t('thinking.plan.item4') },
  ];

  const gaps = [
    { text: t('thinking.gaps.item1'), query: t('thinking.gaps.query1') },
    { text: t('thinking.gaps.item2'), query: t('thinking.gaps.query2') },
  ];

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            {t('thinking.title')}
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {t('thinking.subtitle')}
          </p>
        </div>

        <div className="max-w-4xl mx-auto relative">
          {/* Main thinking panel card */}
          <GlassCard className="p-0 overflow-hidden" hover={false}>
            {/* Header with loading state */}
            <div className="px-6 py-4 border-b border-white/[0.05] bg-purple-500/5">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                <span className="text-purple-400 font-medium">{t('thinking.header')}</span>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Research Approach */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="text-white font-medium">{t('thinking.approach.label')}</span>
                </div>
                <span className="text-gray-400">{t('thinking.approach.type')}</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  {t('thinking.approach.badge')}
                </span>
              </div>

              {/* AI suggestion */}
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
                <span>{t('thinking.aiSuggestion')}</span>
              </div>

              {/* Research Plan */}
              <div>
                <h4 className="text-gray-400 text-sm font-medium mb-3">{t('thinking.planLabel')}</h4>
                <div className="space-y-2">
                  {researchPlan.map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <span className="text-purple-400 font-mono text-sm mt-0.5">{index + 1}</span>
                      <div>
                        <span className="text-purple-400 text-sm">{item.type}:</span>
                        <span className="text-white text-sm ml-2">{item.query}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/[0.05]" />

              {/* Deepening research on gaps */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="text-gray-400 text-sm">{t('thinking.gapsLabel')}</span>
                </div>
                <div className="space-y-4">
                  {gaps.map((gap, index) => (
                    <div key={index} className="pl-6 border-l-2 border-amber-500/30">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-amber-400 mt-1">+</span>
                        <p className="text-gray-300 text-sm leading-relaxed">{gap.text}</p>
                      </div>
                      <p className="text-gray-500 text-xs ml-4 mt-1 font-mono">{gap.query}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Glow effect */}
          <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-blue-500/10 to-cyan-500/20 rounded-3xl blur-3xl -z-10" />
        </div>
      </div>
    </section>
  );
}
