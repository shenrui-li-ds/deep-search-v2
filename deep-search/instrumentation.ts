/**
 * Next.js Instrumentation Hook
 *
 * This file initializes Sentry for server-side and edge runtimes.
 * The register function is called once when the server starts.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Capture errors from nested React Server Components.
 * Required for proper error tracking in RSC.
 */
export const onRequestError = Sentry.captureRequestError;
