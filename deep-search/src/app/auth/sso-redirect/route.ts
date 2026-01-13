import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * SSO Redirect Route
 *
 * This route forces cookies to be set with the shared domain (.athenius.io)
 * before redirecting to an external subdomain.
 *
 * The key insight: We must set cookies on the REDIRECT RESPONSE itself,
 * not via cookieStore (which sets on a different response object).
 */

const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

// Log the configured domain for debugging
console.log('[SSO Redirect] COOKIE_DOMAIN configured as:', COOKIE_DOMAIN || '(not set - will use host-only)');

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

  const cookieStore = await cookies();

  // Create redirect response first - we'll set cookies on THIS response
  const targetUrl = (redirectTo && isValidExternalUrl(redirectTo)) ? redirectTo : origin;
  const response = NextResponse.redirect(targetUrl);

  // Create Supabase client that sets cookies on our redirect response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Set cookies directly on the redirect response with shared domain
          console.log('[SSO Redirect] setAll called with', cookiesToSet.length, 'cookies');
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
            };
            console.log('[SSO Redirect] Setting cookie:', name, 'with domain:', cookieOptions.domain || '(host-only)');
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    }
  );

  // Force session refresh - this calls setAll() with new tokens
  console.log('[SSO Redirect] Calling refreshSession...');
  const { data: { session }, error } = await supabase.auth.refreshSession();

  if (error || !session) {
    console.error('[SSO Redirect] Session refresh failed:', error?.message);
    // Redirect to login instead
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  console.log('[SSO Redirect] Session refresh successful, user:', session.user?.email);
  console.log('[SSO Redirect] Redirecting to:', targetUrl);

  // Log the cookies that will be sent
  const setCookieHeaders = response.headers.getSetCookie();
  console.log('[SSO Redirect] Set-Cookie headers count:', setCookieHeaders.length);
  setCookieHeaders.forEach((cookie, i) => {
    // Log first 100 chars of each cookie (avoid logging full tokens)
    console.log(`[SSO Redirect] Cookie ${i + 1}:`, cookie.substring(0, 100) + '...');
  });

  // Return the response with cookies set
  return response;
}
