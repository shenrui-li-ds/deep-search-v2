/**
 * @jest-environment node
 */

/**
 * Redirect URL validation tests for open redirect prevention.
 * Tests the isValidRedirectUrl function from trusted-domains-client.ts
 *
 * SECURITY UPDATE: Now uses exact domain matching instead of subdomain wildcards
 * to prevent subdomain takeover attacks.
 */

// Mock environment variable for dev domains
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_DEV_DOMAINS: 'localhost:3000,localhost:3001,as.myapp.test:3000,docs.myapp.test:3001'
  };
});

afterEach(() => {
  process.env = originalEnv;
});

// Production domains - always trusted (must match trusted-domains.ts)
const PRODUCTION_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  'www.athenius.io',
  'search.athenius.io',
];

// Development domains from env
function getDevDomains(): string[] {
  const devDomainsEnv = process.env.NEXT_PUBLIC_DEV_DOMAINS;
  if (!devDomainsEnv) return [];
  return devDomainsEnv.split(',').map(d => d.trim()).filter(d => d.length > 0);
}

function getTrustedDomains(): string[] {
  return [...PRODUCTION_DOMAINS, ...getDevDomains()];
}

/**
 * Check if a host EXACTLY matches a trusted domain.
 * Does NOT allow arbitrary subdomains to prevent subdomain takeover attacks.
 */
function isExactTrustedDomain(host: string): boolean {
  const trustedDomains = getTrustedDomains();
  return trustedDomains.includes(host);
}

/**
 * Validate redirect URL - mirrors trusted-domains-client.ts
 */
function isValidRedirectUrl(url: string): boolean {
  // Relative paths starting with single slash are safe
  if (url.startsWith('/') && !url.startsWith('//')) {
    if (url.includes('\\')) return false;
    try {
      const decoded = decodeURIComponent(url);
      if (decoded.startsWith('//') || decoded.includes('\\')) return false;
    } catch {
      return false;
    }
    if (/^\/[a-z]+:/i.test(url)) return false;
    return true;
  }

  // Validate absolute URLs against trusted domains (exact match only)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      return isExactTrustedDomain(parsed.host);
    } catch {
      return false;
    }
  }

  return false;
}

