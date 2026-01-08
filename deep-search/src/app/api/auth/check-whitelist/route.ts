import { NextRequest, NextResponse } from 'next/server';

// Check if email is in the CAPTCHA bypass whitelist
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
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { whitelisted: false, error: 'Missing email' },
        { status: 400 }
      );
    }

    const whitelisted = isEmailWhitelisted(email);

    return NextResponse.json({ whitelisted });
  } catch (error) {
    console.error('Whitelist check error:', error);
    return NextResponse.json(
      { whitelisted: false, error: 'Check failed' },
      { status: 500 }
    );
  }
}
