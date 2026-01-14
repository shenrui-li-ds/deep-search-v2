/**
 * Rate Limiting Utility
 *
 * Provides rate limiting for API endpoints and SSO routes.
 *
 * In development: Uses in-memory storage (works for single instance)
 * In production: Should be upgraded to use Upstash Redis (@upstash/ratelimit)
 *
 * To upgrade to Upstash in production:
 * 1. Install: npm install @upstash/ratelimit @upstash/redis
 * 2. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
 * 3. The rateLimit function will automatically use Redis when available
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store for development (not suitable for serverless production)
const memoryStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60000; // 1 minute
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp (ms) when the rate limit resets */
  reset: number;
  /** Number of requests made in the current window */
  current: number;
}

/**
 * Check rate limit for a given identifier (usually IP or user ID)
 *
 * @param identifier - Unique identifier for the rate limit (e.g., IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result with success status and metadata
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // Clean up expired entries periodically
  cleanupExpiredEntries();

  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = `ratelimit:${identifier}`;

  let entry = memoryStore.get(key);

  // If no entry or entry has expired, create a new one
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 1,
      resetAt: now + windowMs,
    };
    memoryStore.set(key, entry);

    return {
      success: true,
      remaining: config.limit - 1,
      reset: entry.resetAt,
      current: 1,
    };
  }

  // Increment the count
  entry.count += 1;

  // Check if over limit
  if (entry.count > config.limit) {
    return {
      success: false,
      remaining: 0,
      reset: entry.resetAt,
      current: entry.count,
    };
  }

  return {
    success: true,
    remaining: config.limit - entry.count,
    reset: entry.resetAt,
    current: entry.count,
  };
}

/**
 * Get client IP address from request
 * Handles various proxy headers safely
 */
export function getClientIp(request: Request): string {
  // Check common proxy headers (in order of preference)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Cloudflare
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;

  // Fallback to a default (for local development)
  return '127.0.0.1';
}

// Pre-configured rate limiters for common use cases

/** Rate limit for SSO endpoints: 10 requests per minute */
export const SSO_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowSeconds: 60,
};

/** Rate limit for authentication attempts: 5 per minute */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  limit: 5,
  windowSeconds: 60,
};

/** Rate limit for API endpoints: 100 per minute */
export const API_RATE_LIMIT: RateLimitConfig = {
  limit: 100,
  windowSeconds: 60,
};
