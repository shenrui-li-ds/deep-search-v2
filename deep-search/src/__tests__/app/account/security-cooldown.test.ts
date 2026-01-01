/**
 * @jest-environment node
 */

/**
 * Security cooldown tests for sensitive account actions.
 * Tests the 15-minute cooldown between login and security actions
 * (reset password, change email).
 */

// Security cooldown configuration (mirroring account/page.tsx logic)
const SECURITY_COOLDOWN_SECONDS = 15 * 60; // 15 minutes

function getSecurityCooldownRemaining(sessionStartTime: number | null, currentTime: number): number {
  if (sessionStartTime === null) return 0;

  const elapsed = Math.floor((currentTime - sessionStartTime) / 1000);
  return Math.max(0, SECURITY_COOLDOWN_SECONDS - elapsed);
}

function formatCooldownTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

describe('Security Cooldown', () => {
  describe('getSecurityCooldownRemaining', () => {
    it('should return 0 if no session start time exists', () => {
      const result = getSecurityCooldownRemaining(null, Date.now());
      expect(result).toBe(0);
    });

    it('should return full cooldown time if just logged in', () => {
      const now = Date.now();
      const result = getSecurityCooldownRemaining(now, now);
      expect(result).toBe(SECURITY_COOLDOWN_SECONDS);
    });

    it('should return remaining time after partial cooldown', () => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const result = getSecurityCooldownRemaining(fiveMinutesAgo, now);
      expect(result).toBe(10 * 60); // 10 minutes remaining
    });

    it('should return 0 when cooldown has expired', () => {
      const now = Date.now();
      const twentyMinutesAgo = now - 20 * 60 * 1000;
      const result = getSecurityCooldownRemaining(twentyMinutesAgo, now);
      expect(result).toBe(0);
    });

    it('should return exactly 0 at the cooldown boundary', () => {
      const now = Date.now();
      const exactlyFifteenMinutesAgo = now - SECURITY_COOLDOWN_SECONDS * 1000;
      const result = getSecurityCooldownRemaining(exactlyFifteenMinutesAgo, now);
      expect(result).toBe(0);
    });

    it('should return 1 second remaining just before expiry', () => {
      const now = Date.now();
      const almostFifteenMinutesAgo = now - (SECURITY_COOLDOWN_SECONDS - 1) * 1000;
      const result = getSecurityCooldownRemaining(almostFifteenMinutesAgo, now);
      expect(result).toBe(1);
    });
  });

  describe('formatCooldownTime', () => {
    it('should format seconds only when under a minute', () => {
      expect(formatCooldownTime(45)).toBe('45s');
      expect(formatCooldownTime(1)).toBe('1s');
      expect(formatCooldownTime(59)).toBe('59s');
    });

    it('should format minutes and seconds when over a minute', () => {
      expect(formatCooldownTime(60)).toBe('1m 0s');
      expect(formatCooldownTime(90)).toBe('1m 30s');
      expect(formatCooldownTime(125)).toBe('2m 5s');
    });

    it('should handle the full 15 minute cooldown', () => {
      expect(formatCooldownTime(SECURITY_COOLDOWN_SECONDS)).toBe('15m 0s');
    });

    it('should handle zero seconds', () => {
      expect(formatCooldownTime(0)).toBe('0s');
    });

    it('should format 14m 59s correctly', () => {
      expect(formatCooldownTime(14 * 60 + 59)).toBe('14m 59s');
    });
  });

  describe('Cooldown Security Scenarios', () => {
    it('should enforce cooldown immediately after login', () => {
      const loginTime = Date.now();
      const immediateCheck = loginTime + 100; // 100ms later

      const remaining = getSecurityCooldownRemaining(loginTime, immediateCheck);

      // Should still have almost full cooldown
      expect(remaining).toBeGreaterThan(SECURITY_COOLDOWN_SECONDS - 2);
    });

    it('should allow action after cooldown period', () => {
      const loginTime = Date.now();
      const afterCooldown = loginTime + (SECURITY_COOLDOWN_SECONDS + 1) * 1000;

      const remaining = getSecurityCooldownRemaining(loginTime, afterCooldown);

      expect(remaining).toBe(0);
    });

    it('should block action during cooldown period', () => {
      const loginTime = Date.now();
      const duringCooldown = loginTime + 5 * 60 * 1000; // 5 minutes later

      const remaining = getSecurityCooldownRemaining(loginTime, duringCooldown);

      // Should have 10 minutes remaining
      expect(remaining).toBe(10 * 60);
      expect(remaining).toBeGreaterThan(0);
    });
  });
});
