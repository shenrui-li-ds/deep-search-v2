import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  images: {
    domains: [
      'via.placeholder.com',
      'www.reuters.com',
      'www.cnbc.com',
      'www.techcrunch.com',
      'www.nextgov.com',
      'www.example.com',
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers
  tunnelRoute: '/monitoring',

  // Source maps configuration
  sourcemaps: {
    // Delete source maps after upload (don't expose them in production)
    deleteSourcemapsAfterUpload: true,
  },
});
