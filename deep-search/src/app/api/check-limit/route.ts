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
 * Checks if the user can perform a search using BOTH:
 * 1. Rate limits (security) - daily/monthly search limits to prevent abuse
 * 2. Credit system (billing) - deducts credits if allowed
 *
 * Both checks must pass for search to be allowed.
 * Uses optimized single-call function when available, falls back to two-call system.
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

    // Try optimized single-call function first
    const { data, error } = await supabase.rpc('check_and_authorize_search', {
      p_credits_needed: creditsNeeded,
    });

    if (error) {
      // Fall back to two-call system if combined function doesn't exist
      if (error.code === '42883') { // function does not exist
        console.warn('check_and_authorize_search not found, using legacy two-call system');
        return await legacyDualCheck(supabase, creditsNeeded);
      }
      console.error('Error in check_and_authorize_search:', error);
      // On error, allow but log (fail-open for availability)
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // Handle combined function result
    if (!data.allowed) {
      if (data.phase === 'rate_limit') {
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          remaining: 0,
          limit: data.daily_limit || data.monthly_limit,
        });
      } else {
        // Credits phase
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          creditsNeeded: data.needed || creditsNeeded,
          remainingCredits: (data.remaining_free || 0) + (data.remaining_purchased || 0),
        });
      }
    }

    // Both checks passed - search allowed
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

/**
 * Legacy two-call system for backwards compatibility.
 * Used when check_and_authorize_search function is not available.
 */
async function legacyDualCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  creditsNeeded: number
) {
  // PHASE 1: Rate limits (security)
  const rateLimitResult = await checkRateLimits(supabase);
  if (!rateLimitResult.allowed) {
    return NextResponse.json({
      allowed: false,
      reason: rateLimitResult.reason,
      remaining: rateLimitResult.remaining,
      limit: rateLimitResult.limit,
    });
  }

  // PHASE 2: Credits (billing)
  const { data, error } = await supabase.rpc('check_and_use_credits', {
    p_credits_needed: creditsNeeded,
  });

  if (error) {
    if (error.code === '42883') { // function does not exist
      console.warn('check_and_use_credits not found, using rate limits only');
      return NextResponse.json({
        allowed: true,
        remaining: rateLimitResult.remaining,
        limit: rateLimitResult.limit,
      });
    }
    console.error('Error checking credits:', error);
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
  }

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
}

/**
 * Check rate limits (daily/monthly search caps) for security/abuse prevention.
 * This is separate from billing - it's a hard cap regardless of credits.
 */
async function checkRateLimits(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{
  allowed: boolean;
  reason?: string;
  remaining: number;
  limit: number;
}> {
  // Try v2 first (optimized, returns JSON with increment)
  const { data, error } = await supabase.rpc('check_and_increment_search_v2');

  if (error) {
    // Fall back to v1 if v2 doesn't exist
    if (error.code === '42883') {
      const { data: v1Data, error: v1Error } = await supabase.rpc('check_and_increment_search');
      if (v1Error) {
        // If rate limit functions don't exist, allow (degraded mode)
        if (v1Error.code === '42883') {
          console.warn('Rate limit functions not found, skipping rate limit check');
          return { allowed: true, remaining: -1, limit: -1 };
        }
        console.error('Error checking rate limit (v1):', v1Error);
        return { allowed: true, remaining: -1, limit: -1 };
      }

      // v1 returns boolean, need to fetch limits for details
      if (v1Data === false) {
        const { data: limits } = await supabase
          .from('user_limits')
          .select('*')
          .single();

        let reason = 'Rate limit reached. Please try again later.';
        if (limits) {
          if (limits.daily_searches_used >= limits.daily_search_limit) {
            reason = `Daily search limit reached (${limits.daily_search_limit} searches). Resets at midnight.`;
          } else if (limits.monthly_searches_used >= limits.monthly_search_limit) {
            reason = `Monthly search limit reached (${limits.monthly_search_limit} searches). Resets on the 1st.`;
          }
        }

        return {
          allowed: false,
          reason,
          remaining: 0,
          limit: limits?.daily_search_limit || 50,
        };
      }

      return { allowed: true, remaining: -1, limit: -1 };
    }
    console.error('Error checking rate limit (v2):', error);
    return { allowed: true, remaining: -1, limit: -1 };
  }

  // v2 returns JSON with all details
  if (!data.allowed) {
    return {
      allowed: false,
      reason: data.reason,
      remaining: 0,
      limit: data.daily_limit,
    };
  }

  return {
    allowed: true,
    remaining: data.daily_limit - data.daily_used,
    limit: data.daily_limit,
  };
}
