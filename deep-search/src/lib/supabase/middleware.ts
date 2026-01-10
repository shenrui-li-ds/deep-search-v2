import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
            supabaseResponse.cookies.set(name, value, options)
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
    const redirectPath = request.nextUrl.pathname;
    if (isValidRedirectPath(redirectPath)) {
      url.searchParams.set('redirectTo', redirectPath);
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
