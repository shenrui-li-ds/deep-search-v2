import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { MainLayout, RelatedQuestions, RelatedResources } from '../../components/index';
import SearchClient from './search-client';

// Mock data for development purposes - we'll keep these for the related sections
const mockRelatedQuestions = [
  "What makes Oceiot's design unique compared to other quantum chips?",
  "How does Oceiot's implementation of cat qubits improve its functionality?",
  "What are the potential challenges Amazon might face with Oceiot?",
  "How does Oceiot's error correction mechanism work in practical terms?",
  "When will Oceiot be available for commercial use?"
];

const mockRelatedResources = [
  {
    id: 'r1',
    title: 'Quantum Computing: An Overview',
    description: 'A comprehensive guide to quantum computing principles',
    imageUrl: 'https://via.placeholder.com/150?text=Quantum+Computing',
    url: 'https://example.com/quantum-computing'
  },
  {
    id: 'r2',
    title: 'Error Correction in Quantum Systems',
    description: 'Learn about various strategies for quantum error correction',
    imageUrl: 'https://via.placeholder.com/150?text=Error+Correction',
    url: 'https://example.com/quantum-error-correction'
  },
  {
    id: 'r3',
    title: 'AWS Quantum Computing Services',
    description: "Overview of Amazon's quantum computing offerings",
    imageUrl: 'https://via.placeholder.com/150?text=AWS+Quantum',
    url: 'https://example.com/aws-quantum'
  }
];

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    provider?: string;
    mode?: string;  // 'web' | 'focus' | 'pro'
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
  const mode = (params.mode || 'web') as 'web' | 'focus' | 'pro';
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
        
        <div className="max-w-4xl mx-auto px-6">
          <RelatedQuestions questions={mockRelatedQuestions} />
          <RelatedResources resources={mockRelatedResources} />
        </div>
      </Suspense>
    </MainLayout>
  );
}
