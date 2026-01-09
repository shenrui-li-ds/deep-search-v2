import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for whitelist checks
// Prevents email enumeration attacks
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per IP

function getRateLimitKey(request: NextRequest): string {
  // Use IP address for rate limiting
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `whitelist:${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // Clean up expired entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [k, v] of rateLimitMap) {
      if (v.resetTime < now) rateLimitMap.delete(k);
    }
  }

  if (!entry || entry.resetTime < now) {
    // New window
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Rate limited
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  // Increment count
  entry.count++;
  return { allowed: true };
}

// Check if email is in the CAPTCHA bypass whitelist
// Env var: CAPTCHA_WHITELIST_EMAILS (comma-separated)
function isEmailWhitelisted(email?: string): boolean {
  if (!email) return false;

  const whitelist = process.env.CAPTCHA_WHITELIST_EMAILS;
  if (!whitelist) return false;

  const whitelistedEmails = whitelist.split(',').map(e => e.trim().toLowerCase());
  return whitelistedEmails.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting to prevent email enumeration
    const rateLimitKey = getRateLimitKey(request);
    const { allowed, retryAfter } = checkRateLimit(rateLimitKey);

    if (!allowed) {
      return NextResponse.json(
        { whitelisted: false, error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfter) }
        }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { whitelisted: false, error: 'Missing email' },
        { status: 400 }
      );
    }

    const whitelisted = isEmailWhitelisted(email);

    return NextResponse.json({ whitelisted });
  } catch (error) {
    console.error('Whitelist check error:', error);
    return NextResponse.json(
      { whitelisted: false, error: 'Check failed' },
      { status: 500 }
    );
  }
}
