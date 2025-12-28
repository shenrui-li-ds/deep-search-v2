/**
 * @jest-environment node
 */

// Mock the Supabase client before importing
const mockUser = { id: 'test-user-id', email: 'test@example.com' };

const mockSupabaseClient = {
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: mockUser } }),
  },
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
};

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
  getUserLimits,
  canPerformSearch,
} from '@/lib/supabase/database';

describe('Supabase Database Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockSupabaseClient.auth.getUser.mockResolvedValue({ data: { user: mockUser } });
  });

  describe('addSearchToHistory', () => {
    it('should add a search entry to history', async () => {
      const entry = {
        query: 'test query',
        provider: 'deepseek',
        mode: 'web' as const,
        sources_count: 10,
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: { id: 'new-id', ...entry, user_id: mockUser.id },
        error: null,
      });

      const result = await addSearchToHistory(entry);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('search_history');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        ...entry,
        user_id: mockUser.id,
      });
      expect(result).toEqual({ id: 'new-id', ...entry, user_id: mockUser.id });
    });

    it('should return null if no user is logged in', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

      const result = await addSearchToHistory({
        query: 'test',
        provider: 'deepseek',
        mode: 'web',
        sources_count: 5,
      });

      expect(result).toBeNull();
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
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

  describe('getUserLimits', () => {
    it('should return user limits', async () => {
      const mockLimits = {
        user_id: mockUser.id,
        daily_search_limit: 50,
        daily_searches_used: 10,
        monthly_token_limit: 500000,
        monthly_tokens_used: 50000,
        last_reset_date: '2024-01-15',
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
        monthly_token_limit: 500000,
        monthly_tokens_used: 100000,
        last_reset_date: new Date().toISOString().split('T')[0], // Today
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
        monthly_token_limit: 500000,
        monthly_tokens_used: 500000, // At limit
        last_reset_date: new Date().toISOString().split('T')[0],
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
        monthly_token_limit: 500000,
        monthly_tokens_used: 100000,
        last_reset_date: new Date().toISOString().split('T')[0],
      };

      mockSupabaseClient.single.mockResolvedValueOnce({
        data: mockLimits,
        error: null,
      });

      const result = await canPerformSearch();

      expect(result).toEqual({ allowed: true });
    });
  });
});
