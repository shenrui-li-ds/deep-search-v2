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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();

  // Ref to track content for batched updates
  const contentRef = useRef<string>('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pro Search mode uses full LLM-based proofreading
  const useProofread = mode === 'pro';

  // Batched update function to reduce re-renders (50ms for smooth streaming)
  const scheduleContentUpdate = useCallback(() => {
    if (updateTimeoutRef.current) return;

    updateTimeoutRef.current = setTimeout(() => {
      setStreamingContent(contentRef.current);
      updateTimeoutRef.current = null;
    }, 50);
  }, []);

  // Stream content from a response
  const streamResponse = useCallback(async (
    response: Response,
    onChunk: (content: string) => void,
    onComplete: (fullContent: string) => void
  ) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

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
              if (data.done === true) break;
              fullContent += data.data;
              onChunk(fullContent);
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
    }

    onComplete(fullContent);
    return fullContent;
  }, []);

  // Smooth transition to new content
  const transitionToContent = useCallback((newContent: string, fetchedSources: Source[], fetchedImages: SearchImage[]) => {
    // Start fade out
    setIsTransitioning(true);

    // After fade out, update content and fade in
    setTimeout(() => {
      setStreamingContent(newContent);
      setSearchResult({
        query,
        content: newContent,
        sources: fetchedSources,
        images: fetchedImages
      });
      setLoadingStage('complete');

      // Small delay before starting fade in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 200); // Duration of fade out
  }, [query]);

  useEffect(() => {
    if (!query) return;

    // AbortController to cancel in-flight requests on cleanup (prevents React StrictMode double-execution issues)
    const abortController = new AbortController();
    let isActive = true; // Flag to prevent state updates from stale requests

    const performSearch = async () => {
      setLoadingStage('searching');
      setError(null);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setIsTransitioning(false);

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
          signal: abortController.signal
        });

        if (!isActive) return; // Check if effect was cleaned up

        if (!searchResponse.ok) {
          throw new Error('Search failed');
        }

        const searchData = await searchResponse.json();
        const fetchedSources: Source[] = searchData.sources || [];
        const fetchedImages: SearchImage[] = searchData.images || [];

        if (!isActive) return;

        if (fetchedSources.length === 0) {
          setError('No search results found');
          setLoadingStage('complete');
          return;
        }

        setSources(fetchedSources);
        setImages(fetchedImages);

        // Step 2: Summarize search results (stream for all modes)
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
          signal: abortController.signal
        });

        if (!isActive) return;

        if (!summarizeResponse.ok) {
          throw new Error('Summarization failed');
        }

        // Stream summarization to UI
        let summarizedContent = '';
        await streamResponse(
          summarizeResponse,
          (content) => {
            if (!isActive) return;
            contentRef.current = content;
            scheduleContentUpdate();
          },
          (fullContent) => {
            if (!isActive) return;
            // Clear any pending timeout
            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
              updateTimeoutRef.current = null;
            }
            summarizedContent = fullContent;
            const cleanedContent = cleanupFinalContent(fullContent);
            setStreamingContent(cleanedContent);
          }
        );

        if (!isActive) return;

        // Apply cleanup
        const cleanedContent = cleanupFinalContent(summarizedContent);

        if (useProofread) {
          // PRO MODE: Proofread in background, then smooth transition
          setLoadingStage('proofreading');

          const proofreadResponse = await fetch('/api/proofread', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: cleanedContent,
              mode: 'full',
              provider,
              stream: false // Non-streaming for simplicity
            }),
            signal: abortController.signal
          });

          if (!isActive) return;

          if (!proofreadResponse.ok) {
            // Fallback: use summarized content
            console.error('Proofread API failed, using summarized content');
            transitionToContent(cleanedContent, fetchedSources, fetchedImages);
            return;
          }

          const proofreadData = await proofreadResponse.json();
          const proofreadContent = proofreadData.proofread || cleanedContent;

          if (!isActive) return;

          // Smooth transition to proofread content
          transitionToContent(proofreadContent, fetchedSources, fetchedImages);

        } else {
          // NON-PRO MODE: Just set final result
          if (!isActive) return;
          setSearchResult({
            query,
            content: cleanedContent,
            sources: fetchedSources,
            images: fetchedImages
          });
          setLoadingStage('complete');
        }

      } catch (err) {
        // Ignore abort errors (expected when effect is cleaned up)
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!isActive) return;
        console.error('Search error:', err);
        setError('An error occurred while processing your search');
        setLoadingStage('complete');
      }
    };

    performSearch();

    return () => {
      isActive = false;
      abortController.abort();
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [query, provider, mode, deep, useProofread, scheduleContentUpdate, streamResponse, transitionToContent]);

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

  // Show "no results" only when complete and no result/sources
  if (loadingStage === 'complete' && !searchResult && sources.length === 0) {
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

  // Use a single SearchResultComponent for summarizing, proofreading, and complete stages
  // This prevents component remounting which causes visual flash
  const displayContent = loadingStage === 'complete' && searchResult
    ? searchResult.content
    : streamingContent;

  const displaySources = loadingStage === 'complete' && searchResult
    ? searchResult.sources
    : sources;

  const displayImages = loadingStage === 'complete' && searchResult
    ? searchResult.images
    : images;

  return (
    <SearchResultComponent
      query={query}
      result={{
        content: displayContent,
        sources: displaySources,
        images: displayImages?.map(image => ({
          url: image.url,
          alt: image.alt,
          sourceId: image.sourceId || ''
        }))
      }}
      isLoading={false}
      isSearching={loadingStage === 'searching'}
      isStreaming={loadingStage === 'summarizing'}
      isPolishing={loadingStage === 'proofreading'}
      isTransitioning={isTransitioning}
    />
  );
}
