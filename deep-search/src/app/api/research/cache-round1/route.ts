import { NextRequest, NextResponse } from 'next/server';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import type { AspectExtraction } from '../extract/route';

/**
 * Round 1 cache data structure
 * Contains everything needed to skip round 1 on retry
 */
export interface Round1CacheData {
  plan: { aspect: string; query: string }[];
  queryType: string | null;
  suggestedDepth: 'standard' | 'deep' | null;
  extractions: AspectExtraction[];
  sources: { id: string; url: string; title: string; iconUrl: string; snippet?: string }[];
  images: { url: string; alt: string; sourceId?: string }[];
  globalSourceIndex: Record<string, number>;
  tavilyQueryCount: number;
}

/**
 * GET: Check if cached round 1 data exists for this query
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const provider = searchParams.get('provider') || 'default';

    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    const supabase = await createClient();
    const cacheKey = generateCacheKey('round1-extractions', { query, provider });

    const { data, source } = await getFromCache<Round1CacheData>(cacheKey, supabase);

    if (data) {
      console.log(`[Round1 Cache] HIT for query: ${query.slice(0, 50)}... (source: ${source})`);
      return NextResponse.json({
        cached: true,
        data,
        source
      });
    }

    return NextResponse.json({ cached: false });
  } catch (error) {
    console.error('[Round1 Cache] GET error:', error);
    return NextResponse.json({ cached: false, error: 'Cache check failed' });
  }
}

/**
 * POST: Save round 1 data to cache
 */
export async function POST(req: NextRequest) {
  try {
    const { query, provider, data } = await req.json() as {
      query: string;
      provider?: string;
      data: Round1CacheData;
    };

    if (!query || !data) {
      return NextResponse.json({ error: 'Query and data required' }, { status: 400 });
    }

    const supabase = await createClient();
    const cacheKey = generateCacheKey('round1-extractions', { query, provider });

    await setToCache(cacheKey, 'round1-extractions', query, data, provider, supabase);

    console.log(`[Round1 Cache] SET for query: ${query.slice(0, 50)}...`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Round1 Cache] POST error:', error);
    return NextResponse.json({ error: 'Cache save failed' }, { status: 500 });
  }
}
