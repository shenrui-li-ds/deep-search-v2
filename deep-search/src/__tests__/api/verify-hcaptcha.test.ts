/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocking
import { POST } from '@/app/api/auth/verify-hcaptcha/route';

describe('/api/auth/verify-hcaptcha', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, HCAPTCHA_SECRET_KEY: 'test-secret-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validation', () => {
    it('should return 400 if token is missing and email not whitelisted', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing token');
    });

    it('should return 500 if secret key is not configured', async () => {
      delete process.env.HCAPTCHA_SECRET_KEY;

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Server configuration error');
    });
  });

  describe('email whitelist bypass', () => {
    it('should return success for whitelisted email without token', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'test@example.com';

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.bypassed).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle case-insensitive email matching', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'Test@Example.com';

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.bypassed).toBe(true);
    });

    it('should not bypass for non-whitelisted email', async () => {
      process.env.CAPTCHA_WHITELIST_EMAILS = 'other@example.com';

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing token');
    });

    it('should require token when whitelist env var not set', async () => {
      delete process.env.CAPTCHA_WHITELIST_EMAILS;

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing token');
    });
  });

  describe('successful verification', () => {
    it('should return success when hCaptcha verifies token', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'valid-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hcaptcha.com/siteverify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should include secret and token in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token-123' }),
      });

      await POST(request);

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toContain('secret=test-secret-key');
      expect(body).toContain('response=test-token-123');
    });
  });

  describe('failed verification', () => {
    it('should return 400 when hCaptcha rejects token', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'invalid-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Verification failed');
    });

    it('should return 500 when fetch throws an error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Verification error');
    });
  });

  describe('IP forwarding', () => {
    it('should include client IP when x-forwarded-for header is present', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      });

      await POST(request);

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toContain('remoteip=192.168.1.1');
    });

    it('should include client IP when x-real-ip header is present', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
        headers: {
          'x-real-ip': '10.0.0.5',
        },
      });

      await POST(request);

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).toContain('remoteip=10.0.0.5');
    });

    it('should not include remoteip when IP is unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-hcaptcha', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
      });

      await POST(request);

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;
      expect(body).not.toContain('remoteip');
    });
  });
});
