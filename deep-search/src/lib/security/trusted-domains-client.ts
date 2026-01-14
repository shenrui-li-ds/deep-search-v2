/**
 * Client-side Trusted Domains Configuration
 *
 * This is the client-side version of trusted-domains.ts for use in 'use client' components.
 * Uses NEXT_PUBLIC_ environment variables which are available in the browser.
 */

// Production domains - always trusted
const PRODUCTION_DOMAINS = [
  'docs.athenius.io',
  'athenius.io',
  'www.athenius.io',
];

/**
 * Parse development domains from environment variable.
 * Uses NEXT_PUBLIC_ prefix for client-side access.
 */
function getDevDomains(): string[] {
  const devDomainsEnv = process.env.NEXT_PUBLIC_DEV_DOMAINS;
  if (!devDomainsEnv) return [];

  return devDomainsEnv
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0);
}

/**
 * Get all trusted domains (production + development if configured)
 */
export function getTrustedDomains(): string[] {
  return [...PRODUCTION_DOMAINS, ...getDevDomains()];
}

/**
 * Check if a host exactly matches a trusted domain.
 * Does NOT allow arbitrary subdomains to prevent subdomain takeover attacks.
 */
export function isExactTrustedDomain(host: string): boolean {
  const trustedDomains = getTrustedDomains();
  return trustedDomains.includes(host);
}

/**
 * Validate a redirect URL for client-side use.
 * Only allows relative paths or exact domain matches.
 */
export function isValidRedirectUrl(url: string): boolean {
  // Relative paths starting with single slash are safe
  if (url.startsWith('/') && !url.startsWith('//')) {
    // Additional checks for bypass attempts
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
