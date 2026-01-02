/**
 * @jest-environment node
 */

// Mock the Supabase client before importing
const mockUser = { id: 'test-user-id', email: 'test@example.com' };

// Create mock with proper chaining - all methods return 'this' for chaining by default
const mockSupabaseClient: Record<string, jest.Mock | unknown> = {};

// Helper to reset mock chain (called in beforeEach)
const resetMockChain = () => {
  const chainableMethods = ['from', 'select', 'insert', 'delete', 'update', 'eq', 'or', 'order', 'range', 'limit', 'single', 'gte'];
  chainableMethods.forEach(method => {
    if (!mockSupabaseClient[method]) {
      mockSupabaseClient[method] = jest.fn();
    }
    (mockSupabaseClient[method] as jest.Mock).mockReset();
    (mockSupabaseClient[method] as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  if (!mockSupabaseClient.auth) {
    mockSupabaseClient.auth = { getUser: jest.fn() };
  }
  (mockSupabaseClient.auth as { getUser: jest.Mock }).getUser.mockReset();
  (mockSupabaseClient.auth as { getUser: jest.Mock }).getUser.mockResolvedValue({ data: { user: mockUser } });

  if (!mockSupabaseClient.rpc) {
    mockSupabaseClient.rpc = jest.fn();
  }
  (mockSupabaseClient.rpc as jest.Mock).mockReset();
  (mockSupabaseClient.rpc as jest.Mock).mockResolvedValue({ data: true, error: null });
};

// Initialize the mock
resetMockChain();

// Mock the createClient function
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

import {
  addSearchToHistory,
  getSearchHistory,
  searchHistory,
  deleteSearchFromHistory,
  clearSearchHistory,
  getSearchHistoryCount,
  toggleBookmark,
  getBookmarkedSearches,
  getBookmarkedCount,
  getUserLimits,
  canPerformSearch,
  getUserPreferences,
  updateUserPreferences,
  getUserCredits,
  checkAndUseCredits,
  hasEnoughCredits,
  getPurchaseHistory,
  getUsageStats,
  CREDIT_COSTS,
} from '@/lib/supabase/database';

describe('Supabase Database Functions', () => {
  beforeEach(() => {
    // Reset all mocks and re-establish chain
    resetMockChain();
  });

  describe('addSearchToHistory', () => {
    it('should call upsert_search_history RPC with correct parameters', async () => {
      const entry = {
        query: 'test query',
        provider: 'deepseek',
        mode: 'web' as const,
        sources_count: 10,
        refined_query: 'refined test query',
      };

      const mockResult = {
        id: 'new-id',
        ...entry,
        user_id: mockUser.id,
        bookmarked: false,
      };

      // RPC returns an array
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: [mockResult],
        error: null,
      });

      const result = await addSearchToHistory(entry);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_search_history', {
        p_user_id: mockUser.id,
        p_query: entry.query,
        p_provider: entry.provider,
        p_mode: entry.mode,
        p_sources_count: entry.sources_count,
        p_refined_query: entry.refined_query,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle null refined_query', async () => {
      const entry = {
        query: 'test query',
        provider: 'deepseek',
        mode: 'web' as const,
        sources_count: 10,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{ id: 'new-id', ...entry, user_id: mockUser.id }],
        error: null,
      });

      await addSearchToHistory(entry);

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_search_history', {
        p_user_id: mockUser.id,
        p_query: entry.query,
        p_provider: entry.provider,
        p_mode: entry.mode,
        p_sources_count: entry.sources_count,
        p_refined_query: null,
      });
    });

    it('should return null if no user is logged in', async () => {
      (mockSupabaseClient.auth as { getUser: jest.Mock }).getUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await addSearchToHistory({
        query: 'test',
        provider: 'deepseek',
        mode: 'web',
        sources_count: 5,
      });

      expect(result).toBeNull();
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });

    it('should throw error if RPC fails', async () => {
      const entry = {
        query: 'test query',
        provider: 'deepseek',
        mode: 'web' as const,
        sources_count: 10,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC error' },
      });

      await expect(addSearchToHistory(entry)).rejects.toEqual({ message: 'RPC error' });
    });
  });

  describe('getSearchHistory', () => {
    it('should fetch search history with default limit', async () => {
      const mockHistory = [
        { id: '1', query: 'query 1', provider: 'deepseek', mode: 'web', sources_count: 5 },
        { id: '2', query: 'query 2', provider: 'openai', mode: 'pro', sources_count: 10 },
      ];

      mockSupabaseClient.range.mockResolvedValueOnce({
        data: mockHistory,
        error: null,
      });

      const result = await getSearchHistory();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(0, 49); // Default limit 50
      expect(result).toEqual(mockHistory);
    });

    it('should respect custom limit and offset', async () => {
      mockSupabaseClient.range.mockResolvedValueOnce({ data: [], error: null });

      await getSearchHistory(20, 10);

      expect(mockSupabaseClient.range).toHaveBeenCalledWith(10, 29);
    });
  });

  describe('searchHistory', () => {
    it('should search history with a search term', async () => {
      const searchTerm = 'quantum';
      const mockResults = [
        { id: '1', query: 'quantum computing', provider: 'deepseek', mode: 'web', sources_count: 8 },
      ];

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: mockResults,
        error: null,
      });

      const result = await searchHistory(searchTerm);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.or).toHaveBeenCalledWith(
        `query.ilike.%${searchTerm}%,refined_query.ilike.%${searchTerm}%`
      );
      expect(result).toEqual(mockResults);
    });
  });

  describe('deleteSearchFromHistory', () => {
    it('should delete a search entry by id', async () => {
      mockSupabaseClient.eq.mockResolvedValueOnce({ error: null });

      await deleteSearchFromHistory('test-id');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'test-id');
    });
  });

  describe('clearSearchHistory', () => {
    it('should clear all search history for the current user', async () => {
      mockSupabaseClient.eq.mockResolvedValueOnce({ error: null });

      await clearSearchHistory();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUser.id);
    });

    it('should not delete anything if no user is logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      await clearSearchHistory();

      expect(mockSupabaseClient.delete).not.toHaveBeenCalled();
    });
  });

  describe('getSearchHistoryCount', () => {
    it('should return the count of search history entries', async () => {
      mockSupabaseClient.select.mockResolvedValueOnce({
        count: 42,
        error: null,
      });

      const result = await getSearchHistoryCount();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(result).toBe(42);
    });

    it('should return 0 if count is null', async () => {
      mockSupabaseClient.select.mockResolvedValueOnce({
        count: null,
        error: null,
      });

      const result = await getSearchHistoryCount();

      expect(result).toBe(0);
    });
  });

  describe('toggleBookmark', () => {
    it('should toggle bookmark from false to true', async () => {
      // Mock the first chain ending with .single() to return current bookmark status
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { bookmarked: false },
        error: null,
      });
      // The second chain (.update().eq()) just needs to not error - eq returns mock by default

      const result = await toggleBookmark('test-id');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ bookmarked: true });
      expect(result).toBe(true);
    });

    it('should toggle bookmark from true to false', async () => {
      // Mock the first chain ending with .single() to return current bookmark status
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { bookmarked: true },
        error: null,
      });

      const result = await toggleBookmark('test-id');

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({ bookmarked: false });
      expect(result).toBe(false);
    });
  });

  describe('getBookmarkedSearches', () => {
    it('should fetch bookmarked searches', async () => {
      const mockBookmarked = [
        { id: '1', query: 'query 1', provider: 'deepseek', mode: 'web', sources_count: 5, bookmarked: true },
        { id: '2', query: 'query 2', provider: 'openai', mode: 'pro', sources_count: 10, bookmarked: true },
      ];

      mockSupabaseClient.range.mockResolvedValueOnce({
        data: mockBookmarked,
        error: null,
      });

      const result = await getBookmarkedSearches();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('bookmarked', true);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual(mockBookmarked);
    });

    it('should respect custom limit and offset', async () => {
      mockSupabaseClient.range.mockResolvedValueOnce({ data: [], error: null });

      await getBookmarkedSearches(20, 10);

      expect(mockSupabaseClient.range).toHaveBeenCalledWith(10, 29);
    });
  });

  describe('getBookmarkedCount', () => {
    it('should return the count of bookmarked entries', async () => {
      // Chain ends with .eq(), so mock eq to return the count result
      mockSupabaseClient.eq.mockResolvedValueOnce({
        count: 15,
        error: null,
      });

      const result = await getBookmarkedCount();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('bookmarked', true);
      expect(result).toBe(15);
    });

    it('should return 0 if count is null', async () => {
      // Chain ends with .eq(), so mock eq to return the count result
      mockSupabaseClient.eq.mockResolvedValueOnce({
        count: null,
        error: null,
      });

      const result = await getBookmarkedCount();

      expect(result).toBe(0);
    });
  });

  describe('getUserLimits', () => {
    it('should return user limits', async () => {
      const mockLimits = {
        user_id: mockUser.id,
        daily_search_limit: 50,
        daily_searches_used: 10,
        daily_token_limit: 100000,
        daily_tokens_used: 5000,
        monthly_search_limit: 1000,
        monthly_searches_used: 100,
        monthly_token_limit: 500000,
        monthly_tokens_used: 50000,
        last_daily_reset: '2024-01-15',
        last_monthly_reset: '2024-01-01',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockLimits,
        error: null,
      });

      const result = await getUserLimits();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_limits');
      expect(result).toEqual(mockLimits);
    });

    it('should return null if no user is logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await getUserLimits();

      expect(result).toBeNull();
    });
  });

  describe('canPerformSearch', () => {
    it('should return allowed true if user has no limits record', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await canPerformSearch();

      expect(result).toEqual({ allowed: true });
    });

    it('should return allowed false if daily limit reached', async () => {
      const mockLimits = {
        user_id: mockUser.id,
        daily_search_limit: 50,
        daily_searches_used: 50,
        daily_token_limit: 100000,
        daily_tokens_used: 5000,
        monthly_search_limit: 1000,
        monthly_searches_used: 100,
        monthly_token_limit: 500000,
        monthly_tokens_used: 100000,
        last_daily_reset: new Date().toISOString().split('T')[0], // Today
        last_monthly_reset: '2024-01-01',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockLimits,
        error: null,
      });

      const result = await canPerformSearch();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily search limit reached');
    });

    it('should return allowed false if monthly token limit reached', async () => {
      const mockLimits = {
        user_id: mockUser.id,
        daily_search_limit: 50,
        daily_searches_used: 10,
        daily_token_limit: 100000,
        daily_tokens_used: 5000,
        monthly_search_limit: 1000,
        monthly_searches_used: 100,
        monthly_token_limit: 500000,
        monthly_tokens_used: 500000, // At limit
        last_daily_reset: new Date().toISOString().split('T')[0],
        last_monthly_reset: '2024-01-01',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockLimits,
        error: null,
      });

      const result = await canPerformSearch();

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Monthly token limit reached');
    });

    it('should return allowed true if under all limits', async () => {
      const mockLimits = {
        user_id: mockUser.id,
        daily_search_limit: 50,
        daily_searches_used: 10,
        daily_token_limit: 100000,
        daily_tokens_used: 5000,
        monthly_search_limit: 1000,
        monthly_searches_used: 100,
        monthly_token_limit: 500000,
        monthly_tokens_used: 100000,
        last_daily_reset: new Date().toISOString().split('T')[0],
        last_monthly_reset: '2024-01-01',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockLimits,
        error: null,
      });

      const result = await canPerformSearch();

      expect(result).toEqual({ allowed: true });
    });
  });

  describe('getUserPreferences', () => {
    it('should return user preferences', async () => {
      const mockPreferences = {
        user_id: mockUser.id,
        default_provider: 'claude',
        default_mode: 'pro',
        created_at: '2024-01-15T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockPreferences,
        error: null,
      });

      const result = await getUserPreferences();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_preferences');
      expect(result).toEqual(mockPreferences);
    });

    it('should return null if no user is logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await getUserPreferences();

      expect(result).toBeNull();
    });

    it('should return defaults if no preferences record exists (PGRST116)', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await getUserPreferences();

      expect(result).toEqual({
        user_id: mockUser.id,
        default_provider: 'deepseek',
        default_mode: 'web',
      });
    });

    it('should throw error for other database errors', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error', code: 'OTHER_ERROR' },
      });

      await expect(getUserPreferences()).rejects.toEqual({
        message: 'Database error',
        code: 'OTHER_ERROR',
      });
    });
  });

  describe('updateUserPreferences', () => {
    it('should call upsert_user_preferences RPC with correct parameters', async () => {
      const mockResult = {
        user_id: mockUser.id,
        default_provider: 'grok',
        default_mode: 'brainstorm',
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await updateUserPreferences({
        default_provider: 'grok',
        default_mode: 'brainstorm',
      });

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_user_preferences', {
        p_default_provider: 'grok',
        p_default_mode: 'brainstorm',
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle partial update (only provider)', async () => {
      const mockResult = {
        user_id: mockUser.id,
        default_provider: 'openai',
        default_mode: 'web',
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await updateUserPreferences({
        default_provider: 'openai',
      });

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_user_preferences', {
        p_default_provider: 'openai',
        p_default_mode: null,
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle partial update (only mode)', async () => {
      const mockResult = {
        user_id: mockUser.id,
        default_provider: 'deepseek',
        default_mode: 'pro',
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await updateUserPreferences({
        default_mode: 'pro',
      });

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_user_preferences', {
        p_default_provider: null,
        p_default_mode: 'pro',
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null if no user is logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await updateUserPreferences({
        default_provider: 'claude',
      });

      expect(result).toBeNull();
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    });

    it('should throw error if RPC fails', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC error' },
      });

      await expect(
        updateUserPreferences({ default_provider: 'claude' })
      ).rejects.toEqual({ message: 'RPC error' });
    });
  });

  // ============================================
  // CREDIT SYSTEM TESTS
  // ============================================

  describe('CREDIT_COSTS', () => {
    it('should have correct credit costs for each mode', () => {
      expect(CREDIT_COSTS.web).toBe(1);
      expect(CREDIT_COSTS.pro).toBe(3);
      expect(CREDIT_COSTS.brainstorm).toBe(3);
    });
  });

  describe('getUserCredits', () => {
    it('should return user credits from RPC', async () => {
      const mockCredits = {
        monthly_free_credits: 1000,
        free_credits_used: 100,
        free_credits_remaining: 900,
        purchased_credits: 500,
        total_available: 1400,
        days_until_reset: 15,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockCredits,
        error: null,
      });

      const result = await getUserCredits();

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_user_credits');
      expect(result).toEqual(mockCredits);
    });

    it('should return null if RPC returns error response', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: { error: 'Not authenticated' },
        error: null,
      });

      const result = await getUserCredits();

      expect(result).toBeNull();
    });

    it('should throw error if RPC fails', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(getUserCredits()).rejects.toEqual({ message: 'Database error' });
    });
  });

  describe('checkAndUseCredits', () => {
    it('should check and use credits for web mode (1 credit)', async () => {
      const mockResult = {
        allowed: true,
        source: 'free',
        credits_used: 1,
        remaining_free: 899,
        remaining_purchased: 0,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await checkAndUseCredits('web');

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('check_and_use_credits', {
        p_credits_needed: 1,
      });
      expect(result).toEqual(mockResult);
    });

    it('should check and use credits for pro mode (3 credits)', async () => {
      const mockResult = {
        allowed: true,
        source: 'purchased',
        credits_used: 3,
        remaining_free: 0,
        remaining_purchased: 497,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await checkAndUseCredits('pro');

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('check_and_use_credits', {
        p_credits_needed: 3,
      });
      expect(result).toEqual(mockResult);
    });

    it('should check and use credits for brainstorm mode (3 credits)', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: { allowed: true, source: 'free', credits_used: 3, remaining_free: 997, remaining_purchased: 0 },
        error: null,
      });

      const result = await checkAndUseCredits('brainstorm');

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('check_and_use_credits', {
        p_credits_needed: 3,
      });
      expect(result.allowed).toBe(true);
    });

    it('should return not allowed if insufficient credits', async () => {
      const mockResult = {
        allowed: false,
        error: 'Insufficient credits',
        needed: 2,
        remaining_free: 0,
        remaining_purchased: 1,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const result = await checkAndUseCredits('pro');

      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Insufficient credits');
    });

    it('should return safe default on RPC error', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC error' },
      });

      const result = await checkAndUseCredits('web');

      expect(result.allowed).toBe(false);
      expect(result.error).toBe('Failed to check credits');
    });
  });

  describe('hasEnoughCredits', () => {
    it('should return true if user has enough credits', async () => {
      const mockCredits = {
        monthly_free_credits: 1000,
        free_credits_used: 100,
        free_credits_remaining: 900,
        purchased_credits: 0,
        total_available: 900,
        days_until_reset: 15,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockCredits,
        error: null,
      });

      const result = await hasEnoughCredits('web');

      expect(result.hasCredits).toBe(true);
      expect(result.totalAvailable).toBe(900);
      expect(result.creditsNeeded).toBe(1);
    });

    it('should return false if user does not have enough credits', async () => {
      const mockCredits = {
        monthly_free_credits: 1000,
        free_credits_used: 1000,
        free_credits_remaining: 0,
        purchased_credits: 1,
        total_available: 1,
        days_until_reset: 15,
      };

      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: mockCredits,
        error: null,
      });

      const result = await hasEnoughCredits('pro'); // Needs 3 credits

      expect(result.hasCredits).toBe(false);
      expect(result.totalAvailable).toBe(1);
      expect(result.creditsNeeded).toBe(3);
    });

    it('should return false if getUserCredits returns null', async () => {
      (mockSupabaseClient.rpc as jest.Mock).mockResolvedValueOnce({
        data: { error: 'Not authenticated' },
        error: null,
      });

      const result = await hasEnoughCredits('web');

      expect(result.hasCredits).toBe(false);
      expect(result.totalAvailable).toBe(0);
    });
  });

  describe('getPurchaseHistory', () => {
    it('should fetch purchase history with default limit', async () => {
      const mockPurchases = [
        { id: '1', pack_type: 'starter', credits: 500, amount_cents: 500, status: 'completed', created_at: '2024-01-15' },
        { id: '2', pack_type: 'plus', credits: 2000, amount_cents: 1500, status: 'completed', created_at: '2024-01-10' },
      ];

      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: mockPurchases,
        error: null,
      });

      const result = await getPurchaseHistory();

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('credit_purchases');
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(50);
      expect(result).toEqual(mockPurchases);
    });

    it('should respect custom limit', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null });

      await getPurchaseHistory(10);

      expect(mockSupabaseClient.limit).toHaveBeenCalledWith(10);
    });

    it('should throw error if query fails', async () => {
      mockSupabaseClient.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query error' },
      });

      await expect(getPurchaseHistory()).rejects.toEqual({ message: 'Query error' });
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      const mockSearchHistory = [
        { mode: 'web', provider: 'deepseek', created_at: new Date().toISOString() },
        { mode: 'web', provider: 'deepseek', created_at: new Date().toISOString() },
        { mode: 'pro', provider: 'openai', created_at: new Date().toISOString() },
        { mode: 'brainstorm', provider: 'claude', created_at: new Date().toISOString() },
      ];

      mockSupabaseClient.gte.mockResolvedValueOnce({
        data: mockSearchHistory,
        error: null,
      });

      const result = await getUsageStats(30);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('mode, provider, created_at');
      expect(result.totalSearches).toBe(4);
      expect(result.byMode).toEqual([
        { mode: 'web', count: 2 },
        { mode: 'pro', count: 1 },
        { mode: 'brainstorm', count: 1 },
      ]);
      expect(result.byProvider).toEqual([
        { provider: 'deepseek', count: 2 },
        { provider: 'openai', count: 1 },
        { provider: 'claude', count: 1 },
      ]);
      expect(result.last30Days.length).toBe(30);
    });

    it('should return empty stats if no search history', async () => {
      mockSupabaseClient.gte.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await getUsageStats();

      expect(result.totalSearches).toBe(0);
      expect(result.byMode).toEqual([]);
      expect(result.byProvider).toEqual([]);
      expect(result.last30Days.length).toBe(30);
    });

    it('should throw error if query fails', async () => {
      mockSupabaseClient.gte.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query error' },
      });

      await expect(getUsageStats()).rejects.toEqual({ message: 'Query error' });
    });
  });
});
