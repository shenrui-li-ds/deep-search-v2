import { NextRequest, NextResponse } from 'next/server';
import { callLLM, LLMProvider } from '@/lib/api-utils';
import { generateRelatedSearchesPrompt } from '@/lib/prompts';
import { OpenAIMessage } from '@/lib/types';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';

// Response type for caching
interface RelatedSearchesResponse {
  relatedSearches: string[];
  cached?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const { query, content, provider } = await req.json();
    const llmProvider = provider as LLMProvider | undefined;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required and must be a string' },
        { status: 400 }
      );
    }

    // Extract key topics from the content (first 500 chars as context)
    const keyTopics = content
      ? content.substring(0, 500).replace(/\[[\d]+\]/g, '').trim()
      : query;

    // Generate cache key based on query and content snippet
    const cacheKey = generateCacheKey('related', {
      query,
      content: keyTopics,
    });

    // Try to get from cache
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      console.log('[Cache] Supabase not available, using memory cache only');
    }

    const { data: cachedData, source } = await getFromCache<RelatedSearchesResponse>(
      cacheKey,
      supabase
    );

    if (cachedData) {
      console.log(`[Related] Cache ${source} hit for: ${query.slice(0, 50)}`);
      return NextResponse.json({
        ...cachedData,
        cached: true,
      });
    }

    // Cache miss - call LLM
    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: generateRelatedSearchesPrompt(query, keyTopics)
      },
      {
        role: 'user',
        content: `Generate related search queries for: "${query}"`
      }
    ];

    const response = await callLLM(messages, 0.7, false, llmProvider);

    // Parse the JSON response
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      cleanResponse = cleanResponse.trim();

      const relatedSearches = JSON.parse(cleanResponse);

      // Validate the response structure
      if (!Array.isArray(relatedSearches)) {
        throw new Error('Response is not an array');
      }

      // Extract queries and ensure they're valid
      const queries = relatedSearches
        .filter((item: { query?: string }) => item && typeof item.query === 'string')
        .map((item: { query: string }) => item.query)
        .slice(0, 6); // Limit to 6 queries

      const result: RelatedSearchesResponse = { relatedSearches: queries };

      // Cache the response
      await setToCache(cacheKey, 'related', query, result, llmProvider, supabase);

      return NextResponse.json(result);
    } catch (parseError) {
      console.error('Error parsing related searches response:', parseError);
      // Return empty array on parse error
      return NextResponse.json({ relatedSearches: [] });
    }
  } catch (error) {
    console.error('Error in related-searches API:', error);
    return NextResponse.json(
      { error: 'Failed to generate related searches' },
      { status: 500 }
    );
  }
}
