import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { MainLayout } from '../../components/index';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import SearchClient from './search-client';

// Valid values for URL params (prevents injection of arbitrary values)
const VALID_MODES = ['web', 'pro', 'brainstorm'] as const;
const VALID_PROVIDERS = ['deepseek', 'openai', 'grok', 'claude', 'gemini', 'gemini-pro', 'openai-mini', 'vercel-gateway'] as const;

type SearchMode = typeof VALID_MODES[number];
type SearchProvider = typeof VALID_PROVIDERS[number];

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    provider?: string;
    mode?: string;
    deep?: string;
    files?: string;
  }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || '';

  return {
    title: query ? `${query} - Athenius` : 'Athenius',
    description: `Search results for "${query}"`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || '';

  // Validate and sanitize provider param (default to deepseek if invalid)
  const rawProvider = params.provider || 'deepseek';
  const provider: SearchProvider = VALID_PROVIDERS.includes(rawProvider as SearchProvider)
    ? (rawProvider as SearchProvider)
    : 'deepseek';

  // Validate and sanitize mode param (default to web if invalid)
  const rawMode = params.mode || 'web';
  const mode: SearchMode = VALID_MODES.includes(rawMode as SearchMode)
    ? (rawMode as SearchMode)
    : 'web';

  // Deep mode is opt-in via URL param (strict boolean check)
  const deep = params.deep === 'true';

  // Parse attached file IDs (comma-separated UUIDs)
  const fileIds = params.files
    ? params.files.split(',').filter(id => id.trim().length > 0)
    : [];

  if (!query) {
    notFound();
  }

  return (
    <MainLayout pageTitle={query}>
      <ErrorBoundary>
        <Suspense fallback={<div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-t-2 border-teal-500"></div></div>}>
          <SearchClient
            query={query}
            provider={provider}
            mode={mode}
            deep={deep}
            fileIds={fileIds}
          />
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  );
}
