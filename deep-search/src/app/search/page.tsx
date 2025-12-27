import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { MainLayout } from '../../components/index';
import SearchClient from './search-client';

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    provider?: string;
    mode?: string;  // 'web' | 'pro' | 'brainstorm'
    deep?: string;
  }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || '';

  return {
    title: query ? `${query} - DeepSearch` : 'DeepSearch',
    description: `Search results for "${query}"`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || '';
  const provider = params.provider || 'deepseek';
  const mode = (params.mode || 'web') as 'web' | 'pro' | 'brainstorm';
  const deep = params.deep === 'true' || mode === 'pro';  // Pro mode enables deep search

  if (!query) {
    notFound();
  }

  return (
    <MainLayout>
      <Suspense fallback={<div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-t-2 border-teal-500"></div></div>}>
        <SearchClient
          query={query}
          provider={provider}
          mode={mode}
          deep={deep}
        />
      </Suspense>
    </MainLayout>
  );
}
