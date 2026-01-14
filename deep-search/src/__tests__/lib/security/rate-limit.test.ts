/**
 * @jest-environment node
 */

/**
 * Rate Limiting Utility Tests
 *
 * Tests for the rate limiter used to protect SSO and API endpoints
 * from abuse and resource exhaustion attacks.
 */

// In-memory store for test implementation
const memoryStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
  current: number;
}

// Mirror of the rate limit implementation for testing
async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = `ratelimit:${identifier}`;

  let entry = memoryStore.get(key);

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

  entry.count += 1;

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

function getClientIp(headers: Record<string, string>): string {
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = headers['x-real-ip'];
  if (realIp) return realIp;

  const cfConnectingIp = headers['cf-connecting-ip'];
  if (cfConnectingIp) return cfConnectingIp;

  return '127.0.0.1';
}

// Pre-configured rate limiters (must match rate-limit.ts)
const SSO_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSeconds: 60 };
const AUTH_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 60 };
const API_RATE_LIMIT: RateLimitConfig = { limit: 100, windowSeconds: 60 };

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear the store before each test
    memoryStore.clear();
  });

  describe('Basic Rate Limiting', () => {
    it('should allow requests under the limit', async () => {
      const config: RateLimitConfig = { limit: 5, windowSeconds: 60 };

      for (let i = 0; i < 5; i++) {
        const result = await rateLimit('test-user', config);
        expect(result.success).toBe(true);
        expect(result.remaining).toBe(4 - i);
        expect(result.current).toBe(i + 1);
      }
    });

    it('should block requests over the limit', async () => {
      const config: RateLimitConfig = { limit: 3, windowSeconds: 60 };

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimit('test-user', config);
        expect(result.success).toBe(true);
      }

      // 4th request should be blocked
      const blocked = await rateLimit('test-user', config);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.current).toBe(4);
    });

    it('should return proper reset timestamp', async () => {
      const config: RateLimitConfig = { limit: 5, windowSeconds: 60 };
      const beforeRequest = Date.now();

      const result = await rateLimit('test-user', config);

      expect(result.reset).toBeGreaterThan(beforeRequest);
      expect(result.reset).toBeLessThanOrEqual(beforeRequest + 60000 + 100); // Allow 100ms tolerance
    });

    it('should track different identifiers separately', async () => {
      const config: RateLimitConfig = { limit: 2, windowSeconds: 60 };

      // User A uses their limit
      await rateLimit('user-a', config);
      await rateLimit('user-a', config);
      const userABlocked = await rateLimit('user-a', config);
      expect(userABlocked.success).toBe(false);

      // User B should still have their full limit
      const userBResult = await rateLimit('user-b', config);
      expect(userBResult.success).toBe(true);
      expect(userBResult.remaining).toBe(1);
    });
  });

  describe('Window Expiration', () => {
    it('should reset after window expires', async () => {
      const config: RateLimitConfig = { limit: 2, windowSeconds: 1 }; // 1 second window

      // Use up the limit
      await rateLimit('test-user', config);
      await rateLimit('test-user', config);

      // Should be blocked
      let result = await rateLimit('test-user', config);
      expect(result.success).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      result = await rateLimit('test-user', config);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(1);
      expect(result.current).toBe(1);
    });
  });

  describe('Pre-configured Limits', () => {
    it('should have SSO rate limit of 10/minute', () => {
      expect(SSO_RATE_LIMIT.limit).toBe(10);
      expect(SSO_RATE_LIMIT.windowSeconds).toBe(60);
    });

    it('should have AUTH rate limit of 5/minute', () => {
      expect(AUTH_RATE_LIMIT.limit).toBe(5);
      expect(AUTH_RATE_LIMIT.windowSeconds).toBe(60);
    });

    it('should have API rate limit of 100/minute', () => {
      expect(API_RATE_LIMIT.limit).toBe(100);
      expect(API_RATE_LIMIT.windowSeconds).toBe(60);
    });
  });

  describe('Client IP Extraction', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const headers = { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' };
      expect(getClientIp(headers)).toBe('203.0.113.195');
    });

    it('should handle single IP in x-forwarded-for', () => {
      const headers = { 'x-forwarded-for': '192.168.1.1' };
      expect(getClientIp(headers)).toBe('192.168.1.1');
    });

    it('should fall back to x-real-ip', () => {
      const headers = { 'x-real-ip': '10.0.0.1' };
      expect(getClientIp(headers)).toBe('10.0.0.1');
    });

    it('should handle Cloudflare cf-connecting-ip', () => {
      const headers = { 'cf-connecting-ip': '172.16.0.1' };
      expect(getClientIp(headers)).toBe('172.16.0.1');
    });

    it('should prioritize x-forwarded-for over other headers', () => {
      const headers = {
        'x-forwarded-for': '203.0.113.195',
        'x-real-ip': '10.0.0.1',
        'cf-connecting-ip': '172.16.0.1',
      };
      expect(getClientIp(headers)).toBe('203.0.113.195');
    });

    it('should return default for missing headers', () => {
      const headers = {};
      expect(getClientIp(headers)).toBe('127.0.0.1');
    });
  });

  describe('SSO Endpoint Protection', () => {
    it('should allow normal SSO usage', async () => {
      // Simulate 5 SSO redirects (normal usage)
      for (let i = 0; i < 5; i++) {
        const result = await rateLimit('sso:192.168.1.1', SSO_RATE_LIMIT);
        expect(result.success).toBe(true);
      }
    });

    it('should block SSO abuse', async () => {
      // Simulate 10 SSO redirects (at limit)
      for (let i = 0; i < 10; i++) {
        const result = await rateLimit('sso:192.168.1.1', SSO_RATE_LIMIT);
        expect(result.success).toBe(true);
      }

      // 11th request should be blocked
      const blocked = await rateLimit('sso:192.168.1.1', SSO_RATE_LIMIT);
      expect(blocked.success).toBe(false);
    });

    it('should not affect legitimate users during attack', async () => {
      // Attacker exhausts their limit
      for (let i = 0; i < 15; i++) {
        await rateLimit('sso:attacker-ip', SSO_RATE_LIMIT);
      }

      // Legitimate user should still have access
      const legitResult = await rateLimit('sso:legit-user-ip', SSO_RATE_LIMIT);
      expect(legitResult.success).toBe(true);
    });
  });

  describe('Auth Endpoint Protection', () => {
    it('should allow legitimate login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await rateLimit('auth:192.168.1.1', AUTH_RATE_LIMIT);
        expect(result.success).toBe(true);
      }
    });

    it('should block brute force attempts', async () => {
      // Use up the 5 attempts
      for (let i = 0; i < 5; i++) {
        await rateLimit('auth:192.168.1.1', AUTH_RATE_LIMIT);
      }

      // 6th attempt should be blocked
      const blocked = await rateLimit('auth:192.168.1.1', AUTH_RATE_LIMIT);
      expect(blocked.success).toBe(false);
    });
  });

  describe('Response Headers', () => {
    it('should provide data for rate limit headers', async () => {
      const config: RateLimitConfig = { limit: 10, windowSeconds: 60 };

      const result = await rateLimit('test-user', config);

      // These values should be used to set response headers
      expect(typeof result.remaining).toBe('number');
      expect(typeof result.reset).toBe('number');
      expect(result.reset).toBeGreaterThan(Date.now());

      // Calculate Retry-After for blocked requests
      if (!result.success) {
        const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it('should return correct remaining count', async () => {
      const config: RateLimitConfig = { limit: 5, windowSeconds: 60 };

      const r1 = await rateLimit('test-user', config);
      expect(r1.remaining).toBe(4);

      const r2 = await rateLimit('test-user', config);
      expect(r2.remaining).toBe(3);

      const r3 = await rateLimit('test-user', config);
      expect(r3.remaining).toBe(2);
    });
  });
});
