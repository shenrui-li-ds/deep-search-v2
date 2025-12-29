/**
 * @jest-environment node
 */
import { POST } from '@/app/api/research/plan/route';
import { NextRequest } from 'next/server';

// Mock the api-utils module
jest.mock('@/lib/api-utils', () => ({
  callLLM: jest.fn(),
  getCurrentDate: jest.fn(() => 'Friday, December 27, 2024'),
}));

// Mock the prompts module
jest.mock('@/lib/prompts', () => ({
  researchPlannerPrompt: jest.fn(() => 'mocked planner prompt'),
}));

// Mock the cache module
jest.mock('@/lib/cache', () => ({
  generateCacheKey: jest.fn(() => 'mock-cache-key'),
  getFromCache: jest.fn(() => Promise.resolve({ data: null, source: 'miss' })),
  setToCache: jest.fn(() => Promise.resolve()),
}));

// Mock Supabase server client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(null)),
}));

import { callLLM } from '@/lib/api-utils';

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('/api/research/plan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 if query is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query parameter is required');
  });

  it('returns research plan on success', async () => {
    const mockLLMResponse = JSON.stringify([
      { aspect: 'fundamentals', query: 'what is quantum computing explained' },
      { aspect: 'applications', query: 'quantum computing real world applications' },
      { aspect: 'comparison', query: 'quantum vs classical computing differences' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        provider: 'deepseek',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.originalQuery).toBe('quantum computing');
    expect(data.plan).toHaveLength(3);
    expect(data.plan[0]).toEqual({
      aspect: 'fundamentals',
      query: 'what is quantum computing explained',
    });
  });

  it('handles LLM response with markdown code blocks', async () => {
    const mockLLMResponse = '```json\n[{"aspect": "basics", "query": "intro to AI"}]\n```';

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'artificial intelligence',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toEqual([{ aspect: 'basics', query: 'intro to AI' }]);
  });

  it('falls back to original query on invalid JSON response', async () => {
    mockCallLLM.mockResolvedValueOnce('invalid json');

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'machine learning',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toEqual([{ aspect: 'general', query: 'machine learning' }]);
  });

  it('limits plan to 4 queries maximum', async () => {
    const mockLLMResponse = JSON.stringify([
      { aspect: 'aspect1', query: 'query 1' },
      { aspect: 'aspect2', query: 'query 2' },
      { aspect: 'aspect3', query: 'query 3' },
      { aspect: 'aspect4', query: 'query 4' },
      { aspect: 'aspect5', query: 'query 5' },
      { aspect: 'aspect6', query: 'query 6' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toHaveLength(4);
  });

  it('filters out items without aspect or query', async () => {
    const mockLLMResponse = JSON.stringify([
      { aspect: 'valid', query: 'valid query' },
      { aspect: '', query: 'missing aspect' },
      { aspect: 'missing query', query: '' },
      { query: 'no aspect field' },
      { aspect: 'no query field' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.plan).toHaveLength(1);
    expect(data.plan[0]).toEqual({ aspect: 'valid', query: 'valid query' });
  });

  it('returns 500 on LLM error', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('LLM error'));

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to create research plan');
  });

  it('passes provider to callLLM', async () => {
    const mockLLMResponse = JSON.stringify([
      { aspect: 'test', query: 'test query' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/research/plan', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        provider: 'openai',
      }),
    });

    await POST(request);

    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.any(Array),
      0.7,
      false,
      'openai'
    );
  });
});
