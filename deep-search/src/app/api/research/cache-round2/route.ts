import { NextRequest, NextResponse } from 'next/server';
import { generateCacheKey, getFromCache, setToCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import type { AspectExtraction } from '../extract/route';
import type { ResearchGap } from '../analyze-gaps/route';

/**
 * Round 2 cache data structure
 * Contains gap analysis and R2 extractions for retry optimization
 */
export interface Round2CacheData {
  gaps: ResearchGap[];
  extractions: AspectExtraction[];  // R2 extractions only (gap-filling)
  sources: { id: string; url: string; title: string; iconUrl: string; snippet?: string }[];  // R2 sources only
  images: { url: string; alt: string; sourceId?: string }[];  // R2 images only
  tavilyQueryCount: number;  // Number of Tavily queries made in R2
}

/**
 * GET: Check if cached round 2 data exists for this query + R1 state
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const provider = searchParams.get('provider') || 'default';
    const round1ExtractionsHash = searchParams.get('round1ExtractionsHash');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    if (!round1ExtractionsHash) {
      return NextResponse.json({ error: 'round1ExtractionsHash parameter required' }, { status: 400 });
    }

    const supabase = await createClient();
    const cacheKey = generateCacheKey('round2-data', { query, provider, round1ExtractionsHash });

    const { data, source } = await getFromCache<Round2CacheData>(cacheKey, supabase);

    if (data) {
      console.log(`[Round2 Cache] HIT for query: ${query.slice(0, 50)}... (source: ${source})`);
      return NextResponse.json({
        cached: true,
        data,
        source
      });
    }

    return NextResponse.json({ cached: false });
  } catch (error) {
    console.error('[Round2 Cache] GET error:', error);
    return NextResponse.json({ cached: false, error: 'Cache check failed' });
  }
}

/**
 * POST: Save round 2 data to cache
 */
export async function POST(req: NextRequest) {
  try {
    const { query, provider, round1ExtractionsHash, data } = await req.json() as {
      query: string;
      provider?: string;
      round1ExtractionsHash: string;
      data: Round2CacheData;
    };

    if (!query || !data) {
      return NextResponse.json({ error: 'Query and data required' }, { status: 400 });
    }

    if (!round1ExtractionsHash) {
      return NextResponse.json({ error: 'round1ExtractionsHash required' }, { status: 400 });
    }

    const supabase = await createClient();
    const cacheKey = generateCacheKey('round2-data', { query, provider, round1ExtractionsHash });

    await setToCache(cacheKey, 'round2-data', query, data, provider, supabase);

    console.log(`[Round2 Cache] SET for query: ${query.slice(0, 50)}...`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Round2 Cache] POST error:', error);
    return NextResponse.json({ error: 'Cache save failed' }, { status: 500 });
  }
}
