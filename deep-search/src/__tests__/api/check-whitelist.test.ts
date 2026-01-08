/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Import after setting up env
import { POST } from '@/app/api/auth/check-whitelist/route';

describe('/api/auth/check-whitelist', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validation', () => {
    it('should return 400 if email is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.whitelisted).toBe(false);
      expect(data.error).toBe('Missing email');
    });
  });

  describe('whitelist checking', () => {
    it('should return whitelisted=true for whitelisted email', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'test@example.com';

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(true);
    });

    it('should return whitelisted=false for non-whitelisted email', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'other@example.com';

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(false);
    });

    it('should return whitelisted=false when env var not set', async () => {
      delete process.env.CAPTCHA_WHITELIST_EMAILS;

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(false);
    });

    it('should handle case-insensitive email matching', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'Test@Example.com';

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(true);
    });

    it('should handle multiple whitelisted emails', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'user1@example.com,user2@example.com,user3@example.com';

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'user2@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(true);
    });

    it('should handle whitespace in whitelisted emails', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = '  test@example.com  , other@example.com ';

      const request = new NextRequest('http://localhost/api/auth/check-whitelist', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.whitelisted).toBe(true);
    });
  });
});
