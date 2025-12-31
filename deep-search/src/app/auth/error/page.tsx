'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || 'An authentication error occurred';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md text-center">
        {/* Error Icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-rose-500/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>

        {/* Logo */}
        <Link href="/" className="inline-block mb-6">
          <Image
            src="/owl_google.svg"
            alt="Athenius"
            width={48}
            height={48}
            className="mx-auto"
          />
        </Link>

        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">Authentication Error</h1>
        <p className="text-[var(--text-muted)] mb-6">{message}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 bg-[var(--accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try again
          </Link>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-[var(--card)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg font-medium hover:bg-[var(--background)] transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
