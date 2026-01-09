import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next');
  const type = requestUrl.searchParams.get('type');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error);
      return NextResponse.redirect(`${origin}/auth/error?message=${encodeURIComponent(error.message)}`);
    }
  }

  // Handle redirect based on flow type or next parameter
  // Password recovery flow should redirect to reset-password page
  if (type === 'recovery' || next === '/auth/reset-password') {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // If a next URL is provided, redirect there (must be relative path for security)
  if (next && next.startsWith('/')) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Default: redirect to home page after successful authentication
  return NextResponse.redirect(origin);
}
