import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { MAX_CREDITS } from '@/lib/supabase/database';

/**
 * POST /api/check-limit
 *
 * Reserves credits for a search using dynamic billing:
 * 1. Rate limits (security) - daily/monthly search limits
 * 2. Credit reservation (billing) - reserves max credits, actual charged on finalize
 *
 * Request body:
 * - mode: 'web' | 'pro' | 'brainstorm' - search mode (determines max credits)
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
      if (requestedMode === 'web' || requestedMode === 'pro' || requestedMode === 'brainstorm') {
        mode = requestedMode;
      }
    } catch {
      // No body or invalid JSON - use default mode
    }

    const maxCredits = MAX_CREDITS[mode];

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
      // On error, allow but log (fail-open for availability)
      return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
    }

    // Handle reservation result
    if (!data.allowed) {
      return NextResponse.json({
        allowed: false,
        reason: data.error || 'Insufficient credits',
        creditsNeeded: data.needed || maxCredits,
        creditsAvailable: data.available || 0,
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
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
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
        console.warn('No credit functions found, allowing search');
        return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
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
    return NextResponse.json({ allowed: true, remaining: -1, limit: -1 });
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
