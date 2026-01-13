import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// User tier type
export type UserTier = 'free' | 'pro' | 'admin';

// Result of admin check
export interface AdminCheckResult {
  isAdmin: boolean;
  userId?: string;
  userEmail?: string;
  tier?: UserTier;
  error?: string;
  status?: number;
}

/**
 * Check if the current user is an admin.
 * Returns admin status along with user info.
 */
export async function checkAdminAccess(supabase?: SupabaseClient): Promise<AdminCheckResult> {
  const client = supabase || await createClient();

  // Check authentication
  const { data: { user }, error: authError } = await client.auth.getUser();

  if (authError || !user) {
    return {
      isAdmin: false,
      error: 'Authentication required',
      status: 401,
    };
  }

  // Get user tier
  const { data: credits, error: creditsError } = await client.rpc('get_user_credits');

  if (creditsError) {
    return {
      isAdmin: false,
      userId: user.id,
      userEmail: user.email,
      error: 'Failed to verify admin status',
      status: 500,
    };
  }

  const tier = credits?.user_tier as UserTier | undefined;
  const isAdmin = tier === 'admin';

  return {
    isAdmin,
    userId: user.id,
    userEmail: user.email,
    tier,
    error: isAdmin ? undefined : 'Admin access required',
    status: isAdmin ? undefined : 403,
  };
}

// Cookie domain for cross-subdomain auth (e.g., '.athenius.io')
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                // Share cookies across subdomains for SSO
                // All attributes must be set for cross-subdomain cookies to work
                ...(COOKIE_DOMAIN && {
                  domain: COOKIE_DOMAIN,
                  sameSite: 'lax' as const,  // Required for cross-subdomain navigation
                  secure: true,               // Required for HTTPS
                  path: '/',                  // Ensure cookie is available site-wide
                }),
              })
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase client with service_role key for admin operations.
 * Use this for operations that need to bypass RLS (e.g., cache writes).
 *
 * IMPORTANT: Only use server-side. Never expose service_role key to client.
 */
export function createServiceClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY not set, falling back to anon key');
    return null;
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
