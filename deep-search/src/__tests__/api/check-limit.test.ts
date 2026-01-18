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
import { MAX_CREDITS } from '@/lib/supabase/database';

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

  describe('reserve_and_authorize_search function (unified path)', () => {
    it('should use reserve_and_authorize_search for credit reservation', async () => {
      const reservationId = 'test-reservation-id';
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: true,
          reservation_id: reservationId,
          reserved: 1,
          remaining_after_reserve: 999,
          user_tier: 'free',
          daily_searches_used: 1,
          daily_search_limit: 50,
          monthly_searches_used: 1,
          monthly_search_limit: 1000,
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
      expect(data.reservationId).toBe(reservationId);
      expect(data.maxCredits).toBe(1);
      expect(data.remainingAfterReserve).toBe(999);
      expect(data.userTier).toBe('free');
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reserve_and_authorize_search', {
        p_max_credits: 1,
      });
    });

    it('should block when credits are insufficient', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error_type: 'insufficient_credits',
          reason: 'You need 4 credits but only have 2. Purchase more credits to continue.',
          credits_needed: 4,
          credits_available: 2,
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
      expect(data.reason).toContain('You need 4 credits but only have 2');
      expect(data.creditsNeeded).toBe(4);
      expect(data.creditsAvailable).toBe(2);
      expect(data.isCreditsError).toBe(true);
    });

    it('should block when daily search limit reached', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error_type: 'daily_search_limit',
          reason: 'Daily search limit reached (50 searches). Resets at midnight.',
          daily_searches_used: 50,
          daily_search_limit: 50,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Daily search limit reached');
      expect(data.isRateLimitError).toBe(true);
      expect(data.errorType).toBe('daily_search_limit');
    });

    it('should block when monthly search limit reached', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error_type: 'monthly_search_limit',
          reason: 'Monthly search limit reached (1000 searches). Resets on the 1st.',
          monthly_searches_used: 1000,
          monthly_search_limit: 1000,
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
      expect(data.isRateLimitError).toBe(true);
      expect(data.errorType).toBe('monthly_search_limit');
    });

    it('should block when daily token limit reached', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error_type: 'daily_token_limit',
          reason: 'Daily token limit reached (50000 / 50000). Resets at midnight.',
          daily_tokens_used: 50000,
          daily_token_limit: 50000,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Daily token limit reached');
      expect(data.isTokenLimitError).toBe(true);
      expect(data.errorType).toBe('daily_token_limit');
    });

    it('should block when monthly token limit reached', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          error_type: 'monthly_token_limit',
          reason: 'Monthly token limit reached (500000 / 500000). Resets on the 1st.',
          monthly_tokens_used: 500000,
          monthly_token_limit: 500000,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Monthly token limit reached');
      expect(data.isTokenLimitError).toBe(true);
      expect(data.errorType).toBe('monthly_token_limit');
    });

    it('should reserve correct max credits for each mode', async () => {
      const modes = [
        { mode: 'web', expectedMax: MAX_CREDITS.web },
        { mode: 'pro', expectedMax: MAX_CREDITS.pro },
        { mode: 'brainstorm', expectedMax: MAX_CREDITS.brainstorm },
      ];

      for (const { mode, expectedMax } of modes) {
        jest.clearAllMocks();
        mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } });
        mockSupabaseClient.rpc.mockResolvedValueOnce({
          data: {
            allowed: true,
            reservation_id: `res-${mode}`,
            reserved: expectedMax,
            remaining_after_reserve: 1000 - expectedMax,
            user_tier: 'free',
            daily_searches_used: 1,
            daily_search_limit: 50,
            monthly_searches_used: 1,
            monthly_search_limit: 1000,
          },
          error: null,
        });

        const request = new NextRequest('http://localhost/api/check-limit', {
          method: 'POST',
          body: JSON.stringify({ mode }),
        });

        await POST(request);

        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reserve_and_authorize_search', {
          p_max_credits: expectedMax,
        });
      }
    });
  });

  describe('legacy fallback system', () => {
    it('should fall back to reserve_credits when reserve_and_authorize_search does not exist', async () => {
      // reserve_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // reserve_credits works
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: true,
          reservation_id: 'test-id',
          reserved: 1,
          remaining_after_reserve: 999,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2);
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(1, 'reserve_and_authorize_search', { p_max_credits: 1 });
      expect(mockSupabaseClient.rpc).toHaveBeenNthCalledWith(2, 'reserve_credits', { p_max_credits: 1 });
    });

    it('should fall back to check_and_authorize_search when reserve_credits does not exist', async () => {
      // reserve_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // reserve_credits doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_authorize_search works
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
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(3);
    });

    it('should block when legacy check fails', async () => {
      // reserve_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // reserve_credits doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_authorize_search fails
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: false,
          reason: 'Daily search limit reached',
          daily_limit: 50,
          daily_used: 50,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('Daily search limit reached');
    });

    it('should fall back to check_and_use_credits when check_and_authorize_search does not exist', async () => {
      // reserve_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // reserve_credits doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_use_credits works
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: true,
          source: 'free',
          credits_used: 1,
        },
        error: null,
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(4);
    });

    it('should fail-closed when no credit functions exist', async () => {
      // reserve_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // reserve_credits doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_authorize_search doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });
      // check_and_use_credits doesn't exist
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: '42883', message: 'function does not exist' },
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Fail-closed: don't allow without credit system
      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('unavailable');
      expect(data.isTemporaryError).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should deny on database error (fail-closed for security)', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'UNKNOWN', message: 'Database error' },
      });

      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Fail-closed: don't allow unlimited searches on database errors
      expect(data.allowed).toBe(false);
      expect(data.reason).toContain('try again');
      expect(data.isTemporaryError).toBe(true);
    });

    it('should handle malformed request body gracefully', async () => {
      mockSupabaseClient.rpc.mockResolvedValueOnce({
        data: {
          allowed: true,
          reservation_id: 'test-id',
          reserved: 1,
          remaining_after_reserve: 999,
          user_tier: 'free',
          daily_searches_used: 1,
          daily_search_limit: 50,
          monthly_searches_used: 1,
          monthly_search_limit: 1000,
        },
        error: null,
      });

      // Request with invalid JSON body
      const request = new NextRequest('http://localhost/api/check-limit', {
        method: 'POST',
        body: 'not-json',
      });

      const response = await POST(request);
      const data = await response.json();

      // Should use default mode 'web' and succeed
      expect(data.allowed).toBe(true);
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reserve_and_authorize_search', {
        p_max_credits: 1,
      });
    });
  });

  describe('MAX_CREDITS export', () => {
    it('should export correct max credits per mode', () => {
      expect(MAX_CREDITS.web).toBe(1);
      expect(MAX_CREDITS.pro).toBe(4);
      expect(MAX_CREDITS.brainstorm).toBe(6);
    });
  });
});
