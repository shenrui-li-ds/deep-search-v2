"use client";

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface SearchLoadingProps {
  query?: string;
}

const SearchLoading: React.FC<SearchLoadingProps> = ({ query }) => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Animated Tabs Skeleton */}
      <div className="flex items-center gap-6 mb-6 border-b border-[var(--border)]">
        <div className="pb-3 relative">
          <Skeleton className="h-5 w-20" />
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] animate-pulse" />
        </div>
        <div className="pb-3">
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="pb-3">
          <Skeleton className="h-5 w-18" />
        </div>
        <div className="ml-auto">
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>

      {/* Query Title */}
      {query ? (
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-4">{query}</h1>
      ) : (
        <Skeleton className="h-8 w-2/3 mb-4" />
      )}

      {/* Sources Loading Animation */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Searching sources...</span>
          </div>
        </div>

        {/* Source Pills Skeleton */}
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-lg" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>

      <Separator className="mb-6" />

      {/* Content Loading Animation */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-[var(--accent)]">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="font-medium">Analyzing results...</span>
          </div>
        </div>

        {/* Paragraph Skeletons with staggered animation */}
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>

        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="mt-8 flex items-center justify-center">
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-[var(--border)]"></div>
            <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin"></div>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-[var(--text-primary)]">Processing your query</p>
            <p className="text-xs text-[var(--text-muted)]">Synthesizing information from multiple sources</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchLoading;
