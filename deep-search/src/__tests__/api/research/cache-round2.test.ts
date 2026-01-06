/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/research/cache-round2/route';
import { NextRequest } from 'next/server';

// Mock the cache module
jest.mock('@/lib/cache', () => ({
  generateCacheKey: jest.fn((type, params) => `${type}:${params.query}:${params.round1ExtractionsHash}:${params.provider}`),
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

describe('/api/research/cache-round2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRound2Data = {
    gaps: [
      {
        type: 'missing_practical' as const,
        gap: 'No real-world implementation examples found',
        query: 'quantum computing practical implementations 2024',
        importance: 'high' as const,
      },
      {
        type: 'missing_expert' as const,
        gap: 'Limited expert opinions on future developments',
        query: 'quantum computing experts predictions',
        importance: 'medium' as const,
      },
    ],
    extractions: [
      {
        aspect: 'gap_missing_practical',
        keyInsight: 'IBM and Google have deployed quantum computers commercially',
        claims: [{ statement: 'IBM has 100+ qubit systems', sources: [5], confidence: 'established' }],
      },
    ],
    sources: [
      { id: 's5', url: 'https://example.com/5', title: 'Quantum Implementations', iconUrl: '', snippet: 'Real-world examples' },
    ],
    images: [],
    tavilyQueryCount: 2,
  };

  const mockR1ExtractionsHash = 'abc12345';

  describe('GET', () => {
    it('returns 400 if query parameter is missing', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/research/cache-round2?round1ExtractionsHash=${mockR1ExtractionsHash}`
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query parameter required');
    });

    it('returns 400 if round1ExtractionsHash parameter is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/research/cache-round2?query=quantum%20computing'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('round1ExtractionsHash parameter required');
    });

    it('returns cached: true with data on cache hit', async () => {
      mockGetFromCache.mockResolvedValueOnce({
        data: mockRound2Data,
        source: 'supabase',
      });

      const request = new NextRequest(
        `http://localhost:3000/api/research/cache-round2?query=quantum%20computing&provider=deepseek&round1ExtractionsHash=${mockR1ExtractionsHash}`
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(true);
      expect(data.data).toEqual(mockRound2Data);
      expect(data.source).toBe('supabase');
    });

    it('returns cached: false on cache miss', async () => {
      mockGetFromCache.mockResolvedValueOnce({
        data: null,
        source: 'miss',
      });

      const request = new NextRequest(
        `http://localhost:3000/api/research/cache-round2?query=quantum%20computing&provider=deepseek&round1ExtractionsHash=${mockR1ExtractionsHash}`
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
        `http://localhost:3000/api/research/cache-round2?query=quantum%20computing&round1ExtractionsHash=${mockR1ExtractionsHash}`
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
        `http://localhost:3000/api/research/cache-round2?query=quantum%20computing&round1ExtractionsHash=${mockR1ExtractionsHash}`
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
      const request = new NextRequest('http://localhost:3000/api/research/cache-round2', {
        method: 'POST',
        body: JSON.stringify({
          round1ExtractionsHash: mockR1ExtractionsHash,
          data: mockRound2Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query and data required');
    });

    it('returns 400 if data is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/research/cache-round2', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          round1ExtractionsHash: mockR1ExtractionsHash,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Query and data required');
    });

    it('returns 400 if round1ExtractionsHash is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/research/cache-round2', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          data: mockRound2Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('round1ExtractionsHash required');
    });

    it('saves data to cache successfully', async () => {
      mockSetToCache.mockResolvedValueOnce();

      const request = new NextRequest('http://localhost:3000/api/research/cache-round2', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          provider: 'claude',
          round1ExtractionsHash: mockR1ExtractionsHash,
          data: mockRound2Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSetToCache).toHaveBeenCalledWith(
        expect.any(String),
        'round2-data',
        'quantum computing',
        mockRound2Data,
        'claude',
        expect.anything()
      );
    });

    it('returns 500 on cache save error', async () => {
      mockSetToCache.mockRejectedValueOnce(new Error('Cache save error'));

      const request = new NextRequest('http://localhost:3000/api/research/cache-round2', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          round1ExtractionsHash: mockR1ExtractionsHash,
          data: mockRound2Data,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Cache save failed');
    });
  });
});
