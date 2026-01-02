import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Credit costs per search mode
const CREDIT_COSTS: Record<string, number> = {
  web: 1,
  pro: 2,      // Research mode
  brainstorm: 2,
};

/**
 * POST /api/check-limit
 *
 * Checks if the user can perform a search using the credit system.
 * Deducts credits atomically if allowed.
 *
 * Request body:
 * - mode: 'web' | 'pro' | 'brainstorm' - search mode (determines credit cost)
 *
 * Returns:
 * - allowed: boolean - whether the search is allowed
 * - reason: string - explanation if not allowed
 * - creditsUsed: number - credits deducted (if allowed)
 * - remainingCredits: number - total remaining credits
 * - source: 'free' | 'purchased' - which credit pool was used
 *
 * Falls back to legacy search limit system if credit functions don't exist.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No user - allow (unauthenticated requests handled by middleware)
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // Parse request body for mode
    let mode = 'web';
    try {
      const body = await request.json();
      mode = body.mode || 'web';
    } catch {
      // No body or invalid JSON - use default mode
    }

    const creditsNeeded = CREDIT_COSTS[mode] || 1;

    // Try the credit system first
    const { data, error } = await supabase.rpc('check_and_use_credits', {
      p_credits_needed: creditsNeeded,
    });

    if (error) {
      // Fall back to legacy system if credit functions don't exist
      if (error.code === '42883') { // function does not exist
        console.warn('check_and_use_credits not found, falling back to legacy system');
        return await fallbackToLegacy(supabase, user.id);
      }
      console.error('Error checking credits:', error);
      // On error, allow but log
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // Credit check result
    if (!data.allowed) {
      return NextResponse.json({
        allowed: false,
        reason: data.error || 'Insufficient credits. Purchase more credits to continue.',
        creditsNeeded: data.needed || creditsNeeded,
        remainingCredits: (data.remaining_free || 0) + (data.remaining_purchased || 0),
      });
    }

    return NextResponse.json({
      allowed: true,
      creditsUsed: data.credits_used,
      source: data.source,
      remainingCredits: (data.remaining_free || 0) + (data.remaining_purchased || 0),
      remainingFree: data.remaining_free || 0,
      remainingPurchased: data.remaining_purchased || 0,
    });
  } catch (error) {
    console.error('Error in check-limit:', error);
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
  }
}

// Fallback to legacy search limit system if credit functions don't exist
async function fallbackToLegacy(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  // Try v2 first
  const { data, error } = await supabase.rpc('check_and_increment_search_v2');

  if (error) {
    // Fall back to v1 if v2 doesn't exist
    if (error.code === '42883') {
      const { data: v1Data, error: v1Error } = await supabase.rpc('check_and_increment_search');
      if (v1Error) {
        console.error('Error checking search limit (v1):', v1Error);
        return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
      }

      const { data: limits } = await supabase
        .from('user_limits')
        .select('*')
        .eq('user_id', userId)
        .single();

      const allowed = v1Data === true;
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
    console.error('Error checking search limit (v2):', error);
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
  }

  // v2 returns JSON directly
  return NextResponse.json({
    allowed: data.allowed,
    reason: data.reason,
    remaining: data.daily_limit - data.daily_used,
    limit: data.daily_limit,
  });
}
