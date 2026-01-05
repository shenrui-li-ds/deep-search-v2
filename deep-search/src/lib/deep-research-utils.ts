/**
 * Deep Research Utilities
 * Helper functions for multi-round research with gap analysis
 */

import { Source } from './types';

/**
 * Search result from Tavily API
 */
export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

/**
 * Aspect-based search result (used in research pipeline)
 */
export interface AspectResult {
  aspect: string;
  query: string;
  results: TavilyResult[];
}

/**
 * Deduplicates sources by URL, keeping the first occurrence
 * @param sources Array of sources to deduplicate
 * @returns Deduplicated array of sources
 */
export function deduplicateSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter(source => {
    // Normalize URL for comparison (remove trailing slashes, query params for some comparisons)
    const normalizedUrl = normalizeUrl(source.url);
    if (seen.has(normalizedUrl)) {
      return false;
    }
    seen.add(normalizedUrl);
    return true;
  });
}

/**
 * Normalize URL for deduplication comparison
 * - Removes trailing slashes
 * - Converts to lowercase for domain
 * - Preserves path case
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Lowercase the host
    let normalized = parsed.protocol + '//' + parsed.host.toLowerCase();
    // Preserve path case but remove trailing slash
    let path = parsed.pathname;
    if (path.endsWith('/') && path.length > 1) {
      path = path.slice(0, -1);
    }
    normalized += path;
    // Include search params as they may differentiate content
    if (parsed.search) {
      normalized += parsed.search;
    }
    return normalized;
  } catch {
    // If URL parsing fails, just lowercase and trim
    return url.toLowerCase().trim().replace(/\/+$/, '');
  }
}

/**
 * Merges sources from multiple rounds, deduplicating and re-indexing
 * @param round1Sources Sources from round 1
 * @param round2Sources Sources from round 2
 * @returns Merged and deduplicated sources with sequential IDs
 */
export function mergeRoundSources(round1Sources: Source[], round2Sources: Source[]): Source[] {
  // Combine all sources, round 1 first for priority
  const allSources = [...round1Sources, ...round2Sources];

  // Deduplicate
  const deduplicated = deduplicateSources(allSources);

  // Re-index with sequential IDs
  return deduplicated.map((source, index) => ({
    ...source,
    id: String(index + 1)
  }));
}

/**
 * Deduplicates aspect results by URL across all aspects
 * @param aspectResults Array of aspect results to deduplicate
 * @returns Deduplicated aspect results
 */
export function deduplicateAspectResults(aspectResults: AspectResult[]): AspectResult[] {
  const seenUrls = new Set<string>();

  return aspectResults.map(aspect => ({
    ...aspect,
    results: aspect.results.filter(result => {
      const normalizedUrl = normalizeUrl(result.url);
      if (seenUrls.has(normalizedUrl)) {
        return false;
      }
      seenUrls.add(normalizedUrl);
      return true;
    })
  }));
}

/**
 * Merges aspect results from two rounds
 * @param round1Results Aspect results from round 1
 * @param round2Results Aspect results from round 2 (gap-filling)
 * @returns Combined aspect results with deduplication
 */
export function mergeAspectResults(
  round1Results: AspectResult[],
  round2Results: AspectResult[]
): AspectResult[] {
  // First, deduplicate within each round
  const deduped1 = deduplicateAspectResults(round1Results);
  const deduped2 = deduplicateAspectResults(round2Results);

  // Collect all URLs from round 1
  const round1Urls = new Set<string>();
  deduped1.forEach(aspect => {
    aspect.results.forEach(result => {
      round1Urls.add(normalizeUrl(result.url));
    });
  });

  // Filter round 2 results to exclude URLs already in round 1
  const filteredRound2 = deduped2.map(aspect => ({
    ...aspect,
    results: aspect.results.filter(result => !round1Urls.has(normalizeUrl(result.url)))
  }));

  // Combine results
  return [...deduped1, ...filteredRound2];
}

/**
 * Creates a global source index mapping URLs to citation numbers
 * @param sources Array of sources
 * @returns Map of URL to citation number
 */
export function createSourceIndex(sources: Source[]): Map<string, number> {
  const index = new Map<string, number>();
  sources.forEach((source, i) => {
    index.set(normalizeUrl(source.url), i + 1);
  });
  return index;
}

/**
 * Converts Tavily results to Source format
 * @param results Tavily API results
 * @param startIndex Starting index for source IDs
 * @returns Array of Source objects
 */
export function tavilyResultsToSources(results: TavilyResult[], startIndex: number = 0): Source[] {
  return results.map((result, index) => {
    // Extract domain for icon
    let iconUrl = '';
    try {
      const url = new URL(result.url);
      iconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch {
      iconUrl = '';
    }

    return {
      id: String(startIndex + index + 1),
      title: result.title,
      url: result.url,
      iconUrl,
      snippet: result.content?.slice(0, 200)
    };
  });
}

/**
 * Counts total results across all aspects
 * @param aspectResults Array of aspect results
 * @returns Total number of results
 */
export function countTotalResults(aspectResults: AspectResult[]): number {
  return aspectResults.reduce((total, aspect) => total + aspect.results.length, 0);
}
