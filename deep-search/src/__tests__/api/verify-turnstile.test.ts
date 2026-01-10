/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocking
import { POST } from '@/app/api/auth/verify-turnstile/route';

describe('/api/auth/verify-turnstile', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, TURNSTILE_SECRET_KEY: 'test-secret-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validation', () => {
    it('should return 400 if token is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
      delete process.env.TURNSTILE_SECRET_KEY;

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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

  describe('successful verification', () => {
    it('should return success when Cloudflare verifies token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
        method: 'POST',
        body: JSON.stringify({ token: 'valid-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should include secret and token in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
    it('should return 400 when Cloudflare rejects token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: false,
          'error-codes': ['invalid-input-response'],
        }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
        method: 'POST',
        body: JSON.stringify({ token: 'invalid-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Verification failed');
    });

    it('should return 503 when Cloudflare API returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
        method: 'POST',
        body: JSON.stringify({ token: 'test-token' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Verification service unavailable');
    });

    it('should return 500 when fetch throws an error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const request = new NextRequest('http://localhost/api/auth/verify-turnstile', {
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
