import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/finalize-credits
 *
 * Finalizes a credit reservation after search completes.
 * Charges actual credits used and refunds unused credits.
 * Designed to be called fire-and-forget (non-blocking).
 *
 * Request body:
 * - reservationId: string - ID from check-limit response
 * - actualCredits: number - actual Tavily queries made
 *
 * Returns:
 * - success: boolean
 * - charged: number - credits actually charged
 * - refunded: number - credits refunded
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // No user - nothing to finalize
      return NextResponse.json({ success: true, message: 'No user session' });
    }

    // Parse request body
    let reservationId: string | undefined;
    let actualCredits: number = 0;

    try {
      const body = await request.json();
      reservationId = body.reservationId;
      actualCredits = body.actualCredits || 0;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    if (!reservationId) {
      // No reservation to finalize (might be legacy system)
      return NextResponse.json({ success: true, message: 'No reservation to finalize' });
    }

    // Call finalize_credits function
    const { data, error } = await supabase.rpc('finalize_credits', {
      p_reservation_id: reservationId,
      p_actual_credits: actualCredits,
    });

    if (error) {
      // If function doesn't exist, that's fine (legacy system)
      if (error.code === '42883') {
        console.warn('finalize_credits not found, ignoring');
        return NextResponse.json({ success: true, message: 'Legacy system, no finalization needed' });
      }
      console.error('Error in finalize_credits:', error);
      // Don't fail the request - this is fire-and-forget
      return NextResponse.json({ success: false, error: error.message });
    }

    if (!data.success) {
      console.warn('Finalize failed:', data.error);
      return NextResponse.json({ success: false, error: data.error });
    }

    return NextResponse.json({
      success: true,
      charged: data.charged,
      refunded: data.refunded,
    });
  } catch (error) {
    console.error('Error in finalize-credits:', error);
    // Don't fail - this is fire-and-forget
    return NextResponse.json({ success: false, error: 'Internal error' });
  }
}

/**
 * POST /api/finalize-credits/cancel
 *
 * Cancels a credit reservation (full refund).
 * Used when search fails before completion.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: true, message: 'No user session' });
    }

    // Parse request body
    let reservationId: string | undefined;

    try {
      const body = await request.json();
      reservationId = body.reservationId;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    if (!reservationId) {
      return NextResponse.json({ success: true, message: 'No reservation to cancel' });
    }

    // Call cancel_reservation function
    const { data, error } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: reservationId,
    });

    if (error) {
      if (error.code === '42883') {
        return NextResponse.json({ success: true, message: 'Legacy system' });
      }
      console.error('Error in cancel_reservation:', error);
      return NextResponse.json({ success: false, error: error.message });
    }

    if (!data.success) {
      console.warn('Cancel failed:', data.error);
      return NextResponse.json({ success: false, error: data.error });
    }

    return NextResponse.json({
      success: true,
      refunded: data.refunded,
    });
  } catch (error) {
    console.error('Error in cancel reservation:', error);
    return NextResponse.json({ success: false, error: 'Internal error' });
  }
}
