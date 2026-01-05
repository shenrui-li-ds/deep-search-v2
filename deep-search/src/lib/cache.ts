/**
 * Two-tier caching system: In-memory LRU + Supabase persistent cache
 *
 * Tier 1: In-memory LRU cache (fast, 15 min TTL, up to 500 entries)
 * Tier 2: Supabase table (persistent, 48 hour TTL)
 */

import crypto from 'crypto';

// =============================================================================
// Types
// =============================================================================

export type CacheType = 'search' | 'refine' | 'summary' | 'related' | 'plan' | 'research-synthesis' | 'brainstorm-synthesis' | 'round1-extractions';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // In-memory cache settings
  memory: {
    maxEntries: 500,
    defaultTTL: 15 * 60 * 1000, // 15 minutes in ms
  },
  // Supabase cache TTLs by type (in hours)
  supabase: {
    search: 48,               // Tavily results: 48 hours
    refine: 48,               // Query refinement: 48 hours
    summary: 48,              // Web search summaries: 48 hours
    related: 48,              // Related searches: 48 hours
    plan: 48,                 // Research plans: 48 hours
    'research-synthesis': 48, // Research synthesis: 48 hours
    'brainstorm-synthesis': 48, // Brainstorm synthesis: 48 hours
    'round1-extractions': 24, // Round 1 extractions: 24 hours (shorter TTL, source data may change)
  },
};

// =============================================================================
// In-Memory LRU Cache
// =============================================================================

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private defaultTTL: number;

  constructor(maxEntries: number = 500, defaultTTL: number = 15 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    // If at capacity, remove oldest entry (first in map)
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs || this.defaultTTL),
      createdAt: Date.now(),
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  // Clean up expired entries
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}

// Global in-memory cache instance
const memoryCache = new LRUCache<unknown>(CONFIG.memory.maxEntries, CONFIG.memory.defaultTTL);

// Periodic cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const pruned = memoryCache.prune();
    if (pruned > 0) {
      console.log(`[Cache] Pruned ${pruned} expired entries from memory cache`);
    }
  }, 5 * 60 * 1000);
}

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Generate MD5 hash for cache key components
 */
function md5(input: string): string {
  return crypto.createHash('md5').update(input).digest('hex');
}

/**
 * Generate a cache key for different cache types
 */
export function generateCacheKey(
  type: CacheType,
  params: {
    query: string;
    provider?: string;
    depth?: string;
    maxResults?: number;
    sources?: string[];
    content?: string;
    aspectResults?: { aspect: string; query: string; results: { url: string }[] }[];
    angleResults?: { angle: string; query: string; results: { url: string }[] }[];
    deep?: boolean; // For deep research mode
  }
): string {
  const normalizedQuery = params.query.toLowerCase().trim();

  switch (type) {
    case 'search':
      // Tavily search: query + depth + maxResults
      return `search:${md5(normalizedQuery)}:${params.depth || 'basic'}:${params.maxResults || 10}`;

    case 'refine':
      // Query refinement: query + provider
      return `refine:${md5(normalizedQuery)}:${params.provider || 'default'}`;

    case 'summary':
      // Summary: query + sources hash + provider
      const sourcesHash = params.sources ? md5(JSON.stringify(params.sources.sort())) : 'nosources';
      return `summary:${md5(normalizedQuery)}:${sourcesHash}:${params.provider || 'default'}`;

    case 'related':
      // Related searches: query + content snippet hash
      const contentHash = params.content ? md5(params.content.slice(0, 500)) : 'nocontent';
      return `related:${md5(normalizedQuery)}:${contentHash}`;

    case 'plan':
      // Research plan: query + provider
      return `plan:${md5(normalizedQuery)}:${params.provider || 'default'}`;

    case 'research-synthesis':
      // Research synthesis: query + aspect results hash (includes all source URLs) + deep mode
      const aspectHash = params.aspectResults
        ? md5(JSON.stringify(params.aspectResults.map(a => ({
            aspect: a.aspect,
            urls: a.results.map(r => r.url).sort()
          }))))
        : 'noaspects';
      const depthMode = params.deep ? 'deep' : 'standard';
      return `research-synth:${md5(normalizedQuery)}:${aspectHash}:${params.provider || 'default'}:${depthMode}`;

    case 'brainstorm-synthesis':
      // Brainstorm synthesis: query + angle results hash (includes all source URLs)
      const angleHash = params.angleResults
        ? md5(JSON.stringify(params.angleResults.map(a => ({
            angle: a.angle,
            urls: a.results.map(r => r.url).sort()
          }))))
        : 'noangles';
      return `brainstorm-synth:${md5(normalizedQuery)}:${angleHash}:${params.provider || 'default'}`;

    case 'round1-extractions':
      // Round 1 extractions: query + provider (for deep research retry optimization)
      return `round1:${md5(normalizedQuery)}:${params.provider || 'default'}`;

    default:
      return `unknown:${md5(normalizedQuery)}`;
  }
}

