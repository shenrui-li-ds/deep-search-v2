'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ProviderLogo } from './shared';

export function PoweredBy() {
  const t = useTranslations('landing');

  const providers = ['OpenAI', 'Google Gemini', 'Anthropic Claude', 'DeepSeek', 'xAI Grok'];

  return (
    <section className="relative py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gray-500 mb-8 text-sm uppercase tracking-wider">{t('poweredBy.label')}</p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {providers.map((name) => (
            <ProviderLogo key={name} name={name} />
          ))}
        </div>
      </div>
    </section>
  );
}
