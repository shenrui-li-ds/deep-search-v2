import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAX_CREDITS } from '@/lib/supabase/database';

// Tier-based daily token limits
const DAILY_TOKEN_LIMITS: Record<string, number> = {
  free: 50_000,
  pro: 200_000,
  admin: Infinity, // Unlimited
};

/**
 * POST /api/check-limit
 *
 * Reserves credits for a search using dynamic billing:
 * 1. Daily token limits (tier-based) - prevents excessive LLM usage
 * 2. Credit reservation (billing) - reserves max credits, actual charged on finalize
 *
 * Request body:
 * - mode: 'web' | 'pro' | 'deep' | 'brainstorm' - search mode (determines max credits)
 *
 * Returns:
 * - allowed: boolean - whether the search is allowed
 * - reservationId: string - ID to use when finalizing credits
 * - maxCredits: number - maximum credits that could be charged
 * - reason: string - explanation if not allowed
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
    let mode: keyof typeof MAX_CREDITS = 'web';
    try {
      const body = await request.json();
      const requestedMode = body.mode;
      if (requestedMode === 'web' || requestedMode === 'pro' || requestedMode === 'deep' || requestedMode === 'brainstorm') {
        mode = requestedMode;
      }
    } catch {
      // No body or invalid JSON - use default mode
    }

    const maxCredits = MAX_CREDITS[mode];

    // Check daily token limits (tier-based)
    const tokenLimitCheck = await checkDailyTokenLimit(supabase);
    if (!tokenLimitCheck.allowed) {
      return NextResponse.json({
        allowed: false,
        reason: tokenLimitCheck.reason,
        isTokenLimitError: true,
        dailyTokensUsed: tokenLimitCheck.used,
        dailyTokenLimit: tokenLimitCheck.limit,
      });
    }

    // Try optimized single-call function first (checks rate limits + reserves credits)
    const { data, error } = await supabase.rpc('reserve_credits', {
      p_max_credits: maxCredits,
    });

    if (error) {
      // Fall back to legacy system if reserve function doesn't exist
      if (error.code === '42883') { // function does not exist
        console.warn('reserve_credits not found, using legacy system');
        return await legacyCheck(supabase, maxCredits);
      }
      console.error('Error in reserve_credits:', error);
      // Fail-closed: don't allow unlimited searches on database errors
      return NextResponse.json({
        allowed: false,
        reason: 'Unable to verify credits. Please try again in a moment.',
        isTemporaryError: true,
      });
    }

    // Handle reservation result
    if (!data.allowed) {
      const needed = data.needed || maxCredits;
      const available = data.available || 0;
      return NextResponse.json({
        allowed: false,
        reason: `You need ${needed} credits but only have ${available}. Purchase more credits to continue.`,
        creditsNeeded: needed,
        creditsAvailable: available,
        isCreditsError: true,
      });
    }

    // Reservation successful
    return NextResponse.json({
      allowed: true,
      reservationId: data.reservation_id,
      maxCredits: data.reserved,
      remainingAfterReserve: data.remaining_after_reserve,
    });
  } catch (error) {
    console.error('Error in check-limit:', error);
    // Fail-closed: don't allow unlimited searches on unexpected errors
    return NextResponse.json({
      allowed: false,
      reason: 'Unable to verify credits. Please try again in a moment.',
      isTemporaryError: true,
    });
  }
}

/**
 * Legacy check for backwards compatibility.
 * Used when reserve_credits function is not available.
 */
async function legacyCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  maxCredits: number
) {
  // Try the old combined function
  const { data, error } = await supabase.rpc('check_and_authorize_search', {
    p_credits_needed: maxCredits,
  });

  if (error) {
    if (error.code === '42883') {
      // Try even older function
      const { data: oldData, error: oldError } = await supabase.rpc('check_and_use_credits', {
        p_credits_needed: maxCredits,
      });

      if (oldError) {
        console.error('No credit functions available:', oldError);
        // Fail-closed: don't allow unlimited searches without credit system
        return NextResponse.json({
          allowed: false,
          reason: 'Credit system unavailable. Please try again later.',
          isTemporaryError: true,
        });
      }

      if (!oldData.allowed) {
        return NextResponse.json({
          allowed: false,
          reason: oldData.error || 'Insufficient credits',
        });
      }

      return NextResponse.json({
        allowed: true,
        creditsUsed: oldData.credits_used,
        source: oldData.source,
      });
    }
    console.error('Error in legacy check:', error);
    // Fail-closed: don't allow unlimited searches on database errors
    return NextResponse.json({
      allowed: false,
      reason: 'Unable to verify credits. Please try again in a moment.',
      isTemporaryError: true,
    });
  }

  if (!data.allowed) {
    return NextResponse.json({
      allowed: false,
      reason: data.reason || data.error || 'Check failed',
    });
  }

  return NextResponse.json({
    allowed: true,
    creditsUsed: data.credits_used,
    source: data.source,
  });
}

/**
 * Check if user is within their daily token limit (tier-based).
 * Returns allowed: true for admin tier (unlimited).
 */
async function checkDailyTokenLimit(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ allowed: boolean; reason?: string; used?: number; limit?: number }> {
  try {
    // Get user tier from credits
    const { data: credits } = await supabase.rpc('get_user_credits');
    const tier = credits?.user_tier || 'free';
    const dailyLimit = DAILY_TOKEN_LIMITS[tier] ?? DAILY_TOKEN_LIMITS.free;

    // Admin has unlimited tokens
    if (dailyLimit === Infinity) {
      return { allowed: true };
    }

    // Get current daily token usage
    const { data: limits } = await supabase
      .from('user_limits')
      .select('daily_tokens_used')
      .single();

    const dailyUsed = limits?.daily_tokens_used || 0;

    if (dailyUsed >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${dailyUsed.toLocaleString()} / ${dailyLimit.toLocaleString()}). Resets at midnight.`,
        used: dailyUsed,
        limit: dailyLimit,
      };
    }

    return { allowed: true, used: dailyUsed, limit: dailyLimit };
  } catch (error) {
    // On error, allow the request (fail-open for token limits only)
    // Credit system is the primary limiter
    console.warn('Error checking daily token limit:', error);
    return { allowed: true };
  }
}
