/**
 * @jest-environment node
 */
import { POST } from '@/app/api/related-searches/route';
import { NextRequest } from 'next/server';

// Mock the api-utils module
jest.mock('@/lib/api-utils', () => ({
  callLLM: jest.fn(),
}));

// Mock the prompts module
jest.mock('@/lib/prompts', () => ({
  generateRelatedSearchesPrompt: jest.fn(() => 'mocked prompt'),
}));

import { callLLM } from '@/lib/api-utils';

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('/api/related-searches', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 if query is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query parameter is required and must be a string');
  });

  it('returns related searches on success', async () => {
    const mockLLMResponse = JSON.stringify([
      { query: 'Related query 1' },
      { query: 'Related query 2' },
      { query: 'Related query 3' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test query',
        content: 'Some content about the topic',
        provider: 'deepseek',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedSearches).toEqual([
      'Related query 1',
      'Related query 2',
      'Related query 3',
    ]);
  });

  it('handles LLM response with markdown code blocks', async () => {
    const mockLLMResponse = '```json\n[{"query": "Query 1"}, {"query": "Query 2"}]\n```';

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedSearches).toEqual(['Query 1', 'Query 2']);
  });

  it('returns empty array on invalid JSON response', async () => {
    mockCallLLM.mockResolvedValueOnce('invalid json');

    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedSearches).toEqual([]);
  });

  it('limits results to 6 queries', async () => {
    const mockLLMResponse = JSON.stringify([
      { query: 'Query 1' },
      { query: 'Query 2' },
      { query: 'Query 3' },
      { query: 'Query 4' },
      { query: 'Query 5' },
      { query: 'Query 6' },
      { query: 'Query 7' },
      { query: 'Query 8' },
    ]);

    mockCallLLM.mockResolvedValueOnce(mockLLMResponse);

    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.relatedSearches).toHaveLength(6);
  });

  it('returns 500 on LLM error', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('LLM error'));

    const request = new NextRequest('http://localhost:3000/api/related-searches', {
      method: 'POST',
      body: JSON.stringify({
        query: 'Test query',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to generate related searches');
  });
});
