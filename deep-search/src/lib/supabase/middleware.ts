import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isValidRedirectPath } from '@/lib/security/trusted-domains';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Determine if we should use shared domain (skip for localhost)
  // Use headers.host because nextUrl.host normalizes to localhost in dev
  const host = request.headers.get('host') || request.nextUrl.host;
  const useSharedDomain = shouldUseSharedDomain(host);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set secure cookie attributes
            // Note: Do NOT set httpOnly - Supabase SSR requires cookies readable by JS
            supabaseResponse.cookies.set(name, value, {
              ...options,
              secure: IS_PRODUCTION,
              sameSite: 'lax',
              ...(useSharedDomain && COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
            });
          });
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // FIX #5: Remove sensitive error details from logs
      // Treat as unauthenticated without exposing error details
    } else {
      user = data.user;
    }
  } catch {
    // Rate limit or network error - treat as unauthenticated but don't loop
  }

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',  // Home page handles its own auth check (shows landing for non-auth)
    '/landing',  // Public landing page
    '/icon',  // Dynamic favicon (must be public for browser tab icon)
    '/favicon.ico',  // Static favicon
    '/auth/login',
    '/auth/signup',
    '/auth/callback',
    '/auth/sso-redirect',  // SSO redirect handles its own auth check
    '/auth/error',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/api/auth/verify-turnstile',
    '/api/auth/check-whitelist',
    '/api/auth/send-otp',
    '/api/auth/verify-otp',
  ];
  // Check if route is public using exact match or proper path prefix
  // This prevents /auth/login-attack from matching /auth/login
  const isPublicRoute = publicRoutes.some(route => {
    const pathname = request.nextUrl.pathname;
    return pathname === route || pathname.startsWith(route + '/');
  });

  // If user is not logged in and trying to access protected route, redirect to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    // Only set redirectTo if the path is valid (prevents open redirect attacks)
    // Include search params so user doesn't lose their query after login
    const redirectPath = request.nextUrl.pathname;
    if (isValidRedirectPath(redirectPath)) {
      const fullPath = request.nextUrl.search
        ? redirectPath + request.nextUrl.search
        : redirectPath;
      url.searchParams.set('redirectTo', fullPath);
    }
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access auth pages, redirect appropriately
  // Exception: These routes need to handle their own logic or are viewable by all
  const noRedirectRoutes = [
    '/',  // Home page handles its own content based on auth
    '/landing',  // Landing page is always viewable (for sharing)
    '/auth/callback',
    '/auth/reset-password',
    '/auth/sso-redirect',
  ];
  const shouldRedirect = user && isPublicRoute && !noRedirectRoutes.some(route => request.nextUrl.pathname.startsWith(route));
  if (shouldRedirect) {
    // Check for redirectTo parameter - if it's a valid external URL, redirect there
    // This enables SSO: user logged in on AS, visiting from AD, should go back to AD
    const redirectTo = request.nextUrl.searchParams.get('redirectTo');
    if (redirectTo && isValidRedirectPath(redirectTo)) {
      // External URL - go through SSO redirect to set cookies with shared domain
      if (redirectTo.startsWith('http://') || redirectTo.startsWith('https://')) {
        const ssoUrl = request.nextUrl.clone();
        ssoUrl.pathname = '/auth/sso-redirect';
        ssoUrl.search = '';
        ssoUrl.searchParams.set('to', redirectTo);
        return NextResponse.redirect(ssoUrl);
      }
      // Internal path - redirect within AS
      const url = request.nextUrl.clone();
      url.pathname = redirectTo;
      url.search = '';
      return NextResponse.redirect(url);
    }

    // No valid redirectTo - go to home
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
