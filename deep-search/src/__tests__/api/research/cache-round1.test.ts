/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/research/cache-round1/route';
import { NextRequest } from 'next/server';

// Mock the cache module
jest.mock('@/lib/cache', () => ({
  generateCacheKey: jest.fn((type, params) => `${type}:${params.query}:${params.provider}`),
  getFromCache: jest.fn(),
  setToCache: jest.fn(() => Promise.resolve()),
}));

// Mock the supabase server module
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve({})),
}));

import { getFromCache, setToCache } from '@/lib/cache';

const mockGetFromCache = getFromCache as jest.MockedFunction<typeof getFromCache>;
const mockSetToCache = setToCache as jest.MockedFunction<typeof setToCache>;

describe('/api/research/cache-round1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRound1Data = {
    plan: [
      { aspect: 'fundamentals', query: 'quantum computing basics' },
      { aspect: 'applications', query: 'quantum computing applications' },
    ],
    queryType: 'technical',
    suggestedDepth: 'deep' as const,
    extractions: [
      {
        aspect: 'fundamentals',
        keyInsight: 'Quantum computing uses qubits',
        claims: [{ statement: 'Qubits can be in superposition', sources: [1], confidence: 'established' }],
      },
    ],
    sources: [
      { id: 's1', url: 'https://example.com/1', title: 'Quantum Basics', iconUrl: '', snippet: 'Basic info' },
    ],
    images: [],
    globalSourceIndex: { 'https://example.com/1': 1 },
    tavilyQueryCount: 3,
  };

  describe('GET', () => {
    it('returns 400 if query parameter is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/research/cache-round1');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter required');
    });

    it('returns cached: true with data on cache hit', async () => {
      mockGetFromCache.mockResolvedValueOnce({
        data: mockRound1Data,
        source: 'supabase',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/research/cache-round1?query=quantum%20computing&provider=deepseek'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(true);
      expect(data.data).toEqual(mockRound1Data);
      expect(data.source).toBe('supabase');
    });

    it('returns cached: false on cache miss', async () => {
      mockGetFromCache.mockResolvedValueOnce({
        data: null,
        source: 'miss',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/research/cache-round1?query=quantum%20computing&provider=deepseek'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(false);
    });

    it('uses default provider when not specified', async () => {
      mockGetFromCache.mockResolvedValueOnce({
        data: null,
        source: 'miss',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/research/cache-round1?query=quantum%20computing'
      );

      await GET(request);

      expect(mockGetFromCache).toHaveBeenCalledWith(
        expect.stringContaining(':default'),
        expect.anything()
      );
    });

    it('handles cache check errors gracefully', async () => {
      mockGetFromCache.mockRejectedValueOnce(new Error('Cache error'));

      const request = new NextRequest(
        'http://localhost:3000/api/research/cache-round1?query=quantum%20computing'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(false);
      expect(data.error).toBe('Cache check failed');
    });
  });

  describe('POST', () => {
    it('returns 400 if query is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/research/cache-round1', {
        method: 'POST',
        body: JSON.stringify({
          data: mockRound1Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query and data required');
    });

    it('returns 400 if data is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/research/cache-round1', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query and data required');
    });

    it('saves data to cache successfully', async () => {
      mockSetToCache.mockResolvedValueOnce();

      const request = new NextRequest('http://localhost:3000/api/research/cache-round1', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          provider: 'claude',
          data: mockRound1Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSetToCache).toHaveBeenCalledWith(
        expect.any(String),
        'round1-extractions',
        'quantum computing',
        mockRound1Data,
        'claude',
        expect.anything()
      );
    });

    it('returns 500 on cache save error', async () => {
      mockSetToCache.mockRejectedValueOnce(new Error('Cache save error'));

      const request = new NextRequest('http://localhost:3000/api/research/cache-round1', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          data: mockRound1Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Cache save failed');
    });
  });
});
