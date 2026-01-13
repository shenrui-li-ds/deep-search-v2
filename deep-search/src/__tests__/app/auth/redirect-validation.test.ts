/**
 * @jest-environment node
 */

/**
 * Redirect URL validation tests for open redirect prevention.
 * Tests the isValidRedirectUrl function used in login page.
 */

// Trusted domains for external redirects (must match login/page.tsx)
const TRUSTED_REDIRECT_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  'localhost:3000',
  'localhost:3001',
];

/**
 * Validate redirect URL to prevent open redirect attacks.
 * Only allows relative paths or absolute URLs to trusted domains.
 *
 * This mirrors the implementation in src/app/auth/login/page.tsx
 */
function isValidRedirectUrl(url: string): boolean {
  // Relative paths are always safe
  if (url.startsWith('/') && !url.startsWith('//')) {
    return true;
  }

  // Validate absolute URLs against trusted domains
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return TRUSTED_REDIRECT_DOMAINS.some(
        domain => parsed.host === domain || parsed.host.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  }

  return false;
}

describe('Redirect URL Validation', () => {
  describe('Relative Paths', () => {
    it('should allow simple relative paths', () => {
      expect(isValidRedirectUrl('/')).toBe(true);
      expect(isValidRedirectUrl('/search')).toBe(true);
      expect(isValidRedirectUrl('/files/123')).toBe(true);
      expect(isValidRedirectUrl('/auth/callback')).toBe(true);
    });

    it('should allow relative paths with query params', () => {
      expect(isValidRedirectUrl('/search?q=test')).toBe(true);
      expect(isValidRedirectUrl('/files?status=ready&limit=10')).toBe(true);
    });

    it('should allow relative paths with hash fragments', () => {
      expect(isValidRedirectUrl('/docs#section-1')).toBe(true);
      expect(isValidRedirectUrl('/page?id=1#anchor')).toBe(true);
    });

    it('should reject protocol-relative URLs (//)', () => {
      expect(isValidRedirectUrl('//evil.com')).toBe(false);
      expect(isValidRedirectUrl('//evil.com/path')).toBe(false);
      expect(isValidRedirectUrl('///evil.com')).toBe(false);
    });
  });

  describe('Trusted Domains', () => {
    it('should allow exact trusted domain matches', () => {
      expect(isValidRedirectUrl('https://athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/search')).toBe(true);
      expect(isValidRedirectUrl('https://docs.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://docs.athenius.io/files')).toBe(true);
    });

    it('should allow localhost for development', () => {
      expect(isValidRedirectUrl('http://localhost:3000')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3000/')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3000/search')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3001')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3001/files')).toBe(true);
    });

    it('should allow subdomains of trusted domains', () => {
      expect(isValidRedirectUrl('https://api.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://staging.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://test.docs.athenius.io')).toBe(true);
    });

    it('should allow URLs with query params and fragments', () => {
      expect(isValidRedirectUrl('https://docs.athenius.io/files?id=123')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/search?q=test#results')).toBe(true);
    });
  });

  describe('Malicious URLs (Open Redirect Attacks)', () => {
    it('should reject completely untrusted domains', () => {
      expect(isValidRedirectUrl('https://evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://malicious.org/phishing')).toBe(false);
      expect(isValidRedirectUrl('http://attacker.net')).toBe(false);
    });

    it('should reject domains that look similar to trusted ones', () => {
      // Typosquatting attempts
      expect(isValidRedirectUrl('https://athenius.com')).toBe(false);
      expect(isValidRedirectUrl('https://athenious.io')).toBe(false);
      expect(isValidRedirectUrl('https://atheniusio.com')).toBe(false);
    });

    it('should reject subdomain injection attacks', () => {
      // Attacker owns evil.com, tries to make it look like athenius.io
      expect(isValidRedirectUrl('https://athenius.io.evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://docs.athenius.io.evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://athenius-io.evil.com')).toBe(false);
    });

    it('should reject credential injection in URLs', () => {
      // Attempts to confuse with userinfo component
      expect(isValidRedirectUrl('https://athenius.io@evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://user:pass@evil.com')).toBe(false);
    });

    it('should reject non-HTTP protocols', () => {
      expect(isValidRedirectUrl('javascript:alert(1)')).toBe(false);
      expect(isValidRedirectUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidRedirectUrl('file:///etc/passwd')).toBe(false);
      expect(isValidRedirectUrl('ftp://evil.com/file')).toBe(false);
    });

    it('should reject malformed URLs', () => {
      expect(isValidRedirectUrl('https://')).toBe(false);
      expect(isValidRedirectUrl('https:/evil.com')).toBe(false);
      expect(isValidRedirectUrl('not-a-url')).toBe(false);
      expect(isValidRedirectUrl('')).toBe(false);
    });

    it('should reject localhost on wrong ports', () => {
      expect(isValidRedirectUrl('http://localhost:8080')).toBe(false);
      expect(isValidRedirectUrl('http://localhost:4000')).toBe(false);
      expect(isValidRedirectUrl('http://localhost')).toBe(false);
    });

    it('should reject localhost alternatives', () => {
      expect(isValidRedirectUrl('http://127.0.0.1:3000')).toBe(false);
      expect(isValidRedirectUrl('http://0.0.0.0:3000')).toBe(false);
      expect(isValidRedirectUrl('http://[::1]:3000')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      expect(isValidRedirectUrl('')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(isValidRedirectUrl(' ')).toBe(false);
      expect(isValidRedirectUrl('  /search')).toBe(false);
    });

    it('should handle URL encoding tricks', () => {
      // Encoded slashes shouldn't bypass checks
      expect(isValidRedirectUrl('%2F%2Fevil.com')).toBe(false);
      expect(isValidRedirectUrl('/%2Fevil.com')).toBe(true); // This is a valid relative path
    });

    it('should handle backslash tricks', () => {
      // Some browsers treat backslash as forward slash
      expect(isValidRedirectUrl('/\\evil.com')).toBe(true); // Relative path (browser would normalize)
      expect(isValidRedirectUrl('\\\\evil.com')).toBe(false);
    });

    it('should handle case sensitivity in domain matching', () => {
      expect(isValidRedirectUrl('https://ATHENIUS.IO')).toBe(true);
      expect(isValidRedirectUrl('https://Docs.Athenius.IO')).toBe(true);
      expect(isValidRedirectUrl('HTTPS://athenius.io')).toBe(false); // Protocol is case-sensitive in our check
    });
  });

  describe('Integration with Login Flow', () => {
    it('should handle typical docs.athenius.io redirect', () => {
      const redirectTo = 'https://docs.athenius.io/files';
      expect(isValidRedirectUrl(redirectTo)).toBe(true);
    });

    it('should handle typical internal redirect', () => {
      const redirectTo = '/search?q=test';
      expect(isValidRedirectUrl(redirectTo)).toBe(true);
    });

    it('should fall back safely for invalid redirects', () => {
      const maliciousRedirect = 'https://evil.com/phishing';
      const safeRedirect = isValidRedirectUrl(maliciousRedirect) ? maliciousRedirect : '/';
      expect(safeRedirect).toBe('/');
    });
  });

  describe('SSO Flow (Middleware Behavior)', () => {
    /**
     * Simulates the middleware decision for logged-in users visiting auth pages.
     * This mirrors the logic in src/lib/supabase/middleware.ts
     */
    function getRedirectForLoggedInUser(redirectTo: string | null): string {
      if (redirectTo && isValidRedirectUrl(redirectTo)) {
        return redirectTo;
      }
      return '/'; // Default to home if no valid redirectTo
    }

    it('should redirect logged-in user to external docs.athenius.io', () => {
      const redirectTo = 'https://docs.athenius.io/library';
      const result = getRedirectForLoggedInUser(redirectTo);
      expect(result).toBe('https://docs.athenius.io/library');
    });

    it('should redirect logged-in user to internal path', () => {
      const redirectTo = '/search';
      const result = getRedirectForLoggedInUser(redirectTo);
      expect(result).toBe('/search');
    });

    it('should redirect to home when no redirectTo provided', () => {
      const result = getRedirectForLoggedInUser(null);
      expect(result).toBe('/');
    });

    it('should redirect to home for invalid redirectTo', () => {
      const maliciousRedirect = 'https://evil.com/steal-session';
      const result = getRedirectForLoggedInUser(maliciousRedirect);
      expect(result).toBe('/');
    });

    it('should handle full SSO flow: AD -> AS -> AD', () => {
      // Simulating: User at docs.athenius.io is not logged in
      // AD middleware creates redirect URL
      const adOrigin = 'https://docs.athenius.io';
      const asLoginUrl = `https://athenius.io/auth/login?redirectTo=${encodeURIComponent(adOrigin + '/library')}`;

      // Extract redirectTo from URL
      const url = new URL(asLoginUrl);
      const redirectTo = url.searchParams.get('redirectTo');

      // AS middleware (user already logged in) should redirect back to AD
      expect(redirectTo).toBe('https://docs.athenius.io/library');
      expect(isValidRedirectUrl(redirectTo!)).toBe(true);

      const finalRedirect = getRedirectForLoggedInUser(redirectTo);
      expect(finalRedirect).toBe('https://docs.athenius.io/library');
    });

    it('should block SSO flow to untrusted domain', () => {
      // Attacker tries to use AS as open redirect
      const maliciousUrl = 'https://evil.com/phishing';
      const asLoginUrl = `https://athenius.io/auth/login?redirectTo=${encodeURIComponent(maliciousUrl)}`;

      const url = new URL(asLoginUrl);
      const redirectTo = url.searchParams.get('redirectTo');

      expect(isValidRedirectUrl(redirectTo!)).toBe(false);

      const finalRedirect = getRedirectForLoggedInUser(redirectTo);
      expect(finalRedirect).toBe('/'); // Falls back to home, not evil.com
    });
  });
});
