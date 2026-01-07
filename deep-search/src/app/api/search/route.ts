import { NextRequest, NextResponse } from 'next/server';
import { callSearchWithFallback, SearchProvider } from '@/lib/api-utils';
import { Source, SearchImage, TavilySearchResult } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import { createApiLogger, createTimer, LogMessages } from '@/lib/logger';

// Helper function to convert Tavily results to our Source format
function convertToSources(tavilyResults: TavilySearchResult): Source[] {
  return tavilyResults.results.map((result, index) => {
    // Extract domain from URL for the icon
    let domain = '';
    try {
      const url = new URL(result.url);
      domain = url.hostname;
    } catch (e) {
      console.error('Error parsing URL:', e);
      domain = 'example.com';
    }

    return {
      id: `s${index + 1}`,
      title: result.title,
      url: result.url,
      iconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      author: result.author || result.source || domain,
      timeAgo: result.published_date ? getTimeAgo(result.published_date) : 'Recent',
      readTime: calculateReadTime(result.content),
    };
  });
}

// Helper function to convert Tavily images to our SearchImage format
function convertToImages(tavilyResults: TavilySearchResult): SearchImage[] {
  if (!tavilyResults.images || tavilyResults.images.length === 0) {
    return [];
  }

  return tavilyResults.images.map((image, index) => {
    return {
      url: image.url,
      alt: image.alt_text || 'Search result image',
      sourceId: `s${Math.min(index + 1, tavilyResults.results.length)}`, // Link to a valid source
    };
  });
}

// Calculate approximate read time
function calculateReadTime(content: string): string {
  const words = content.split(/\s+/).length;
  const readTimeMinutes = Math.max(1, Math.round(words / 200)); // Average reading speed
  return `${readTimeMinutes} min`;
}

// Get time ago from date string
function getTimeAgo(dateString: string): string {
  try {
    const publishedDate = new Date(dateString);
    const now = new Date();
    const diffInMilliseconds = now.getTime() - publishedDate.getTime();
    
    const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInWeeks = Math.floor(diffInDays / 7);
    const diffInMonths = Math.floor(diffInDays / 30);
    
    if (diffInMonths > 0) {
      return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
    } else if (diffInWeeks > 0) {
      return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
    } else if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    }
  } catch (e) {
    console.error('Error parsing date:', e);
    return 'Recent';
  }
}

// Response type for caching
interface SearchResponse {
  query: string;
  sources: Source[];
  images: SearchImage[];
  rawResults: TavilySearchResult;
  searchProvider?: SearchProvider;
  cached?: boolean;
}

export async function POST(req: NextRequest) {
  const log = createApiLogger('search');
  const timer = createTimer();

  try {
    const { query, searchDepth = 'basic', maxResults = 10 } = await req.json();

    if (!query) {
      log.warn('Missing query parameter');
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    log.info(LogMessages.SEARCH_STARTED, { query, searchDepth, maxResults });

    // Generate cache key
    const cacheKey = generateCacheKey('search', {
      query,
      depth: searchDepth,
      maxResults,
    });

    // Try to get from cache (Supabase client for tier 2)
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      // Supabase not available, continue without tier 2 cache
      log.debug('Supabase not available, using memory cache only');
    }

    const { data: cachedData, source } = await getFromCache<SearchResponse>(
      cacheKey,
      supabase
    );

    if (cachedData) {
      log.info(LogMessages.SEARCH_CACHE_HIT, {
        query,
        cacheSource: source,
        durationMs: timer.elapsed(),
      });
      return NextResponse.json({
        ...cachedData,
        cached: true,
      });
    }

    log.debug(LogMessages.SEARCH_CACHE_MISS, { query });

    // Cache miss - call search API with fallback
    const { results: searchResults, provider: searchProvider } = await callSearchWithFallback(
      query,
      true, // include images
      searchDepth as 'basic' | 'advanced',
      maxResults
    );

    // Convert search results to our format
    const sources = convertToSources(searchResults);
    const images = convertToImages(searchResults);

    const response: SearchResponse = {
      query,
      sources,
      images,
      rawResults: searchResults,
      searchProvider,
    };

    // Cache the response
    await setToCache(cacheKey, 'search', query, response, undefined, supabase);

    log.info(LogMessages.SEARCH_COMPLETED, {
      query,
      searchProvider,
      sourcesCount: sources.length,
      imagesCount: images.length,
      durationMs: timer.elapsed(),
    });

    return NextResponse.json(response);
  } catch (error) {
    log.error(LogMessages.SEARCH_FAILED, { durationMs: timer.elapsed() }, error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
