import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * SSO Redirect Route
 *
 * This route exists to trigger server-side middleware before redirecting
 * to an external domain. The middleware sets cookies with the shared
 * domain (.athenius.io), enabling SSO across subdomains.
 *
 * Flow:
 * 1. User logs in on AS (browser sets cookies for www.athenius.io)
 * 2. Login page redirects to /auth/sso-redirect?to=https://docs.athenius.io
 * 3. Middleware runs, sets cookies with domain=.athenius.io
 * 4. This route redirects to the external URL
 * 5. External domain can now read the shared cookies
 */

// Trusted domains for SSO redirects
const TRUSTED_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  'www.athenius.io',
  'localhost:3000',
  'localhost:3001',
];

function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return TRUSTED_DOMAINS.some(
      domain => parsed.host === domain || parsed.host.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get('to');
  const origin = url.origin;

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not authenticated - redirect to login
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Validate redirect URL
  if (redirectTo && isValidExternalUrl(redirectTo)) {
    return NextResponse.redirect(redirectTo);
  }

  // Invalid or missing redirect - go home
  return NextResponse.redirect(origin);
}
