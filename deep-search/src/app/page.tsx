import { createClient } from '@/lib/supabase/server';
import SearchHome from '@/components/SearchHome';
import LandingPage from './landing/page';

/**
 * Home page with server-side auth check.
 * - Authenticated users see the search interface
 * - Unauthenticated users see the landing page
 *
 * Server-side auth check eliminates client-side race conditions
 * and provides the correct content on first render.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Show landing page for non-authenticated users
  if (!user) {
    return <LandingPage />;
  }

  // Authenticated user - show the search interface
  return <SearchHome />;
}
