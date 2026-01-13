import { createBrowserClient } from '@supabase/ssr';

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const RAW_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
// Trim whitespace and validate - must start with dot for subdomain sharing
const COOKIE_DOMAIN = RAW_COOKIE_DOMAIN?.trim();

// Debug: log cookie domain configuration (only in browser, only once)
if (typeof window !== 'undefined' && !window.__supabaseCookieDomainLogged) {
  console.log('[Supabase Client] Cookie domain config:', {
    raw: RAW_COOKIE_DOMAIN,
    trimmed: COOKIE_DOMAIN,
    enabled: !!COOKIE_DOMAIN,
  });
  window.__supabaseCookieDomainLogged = true;
}

// Extend Window interface for our debug flag
declare global {
  interface Window {
    __supabaseCookieDomainLogged?: boolean;
  }
}

export function createClient() {
  // TEMPORARILY DISABLED: Cookie domain customization
  // If cookies aren't being set at all, let's see if default Supabase works
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // Removed cookieOptions to test if base Supabase auth works
  );
}
