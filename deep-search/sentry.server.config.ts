/**
 * Sentry Server Configuration
 *
 * Initializes Sentry for server-side error tracking.
 * This file is loaded on the server (Node.js runtime).
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Filter out noisy errors
  beforeSend(event, hint) {
    const error = hint.originalException;

    // Ignore network errors from user disconnects (common in streaming)
    if (
      error instanceof Error &&
      (error.message.includes('client disconnected') ||
        error.message.includes('premature close') ||
        error.message.includes('socket hang up'))
    ) {
      return null;
    }

    return event;
  },

  // Environment
  environment: process.env.NODE_ENV,
});
