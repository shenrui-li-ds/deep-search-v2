import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for database functions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OTPVerifyResult {
  success: boolean;
  verified_at?: string;
  error?: string;
  attempts_remaining?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { email, code, purpose } = await request.json();

    // Validate inputs
    if (!email || !code || !purpose) {
      return NextResponse.json(
        { success: false, error: 'Email, code, and purpose are required' },
        { status: 400 }
      );
    }

    if (!['signup', 'login', 'reset'].includes(purpose)) {
      return NextResponse.json(
        { success: false, error: 'Invalid purpose' },
        { status: 400 }
      );
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid code format' },
        { status: 400 }
      );
    }

    // Verify OTP via database function
    const { data, error: dbError } = await supabase.rpc('verify_email_otp', {
      p_email: email.toLowerCase(),
      p_code: code,
      p_purpose: purpose,
    });

    if (dbError) {
      console.error('OTP verification error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to verify code' },
        { status: 500 }
      );
    }

    const result = data as OTPVerifyResult;

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          attempts_remaining: result.attempts_remaining,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      verified_at: result.verified_at,
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
