import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

// Trusted domains for cross-app redirects (SSO)
const TRUSTED_REDIRECT_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  // Add localhost for development
  'localhost:3000',
  'localhost:3001',
];

/**
 * Validates that a redirect path/URL is safe
 * Allows:
 * - Relative paths (e.g., /dashboard)
 * - Full URLs to trusted domains (e.g., https://docs.athenius.io/library)
 * Prevents:
 * - Open redirect attacks (//evil.com, /\evil.com, etc.)
 */
function isValidRedirectPath(path: string): boolean {
  // Check if it's a full URL to a trusted domain
  if (path.startsWith('https://') || path.startsWith('http://')) {
    try {
      const url = new URL(path);
      const isTrusted = TRUSTED_REDIRECT_DOMAINS.some(
        domain => url.host === domain || url.host.endsWith('.' + domain)
      );
      return isTrusted;
    } catch {
      return false;
    }
  }

  // Must start with single forward slash (relative path)
  if (!path.startsWith('/')) return false;

  // Must not start with // (protocol-relative URL)
  if (path.startsWith('//')) return false;

  // Must not contain backslash (some browsers interpret as forward slash)
  if (path.includes('\\')) return false;

  // Must not contain encoded slashes that could bypass checks
  const decoded = decodeURIComponent(path);
  if (decoded.startsWith('//') || decoded.includes('\\')) return false;

  // Must not contain protocol
  if (/^\/[a-z]+:/i.test(path)) return false;

  return true;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              // Share cookies across subdomains for SSO
              domain: COOKIE_DOMAIN,
            })
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/auth/login',
    '/auth/signup',
    '/auth/callback',
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

  // If user is logged in and trying to access auth pages, redirect to home
  // Exception: /auth/reset-password needs to be accessible for password recovery flow
  const noRedirectRoutes = ['/auth/callback', '/auth/reset-password'];
  const shouldRedirect = user && isPublicRoute && !noRedirectRoutes.some(route => request.nextUrl.pathname.startsWith(route));
  if (shouldRedirect) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
