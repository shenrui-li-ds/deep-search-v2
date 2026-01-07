import { createServerClient } from '@supabase/ssr';
import { type SupabaseClient } from '@supabase/supabase-js';
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
              cookieStore.set(name, value, options)
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
