"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, Source, SearchImage } from '@/lib/types';
import SearchResultComponent from '@/components/SearchResult';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cleanupFinalContent } from '@/lib/text-cleanup';
import { addSearchToHistory, canPerformSearch } from '@/lib/supabase/database';

interface SearchClientProps {
  query: string;
  provider?: string;
  mode?: 'web' | 'pro' | 'brainstorm';
  deep?: boolean;
}

type LoadingStage = 'refining' | 'searching' | 'summarizing' | 'proofreading' | 'complete' | 'planning' | 'researching' | 'synthesizing' | 'reframing' | 'exploring' | 'ideating';

export default function SearchClient({ query, provider = 'deepseek', mode = 'web', deep = false }: SearchClientProps) {
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('searching');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [sources, setSources] = useState<Source[]>([]);
  const [images, setImages] = useState<SearchImage[]>([]);
  const [relatedSearches, setRelatedSearches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();

  // Ref to track content for batched updates
  const contentRef = useRef<string>('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
  const transitionToContent = useCallback((newContent: string, fetchedSources: Source[], fetchedImages: SearchImage[], searchMode: 'web' | 'pro' | 'brainstorm', searchProvider: string) => {
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

      // Save to search history
      addSearchToHistory({
        query,
        provider: searchProvider,
        mode: searchMode,
        sources_count: fetchedSources.length
      }).catch(err => console.error('Failed to save to history:', err));

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

    // Research pipeline for Pro mode
    const performResearch = async () => {
      setLoadingStage('planning');
      setError(null);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);

      try {
        // Step 1: Create research plan and check limits in parallel
        const [planResponse, limitCheck] = await Promise.all([
          fetch('/api/research/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }),
          canPerformSearch()
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          setError(limitCheck.reason || 'Search limit reached. Please try again later.');
          setLoadingStage('complete');
          return;
        }

        if (!planResponse.ok) {
          throw new Error('Research planning failed');
        }

        const planData = await planResponse.json();
        const researchPlan = planData.plan || [{ aspect: 'general', query }];

        // Step 2: Execute multiple searches in parallel
        setLoadingStage('researching');

        const searchPromises = researchPlan.map((planItem: { aspect: string; query: string }) =>
          fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: planItem.query,
              searchDepth: 'advanced',
              maxResults: 10 // 10 per aspect, total ~40 sources
            }),
            signal: abortController.signal
          }).then(res => res.json()).then(data => ({
            aspect: planItem.aspect,
            query: planItem.query,
            ...data
          }))
        );

        const searchResults = await Promise.all(searchPromises);

        if (!isActive) return;

        // Aggregate sources and images, deduplicating by URL
        const seenUrls = new Set<string>();
        const allSources: Source[] = [];
        const allImages: SearchImage[] = [];
        const aspectResults: { aspect: string; query: string; results: { title: string; url: string; content: string }[] }[] = [];
        let sourceIndex = 1; // Global counter for unique source IDs

        for (const result of searchResults) {
          const sources = result.sources || [];
          const images = result.images || [];
          const rawResults = result.rawResults?.results || [];

          // Collect unique sources with new unique IDs
          for (const source of sources) {
            if (!seenUrls.has(source.url)) {
              seenUrls.add(source.url);
              // Assign a new unique ID to avoid duplicates across search results
              allSources.push({
                ...source,
                id: `s${sourceIndex++}`
              });
            }
          }

          // Collect images
          for (const image of images) {
            if (!allImages.some(i => i.url === image.url)) {
              allImages.push(image);
            }
          }

          // Prepare aspect results for synthesizer
          aspectResults.push({
            aspect: result.aspect,
            query: result.query,
            results: rawResults.map((r: { title: string; url: string; content: string }) => ({
              title: r.title,
              url: r.url,
              content: r.content
            }))
          });
        }

        if (allSources.length === 0) {
          setError('No search results found');
          setLoadingStage('complete');
          return;
        }

        setSources(allSources);
        setImages(allImages);

        // Step 3: Synthesize research results
        setLoadingStage('synthesizing');

        const synthesizeResponse = await fetch('/api/research/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            aspectResults,
            stream: true,
            provider
          }),
          signal: abortController.signal
        });

        if (!isActive) return;

        if (!synthesizeResponse.ok) {
          throw new Error('Research synthesis failed');
        }

        // Stream synthesis to UI
        let synthesizedContent = '';
        await streamResponse(
          synthesizeResponse,
          (content) => {
            if (!isActive) return;
            contentRef.current = content;
            scheduleContentUpdate();
          },
          (fullContent) => {
            if (!isActive) return;
            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
              updateTimeoutRef.current = null;
            }
            synthesizedContent = fullContent;
            const cleanedContent = cleanupFinalContent(fullContent);
            setStreamingContent(cleanedContent);
          }
        );

        if (!isActive) return;

        const cleanedContent = cleanupFinalContent(synthesizedContent);

        // Fetch related searches in background
        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            content: cleanedContent.substring(0, 1000),
            provider
          }),
          signal: abortController.signal
        })
          .then(res => res.json())
          .then(data => {
            if (isActive && data.relatedSearches) {
              setRelatedSearches(data.relatedSearches);
            }
          })
          .catch(() => {});

        // Step 4: Quick proofread (regex-only, no LLM) to avoid content shrinkage
        setLoadingStage('proofreading');

        const proofreadResponse = await fetch('/api/proofread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: cleanedContent,
            mode: 'quick', // Use regex-only cleanup to preserve synthesized content
            stream: false
          }),
          signal: abortController.signal
        });

        if (!isActive) return;

        if (!proofreadResponse.ok) {
          console.error('Proofread API failed, using synthesized content');
          transitionToContent(cleanedContent, allSources, allImages, mode, provider);
          return;
        }

        const proofreadData = await proofreadResponse.json();
        const proofreadContent = proofreadData.proofread || cleanedContent;

        if (!isActive) return;

        transitionToContent(proofreadContent, allSources, allImages, mode, provider);

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!isActive) return;
        console.error('Research error:', err);
        setError('An error occurred while processing your research');
        setLoadingStage('complete');
      }
    };

    // Brainstorm pipeline for creative ideation
    const performBrainstorm = async () => {
      setLoadingStage('reframing');
      setError(null);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);

      try {
        // Step 1: Generate creative angles and check limits in parallel
        const [reframeResponse, limitCheck] = await Promise.all([
          fetch('/api/brainstorm/reframe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }),
          canPerformSearch()
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          setError(limitCheck.reason || 'Search limit reached. Please try again later.');
          setLoadingStage('complete');
          return;
        }

        if (!reframeResponse.ok) {
          throw new Error('Failed to generate creative angles');
        }

        const reframeData = await reframeResponse.json();
        const creativeAngles = reframeData.angles || [{ angle: 'direct', query }];

        // Step 2: Execute parallel searches for each creative angle
        setLoadingStage('exploring');

        const searchPromises = creativeAngles.map((angleItem: { angle: string; query: string }) =>
          fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: angleItem.query,
              searchDepth: 'basic',
              maxResults: 8 // 8 per angle, ~40 total sources
            }),
            signal: abortController.signal
          }).then(res => res.json()).then(data => ({
            angle: angleItem.angle,
            query: angleItem.query,
            ...data
          }))
        );

        const searchResults = await Promise.all(searchPromises);

        if (!isActive) return;

        // Aggregate sources and images, deduplicating by URL
        const seenUrls = new Set<string>();
        const allSources: Source[] = [];
        const allImages: SearchImage[] = [];
        const angleResults: { angle: string; query: string; results: { title: string; url: string; content: string }[] }[] = [];
        let sourceIndex = 1;

        for (const result of searchResults) {
          const sources = result.sources || [];
          const images = result.images || [];
          const rawResults = result.rawResults?.results || [];

          // Collect unique sources with new unique IDs
          for (const source of sources) {
            if (!seenUrls.has(source.url)) {
              seenUrls.add(source.url);
              allSources.push({
                ...source,
                id: `s${sourceIndex++}`
              });
            }
          }

          // Collect images
          for (const image of images) {
            if (!allImages.some(i => i.url === image.url)) {
              allImages.push(image);
            }
          }

          // Prepare angle results for synthesizer
          angleResults.push({
            angle: result.angle,
            query: result.query,
            results: rawResults.map((r: { title: string; url: string; content: string }) => ({
              title: r.title,
              url: r.url,
              content: r.content
            }))
          });
        }

        if (allSources.length === 0) {
          setError('No search results found');
          setLoadingStage('complete');
          return;
        }

        setSources(allSources);
        setImages(allImages);

        // Step 3: Synthesize cross-domain inspiration into ideas
        setLoadingStage('ideating');

        const synthesizeResponse = await fetch('/api/brainstorm/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            angleResults,
            stream: true,
            provider
          }),
          signal: abortController.signal
        });

        if (!isActive) return;

        if (!synthesizeResponse.ok) {
          throw new Error('Brainstorm synthesis failed');
        }

        // Stream synthesis to UI
        let synthesizedContent = '';
        await streamResponse(
          synthesizeResponse,
          (content) => {
            if (!isActive) return;
            contentRef.current = content;
            scheduleContentUpdate();
          },
          (fullContent) => {
            if (!isActive) return;
            if (updateTimeoutRef.current) {
              clearTimeout(updateTimeoutRef.current);
              updateTimeoutRef.current = null;
            }
            synthesizedContent = fullContent;
            const cleanedContent = cleanupFinalContent(fullContent);
            setStreamingContent(cleanedContent);
          }
        );

        if (!isActive) return;

        const cleanedContent = cleanupFinalContent(synthesizedContent);

        // Fetch related searches in background
        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            content: cleanedContent.substring(0, 1000),
            provider
          }),
          signal: abortController.signal
        })
          .then(res => res.json())
          .then(data => {
            if (isActive && data.relatedSearches) {
              setRelatedSearches(data.relatedSearches);
            }
          })
          .catch(() => {});

        // Step 4: Quick proofread (regex-only)
        setLoadingStage('proofreading');

        const proofreadResponse = await fetch('/api/proofread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: cleanedContent,
            mode: 'quick',
            stream: false
          }),
          signal: abortController.signal
        });

        if (!isActive) return;

        if (!proofreadResponse.ok) {
          console.error('Proofread API failed, using synthesized content');
          transitionToContent(cleanedContent, allSources, allImages, mode, provider);
          return;
        }

        const proofreadData = await proofreadResponse.json();
        const proofreadContent = proofreadData.proofread || cleanedContent;

        if (!isActive) return;

        transitionToContent(proofreadContent, allSources, allImages, mode, provider);

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!isActive) return;
        console.error('Brainstorm error:', err);
        setError('An error occurred while brainstorming ideas');
        setLoadingStage('complete');
      }
    };

    // Standard web search pipeline
    const performSearch = async () => {
      setLoadingStage('refining');
      setError(null);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);

      try {
        // Step 1: Refine query and check limits in parallel
        const [refineResult, limitCheck] = await Promise.all([
          fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }).then(res => res.ok ? res.json() : { refinedQuery: query }).catch(() => ({ refinedQuery: query })),
          canPerformSearch()
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          setError(limitCheck.reason || 'Search limit reached. Please try again later.');
          setLoadingStage('complete');
          return;
        }

        const refinedQuery = refineResult.refinedQuery || query;

        // Step 2: Perform search via Tavily with refined query
        setLoadingStage('searching');

        const searchResponse = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: refinedQuery,
            searchDepth: deep ? 'advanced' : 'basic',
            maxResults: deep ? 15 : 10
          }),
          signal: abortController.signal
        });

        if (!isActive) return;

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

        // Step 3: Summarize search results (stream for all modes)
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

        const cleanedContent = cleanupFinalContent(summarizedContent);

        // Fetch related searches in background (non-blocking)
        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            content: cleanedContent.substring(0, 1000),
            provider
          }),
          signal: abortController.signal
        })
          .then(res => res.json())
          .then(data => {
            if (isActive && data.relatedSearches) {
              setRelatedSearches(data.relatedSearches);
            }
          })
          .catch(() => {});

        // NON-PRO MODE: Just set final result (no proofreading)
        if (!isActive) return;
        setSearchResult({
          query,
          content: cleanedContent,
          sources: fetchedSources,
          images: fetchedImages
        });
        setLoadingStage('complete');

        // Save to search history
        addSearchToHistory({
          query,
          provider,
          mode: mode as 'web' | 'pro' | 'brainstorm',
          sources_count: fetchedSources.length
        }).catch(err => console.error('Failed to save to history:', err));

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (!isActive) return;
        console.error('Search error:', err);
        setError('An error occurred while processing your search');
        setLoadingStage('complete');
      }
    };

    // Choose pipeline based on mode
    if (mode === 'pro') {
      performResearch();
    } else if (mode === 'brainstorm') {
      performBrainstorm();
    } else {
      performSearch();
    }

    return () => {
      isActive = false;
      abortController.abort();
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [query, provider, mode, deep, scheduleContentUpdate, streamResponse, transitionToContent]);

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

  // Determine loading state indicators
  const isSearching = loadingStage === 'refining' || loadingStage === 'searching' || loadingStage === 'planning' || loadingStage === 'researching' || loadingStage === 'reframing' || loadingStage === 'exploring';
  const isStreaming = loadingStage === 'summarizing' || loadingStage === 'synthesizing' || loadingStage === 'ideating';
  const isPolishing = loadingStage === 'proofreading';

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
      relatedSearches={relatedSearches}
      provider={provider}
      mode={mode}
      loadingStage={loadingStage}
      isLoading={false}
      isSearching={isSearching}
      isStreaming={isStreaming}
      isPolishing={isPolishing}
      isTransitioning={isTransitioning}
    />
  );
}
