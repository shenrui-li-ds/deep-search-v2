/**
 * @jest-environment node
 */

/**
 * Login lockout tests for brute force protection.
 * Tests the progressive account lockout thresholds.
 */

// Lockout thresholds (mirroring add-login-lockout.sql logic)
interface LockoutResult {
  locked: boolean;
  locked_until: string | null;
  attempts: number;
}

interface LockoutStatus {
  locked: boolean;
  locked_until: string | null;
  remaining_seconds: number;
}

/**
 * Simulates the lockout logic from the PostgreSQL function.
 * This mirrors the logic in supabase/add-login-lockout.sql
 */
function calculateLockoutDuration(
  attempts: number,
  firstFailedAt: Date,
  now: Date
): number | null {
  // 15+ attempts in 1 hour -> 1 hour lock
  if (attempts >= 15) {
    return 60 * 60; // 1 hour in seconds
  }

  // 10+ attempts in 1 hour -> 30 min lock
  if (attempts >= 10) {
    return 30 * 60; // 30 minutes in seconds
  }

  // 5+ attempts in 15 minutes -> 5 min lock
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
  if (attempts >= 5 && firstFailedAt > fifteenMinutesAgo) {
    return 5 * 60; // 5 minutes in seconds
  }

  return null; // No lockout
}

/**
 * Simulates checking remaining lockout time.
 */
function calculateRemainingSeconds(lockedUntil: Date | null, now: Date): number {
  if (!lockedUntil || lockedUntil <= now) {
    return 0;
  }
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
}

/**
 * Format time for display (mirrors login/page.tsx formatTime).
 */
function formatTime(seconds: number): string {
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  } else if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  return `${seconds}s`;
}

describe('Login Lockout', () => {
  describe('calculateLockoutDuration', () => {
    it('should not lock out with fewer than 5 attempts', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago

      for (let attempts = 1; attempts < 5; attempts++) {
        const duration = calculateLockoutDuration(attempts, firstFailed, now);
        expect(duration).toBeNull();
      }
    });

    it('should lock for 5 minutes after 5 attempts in 15 minutes', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago

      const duration = calculateLockoutDuration(5, firstFailed, now);

      expect(duration).toBe(5 * 60);
    });

    it('should not lock after 5 attempts if first attempt was more than 15 minutes ago', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 20 * 60 * 1000); // 20 min ago

      const duration = calculateLockoutDuration(5, firstFailed, now);

      expect(duration).toBeNull();
    });

    it('should lock for 30 minutes after 10 attempts', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago

      const duration = calculateLockoutDuration(10, firstFailed, now);

      expect(duration).toBe(30 * 60);
    });

    it('should lock for 1 hour after 15+ attempts', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 45 * 60 * 1000); // 45 min ago

      const duration15 = calculateLockoutDuration(15, firstFailed, now);
      const duration20 = calculateLockoutDuration(20, firstFailed, now);
      const duration100 = calculateLockoutDuration(100, firstFailed, now);

      expect(duration15).toBe(60 * 60);
      expect(duration20).toBe(60 * 60);
      expect(duration100).toBe(60 * 60);
    });

    it('should apply higher lockout tier regardless of timing after 10 attempts', () => {
      const now = new Date();
      // Even if first attempt was over an hour ago, 10+ attempts = 30 min lock
      const firstFailed = new Date(now.getTime() - 90 * 60 * 1000); // 90 min ago

      const duration = calculateLockoutDuration(10, firstFailed, now);

      expect(duration).toBe(30 * 60);
    });
  });

  describe('calculateRemainingSeconds', () => {
    it('should return 0 if not locked', () => {
      const now = new Date();
      const remaining = calculateRemainingSeconds(null, now);
      expect(remaining).toBe(0);
    });

    it('should return 0 if lock has expired', () => {
      const now = new Date();
      const lockedUntil = new Date(now.getTime() - 60 * 1000); // 1 min ago

      const remaining = calculateRemainingSeconds(lockedUntil, now);

      expect(remaining).toBe(0);
    });

    it('should return remaining seconds if still locked', () => {
      const now = new Date();
      const lockedUntil = new Date(now.getTime() + 5 * 60 * 1000); // 5 min from now

      const remaining = calculateRemainingSeconds(lockedUntil, now);

      expect(remaining).toBe(5 * 60);
    });

    it('should return 0 exactly at expiry time', () => {
      const now = new Date();
      const lockedUntil = new Date(now.getTime());

      const remaining = calculateRemainingSeconds(lockedUntil, now);

      expect(remaining).toBe(0);
    });
  });

  describe('formatTime', () => {
    it('should format seconds only', () => {
      expect(formatTime(30)).toBe('30s');
      expect(formatTime(59)).toBe('59s');
    });

    it('should format minutes and seconds', () => {
      expect(formatTime(60)).toBe('1m 0s');
      expect(formatTime(90)).toBe('1m 30s');
      expect(formatTime(300)).toBe('5m 0s');
      expect(formatTime(1799)).toBe('29m 59s');
    });

    it('should format hours and minutes', () => {
      expect(formatTime(3600)).toBe('1h 0m');
      expect(formatTime(3660)).toBe('1h 1m');
      expect(formatTime(3720)).toBe('1h 2m');
    });

    it('should format the standard lockout durations correctly', () => {
      expect(formatTime(5 * 60)).toBe('5m 0s');    // 5 min lockout
      expect(formatTime(30 * 60)).toBe('30m 0s');  // 30 min lockout
      expect(formatTime(60 * 60)).toBe('1h 0m');   // 1 hour lockout
    });
  });

  describe('Progressive Lockout Scenarios', () => {
    it('should escalate lockout severity with more attempts', () => {
      const now = new Date();
      const firstFailed = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago

      // 5 attempts -> 5 min
      const lock5 = calculateLockoutDuration(5, firstFailed, now);
      expect(lock5).toBe(5 * 60);

      // 10 attempts -> 30 min
      const lock10 = calculateLockoutDuration(10, firstFailed, now);
      expect(lock10).toBe(30 * 60);

      // 15 attempts -> 1 hour
      const lock15 = calculateLockoutDuration(15, firstFailed, now);
      expect(lock15).toBe(60 * 60);
    });

    it('should not lock legitimate slow login attempts', () => {
      const now = new Date();
      // 4 attempts spread over 20 minutes (not suspicious)
      const firstFailed = new Date(now.getTime() - 20 * 60 * 1000);

      const duration = calculateLockoutDuration(4, firstFailed, now);

      expect(duration).toBeNull();
    });
  });
});
