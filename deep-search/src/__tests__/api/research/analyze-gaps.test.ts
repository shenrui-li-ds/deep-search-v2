/**
 * @jest-environment node
 */
import { POST } from '@/app/api/research/analyze-gaps/route';
import { NextRequest } from 'next/server';

// Mock the api-utils module
jest.mock('@/lib/api-utils', () => ({
  callLLM: jest.fn(),
}));

// Mock the prompts module
jest.mock('@/lib/prompts', () => ({
  gapAnalyzerPrompt: jest.fn(() => 'mocked gap analyzer prompt'),
}));

import { callLLM } from '@/lib/api-utils';

const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;

describe('/api/research/analyze-gaps', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockExtractedData = [
    {
      aspect: 'fundamentals',
      keyInsight: 'Quantum computing uses qubits for computation',
      claims: [
        { statement: 'Qubits can exist in superposition' },
        { statement: 'Quantum entanglement enables parallelism' },
      ],
    },
    {
      aspect: 'applications',
      keyInsight: 'QC is useful for cryptography and simulation',
      claims: [
        { statement: 'Shor\'s algorithm can break RSA' },
      ],
    },
  ];

  it('returns 400 if query is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query and extractedData are required');
  });

  it('returns 400 if extractedData is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Query and extractedData are required');
  });

  it('returns gaps when LLM identifies them', async () => {
    const mockGaps = [
      {
        type: 'missing_practical',
        gap: 'Missing practical implementation examples',
        query: 'quantum computing practical implementations 2024',
        importance: 'high',
      },
      {
        type: 'needs_recency',
        gap: 'Need recent developments',
        query: 'quantum computing latest breakthroughs 2024',
        importance: 'medium',
      },
    ];
    mockCallLLM.mockResolvedValueOnce(JSON.stringify(mockGaps));

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
        language: 'English',
        provider: 'deepseek',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGaps).toBe(true);
    expect(data.gaps).toHaveLength(2);
    expect(data.gaps[0].type).toBe('missing_practical');
    expect(data.gaps[1].type).toBe('needs_recency');
  });

  it('returns hasGaps: false when no gaps found', async () => {
    mockCallLLM.mockResolvedValueOnce('[]');

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGaps).toBe(false);
    expect(data.gaps).toHaveLength(0);
  });

  it('limits gaps to maximum of 3', async () => {
    const mockGaps = [
      { type: 'missing_practical', gap: 'Gap 1', query: 'query 1', importance: 'high' },
      { type: 'needs_recency', gap: 'Gap 2', query: 'query 2', importance: 'high' },
      { type: 'missing_comparison', gap: 'Gap 3', query: 'query 3', importance: 'medium' },
      { type: 'missing_expert', gap: 'Gap 4', query: 'query 4', importance: 'medium' },
      { type: 'missing_perspective', gap: 'Gap 5', query: 'query 5', importance: 'medium' },
    ];
    mockCallLLM.mockResolvedValueOnce(JSON.stringify(mockGaps));

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gaps).toHaveLength(3);
  });

  it('handles JSON in markdown code block', async () => {
    const mockGaps = [
      { type: 'missing_practical', gap: 'Gap 1', query: 'query 1', importance: 'high' },
    ];
    mockCallLLM.mockResolvedValueOnce('```json\n' + JSON.stringify(mockGaps) + '\n```');

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGaps).toBe(true);
    expect(data.gaps).toHaveLength(1);
  });

  it('returns empty gaps on parse error (fail-safe)', async () => {
    mockCallLLM.mockResolvedValueOnce('invalid json {not valid}');

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGaps).toBe(false);
    expect(data.gaps).toHaveLength(0);
  });

  it('filters out invalid gap entries', async () => {
    const mockGaps = [
      { type: 'missing_practical', gap: 'Valid gap', query: 'valid query', importance: 'high' },
      { type: 'invalid', gap: 'Missing importance' }, // Invalid - missing importance and query
      { gap: 'Missing type', query: 'query', importance: 'high' }, // Invalid - missing type
    ];
    mockCallLLM.mockResolvedValueOnce(JSON.stringify(mockGaps));

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.gaps).toHaveLength(1);
    expect(data.gaps[0].gap).toBe('Valid gap');
  });

  it('returns empty gaps on LLM error (fail-safe)', async () => {
    mockCallLLM.mockRejectedValueOnce(new Error('LLM error'));

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasGaps).toBe(false);
    expect(data.gaps).toHaveLength(0);
    expect(data.error).toBe('Gap analysis failed, continuing without round 2');
  });

  it('uses low temperature for analytical task', async () => {
    mockCallLLM.mockResolvedValueOnce('[]');

    const request = new NextRequest('http://localhost:3000/api/research/analyze-gaps', {
      method: 'POST',
      body: JSON.stringify({
        query: 'quantum computing',
        extractedData: mockExtractedData,
        provider: 'claude',
      }),
    });

    await POST(request);

    expect(mockCallLLM).toHaveBeenCalledWith(
      expect.any(Array),
      0.4, // Low temperature
      false, // Non-streaming
      'claude'
    );
  });
});
