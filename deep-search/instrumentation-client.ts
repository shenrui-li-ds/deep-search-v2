/**
 * Client-Side Instrumentation (Sentry)
 *
 * Initializes Sentry for client-side error tracking.
 * This file is loaded on the browser via Next.js instrumentation-client hook.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Enable replay for 10% of sessions
  replaysSessionSampleRate: 0.1,

  // Sample 100% of sessions with errors
  replaysOnErrorSampleRate: 1.0,

  // Integrations
  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default for privacy
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out noisy errors
  beforeSend(event, hint) {
    const error = hint.originalException;

    // Ignore ResizeObserver errors (common, harmless)
    if (
      error instanceof Error &&
      error.message.includes('ResizeObserver loop')
    ) {
      return null;
    }

    // Ignore canceled fetch requests
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }

    return event;
  },

  // Environment
  environment: process.env.NODE_ENV,
});

// Export router transition hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
