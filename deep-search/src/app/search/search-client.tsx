"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, Source, SearchImage } from '@/lib/types';
import SearchResultComponent from '@/components/SearchResult';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cleanupFinalContent } from '@/lib/text-cleanup';

interface SearchClientProps {
  query: string;
  provider?: string;
  mode?: 'web' | 'focus' | 'pro';
  deep?: boolean;
}

type LoadingStage = 'searching' | 'summarizing' | 'proofreading' | 'complete';

export default function SearchClient({ query, provider = 'deepseek', mode = 'web', deep = false }: SearchClientProps) {
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('searching');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [sources, setSources] = useState<Source[]>([]);
  const [images, setImages] = useState<SearchImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Ref to track content for batched updates
  const contentRef = useRef<string>('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pro Search mode uses full LLM-based proofreading
  const useProofread = mode === 'pro';

  // Proofread full content
  const proofreadContent = useCallback(async (content: string): Promise<string> => {
    try {
      const response = await fetch('/api/proofread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: 'full',
          provider
        }),
      });

      if (!response.ok) {
        console.error('Proofread API failed, using original content');
        return content;
      }

      const data = await response.json();
      return data.proofread || content;
    } catch (err) {
      console.error('Error proofreading:', err);
      return content;
    }
  }, [provider]);

  // Batched update function to reduce re-renders
  const scheduleContentUpdate = useCallback(() => {
    if (updateTimeoutRef.current) return; // Already scheduled

    updateTimeoutRef.current = setTimeout(() => {
      setStreamingContent(contentRef.current);
      updateTimeoutRef.current = null;
    }, 50); // Update every 50ms max
  }, []);

  useEffect(() => {
    if (!query) return;

    const performSearch = async () => {
      setLoadingStage('searching');
      setError(null);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);

      try {
        // Step 1: Perform search via Tavily
        const searchResponse = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            searchDepth: deep ? 'advanced' : 'basic',
            maxResults: deep ? 15 : 10
          }),
        });

        if (!searchResponse.ok) {
          throw new Error('Search failed');
        }

        const searchData = await searchResponse.json();
        const fetchedSources: Source[] = searchData.sources || [];
        const fetchedImages: SearchImage[] = searchData.images || [];

        if (fetchedSources.length === 0) {
          setError('No search results found');
          setLoadingStage('complete');
          return;
        }

        // Store sources and images for display
        setSources(fetchedSources);
        setImages(fetchedImages);

        // Step 2: Summarize search results with streaming
        setLoadingStage('summarizing');

        const summarizeResponse = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            results: searchData.rawResults.results,
            stream: true,
            provider
          }),
        });

        if (!summarizeResponse.ok) {
          throw new Error('Summarization failed');
        }

        // Stream content with batched updates
        const reader = summarizeResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(5));

                  if (data.done === true) {
                    break;
                  }

                  // Accumulate content in ref (doesn't trigger re-render)
                  contentRef.current += data.data;
                  // Schedule batched update
                  scheduleContentUpdate();

                } catch (e) {
                  console.error('Error parsing stream:', e);
                }
              }
            }
          }
        }

        // Clear any pending timeout and do final update
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
          updateTimeoutRef.current = null;
        }
        setStreamingContent(contentRef.current);

        // Apply client-side cleanup
        let finalContent = cleanupFinalContent(contentRef.current);

        // Step 3: Proofread if Pro Search mode
        if (useProofread && finalContent.length > 0) {
          setLoadingStage('proofreading');
          finalContent = await proofreadContent(finalContent);
        }

        // Step 4: Set final result
        setSearchResult({
          query,
          content: finalContent,
          sources: fetchedSources,
          images: fetchedImages
        });
        setLoadingStage('complete');

      } catch (err) {
        console.error('Search error:', err);
        setError('An error occurred while processing your search');
        setLoadingStage('complete');
      }
    };

    performSearch();

    // Cleanup timeout on unmount
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [query, provider, mode, deep, useProofread, proofreadContent, scheduleContentUpdate]);

  // Show search stage loading
  if (loadingStage === 'searching') {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-8">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-6">{query}</h1>

          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[var(--accent)] text-white">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <span className="text-sm text-[var(--text-primary)] font-medium">
              Searching the web...
            </span>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[var(--text-muted)]">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
            <span className="text-sm">Finding relevant sources...</span>
          </div>
        </Card>
      </div>
    );
  }

  // Show streaming content during summarizing or proofreading
  if (loadingStage === 'summarizing' || loadingStage === 'proofreading') {
    return (
      <SearchResultComponent
        query={query}
        result={{
          content: streamingContent,
          sources: sources,
          images: images.map(image => ({
            url: image.url,
            alt: image.alt,
            sourceId: image.sourceId || ''
          }))
        }}
        isLoading={false}
        isStreaming={true}
        isPolishing={loadingStage === 'proofreading'}
      />
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-8 text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Something went wrong</h2>
          <p className="text-[var(--text-muted)] mb-6">{error}</p>
          <Button onClick={() => router.push('/')}>
            Try a different search
          </Button>
        </Card>
      </div>
    );
  }

  if (!searchResult) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-8 text-center">
          <div className="mb-4">
            <svg className="w-12 h-12 mx-auto text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No results found</h2>
          <p className="text-[var(--text-muted)] mb-6">We couldn&apos;t find any results for your search. Try different keywords.</p>
          <Button onClick={() => router.push('/')}>
            Try a different search
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <SearchResultComponent
      query={query}
      result={{
        content: searchResult.content,
        sources: searchResult.sources,
        images: searchResult.images?.map(image => ({
          url: image.url,
          alt: image.alt,
          sourceId: image.sourceId || ''
        }))
      }}
      isLoading={false}
    />
  );
}
