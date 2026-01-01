import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/check-limit
 *
 * Checks if the user can perform a search and increments the counter atomically.
 * This runs server-side to avoid React Strict Mode double-invocation issues.
 *
 * Uses `check_and_increment_search_v2` which returns all data in a single query,
 * eliminating one database round-trip compared to the original implementation.
 *
 * Returns:
 * - allowed: boolean - whether the search is allowed
 * - reason: string - explanation if not allowed
 * - remaining: number - remaining searches for the day
 * - limit: number - daily search limit
 */
export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No user - allow (unauthenticated requests handled by middleware)
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // Try the optimized v2 function first (single query, returns JSON with all data)
    const { data, error } = await supabase.rpc('check_and_increment_search_v2');

    if (error) {
      // Fall back to v1 if v2 doesn't exist yet (migration not applied)
      if (error.code === '42883') { // function does not exist
        console.warn('check_and_increment_search_v2 not found, falling back to v1');
        return await fallbackToV1(supabase, user.id);
      }
      console.error('Error checking search limit:', error);
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // v2 returns JSON directly with all the data we need
    return NextResponse.json({
      allowed: data.allowed,
      reason: data.reason,
      remaining: data.daily_limit - data.daily_used,
      limit: data.daily_limit,
    });
  } catch (error) {
    console.error('Error in check-limit:', error);
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
  }
}

// Fallback to v1 behavior if v2 function doesn't exist
async function fallbackToV1(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase.rpc('check_and_increment_search');

  if (error) {
    console.error('Error checking search limit (v1):', error);
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
  }

  const { data: limits } = await supabase
    .from('user_limits')
    .select('*')
    .eq('user_id', userId)
    .single();

  const allowed = data === true;
  let reason: string | undefined;
  if (!allowed && limits) {
    if (limits.daily_searches_used >= limits.daily_search_limit) {
      reason = `Daily search limit reached (${limits.daily_search_limit} searches). Resets at midnight.`;
    } else if (limits.monthly_searches_used >= limits.monthly_search_limit) {
      reason = `Monthly search limit reached (${limits.monthly_search_limit} searches). Resets on the 1st.`;
    }
  }

  return NextResponse.json({
    allowed,
    remaining: limits ? limits.daily_search_limit - limits.daily_searches_used : 0,
    limit: limits?.daily_search_limit || 50,
    reason,
  });
}
