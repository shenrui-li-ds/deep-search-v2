"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResult, Source, SearchImage } from '@/lib/types';
import SearchResultComponent from '@/components/SearchResult';
import type { QueryType, ResearchPlanItem } from '@/app/api/research/plan/route';
import type { ResearchGap, AnalyzeGapsResponse } from '@/app/api/research/analyze-gaps/route';
import type { Round1CacheData } from '@/app/api/research/cache-round1/route';
import type { Round2CacheData } from '@/app/api/research/cache-round2/route';
import { Button } from '@/components/ui/button';
import { ErrorType, errorMessages, detectErrorType } from '@/lib/error-types';

// Simple hash function for browser (djb2 algorithm)
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  // Convert to hex string, take first 16 chars for reasonable length
  return (hash >>> 0).toString(16).padStart(8, '0');
}
import { Card } from '@/components/ui/card';
import { cleanupFinalContent } from '@/lib/text-cleanup';
import { addSearchToHistory, toggleBookmark } from '@/lib/supabase/database';

interface SearchClientProps {
  query: string;
  provider?: string;
  mode?: 'web' | 'pro' | 'brainstorm';
  deep?: boolean;
}

type LoadingStage = 'refining' | 'searching' | 'summarizing' | 'proofreading' | 'complete' | 'planning' | 'researching' | 'extracting' | 'synthesizing' | 'reframing' | 'exploring' | 'ideating' | 'analyzing_gaps' | 'deepening';

