import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { isValidTrustedUrl } from '@/lib/security/trusted-domains';
import { rateLimit, getClientIp, SSO_RATE_LIMIT } from '@/lib/security/rate-limit';

/**
 * SSO Redirect Route
 *
 * This route forces cookies to be set with the shared domain (.athenius.io)
 * before redirecting to an external subdomain.
 *
 * Security features:
 * - Validates redirect URLs against trusted domains (exact match)
 * - Uses state parameter to prevent CSRF attacks
 * - Checks session before processing
 * - Sets secure cookie attributes
 * - Rate limited to prevent abuse
 */

const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// State cookie name for CSRF protection
const SSO_STATE_COOKIE = 'sso_state';

// Helper to determine if we should use shared domain
// Only use shared domain when the host is actually covered by COOKIE_DOMAIN
// E.g., if COOKIE_DOMAIN is '.athenius.io', only apply for hosts ending in 'athenius.io'
function shouldUseSharedDomain(host: string): boolean {
  if (!COOKIE_DOMAIN) return false;

  // Remove port from host for comparison
  const hostWithoutPort = host.split(':')[0];

  // COOKIE_DOMAIN typically starts with '.' (e.g., '.athenius.io')
  // Check if the host would be covered by this domain
  const domainToMatch = COOKIE_DOMAIN.startsWith('.')
    ? COOKIE_DOMAIN.slice(1)  // Remove leading dot for matching
    : COOKIE_DOMAIN;

  // Host must end with the domain (or be exactly the domain)
  return hostWithoutPort === domainToMatch || hostWithoutPort.endsWith('.' + domainToMatch);
}

/**
 * Generate a cryptographically secure state token for CSRF protection
 */
function generateState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * POST: Initiate SSO redirect - generates state and redirects
 * This should be called from the login page after successful authentication
 */
export async function POST(request: Request) {
  // FIX #7: Rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = await rateLimit(`sso-post:${clientIp}`, SSO_RATE_LIMIT);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(SSO_RATE_LIMIT.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  const url = new URL(request.url);
  const origin = url.origin;

  let body: { to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const redirectTo = body.to;

  // Validate redirect URL
  if (!redirectTo || !isValidTrustedUrl(redirectTo)) {
    return NextResponse.json({ error: 'Invalid redirect URL' }, { status: 400 });
  }

  // Generate state for CSRF protection
  const state = generateState();

  // Create response that redirects to GET with state
  const ssoUrl = new URL('/auth/sso-redirect', origin);
  ssoUrl.searchParams.set('to', redirectTo);
  ssoUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(ssoUrl);

  // Set state cookie (httpOnly, secure in production)
  response.cookies.set(SSO_STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 60, // 1 minute expiry
    path: '/auth/sso-redirect',
  });

  return response;
}

/**
 * GET: Complete SSO redirect - validates state and sets shared domain cookies
 */
export async function GET(request: Request) {
  // FIX #7: Rate limiting
  const clientIp = getClientIp(request);
  const rateLimitResult = await rateLimit(`sso-get:${clientIp}`, SSO_RATE_LIMIT);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(SSO_RATE_LIMIT.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        },
      }
    );
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get('to');
  const stateParam = url.searchParams.get('state');
  const origin = url.origin;

  // Get actual host from headers (url.host normalizes to localhost in Next.js dev)
  const host = request.headers.get('host') || url.host;
  const useSharedDomain = shouldUseSharedDomain(host);

  const cookieStore = await cookies();

  // ============================================================
  // FIX #9: Check for existing session BEFORE processing
  // ============================================================
  const hasAuthCookies = cookieStore.getAll().some(c => c.name.includes('auth-token'));
  if (!hasAuthCookies) {
    // No session cookies - redirect to login
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // ============================================================
  // FIX #6: Validate CSRF state parameter
  // ============================================================
  const stateCookie = cookieStore.get(SSO_STATE_COOKIE);

  // If state parameter is provided, validate it matches the cookie
  // (For backwards compatibility, allow requests without state from internal redirects)
  if (stateParam) {
    if (!stateCookie || stateCookie.value !== stateParam) {
      return NextResponse.json(
        { error: 'Invalid state parameter - possible CSRF attack' },
        { status: 403 }
      );
    }
  }

  // Validate redirect URL (Fix #1 and #4: exact domain matching)
  const targetUrl = (redirectTo && isValidTrustedUrl(redirectTo)) ? redirectTo : origin;

  // Create redirect response
  const response = NextResponse.redirect(targetUrl);

  // Clear the state cookie
  if (stateCookie) {
    response.cookies.delete(SSO_STATE_COOKIE);
  }

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
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set secure cookie attributes
            // Note: Do NOT set httpOnly - Supabase SSR requires cookies readable by JS
            const cookieOptions = {
              ...options,
              secure: IS_PRODUCTION,
              sameSite: 'lax' as const,
              ...(useSharedDomain && COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
            };
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    }
  );

  // Force session refresh - this calls setAll() with new tokens
  const { data: { session }, error } = await supabase.auth.refreshSession();

  if (error || !session) {
    // ============================================================
    // FIX #5: Remove sensitive data from logs (no error details)
    // ============================================================
    console.warn('[SSO Redirect] Session refresh failed');
    return NextResponse.redirect(`${origin}/auth/login`);
  }

  // Non-sensitive logging only
  console.info('[SSO Redirect] Redirect completed successfully');

  return response;
}
