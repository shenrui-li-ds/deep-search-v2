/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock Supabase client
const mockRpc = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: mockRpc,
  }),
}));

// Import after mocking
import { POST } from '@/app/api/auth/verify-otp/route';

describe('/api/auth/verify-otp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validation', () => {
    it('should return 400 if email is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ code: '123456', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Email, code, and purpose are required');
    });

    it('should return 400 if code is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', purpose: 'login' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 if purpose is missing', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 if purpose is invalid', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          purpose: 'invalid',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid purpose');
    });

    it('should return 400 if code format is invalid (not 6 digits)', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '12345', // Only 5 digits
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid code format');
    });

    it('should return 400 if code contains non-digits', async () => {
      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '12345a',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid code format');
    });
  });

  describe('OTP verification', () => {
    it('should call verify_email_otp with correct parameters', async () => {
      mockRpc.mockResolvedValueOnce({
        data: { success: true, verified_at: new Date().toISOString() },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'Test@Example.com',
          code: '123456',
          purpose: 'signup',
        }),
      });

      await POST(request);

      expect(mockRpc).toHaveBeenCalledWith('verify_email_otp', {
        p_email: 'test@example.com', // Should be lowercased
        p_code: '123456',
        p_purpose: 'signup',
      });
    });

    it('should return success with verified_at on valid code', async () => {
      const verifiedAt = new Date().toISOString();
      mockRpc.mockResolvedValueOnce({
        data: { success: true, verified_at: verifiedAt },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.verified_at).toBe(verifiedAt);
    });

    it('should return 400 with error on invalid code', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Invalid or expired code',
          attempts_remaining: 4,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '999999',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or expired code');
      expect(data.attempts_remaining).toBe(4);
    });

    it('should return 400 when code has expired', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Code has expired',
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Code has expired');
    });

    it('should return 400 when max attempts exceeded', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Maximum attempts exceeded',
          attempts_remaining: 0,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.attempts_remaining).toBe(0);
    });

    it('should return 500 on database error', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const request = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          purpose: 'login',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to verify code');
    });
  });

  describe('purpose validation', () => {
    it.each(['signup', 'login', 'reset'])(
      'should accept valid purpose: %s',
      async (purpose) => {
        mockRpc.mockResolvedValueOnce({
          data: { success: true, verified_at: new Date().toISOString() },
          error: null,
        });

        const request = new NextRequest('http://localhost/api/auth/verify-otp', {
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            code: '123456',
            purpose,
          }),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      }
    );
  });
});
