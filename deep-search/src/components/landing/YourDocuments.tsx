'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { GlassCard, DocFeature } from './shared';

export function YourDocuments() {
  const t = useTranslations('landing');

  const files = [
    { name: 'Q3-Financial-Report.pdf', pages: 48, color: 'text-red-400', bg: 'bg-red-500/10' },
    { name: 'Product-Roadmap.docx', pages: 12, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { name: 'Meeting-Notes.md', pages: 3, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left side - Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-emerald-400 font-medium">{t('docs.badge')}</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              {t('docs.title.line1')}
              <br />
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                {t('docs.title.line2')}
              </span>
            </h2>

            <p className="text-xl text-gray-400 mb-10 leading-relaxed">
              {t('docs.subtitle')}
            </p>

            <div className="space-y-6">
              <DocFeature
                icon={
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                }
                title={t('docs.features.upload.title')}
                description={t('docs.features.upload.description')}
              />
              <DocFeature
                icon={
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                }
                title={t('docs.features.citations.title')}
                description={t('docs.features.citations.description')}
              />
              <DocFeature
                icon={
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                }
                title={t('docs.features.hybrid.title')}
                description={t('docs.features.hybrid.description')}
              />
            </div>
          </div>

          {/* Right side - Visual */}
          <div className="relative">
            <GlassCard className="p-8" hover={false}>
              {/* File list preview */}
              <div className="space-y-3 mb-6">
                {files.map((file) => (
                  <div key={file.name} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <div className={`w-8 h-8 rounded ${file.bg} flex items-center justify-center`}>
                      <svg className={`w-4 h-4 ${file.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{file.name}</p>
                      <p className="text-gray-500 text-xs">{file.pages} {t('docs.preview.pages')}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                ))}
              </div>

              {/* Query preview */}
              <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-gray-400 text-sm mb-2">{t('docs.preview.queryLabel')}</p>
                <p className="text-white font-medium mb-4">{t('docs.preview.query')}</p>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 text-xs rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {t('docs.preview.citation')}
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-cyan-500/20 rounded-3xl blur-3xl -z-10" />
          </div>
        </div>
      </div>
    </section>
  );
}
