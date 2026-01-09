/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Must be declared before jest.mock since jest.mock is hoisted
let mockRpc: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

// Mock global fetch for Resend API
let mockFetch: jest.Mock;

// Import after mocking
import { POST } from '@/app/api/auth/send-otp/route';

describe('/api/auth/send-otp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockRpc = jest.fn();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      RESEND_API_KEY: 'test-resend-key',
      RESEND_FROM_EMAIL: 'noreply@test.com',
      NEXT_PUBLIC_APP_NAME: 'TestApp',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validation', () => {
    it('should return 400 if email is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Email and purpose are required');
    });

    it('should return 400 if purpose is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 if purpose is invalid', async () => {
      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'invalid' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid purpose');
    });
  });

  describe('OTP generation', () => {
    it('should call generate_email_otp with correct parameters', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '123456', expires_in: 600 },
        error: null,
      });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'Test@Example.com', purpose: 'signup' }),
        headers: {
          'x-forwarded-for': '192.168.1.1',
        },
      });

      await POST(request);

      expect(mockRpc).toHaveBeenCalledWith('generate_email_otp', {
        p_email: 'test@example.com', // Should be lowercased
        p_purpose: 'signup',
        p_ip_address: '192.168.1.1',
      });
    });

    it('should return 429 when rate limited', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: false, error: 'Rate limited', retry_after: 300 },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.retry_after).toBe(300);
    });

    it('should return 500 on database error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });

  describe('email sending', () => {
    it('should send email via Resend API', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '654321', expires_in: 600 },
        error: null,
      });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      await POST(request);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-resend-key',
            'Content-Type': 'application/json',
          },
        })
      );

      // Check email body contains the code
      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.to).toBe('test@example.com');
      expect(body.from).toBe('noreply@test.com');
      expect(body.subject).toContain('654321');
      expect(body.html).toContain('654321');
    });

    it('should return 500 when Resend API fails', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '123456', expires_in: 600 },
        error: null,
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid API key'),
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to send verification email');
    });

    it('should return 500 when RESEND_API_KEY is not configured', async () => {
      delete process.env.RESEND_API_KEY;

      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '123456', expires_in: 600 },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Email service not configured');
    });
  });

  describe('successful flow', () => {
    it('should return success with expires_in', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '123456', expires_in: 600 },
        error: null,
      });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'signup' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.expires_in).toBe(600);
      expect(data.message).toBe('Verification code sent');
    });
  });

  describe('rate limiting', () => {
    /**
     * Rate limits (per generate_email_otp database function):
     * - 3 requests per email PER PURPOSE per 10 minutes
     *   (so 3 signup + 3 login + 3 reset = 9 total possible)
     * - 10 requests per IP per hour
     * - 5 verification attempts per code before invalidation
     */
    it('should return 429 with retry_after when email rate limited', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Too many verification requests. Please wait 10 minutes.',
          retry_after: 600,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'signup' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.retry_after).toBe(600);
    });

    it('should return 429 with retry_after when IP rate limited', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Too many requests from your location. Please try again later.',
          retry_after: 3600,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.retry_after).toBe(3600);
    });
  });

  describe('purpose-specific email text', () => {
    it.each([
      ['signup', 'complete your signup'],
      ['login', 'log in to your account'],
      ['reset', 'reset your password'],
    ])('should use correct text for %s purpose', async (purpose, expectedText) => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, code: '123456', expires_in: 600 },
        error: null,
      });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const request = new NextRequest('http://localhost/api/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose }),
      });

      await POST(request);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.html).toContain(expectedText);
      expect(body.text).toContain(expectedText);
    });
  });
});