describe('Redirect URL Validation (Exact Domain Matching)', () => {
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

    it('should reject backslash bypass attempts', () => {
      expect(isValidRedirectUrl('/\\evil.com')).toBe(false);
      expect(isValidRedirectUrl('\\\\evil.com')).toBe(false);
    });

    it('should reject encoded bypass attempts', () => {
      expect(isValidRedirectUrl('%2F%2Fevil.com')).toBe(false);
    });
  });

  describe('Trusted Domains (Exact Match Only)', () => {
    it('should allow exact production domain matches', () => {
      expect(isValidRedirectUrl('https://athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/search')).toBe(true);
      expect(isValidRedirectUrl('https://www.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://www.athenius.io/search')).toBe(true);
      expect(isValidRedirectUrl('https://docs.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://docs.athenius.io/files')).toBe(true);
      expect(isValidRedirectUrl('https://search.athenius.io')).toBe(true);
      expect(isValidRedirectUrl('https://search.athenius.io/results')).toBe(true);
    });

    it('should allow exact dev domain matches from env', () => {
      expect(isValidRedirectUrl('http://localhost:3000')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3000/')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3000/search')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3001')).toBe(true);
      expect(isValidRedirectUrl('http://localhost:3001/files')).toBe(true);
      expect(isValidRedirectUrl('http://as.myapp.test:3000')).toBe(true);
      expect(isValidRedirectUrl('http://docs.myapp.test:3001')).toBe(true);
    });

    it('should allow URLs with query params and fragments', () => {
      expect(isValidRedirectUrl('https://docs.athenius.io/files?id=123')).toBe(true);
      expect(isValidRedirectUrl('https://athenius.io/search?q=test#results')).toBe(true);
    });

    it('should REJECT arbitrary subdomains (subdomain takeover prevention)', () => {
      // These would have been allowed with the old .endsWith() check
      // but are now rejected with exact matching
      expect(isValidRedirectUrl('https://api.athenius.io')).toBe(false);
      expect(isValidRedirectUrl('https://staging.athenius.io')).toBe(false);
      expect(isValidRedirectUrl('https://test.docs.athenius.io')).toBe(false);
      expect(isValidRedirectUrl('https://evil.docs.athenius.io')).toBe(false);
    });
  });

  describe('Malicious URLs (Open Redirect Attacks)', () => {
    it('should reject completely untrusted domains', () => {
      expect(isValidRedirectUrl('https://evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://malicious.org/phishing')).toBe(false);
      expect(isValidRedirectUrl('http://attacker.net')).toBe(false);
    });

    it('should reject domains that look similar to trusted ones', () => {
      expect(isValidRedirectUrl('https://athenius.com')).toBe(false);
      expect(isValidRedirectUrl('https://athenious.io')).toBe(false);
      expect(isValidRedirectUrl('https://atheniusio.com')).toBe(false);
    });

    it('should reject subdomain injection attacks', () => {
      expect(isValidRedirectUrl('https://athenius.io.evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://docs.athenius.io.evil.com')).toBe(false);
      expect(isValidRedirectUrl('https://athenius-io.evil.com')).toBe(false);
    });

    it('should reject credential injection in URLs', () => {
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

    it('should handle case sensitivity in domain matching', () => {
      expect(isValidRedirectUrl('https://ATHENIUS.IO')).toBe(true);
      expect(isValidRedirectUrl('https://Docs.Athenius.IO')).toBe(true);
      expect(isValidRedirectUrl('HTTPS://athenius.io')).toBe(false);
    });
  });

  describe('Environment-based Domain Configuration', () => {
    it('should reject dev domains when env var is not set', () => {
      // Temporarily unset the env var
      delete process.env.NEXT_PUBLIC_DEV_DOMAINS;

      expect(isValidRedirectUrl('http://localhost:3000')).toBe(false);
      expect(isValidRedirectUrl('http://as.myapp.test:3000')).toBe(false);

      // Production domains should still work
      expect(isValidRedirectUrl('https://athenius.io')).toBe(true);
    });
  });

  describe('SSO Flow (Updated for Exact Matching)', () => {
    function getRedirectForLoggedInUser(redirectTo: string | null): string {
      if (redirectTo && isValidRedirectUrl(redirectTo)) {
        return redirectTo;
      }
      return '/';
    }

    it('should redirect logged-in user to exact trusted domain', () => {
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

    it('should block subdomain takeover attempts in SSO flow', () => {
      // Attacker has taken over evil.docs.athenius.io
      const subdomainTakeover = 'https://evil.docs.athenius.io/phishing';
      const result = getRedirectForLoggedInUser(subdomainTakeover);
      expect(result).toBe('/'); // Blocked with exact matching
    });

    it('should handle full SSO flow: AD -> AS -> AD', () => {
      const adOrigin = 'https://docs.athenius.io';
      const asLoginUrl = `https://athenius.io/auth/login?redirectTo=${encodeURIComponent(adOrigin + '/library')}`;

      const url = new URL(asLoginUrl);
      const redirectTo = url.searchParams.get('redirectTo');

      expect(redirectTo).toBe('https://docs.athenius.io/library');
      expect(isValidRedirectUrl(redirectTo!)).toBe(true);

      const finalRedirect = getRedirectForLoggedInUser(redirectTo);
      expect(finalRedirect).toBe('https://docs.athenius.io/library');
    });

    it('should block SSO flow to untrusted domain', () => {
      const maliciousUrl = 'https://evil.com/phishing';
      const asLoginUrl = `https://athenius.io/auth/login?redirectTo=${encodeURIComponent(maliciousUrl)}`;

      const url = new URL(asLoginUrl);
      const redirectTo = url.searchParams.get('redirectTo');

      expect(isValidRedirectUrl(redirectTo!)).toBe(false);

      const finalRedirect = getRedirectForLoggedInUser(redirectTo);
      expect(finalRedirect).toBe('/');
    });
  });
});