export default function SearchClient({ query, provider = 'deepseek', mode = 'web', deep = false }: SearchClientProps) {
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('searching');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [sources, setSources] = useState<Source[]>([]);
  const [images, setImages] = useState<SearchImage[]>([]);
  const [relatedSearches, setRelatedSearches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [isCreditError, setIsCreditError] = useState(false);
  const [streamCompleted, setStreamCompleted] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [historyEntryId, setHistoryEntryId] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  // Research thinking state
  const [queryType, setQueryType] = useState<QueryType | null>(null);
  const [researchPlan, setResearchPlan] = useState<ResearchPlanItem[] | null>(null);
  const [suggestedDepth, setSuggestedDepth] = useState<'standard' | 'deep' | null>(null);
  // Deep research state
  const [researchGaps, setResearchGaps] = useState<ResearchGap[] | null>(null);
  // Brainstorm thinking state
  const [brainstormAngles, setBrainstormAngles] = useState<{ angle: string; query: string }[] | null>(null);
  // Web search thinking state
  const [searchIntent, setSearchIntent] = useState<string | null>(null);
  const [refinedQuery, setRefinedQuery] = useState<string | null>(null);
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

  // Retry pending credit finalizations on mount
  useEffect(() => {
    const FINALIZE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes (matches server-side expiry)

    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('pending_finalize_'));

      for (const key of keys) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          const age = Date.now() - (data.timestamp || 0);

          if (age > FINALIZE_EXPIRY_MS) {
            // Expired - server-side cleanup will handle it
            localStorage.removeItem(key);
            continue;
          }

          // Retry finalization
          fetch('/api/finalize-credits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reservationId: data.reservationId,
              actualCredits: data.actualCredits
            })
          })
            .then(res => {
              if (res.ok) {
                localStorage.removeItem(key);
                console.log('[Credit Finalize] Retried pending finalization successfully');
              }
            })
            .catch(() => {
              // Will retry on next page load
            });
        } catch {
          // Invalid data, remove it
          localStorage.removeItem(key);
        }
      }
    } catch {
      // localStorage not available
    }
  }, []); // Run once on mount

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
      setStreamCompleted(true); // Mark stream as successfully completed
      setSearchResult({
        query,
        content: newContent,
        sources: fetchedSources,
        images: fetchedImages
      });
      setLoadingStage('complete');

      // Save to search history and capture the entry ID
      addSearchToHistory({
        query,
        provider: searchProvider,
        mode: searchMode,
        sources_count: fetchedSources.length,
        deep: searchMode === 'pro' ? deep : false
      }).then(entry => {
        if (entry?.id) {
          setHistoryEntryId(entry.id);
          setIsBookmarked(entry.bookmarked || false);
        }
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

    // Timeout configuration (in milliseconds)
    const TIMEOUTS = {
      standard: 60000,   // 60 seconds for standard research
      deep: 120000,      // 120 seconds for deep research (2 rounds)
      round2: 60000,     // 60 seconds for round 2 specifically
    };

    // Helper to create a timeout promise
    const createTimeout = (ms: number, message: string) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms)
      );

    // Helper to finalize credits with localStorage retry
    const finalizeCredits = (reservationId: string | undefined, actualCredits: number) => {
      if (!reservationId) return;

      const storageKey = `pending_finalize_${reservationId}`;

      // Store pending finalization in localStorage for retry
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          reservationId,
          actualCredits,
          timestamp: Date.now()
        }));
      } catch {
        // localStorage not available, proceed without backup
      }

      // Attempt finalization
      fetch('/api/finalize-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId, actualCredits })
      })
        .then(res => {
          if (res.ok) {
            // Success - remove from localStorage
            try {
              localStorage.removeItem(storageKey);
            } catch {
              // Ignore localStorage errors
            }
          }
        })
        .catch(err => {
          console.error('Failed to finalize credits, will retry on next page load:', err);
          // Keep in localStorage for retry
        });
    };

    // Helper to cancel reservation (fire-and-forget)
    const cancelReservation = (reservationId: string | undefined) => {
      if (!reservationId) return;
      fetch('/api/finalize-credits', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId })
      }).catch(err => console.error('Failed to cancel reservation:', err));
    };

    // Research pipeline for Pro mode
    const performResearch = async () => {
      setLoadingStage('planning');
      setError(null);
      setErrorType(null);
      setIsCreditError(false);
      setStreamCompleted(false);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);
      setHistoryEntryId(null);
      setIsBookmarked(false);
      // Reset research thinking state
      setQueryType(null);
      setResearchPlan(null);
      setSuggestedDepth(null);
      setResearchGaps(null);

      let reservationId: string | undefined;
      let tavilyQueryCount = 0;

      try {
        // Step 1: Create research plan and check limits in parallel
        // Use 'deep' mode for credit check if deep research is enabled
        const creditMode = deep ? 'deep' : 'pro';
        const [planResponse, limitCheck] = await Promise.all([
          fetch('/api/research/plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }),
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: creditMode })
          }).then(res => res.json())
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          const errType: ErrorType = limitCheck.isCreditsError ? 'credits_insufficient' : 'rate_limited';
          setError(limitCheck.reason || errorMessages[errType].message);
          setErrorType(errType);
          setIsCreditError(limitCheck.isCreditsError === true);
          setLoadingStage('complete');
          return;
        }

        // Store reservation ID for finalization
        reservationId = limitCheck.reservationId;

        if (!planResponse.ok) {
          throw new Error('Research planning failed');
        }

        const planData = await planResponse.json();
        const plan = planData.plan || [{ aspect: 'general', query }];

        // Store research thinking state for UI display
        if (planData.queryType) {
          setQueryType(planData.queryType);
        }
        if (planData.suggestedDepth) {
          setSuggestedDepth(planData.suggestedDepth);
        }
        setResearchPlan(plan);

        // For deep research: Check if we have cached round 1 data (retry optimization)
        let useRound1Cache = false;
        let cachedRound1: Round1CacheData | null = null;

        if (deep) {
          try {
            const cacheCheckResponse = await fetch(
              `/api/research/cache-round1?query=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider)}`,
              { signal: abortController.signal }
            );
            const cacheCheck = await cacheCheckResponse.json();

            if (cacheCheck.cached && cacheCheck.data) {
              console.log('[Deep Research] Round 1 cache HIT - skipping to gap analysis');
              cachedRound1 = cacheCheck.data;
              useRound1Cache = true;
            }
          } catch {
            // Cache check failed, proceed with full round 1
            console.log('[Deep Research] Round 1 cache check failed, proceeding with full round 1');
          }
        }

        if (!isActive) return;

        // Variables to hold round 1 data (either from cache or fresh)
        let allSources: Source[] = [];
        let allImages: SearchImage[] = [];
        // eslint-disable-next-line prefer-const
        let aspectResults: { aspect: string; query: string; results: { title: string; url: string; content: string }[] }[] = [];
        let globalSourceIndex: Record<string, number> = {};
        let validExtractions: { aspect: string; claims?: unknown[]; statistics?: unknown[]; definitions?: unknown[]; expertOpinions?: unknown[]; contradictions?: unknown[]; keyInsight?: string }[] = [];
        const seenUrls = new Set<string>();
        let sourceIndex = 1;
        let sourceIdx = 1;

        if (useRound1Cache && cachedRound1) {
          // Use cached round 1 data
          allSources = cachedRound1.sources.map(s => ({
            ...s,
            id: s.id
          }));
          allImages = cachedRound1.images;
          validExtractions = cachedRound1.extractions;
          globalSourceIndex = cachedRound1.globalSourceIndex;
          tavilyQueryCount = 0; // No new Tavily queries for round 1

          // Rebuild seenUrls and counters from cached data
          for (const source of allSources) {
            seenUrls.add(source.url);
          }
          sourceIndex = allSources.length + 1;
          sourceIdx = Object.keys(globalSourceIndex).length + 1;

          setSources(allSources);
          setImages(allImages);

          console.log(`[Deep Research] Using cached round 1: ${validExtractions.length} extractions, ${allSources.length} sources`);
        } else {
          // Full round 1: Execute searches and extractions

        // Step 2: Execute multiple searches in parallel
        setLoadingStage('researching');

        const searchPromises = plan.map((planItem: { aspect: string; query: string }) =>
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

        // Count only non-cached Tavily queries (cache hits are free)
        tavilyQueryCount = searchResults.filter(r => !r.cached).length;

        // Aggregate sources and images, deduplicating by URL
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

        // Step 3: Extract structured knowledge from each aspect in parallel
        setLoadingStage('extracting');

        // Build global source index for consistent citation numbers
        for (const result of aspectResults) {
          for (const r of result.results) {
            if (!globalSourceIndex[r.url]) {
              globalSourceIndex[r.url] = sourceIdx++;
            }
          }
        }

        const extractionPromises = aspectResults.map(aspectResult =>
          fetch('/api/research/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              aspectResult,
              globalSourceIndex,
              provider
            }),
            signal: abortController.signal
          }).then(res => res.json()).then(data => data.extraction)
        );

        const extractions = await Promise.all(extractionPromises);

        if (!isActive) return;

        // Filter out failed extractions
        validExtractions = extractions.filter(e => e && e.aspect);

        // Save round 1 data to cache for retry optimization (deep research only)
        if (deep && validExtractions.length > 0) {
          const round1CacheData: Round1CacheData = {
            plan,
            queryType: planData.queryType || null,
            suggestedDepth: planData.suggestedDepth || null,
            extractions: validExtractions as Round1CacheData['extractions'],
            sources: allSources.map(s => ({
              id: s.id,
              url: s.url,
              title: s.title,
              iconUrl: s.iconUrl,
              snippet: s.snippet
            })),
            images: allImages,
            globalSourceIndex,
            tavilyQueryCount
          };

          // Fire-and-forget cache save
          fetch('/api/research/cache-round1', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider, data: round1CacheData })
          }).catch(err => console.error('[Deep Research] Failed to cache round 1:', err));
        }
        } // End of else block (fresh round 1)

        // Track gap descriptions for synthesizer
        let gapDescriptions: string[] = [];

        // Compute R1 extractions hash for R2 cache key
        const r1ExtractionsHash = simpleHash(JSON.stringify(validExtractions));

        // Deep Research: Gap Analysis + Round 2
        if (deep && validExtractions.length > 0) {
          setLoadingStage('analyzing_gaps');

          // First, check if we have cached R2 data for this R1 state
          let useRound2Cache = false;
          let cachedRound2: Round2CacheData | null = null;

          try {
            const r2CacheCheckResponse = await fetch(
              `/api/research/cache-round2?query=${encodeURIComponent(query)}&provider=${encodeURIComponent(provider)}&round1ExtractionsHash=${encodeURIComponent(r1ExtractionsHash)}`,
              { signal: abortController.signal }
            );
            const r2CacheCheck = await r2CacheCheckResponse.json();

            if (r2CacheCheck.cached && r2CacheCheck.data) {
              console.log('[Deep Research] Round 2 cache HIT - skipping gap analysis and searches');
              cachedRound2 = r2CacheCheck.data;
              useRound2Cache = true;
            }
          } catch {
            // Cache check failed, proceed with full round 2
            console.log('[Deep Research] Round 2 cache check failed, proceeding with full round 2');
          }

          if (!isActive) return;

          if (useRound2Cache && cachedRound2) {
            // Use cached R2 data
            setResearchGaps(cachedRound2.gaps);
            gapDescriptions = cachedRound2.gaps.map((gap: ResearchGap) => gap.gap);

            // Merge cached R2 sources with R1 sources
            for (const source of cachedRound2.sources) {
              if (!seenUrls.has(source.url)) {
                seenUrls.add(source.url);
                allSources.push({
                  ...source,
                  id: source.id
                });
              }
            }

            // Merge cached R2 images
            for (const image of cachedRound2.images) {
              if (!allImages.some(i => i.url === image.url)) {
                allImages.push(image);
              }
            }

            // Merge R2 extractions with R1 extractions
            validExtractions = [...validExtractions, ...cachedRound2.extractions];

            // Update sources state
            setSources([...allSources]);

            // No new Tavily queries since we used cache
            console.log(`[Deep Research] Using cached round 2: ${cachedRound2.extractions.length} extractions, ${cachedRound2.sources.length} sources`);
          } else {
            // Full R2: gap analysis + searches + extractions

          // Analyze gaps in round 1 research
          const gapResponse = await fetch('/api/research/analyze-gaps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              extractedData: validExtractions,
              language: 'English', // TODO: detect language
              provider
            }),
            signal: abortController.signal
          });

          if (!isActive) return;

          const gapData: AnalyzeGapsResponse = await gapResponse.json();

          if (gapData.hasGaps && gapData.gaps.length > 0) {
            // Store gaps for UI display
            setResearchGaps(gapData.gaps);

            // Extract gap descriptions for synthesizer prompt
            gapDescriptions = gapData.gaps.map((gap: ResearchGap) => gap.gap);

            // Round 2: Execute searches for identified gaps (with timeout)
            setLoadingStage('deepening');

            // Track R2-specific data for caching
            const r2Sources: { id: string; url: string; title: string; iconUrl: string; snippet?: string }[] = [];
            const r2Images: { url: string; alt: string; sourceId?: string }[] = [];

            try {
              // Wrap round 2 operations with timeout
              const round2Promise = (async () => {
                const round2SearchPromises = gapData.gaps.map((gap: ResearchGap) =>
                  fetch('/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      query: gap.query,
                      searchDepth: 'advanced',
                      maxResults: 8 // Slightly fewer per gap search
                    }),
                    signal: abortController.signal
                  }).then(res => res.json()).then(data => ({
                    aspect: `gap_${gap.type}`,
                    query: gap.query,
                    gapDescription: gap.gap,
                    ...data
                  }))
                );

                const round2Results = await Promise.all(round2SearchPromises);

                if (!isActive) return null;

                // Count round 2 Tavily queries (non-cached)
                const round2QueryCount = round2Results.filter(r => !r.cached).length;
                tavilyQueryCount += round2QueryCount;

                // Add round 2 sources (deduplicated)
                const round2AspectResults: { aspect: string; query: string; results: { title: string; url: string; content: string }[] }[] = [];

                for (const result of round2Results) {
                  const r2SourcesResult = result.sources || [];
                  const r2ImagesResult = result.images || [];
                  const r2RawResults = result.rawResults?.results || [];

                  // Add unique sources and track for R2 cache
                  for (const source of r2SourcesResult) {
                    if (!seenUrls.has(source.url)) {
                      seenUrls.add(source.url);
                      const newSource = {
                        ...source,
                        id: `s${sourceIndex++}`
                      };
                      allSources.push(newSource);
                      // Track R2-specific source for caching
                      r2Sources.push({
                        id: newSource.id,
                        url: source.url,
                        title: source.title,
                        iconUrl: source.iconUrl,
                        snippet: source.snippet
                      });
                    }
                  }

                  // Add unique images and track for R2 cache
                  for (const image of r2ImagesResult) {
                    if (!allImages.some(i => i.url === image.url)) {
                      allImages.push(image);
                      r2Images.push(image);
                    }
                  }

                  // Update global source index for new sources
                  for (const r of r2RawResults) {
                    if (!globalSourceIndex[r.url]) {
                      globalSourceIndex[r.url] = sourceIdx++;
                    }
                  }

                  round2AspectResults.push({
                    aspect: result.aspect,
                    query: result.query,
                    results: r2RawResults.map((r: { title: string; url: string; content: string }) => ({
                      title: r.title,
                      url: r.url,
                      content: r.content
                    }))
                  });
                }

                // Update sources state with round 2 additions
                setSources([...allSources]);

                // Extract from round 2 results
                const round2ExtractionPromises = round2AspectResults.map(aspectResult =>
                  fetch('/api/research/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      query,
                      aspectResult,
                      globalSourceIndex,
                      provider
                    }),
                    signal: abortController.signal
                  }).then(res => res.json()).then(data => data.extraction)
                );

                const round2Extractions = await Promise.all(round2ExtractionPromises);

                if (!isActive) return null;

                // Merge round 1 and round 2 extractions
                const validRound2Extractions = round2Extractions.filter(e => e && e.aspect);
                return validRound2Extractions;
              })();

              // Race between round 2 and timeout
              const round2Result = await Promise.race([
                round2Promise,
                createTimeout(TIMEOUTS.round2, 'Round 2 timeout')
              ]);

              if (round2Result && Array.isArray(round2Result)) {
                validExtractions = [...validExtractions, ...round2Result];
                console.log(`[Deep Research] Round 2 completed: ${round2Result.length} additional extractions`);

                // Save R2 data to cache (fire-and-forget)
                const round2CacheData: Round2CacheData = {
                  gaps: gapData.gaps,
                  extractions: round2Result as Round2CacheData['extractions'],
                  sources: r2Sources,
                  images: r2Images,
                  tavilyQueryCount: tavilyQueryCount
                };

                fetch('/api/research/cache-round2', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    query,
                    provider,
                    round1ExtractionsHash: r1ExtractionsHash,
                    data: round2CacheData
                  })
                }).catch(err => console.error('[Deep Research] Failed to cache round 2:', err));
              }
            } catch (round2Error) {
              if (round2Error instanceof Error && round2Error.message === 'Round 2 timeout') {
                console.warn('[Deep Research] Round 2 timed out after 60s, proceeding with round 1 results only');
                // Clear gap descriptions since we couldn't fill them
                gapDescriptions = [];
              } else {
                // Re-throw other errors
                throw round2Error;
              }
            }
          } else {
            console.log('[Deep Research] No significant gaps found, skipping round 2');
          }
          } // End of else block (fresh round 2)
        }

        // Step 4: Synthesize with extracted data
        setLoadingStage('synthesizing');

        // Start related searches early using plan data (in parallel with synthesis)
        // Use research plan aspects to generate context for related searches
        const planContext = plan.map((p: { aspect: string; query: string }) =>
          `${p.aspect}: ${p.query}`
        ).join('; ');

        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            content: `Research aspects explored: ${planContext}`,
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

        const synthesizeResponse = await fetch('/api/research/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            extractedData: validExtractions.length > 0 ? validExtractions : undefined,
            aspectResults: validExtractions.length === 0 ? aspectResults : undefined, // Fallback to raw results
            stream: true,
            provider,
            deep,
            gapDescriptions
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

        // Finalize credits with actual Tavily query count (fire-and-forget)
        finalizeCredits(reservationId, tavilyQueryCount);

        transitionToContent(proofreadContent, allSources, allImages, mode, provider);

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Cancel reservation on abort
          cancelReservation(reservationId);
          return;
        }
        if (!isActive) return;
        // Cancel reservation on error (full refund)
        cancelReservation(reservationId);
        console.error('Research error:', err);
        const errType = detectErrorType(err);
        setErrorType(errType);
        setError(errorMessages[errType].message);
        setLoadingStage('complete');
      }
    };

    // Brainstorm pipeline for creative ideation
    const performBrainstorm = async () => {
      setLoadingStage('reframing');
      setError(null);
      setErrorType(null);
      setIsCreditError(false);
      setStreamCompleted(false);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);
      setHistoryEntryId(null);
      setIsBookmarked(false);
      // Reset brainstorm thinking state
      setBrainstormAngles(null);

      let reservationId: string | undefined;
      let tavilyQueryCount = 0;

      try {
        // Step 1: Generate creative angles and check limits in parallel
        const [reframeResponse, limitCheck] = await Promise.all([
          fetch('/api/brainstorm/reframe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }),
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'brainstorm' })
          }).then(res => res.json())
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          const errType: ErrorType = limitCheck.isCreditsError ? 'credits_insufficient' : 'rate_limited';
          setError(limitCheck.reason || errorMessages[errType].message);
          setErrorType(errType);
          setIsCreditError(limitCheck.isCreditsError === true);
          setLoadingStage('complete');
          return;
        }

        // Store reservation ID for finalization
        reservationId = limitCheck.reservationId;

        if (!reframeResponse.ok) {
          throw new Error('Failed to generate creative angles');
        }

        const reframeData = await reframeResponse.json();
        const creativeAngles = reframeData.angles || [{ angle: 'direct', query }];

        // Store brainstorm thinking state for UI display
        setBrainstormAngles(creativeAngles);

        // Step 2: Execute parallel searches for each creative angle
        setLoadingStage('exploring');

        const searchPromises = creativeAngles.map((angleItem: { angle: string; query: string }) =>
          fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: angleItem.query,
              searchDepth: 'basic',
              maxResults: 6 // 6 per angle, ~30 total sources
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

        // Count only non-cached Tavily queries (cache hits are free)
        tavilyQueryCount = searchResults.filter(r => !r.cached).length;

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

        // Start related searches early using creative angles (in parallel with synthesis)
        const anglesContext = creativeAngles.map((a: { angle: string; query: string }) =>
          `${a.angle}: ${a.query}`
        ).join('; ');

        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            content: `Creative angles explored: ${anglesContext}`,
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

        // Finalize credits with actual Tavily query count (fire-and-forget)
        finalizeCredits(reservationId, tavilyQueryCount);

        transitionToContent(proofreadContent, allSources, allImages, mode, provider);

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Cancel reservation on abort
          cancelReservation(reservationId);
          return;
        }
        if (!isActive) return;
        // Cancel reservation on error (full refund)
        cancelReservation(reservationId);
        console.error('Brainstorm error:', err);
        const errType = detectErrorType(err);
        setErrorType(errType);
        setError(errorMessages[errType].message);
        setLoadingStage('complete');
      }
    };

    // Standard web search pipeline
    const performSearch = async () => {
      setLoadingStage('refining');
      setError(null);
      setErrorType(null);
      setIsCreditError(false);
      setStreamCompleted(false);
      setSearchResult(null);
      setStreamingContent('');
      contentRef.current = '';
      setSources([]);
      setImages([]);
      setRelatedSearches([]);
      setIsTransitioning(false);
      setHistoryEntryId(null);
      setIsBookmarked(false);
      // Reset web search thinking state
      setSearchIntent(null);
      setRefinedQuery(null);

      let reservationId: string | undefined;

      try {
        // Step 1: Refine query and check limits in parallel
        const [refineResult, limitCheck] = await Promise.all([
          fetch('/api/refine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, provider }),
            signal: abortController.signal
          }).then(res => res.ok ? res.json() : { refinedQuery: query }).catch(() => ({ refinedQuery: query })),
          fetch('/api/check-limit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'web' })
          }).then(res => res.json())
        ]);

        if (!isActive) return;

        if (!limitCheck.allowed) {
          const errType: ErrorType = limitCheck.isCreditsError ? 'credits_insufficient' : 'rate_limited';
          setError(limitCheck.reason || errorMessages[errType].message);
          setErrorType(errType);
          setIsCreditError(limitCheck.isCreditsError === true);
          setLoadingStage('complete');
          return;
        }

        // Store reservation ID for finalization
        reservationId = limitCheck.reservationId;

        const searchQuery = refineResult.refinedQuery || query;

        // Store web search thinking state for UI display
        if (refineResult.searchIntent) {
          setSearchIntent(refineResult.searchIntent);
        }
        setRefinedQuery(searchQuery);

        // Step 2: Perform search via Tavily with refined query
        setLoadingStage('searching');

        const searchResponse = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
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

        // Start related searches immediately using refined query + search context
        // This runs in parallel with summarization for faster results
        const searchContext = searchData.rawResults.results
          .slice(0, 5)
          .map((r: { title: string }) => r.title)
          .join('; ');

        fetch('/api/related-searches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            content: `Search results: ${searchContext}`,
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

        // NON-PRO MODE: Just set final result (no proofreading)
        if (!isActive) return;

        // Finalize credits - 0 if cached, 1 if fresh Tavily query
        finalizeCredits(reservationId, searchData.cached ? 0 : 1);

        setStreamCompleted(true); // Mark stream as successfully completed
        setSearchResult({
          query,
          content: cleanedContent,
          sources: fetchedSources,
          images: fetchedImages
        });
        setLoadingStage('complete');

        // Save to search history and capture the entry ID
        addSearchToHistory({
          query,
          provider,
          mode: mode as 'web' | 'pro' | 'brainstorm',
          sources_count: fetchedSources.length,
          deep: false // Web mode doesn't use deep research
        }).then(entry => {
          if (entry?.id) {
            setHistoryEntryId(entry.id);
            setIsBookmarked(entry.bookmarked || false);
          }
        }).catch(err => console.error('Failed to save to history:', err));

      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Cancel reservation on abort
          cancelReservation(reservationId);
          return;
        }
        if (!isActive) return;
        // Cancel reservation on error (full refund)
        cancelReservation(reservationId);
        console.error('Search error:', err);
        const errType = detectErrorType(err);
        setErrorType(errType);
        setError(errorMessages[errType].message);
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

  // Handle bookmark toggle - must be before any early returns
  const handleToggleBookmark = useCallback(async () => {
    if (!historyEntryId) return;
    try {
      const newBookmarkStatus = await toggleBookmark(historyEntryId);
      setIsBookmarked(newBookmarkStatus);
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  }, [historyEntryId]);

  if (error) {
    // Get error info from type or fallback to defaults
    const errorInfo = errorType ? errorMessages[errorType] : errorMessages.unknown;
    const canRetry = errorInfo.canRetry;

    // Icon based on error type
    const getErrorIcon = () => {
      if (errorType === 'credits_insufficient') {
        return (
          <svg className="w-12 h-12 mx-auto text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
        );
      }
      if (errorType === 'network_error') {
        return (
          <svg className="w-12 h-12 mx-auto text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        );
      }
      if (errorType === 'timeout') {
        return (
          <svg className="w-12 h-12 mx-auto text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }
      if (errorType === 'rate_limited') {
        return (
          <svg className="w-12 h-12 mx-auto text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        );
      }
      if (errorType === 'provider_unavailable') {
        return (
          <svg className="w-12 h-12 mx-auto text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
          </svg>
        );
      }
      // Default error icon
      return (
        <svg className="w-12 h-12 mx-auto text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      );
    };

    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-8 text-center">
          <div className="mb-4">
            {getErrorIcon()}
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            {errorInfo.title}
          </h2>
          <p className="text-[var(--text-muted)] mb-6">{error}</p>
          {isCreditError ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => router.push('/account?tab=billing')}>
                Purchase Credits
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                Back to Search
              </Button>
            </div>
          ) : canRetry ? (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                New Search
              </Button>
            </div>
          ) : (
            <Button onClick={() => router.push('/')}>
              Try a different search
            </Button>
          )}
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
  const isSearching = loadingStage === 'refining' || loadingStage === 'searching' || loadingStage === 'planning' || loadingStage === 'researching' || loadingStage === 'extracting' || loadingStage === 'reframing' || loadingStage === 'exploring' || loadingStage === 'analyzing_gaps' || loadingStage === 'deepening';
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
      deep={deep}
      loadingStage={loadingStage}
      isLoading={false}
      isSearching={isSearching}
      isStreaming={isStreaming}
      isPolishing={isPolishing}
      isTransitioning={isTransitioning}
      historyEntryId={historyEntryId}
      isBookmarked={isBookmarked}
      onToggleBookmark={handleToggleBookmark}
      queryType={queryType}
      researchPlan={researchPlan}
      suggestedDepth={suggestedDepth}
      researchGaps={researchGaps}
      brainstormAngles={brainstormAngles}
      searchIntent={searchIntent}
      refinedQuery={refinedQuery}
      streamCompleted={streamCompleted}
    />
  );
}
