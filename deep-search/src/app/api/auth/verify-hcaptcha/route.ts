import { NextRequest, NextResponse } from 'next/server';

interface HCaptchaVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

// Email whitelist for users who can't access CAPTCHA (e.g., China users)
// Env var: CAPTCHA_WHITELIST_EMAILS (comma-separated)
function isEmailWhitelisted(email?: string): boolean {
  if (!email) return false;

  const whitelist = process.env.CAPTCHA_WHITELIST_EMAILS;
  if (!whitelist) return false;

  const whitelistedEmails = whitelist.split(',').map(e => e.trim().toLowerCase());
  return whitelistedEmails.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const { token, email } = await request.json();

    // Check email whitelist first (for China users who can't access CAPTCHA)
    if (isEmailWhitelisted(email)) {
      console.log(`hCaptcha bypassed for whitelisted email: ${email}`);
      return NextResponse.json({ success: true, bypassed: true });
    }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      );
    }

    const secretKey = process.env.HCAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('HCAPTCHA_SECRET_KEY is not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get client IP for additional validation
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';

    // Verify the token with hCaptcha
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip !== 'unknown') {
      formData.append('remoteip', ip);
    }

    const verifyResponse = await fetch(
      'https://api.hcaptcha.com/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    const result: HCaptchaVerifyResponse = await verifyResponse.json();

    if (!result.success) {
      console.warn('hCaptcha verification failed:', result['error-codes']);
      return NextResponse.json(
        { success: false, error: 'Verification failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('hCaptcha verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Verification error' },
      { status: 500 }
    );
  }
}
