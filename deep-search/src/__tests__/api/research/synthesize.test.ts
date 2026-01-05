/**
 * @jest-environment node
 */
import { POST } from '@/app/api/research/synthesize/route';
import { NextRequest } from 'next/server';

// Mock the api-utils module
jest.mock('@/lib/api-utils', () => ({
  callLLM: jest.fn(),
  getCurrentDate: jest.fn(() => 'Friday, December 27, 2024'),
  getStreamParser: jest.fn(() => async function* mockStreamParser() {
    yield 'Chunk 1';
    yield 'Chunk 2';
  }),
  detectLanguage: jest.fn(() => 'English'),
}));

// Mock the prompts module
jest.mock('@/lib/prompts', () => ({
  researchSynthesizerPrompt: jest.fn(() => 'mocked synthesizer prompt'),
}));

// Mock the cache module
jest.mock('@/lib/cache', () => ({
  generateCacheKey: jest.fn(() => 'test-cache-key'),
  getFromCache: jest.fn(() => Promise.resolve({ data: null, source: 'miss' })),
  setToCache: jest.fn(() => Promise.resolve()),
}));

// Mock the supabase server module
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve({})),
}));

import { callLLM } from '@/lib/api-utils';
import { getFromCache } from '@/lib/cache';

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;
const mockGetFromCache = getFromCache as jest.MockedFunction<typeof getFromCache>;

describe('/api/research/synthesize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: cache miss
    mockGetFromCache.mockResolvedValue({ data: null, source: 'miss' });
  });

  const mockAspectResults = [
    {
      aspect: 'fundamentals',
      query: 'what is quantum computing',
      results: [
        { title: 'Quantum Basics', url: 'https://example.com/1', content: 'Quantum computing uses qubits.' },
        { title: 'Quantum 101', url: 'https://example.com/2', content: 'Unlike classical bits...' },
      ],
    },
    {
      aspect: 'applications',
      query: 'quantum computing applications',
      results: [
        { title: 'QC Applications', url: 'https://example.com/3', content: 'Drug discovery and optimization.' },
      ],
    },
  ];

  it('returns 400 if query is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        aspectResults: mockAspectResults,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query and either extractedData or aspectResults parameters are required');
  });

  it('returns 400 if aspectResults is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query and either extractedData or aspectResults parameters are required');
  });

  it('returns 400 if aspectResults is not an array', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        aspectResults: 'not an array',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query and either extractedData or aspectResults parameters are required');
  });

  it('returns synthesis on success (non-streaming)', async () => {
    const mockSynthesis = '## Research Summary\n\nQuantum computing is a revolutionary technology...';
    mockCallLLM.mockResolvedValueOnce(mockSynthesis);

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        aspectResults: mockAspectResults,
        stream: false,
        provider: 'deepseek',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synthesis).toBe(mockSynthesis);
  });

  it('returns streaming response when stream=true', async () => {
    // Create a mock response object that looks like what callLLM returns for streaming
    const mockStreamResponse = {
      ok: true,
      body: new ReadableStream(),
    };
    mockCallLLM.mockResolvedValueOnce(mockStreamResponse as unknown as string);

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        aspectResults: mockAspectResults,
        stream: true,
      }),
    });

    const response = await POST(request);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('passes provider to callLLM', async () => {
    mockCallLLM.mockResolvedValueOnce('Synthesis result');

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        aspectResults: mockAspectResults,
        stream: false,
        provider: 'claude',
      }),
    });

    await POST(request);

    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.any(Array),
      0.7,
      false,
      'claude'
    );
  });

  it('returns 500 on LLM error', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('LLM error'));

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        aspectResults: mockAspectResults,
        stream: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to synthesize research results');
  });

  it('includes aspect information in formatted results', async () => {
    mockCallLLM.mockResolvedValueOnce('Synthesis result');

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        aspectResults: mockAspectResults,
        stream: false,
      }),
    });

    await POST(request);

    // Check that callLLM was called with messages containing aspect information
    const callArgs = mockCallLLM.mock.calls[0];
    const messages = callArgs[0] as { role: string; content: string }[];
    const userMessage = messages.find(m => m.role === 'user');

    expect(userMessage?.content).toContain('researchAspect name="fundamentals"');
    expect(userMessage?.content).toContain('researchAspect name="applications"');
    expect(userMessage?.content).toContain('2 different research angles');
  });

  it('assigns consistent global source indices', async () => {
    mockCallLLM.mockResolvedValueOnce('Synthesis result');

    const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        query: 'test query',
        aspectResults: mockAspectResults,
        stream: false,
      }),
    });

    await POST(request);

    const callArgs = mockCallLLM.mock.calls[0];
    const messages = callArgs[0] as { role: string; content: string }[];
    const userMessage = messages.find(m => m.role === 'user');

    // Check that source indices are sequential
    expect(userMessage?.content).toContain('source index="1"');
    expect(userMessage?.content).toContain('source index="2"');
    expect(userMessage?.content).toContain('source index="3"');
  });

  describe('caching', () => {
    it('returns cached content without calling LLM (non-streaming)', async () => {
      const cachedContent = '## Cached Research Summary\n\nThis is cached content.';
      mockGetFromCache.mockResolvedValueOnce({
        data: { content: cachedContent },
        source: 'supabase',
      });

      const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          aspectResults: mockAspectResults,
          stream: false,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synthesis).toBe(cachedContent);
      expect(data.cached).toBe(true);
      expect(mockCallLLM).not.toHaveBeenCalled();
    });

    it('returns cached content as SSE stream (streaming)', async () => {
      const cachedContent = '## Cached Research Summary\n\nThis is cached content.';
      mockGetFromCache.mockResolvedValueOnce({
        data: { content: cachedContent },
        source: 'memory',
      });

      const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          aspectResults: mockAspectResults,
          stream: true,
        }),
      });

      const response = await POST(request);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(mockCallLLM).not.toHaveBeenCalled();

      // Read the stream to verify content
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullContent += decoder.decode(value);
        }
      }

      // Should contain cached content (JSON-escaped in SSE) and cached: true flag
      expect(fullContent).toContain('Cached Research Summary');
      expect(fullContent).toContain('This is cached content');
      expect(fullContent).toContain('"cached":true');
    });

    it('calls LLM on cache miss', async () => {
      mockGetFromCache.mockResolvedValueOnce({ data: null, source: 'miss' });
      mockCallLLM.mockResolvedValueOnce('Fresh synthesis result');

      const request = new NextRequest('http://localhost:3000/api/research/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          aspectResults: mockAspectResults,
          stream: false,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.synthesis).toBe('Fresh synthesis result');
      expect(mockCallLLM).toHaveBeenCalled();
    });
  });
});