// =============================================================================
// Supabase Cache Operations
// =============================================================================

/**
 * Get from Supabase cache
 */
async function getFromSupabase<T>(
  cacheKey: string,
  supabase: SupabaseClient
): Promise<T | null> {
  try {
    const { data, error } = await supabase
      .from('search_cache')
      .select('response, expires_at, hit_count')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      // Delete expired entry
      await supabase.from('search_cache').delete().eq('cache_key', cacheKey);
      return null;
    }

    // Increment hit count (fire and forget)
    supabase
      .from('search_cache')
      .update({ hit_count: data.hit_count + 1 })
      .eq('cache_key', cacheKey)
      .then(() => {});

    return data.response as T;
  } catch (error) {
    console.error('[Cache] Supabase get error:', error);
    return null;
  }
}

/**
 * Set to Supabase cache
 */
async function setToSupabase(
  cacheKey: string,
  type: CacheType,
  query: string,
  response: unknown,
  provider: string | null,
  supabase: SupabaseClient
): Promise<void> {
  try {
    const ttlHours = CONFIG.supabase[type] || 24;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    await supabase.from('search_cache').upsert(
      {
        cache_key: cacheKey,
        cache_type: type,
        query,
        response,
        provider,
        expires_at: expiresAt,
        hit_count: 0,
      },
      { onConflict: 'cache_key' }
    );
  } catch (error) {
    console.error('[Cache] Supabase set error:', error);
  }
}

// =============================================================================
// Type for Supabase client (generic to work with actual Supabase client)
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// =============================================================================
// Main Cache Interface
// =============================================================================

/**
 * Two-tier cache: Check memory first, then Supabase
 * @param cacheKey - The cache key
 * @param supabase - Optional Supabase client for tier 2
 * @returns Cached data or null
 */
export async function getFromCache<T>(
  cacheKey: string,
  supabase?: SupabaseClient
): Promise<{ data: T | null; source: 'memory' | 'supabase' | 'miss' }> {
  // Tier 1: Check memory cache
  const memoryResult = memoryCache.get(cacheKey) as T | null;
  if (memoryResult !== null) {
    console.log(`[Cache] Memory HIT: ${cacheKey.slice(0, 50)}...`);
    return { data: memoryResult, source: 'memory' };
  }

  // Tier 2: Check Supabase cache (if client provided)
  if (supabase) {
    const supabaseResult = await getFromSupabase<T>(cacheKey, supabase);
    if (supabaseResult !== null) {
      console.log(`[Cache] Supabase HIT: ${cacheKey.slice(0, 50)}...`);
      // Populate memory cache for faster subsequent access
      memoryCache.set(cacheKey, supabaseResult);
      return { data: supabaseResult, source: 'supabase' };
    }
  }

  console.log(`[Cache] MISS: ${cacheKey.slice(0, 50)}...`);
  return { data: null, source: 'miss' };
}

/**
 * Set to both cache tiers
 * @param cacheKey - The cache key
 * @param type - Cache type for TTL configuration
 * @param query - Original query (for Supabase record)
 * @param data - Data to cache
 * @param provider - Optional provider
 * @param supabase - Optional Supabase client for tier 2
 */
export async function setToCache<T>(
  cacheKey: string,
  type: CacheType,
  query: string,
  data: T,
  provider?: string,
  supabase?: SupabaseClient
): Promise<void> {
  // Tier 1: Set to memory cache
  memoryCache.set(cacheKey, data);

  // Tier 2: Set to Supabase (if client provided)
  if (supabase) {
    await setToSupabase(cacheKey, type, query, data, provider || null, supabase);
  }

  console.log(`[Cache] SET: ${cacheKey.slice(0, 50)}...`);
}

/**
 * Delete from both cache tiers
 */
export async function deleteFromCache(
  cacheKey: string,
  supabase?: SupabaseClient
): Promise<void> {
  memoryCache.delete(cacheKey);

  if (supabase) {
    await supabase.from('search_cache').delete().eq('cache_key', cacheKey);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { memorySize: number; memoryMaxSize: number } {
  return {
    memorySize: memoryCache.size(),
    memoryMaxSize: CONFIG.memory.maxEntries,
  };
}
