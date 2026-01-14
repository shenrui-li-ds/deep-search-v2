'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Step } from './shared';

export function HowItWorks() {
  const t = useTranslations('landing');

  return (
    <section id="how-it-works" className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
            {t('howItWorks.title')}
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>
        </div>

        <div className="space-y-2">
          <Step
            number={1}
            title={t('howItWorks.steps.understand.title')}
            description={t('howItWorks.steps.understand.description')}
            delay={0}
          />
          <Step
            number={2}
            title={t('howItWorks.steps.research.title')}
            description={t('howItWorks.steps.research.description')}
            delay={100}
          />
          <Step
            number={3}
            title={t('howItWorks.steps.synthesize.title')}
            description={t('howItWorks.steps.synthesize.description')}
            delay={200}
          />
          <Step
            number={4}
            title={t('howItWorks.steps.cite.title')}
            description={t('howItWorks.steps.cite.description')}
            isLast
            delay={300}
          />
        </div>
      </div>
    </section>
  );
}
