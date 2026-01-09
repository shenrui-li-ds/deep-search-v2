import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Validates that a redirect path is safe (relative, no protocol, no encoded tricks)
 * Prevents open redirect attacks like:
 * - //evil.com (protocol-relative URL)
 * - /\evil.com (backslash trick)
 * - /%2Fevil.com (encoded slashes)
 */
function isValidRedirectPath(path: string): boolean {
  // Must start with single forward slash
  if (!path.startsWith('/')) return false;

  // Must not start with // (protocol-relative URL)
  if (path.startsWith('//')) return false;

  // Must not contain backslash (some browsers interpret as forward slash)
  if (path.includes('\\')) return false;

  // Must not contain encoded slashes that could bypass checks
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || decoded.includes('\\')) return false;
  } catch {
    // Invalid encoding, reject
    return false;
  }

  // Must not contain protocol
  if (/^\/[a-z]+:/i.test(path)) return false;

  return true;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const type = requestUrl.searchParams.get('type');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
  }

  // Handle redirect based on flow type or next parameter
  // Password recovery flow should redirect to reset-password page
  if (type === 'recovery' || next === '/auth/reset-password') {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // If a next URL is provided, validate and redirect there
  // Security: Validate path to prevent open redirect attacks
  if (next && isValidRedirectPath(next)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Default: redirect to home page after successful authentication
  return NextResponse.redirect(origin);
}
