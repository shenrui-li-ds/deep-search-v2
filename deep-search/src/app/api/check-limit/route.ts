import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAX_CREDITS } from '@/lib/supabase/database';

/**
 * POST /api/check-limit
 *
 * Unified limit check and credit reservation using single RPC call.
 * Checks ALL limits in one atomic operation:
 * 1. Daily search limits (security)
 * 2. Monthly search limits (security)
 * 3. Daily token limits (tier-based)
 * 4. Monthly token limits (tier-based)
 * 5. Credit availability (billing)
 *
 * Request body:
 * - mode: 'web' | 'pro' | 'deep' | 'brainstorm' - search mode (determines max credits)
 *
 * Returns:
 * - allowed: boolean - whether the search is allowed
 * - reservationId: string - ID to use when finalizing credits
 * - maxCredits: number - maximum credits that could be charged
 * - reason: string - explanation if not allowed
 * - error_type: string - type of error for UI handling
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

    // Try new unified function first (single RPC for all checks)
    const { data, error } = await supabase.rpc('reserve_and_authorize_search', {
      p_max_credits: maxCredits,
    });

    if (error) {
      // Fall back to legacy system if new function doesn't exist
      if (error.code === '42883') { // function does not exist
        console.warn('reserve_and_authorize_search not found, using legacy system');
        return await legacyCheck(supabase, maxCredits);
      }
      console.error('Error in reserve_and_authorize_search:', error);
      // Fail-closed: don't allow unlimited searches on database errors
      return NextResponse.json({
        allowed: false,
        reason: 'Unable to verify credits. Please try again in a moment.',
        isTemporaryError: true,
      });
    }

    // Handle unified function result
    if (!data.allowed) {
      const errorType = data.error_type;

      // Map error types to appropriate responses
      if (errorType === 'daily_search_limit' || errorType === 'monthly_search_limit') {
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          isRateLimitError: true,
          errorType: errorType,
          dailySearchesUsed: data.daily_searches_used,
          dailySearchLimit: data.daily_search_limit,
          monthlySearchesUsed: data.monthly_searches_used,
          monthlySearchLimit: data.monthly_search_limit,
        });
      }

      if (errorType === 'daily_token_limit') {
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          isTokenLimitError: true,
          errorType: 'daily_token_limit',
          dailyTokensUsed: data.daily_tokens_used,
          dailyTokenLimit: data.daily_token_limit,
        });
      }

      if (errorType === 'monthly_token_limit') {
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          isTokenLimitError: true,
          errorType: 'monthly_token_limit',
          monthlyTokensUsed: data.monthly_tokens_used,
          monthlyTokenLimit: data.monthly_token_limit,
        });
      }

      if (errorType === 'insufficient_credits') {
        return NextResponse.json({
          allowed: false,
          reason: data.reason,
          creditsNeeded: data.credits_needed,
          creditsAvailable: data.credits_available,
          isCreditsError: true,
        });
      }

      // Generic error
      return NextResponse.json({
        allowed: false,
        reason: data.reason || data.error || 'Check failed',
      });
    }

    // Reservation successful
    return NextResponse.json({
      allowed: true,
      reservationId: data.reservation_id,
      maxCredits: data.reserved,
      remainingAfterReserve: data.remaining_after_reserve,
      userTier: data.user_tier,
      // Include limit info for UI (optional)
      dailySearchesUsed: data.daily_searches_used,
      dailySearchLimit: data.daily_search_limit,
      monthlySearchesUsed: data.monthly_searches_used,
      monthlySearchLimit: data.monthly_search_limit,
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
 * Used when reserve_and_authorize_search function is not available.
 */
async function legacyCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  maxCredits: number
) {
  // Try reserve_credits (newer than check_and_authorize_search)
  const { data: reserveData, error: reserveError } = await supabase.rpc('reserve_credits', {
    p_max_credits: maxCredits,
  });

  if (!reserveError) {
    if (!reserveData.allowed) {
      return NextResponse.json({
        allowed: false,
        reason: reserveData.error || `You need ${reserveData.needed || maxCredits} credits but only have ${reserveData.available || 0}. Purchase more credits to continue.`,
        creditsNeeded: reserveData.needed || maxCredits,
        creditsAvailable: reserveData.available || 0,
        isCreditsError: true,
      });
    }

    return NextResponse.json({
      allowed: true,
      reservationId: reserveData.reservation_id,
      maxCredits: reserveData.reserved,
      remainingAfterReserve: reserveData.remaining_after_reserve,
    });
  }

  // Try check_and_authorize_search
  if (reserveError.code === '42883') {
    const { data, error } = await supabase.rpc('check_and_authorize_search', {
      p_credits_needed: maxCredits,
    });

    if (error) {
      if (error.code === '42883') {
        // Try oldest function
        const { data: oldData, error: oldError } = await supabase.rpc('check_and_use_credits', {
          p_credits_needed: maxCredits,
        });

        if (oldError) {
          console.error('No credit functions available:', oldError);
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
            isCreditsError: true,
          });
        }

        return NextResponse.json({
          allowed: true,
          creditsUsed: oldData.credits_used,
          source: oldData.source,
        });
      }

      console.error('Error in legacy check:', error);
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
        isCreditsError: data.phase === 'credits',
        isRateLimitError: data.phase === 'rate_limit',
      });
    }

    return NextResponse.json({
      allowed: true,
      creditsUsed: data.credits_used,
      source: data.source,
    });
  }

  // Reserve error but not "function not found"
  console.error('Error in reserve_credits:', reserveError);
  return NextResponse.json({
    allowed: false,
    reason: 'Unable to verify credits. Please try again in a moment.',
    isTemporaryError: true,
  });
}
