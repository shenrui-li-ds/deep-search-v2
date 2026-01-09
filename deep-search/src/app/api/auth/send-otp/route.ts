import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for database functions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OTPGenerateResult {
  success: boolean;
  code?: string;
  otp_id?: string;
  expires_in?: number;
  error?: string;
  retry_after?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { email, purpose } = await request.json();

    // Validate inputs
    if (!email || !purpose) {
      return NextResponse.json(
        { success: false, error: 'Email and purpose are required' },
        { status: 400 }
      );
    }

    if (!['signup', 'login', 'reset'].includes(purpose)) {
      return NextResponse.json(
        { success: false, error: 'Invalid purpose' },
        { status: 400 }
      );
    }

    // Get client IP for rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';

    // Generate OTP via database function
    const { data, error: dbError } = await supabase.rpc('generate_email_otp', {
      p_email: email.toLowerCase(),
      p_purpose: purpose,
      p_ip_address: ip,
    });

    if (dbError) {
      console.error('OTP generation error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to generate verification code' },
        { status: 500 }
      );
    }

    const result = data as OTPGenerateResult;

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, retry_after: result.retry_after },
        { status: 429 }
      );
    }

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Email service not configured' },
        { status: 500 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@athenius.io';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Athenius';

    const purposeTextMap: Record<string, string> = {
      signup: 'complete your signup',
      login: 'log in to your account',
      reset: 'reset your password',
    };
    const purposeText = purposeTextMap[purpose as string];

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a1a; font-size: 24px; margin: 0;">${appName}</h1>
  </div>

  <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center;">
    <p style="margin: 0 0 20px; color: #666;">Your verification code to ${purposeText}:</p>

    <div style="background: #fff; border: 2px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${result.code}</span>
    </div>

    <p style="margin: 20px 0 0; color: #999; font-size: 14px;">
      This code expires in 10 minutes.
    </p>
  </div>

  <div style="margin-top: 30px; text-align: center; color: #999; font-size: 12px;">
    <p>If you didn't request this code, you can safely ignore this email.</p>
    <p>&copy; ${new Date().getFullYear()} ${appName}</p>
  </div>
</body>
</html>
    `.trim();

    const emailText = `
Your ${appName} verification code: ${result.code}

Use this code to ${purposeText}. It expires in 10 minutes.

If you didn't request this code, you can safely ignore this email.
    `.trim();

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email.toLowerCase(),
        subject: `${result.code} is your ${appName} verification code`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendResponse.ok) {
      const resendError = await resendResponse.text();
      console.error('Resend API error:', resendError);
      return NextResponse.json(
        { success: false, error: 'Failed to send verification email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent',
      expires_in: result.expires_in,
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
