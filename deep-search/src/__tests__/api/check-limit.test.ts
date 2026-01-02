/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock user
const mockUser = { id: 'test-user-id', email: 'test@example.com' };

// Mock Supabase client
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn(),
  },
  rpc: jest.fn(),
  from: jest.fn(() => mockSupabaseClient),
  select: jest.fn(() => mockSupabaseClient),
  single: jest.fn(),
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}));

// Import after mocking
import { POST } from '@/app/api/check-limit/route';

describe('/api/check-limit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } });
  });

  describe('unauthenticated requests', () => {
    it('should allow unauthenticated users', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });
  });

  describe('rate limits check (security)', () => {
    it('should block when daily rate limit is reached', async () => {
      // Rate limit check returns not allowed
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          reason: 'Daily search limit reached (50 searches). Resets at midnight.',
          daily_limit: 50,
          daily_used: 50,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
        body: JSON.stringify({ mode: 'web' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Daily search limit reached');
      // Should NOT call credit check if rate limit fails
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('check_and_increment_search_v2');
    });

    it('should block when monthly rate limit is reached', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          reason: 'Monthly search limit reached (1000 searches). Resets on the 1st.',
          daily_limit: 50,
          daily_used: 10,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Monthly search limit reached');
    });
  });

  describe('credit check (billing)', () => {
    it('should check credits after rate limits pass', async () => {
      // Rate limit passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, daily_limit: 50, daily_used: 10 },
        error: null,
      });
      // Credit check passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: true,
          source: 'free',
          credits_used: 1,
          remaining_free: 999,
          remaining_purchased: 0,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
        body: JSON.stringify({ mode: 'web' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(data.creditsUsed).toBe(1);
      expect(data.source).toBe('free');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(1, 'check_and_increment_search_v2');
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'check_and_use_credits', {
        p_credits_needed: 1,
      });
    });

    it('should block when insufficient credits', async () => {
      // Rate limit passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, daily_limit: 50, daily_used: 10 },
        error: null,
      });
      // Credit check fails
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error: 'Insufficient credits',
          needed: 2,
          remaining_free: 0,
          remaining_purchased: 1,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
        body: JSON.stringify({ mode: 'pro' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Insufficient credits');
      expect(data.creditsNeeded).toBe(2);
    });

    it('should use correct credit cost for each mode', async () => {
      // Rate limit passes for all tests
      mockSupabaseClient.rpc.mockResolvedValue({
        data: { allowed: true, daily_limit: 50, daily_used: 10 },
        error: null,
      });

      const modes = [
        { mode: 'web', expectedCredits: 1 },
        { mode: 'pro', expectedCredits: 2 },
        { mode: 'brainstorm', expectedCredits: 2 },
      ];

      for (const { mode, expectedCredits } of modes) {
        jest.clearAllMocks();
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: { allowed: true, daily_limit: 50, daily_used: 10 },
          error: null,
        });
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: { allowed: true, source: 'free', credits_used: expectedCredits },
          error: null,
        });

        const request = new NextRequest('http://localhost/api/check-limit', {
          method: 'POST',
          body: JSON.stringify({ mode }),
        });

        await POST(request);

        expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'check_and_use_credits', {
          p_credits_needed: expectedCredits,
        });
      }
    });
  });

  describe('fallback behavior', () => {
    it('should allow if credit functions do not exist (rate limits only)', async () => {
      // Rate limit passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, daily_limit: 50, daily_used: 10 },
        error: null,
      });
      // Credit function doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(data.remaining).toBe(40); // 50 - 10
    });

    it('should fallback to v1 rate limit if v2 does not exist', async () => {
      // v2 doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // v1 returns true (allowed)
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: true,
        error: null,
      });
      // Credit check passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, source: 'free', credits_used: 1 },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(1, 'check_and_increment_search_v2');
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'check_and_increment_search');
    });

    it('should skip rate limits if no rate limit functions exist', async () => {
      // v2 doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // v1 doesn't exist either
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // Credit check passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, source: 'free', credits_used: 1 },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should allow on rate limit error (fail open for availability)', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'Database error' },
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Fail open - allow on error to maintain availability
      expect(data.allowed).toBe(true);
    });

    it('should allow on credit check error after rate limits pass', async () => {
      // Rate limit passes
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: { allowed: true, daily_limit: 50, daily_used: 10 },
        error: null,
      });
      // Credit check errors
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'Database error' },
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Rate limits passed, credit error = fail open
      expect(data.allowed).toBe(true);
    });
  });
});
