/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

// Mock the callLLM function
const mockCallLLM = jest.fn();

jest.mock('@/lib/api-utils', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
  detectLanguage: jest.fn(() => 'English'),
}));

// Mock the usage-tracking module
jest.mock('@/lib/supabase/usage-tracking', () => ({
  trackServerApiUsage: jest.fn(() => Promise.resolve()),
  estimateTokens: jest.fn(() => 100),
}));

// Import after mocking
import { POST } from '@/app/api/research/extract/route';

describe('/api/research/extract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAspectResult = {
    aspect: 'fundamentals',
    query: 'what is quantum computing',
    results: [
      {
        title: 'Quantum Computing Basics',
        url: 'https://example.com/quantum',
        content: 'Quantum computers use qubits which can exist in superposition.',
      },
      {
        title: 'Understanding Qubits',
        url: 'https://example.com/qubits',
        content: 'Unlike classical bits, qubits can be 0 and 1 simultaneously.',
      },
    ],
  };

  const mockGlobalSourceIndex = {
    'https://example.com/quantum': 1,
    'https://example.com/qubits': 2,
  };

  describe('successful extraction', () => {
    it('should extract structured knowledge from search results', async () => {
      const mockExtraction = {
        aspect: 'fundamentals',
        claims: [
          {
            statement: 'Quantum computers use qubits',
            sources: [1],
            confidence: 'established',
          },
        ],
        statistics: [],
        definitions: [
          {
            term: 'Qubit',
            definition: 'A quantum bit that can exist in superposition',
            source: 2,
          },
        ],
        expertOpinions: [],
        contradictions: [],
        keyInsight: 'Quantum computers leverage superposition for parallel computation',
      };

      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify(mockExtraction) });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'quantum computing',
          aspectResult: mockAspectResult,
          globalSourceIndex: mockGlobalSourceIndex,
          provider: 'deepseek',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extraction).toBeDefined();
      expect(data.extraction.aspect).toBe('fundamentals');
      expect(data.extraction.claims).toHaveLength(1);
      expect(data.extraction.definitions).toHaveLength(1);
      expect(data.extraction.keyInsight).toBeTruthy();
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockExtraction = {
        aspect: 'fundamentals',
        claims: [{ statement: 'Test claim', sources: [1], confidence: 'established' }],
        statistics: [],
        definitions: [],
        expertOpinions: [],
        contradictions: [],
        keyInsight: 'Test insight',
      };

      mockCallLLM.mockResolvedValueOnce({ content: '```json\n' + JSON.stringify(mockExtraction) + '\n```' });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          aspectResult: mockAspectResult,
          globalSourceIndex: mockGlobalSourceIndex,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extraction.aspect).toBe('fundamentals');
      expect(data.extraction.claims).toHaveLength(1);
    });

    it('should use low temperature for factual extraction', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify({
        aspect: 'fundamentals',
        claims: [],
        statistics: [],
        definitions: [],
        expertOpinions: [],
        contradictions: [],
        keyInsight: 'Test',
      }) });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test',
          aspectResult: mockAspectResult,
          globalSourceIndex: mockGlobalSourceIndex,
        }),
      });

      await POST(request);

      // Verify callLLM was called with low temperature (0.3)
      expect(mockCallLLM).toHaveBeenCalledWith(
        expect.any(Array),
        0.3, // Low temperature for factual extraction
        false,
        undefined
      );
    });
  });

  describe('error handling', () => {
    it('should return 400 for missing query', async () => {
      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          aspectResult: mockAspectResult,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should return 400 for missing aspectResult', async () => {
      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('should return minimal extraction on JSON parse error', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: 'invalid json response' });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          aspectResult: mockAspectResult,
          globalSourceIndex: mockGlobalSourceIndex,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.extraction.aspect).toBe('fundamentals');
      expect(data.extraction.claims).toEqual([]);
      expect(data.extraction.keyInsight).toBe('Extraction failed - using raw data');
    });

    it('should handle LLM errors gracefully', async () => {
      mockCallLLM.mockRejectedValueOnce(new Error('LLM API error'));

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test query',
          aspectResult: mockAspectResult,
          globalSourceIndex: mockGlobalSourceIndex,
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to extract research data');
    });
  });

  describe('source index handling', () => {
    it('should maintain global source index across extractions', async () => {
      mockCallLLM.mockResolvedValueOnce({ content: JSON.stringify({
        aspect: 'fundamentals',
        claims: [],
        statistics: [],
        definitions: [],
        expertOpinions: [],
        contradictions: [],
        keyInsight: 'Test',
      }) });

      const request = new NextRequest('http://localhost/api/research/extract', {
        method: 'POST',
        body: JSON.stringify({
          query: 'test',
          aspectResult: mockAspectResult,
          globalSourceIndex: { 'https://existing.com': 5 },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.updatedSourceIndex).toBeDefined();
      // The existing index should be preserved
      expect(data.updatedSourceIndex['https://existing.com']).toBe(5);
    });
  });
});
