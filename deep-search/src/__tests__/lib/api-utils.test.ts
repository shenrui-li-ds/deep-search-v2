import {
  OPENAI_API_URL,
  TAVILY_API_URL,
  GOOGLE_SEARCH_API_URL,
  JINA_READER_API_URL,
  callOpenAI,
  callTavily,
  callGoogleSearch,
  callSearchWithFallback,
  extractContentWithJina,
  extractContentsWithJina,
  isGoogleSearchAvailable,
  isJinaApiKeyConfigured,
  formatSearchResultsForSummarization,
  getCurrentDate,
  detectLanguage,
  resetAllCircuitBreakers,
  ChatMessage,
} from '@/lib/api-utils';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset circuit breakers to ensure clean state for each test
    resetAllCircuitBreakers();
    // Mock environment variables
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.TAVILY_API_KEY = 'test-tavily-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.TAVILY_API_KEY;
  });

  describe('Constants', () => {
    it('has correct OpenAI API URL', () => {
      expect(OPENAI_API_URL).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('has correct Tavily API URL', () => {
      expect(TAVILY_API_URL).toBe('https://api.tavily.com/search');
    });
  });

  describe('callOpenAI', () => {
    const mockMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    it('makes request with correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await callOpenAI(mockMessages);

      expect(global.fetch).toHaveBeenCalledWith(
        OPENAI_API_URL,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-openai-key',
          },
        })
      );
    });

    it('uses default model and temperature', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await callOpenAI(mockMessages);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe('gpt-5.2-2025-12-11');
      // GPT-5 family models are reasoning models and don't support custom temperature
      expect(body.temperature).toBeUndefined();
      expect(body.stream).toBe(false);
    });

    it('allows custom model and temperature for supported models', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      // Use gpt-4o which supports temperature
      await callOpenAI(mockMessages, 'gpt-4o', 0.5);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.model).toBe('gpt-4o');
      expect(body.temperature).toBe(0.5);
    });

    it('returns response content for non-streaming requests', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Test response' } }],
        }),
      });

      const result = await callOpenAI(mockMessages);

      // Non-streaming returns LLMResponse object with content and usage
      expect(result).toEqual({ content: 'Test response', usage: undefined });
    });

    it('returns raw response for streaming requests', async () => {
      const mockResponse = { ok: true, body: {} };
      (global.fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await callOpenAI(mockMessages, 'gpt-5.2-2025-12-11', 0.7, true);

      expect(result).toBe(mockResponse);
    });

    it('throws error on API failure', async () => {
      // Mock multiple calls for retry logic
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Invalid API key' },
        }),
      });

      await expect(callOpenAI(mockMessages)).rejects.toThrow(/Invalid API key/);
    });

    it('handles unknown error format', async () => {
      // Mock multiple calls for retry logic
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(callOpenAI(mockMessages)).rejects.toThrow(/Unknown error/);
    });
  });

  describe('callTavily', () => {
    it('makes request with correct body', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await callTavily('test query');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.api_key).toBe('test-tavily-key');
      expect(body.query).toBe('test query');
      expect(body.include_images).toBe(true);
      expect(body.search_depth).toBe('basic');
      expect(body.max_results).toBe(10);
    });

    it('allows custom search options', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await callTavily('test query', false, 'advanced', 20);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArgs.body);

      expect(body.include_images).toBe(false);
      expect(body.search_depth).toBe('advanced');
      expect(body.max_results).toBe(20);
    });

    it('returns search results', async () => {
      const mockResults = {
        results: [{ title: 'Test', url: 'https://test.com' }],
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await callTavily('test query');

      expect(result).toEqual(mockResults);
    });

    it('throws error when API key is missing', async () => {
      delete process.env.TAVILY_API_KEY;

      await expect(callTavily('test query')).rejects.toThrow(
        'TAVILY_API_KEY is not defined in environment variables'
      );
    });

    it('throws error on API failure', async () => {
      // Mock multiple calls for retry logic
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Invalid query' }),
      });

      await expect(callTavily('test query')).rejects.toThrow(/Invalid query/);
    });

    it('handles JSON parse error in error response', async () => {
      // Mock multiple calls for retry logic
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Parse error')),
      });

      await expect(callTavily('test query')).rejects.toThrow(/Internal Server Error/);
    });
  });

  describe('formatSearchResultsForSummarization', () => {
    it('formats search results as XML', () => {
      const searchResults = [
        { title: 'Result 1', url: 'https://example1.com', content: 'Content 1' },
        { title: 'Result 2', url: 'https://example2.com', content: 'Content 2' },
      ];

      const result = formatSearchResultsForSummarization(searchResults);

      expect(result).toContain('<result index="1">');
      expect(result).toContain('<title>Result 1</title>');
      expect(result).toContain('<url>https://example1.com</url>');
      expect(result).toContain('<content>Content 1</content>');
      expect(result).toContain('<result index="2">');
    });

    it('handles empty array', () => {
      const result = formatSearchResultsForSummarization([]);
      expect(result).toBe('');
    });

    it('handles single result', () => {
      const searchResults = [
        { title: 'Only Result', url: 'https://only.com', content: 'Only content' },
      ];

      const result = formatSearchResultsForSummarization(searchResults);

      expect(result).toContain('<result index="1">');
      expect(result).not.toContain('<result index="2">');
    });
  });

  describe('getCurrentDate', () => {
    it('returns formatted date string', () => {
      const result = getCurrentDate();

      // Should contain day of week, month, day number, and year
      expect(result).toMatch(/\w+day, \w+ \d+, \d{4}/);
    });

    it('returns current date', () => {
      const result = getCurrentDate();
      const now = new Date();

      expect(result).toContain(now.getFullYear().toString());
    });
  });

  describe('detectLanguage', () => {
    describe('defaults and edge cases', () => {
      it('returns English for empty string', () => {
        expect(detectLanguage('')).toBe('English');
      });

      it('returns English for whitespace only', () => {
        expect(detectLanguage('   ')).toBe('English');
      });

      it('returns English for null/undefined input', () => {
        expect(detectLanguage(null as unknown as string)).toBe('English');
        expect(detectLanguage(undefined as unknown as string)).toBe('English');
      });
    });

    describe('Chinese detection', () => {
      it('detects Chinese text', () => {
        expect(detectLanguage('什么是量子计算')).toBe('Chinese');
      });

      it('detects Chinese with mixed English words', () => {
        expect(detectLanguage('Python编程入门教程')).toBe('Chinese');
      });

      it('detects simplified Chinese', () => {
        expect(detectLanguage('今天天气很好')).toBe('Chinese');
      });

      it('detects traditional Chinese characters', () => {
        expect(detectLanguage('學習機器學習')).toBe('Chinese');
      });
    });

    describe('Japanese detection', () => {
      it('detects Japanese hiragana', () => {
        expect(detectLanguage('こんにちは')).toBe('Japanese');
      });

      it('detects Japanese katakana', () => {
        expect(detectLanguage('コンピューター')).toBe('Japanese');
      });

      it('detects mixed Japanese text', () => {
        expect(detectLanguage('プログラミングを学ぶ')).toBe('Japanese');
      });
    });

    describe('Korean detection', () => {
      it('detects Korean text', () => {
        expect(detectLanguage('안녕하세요')).toBe('Korean');
      });

      it('detects Korean with English', () => {
        expect(detectLanguage('Python 프로그래밍')).toBe('Korean');
      });
    });

    describe('European language detection', () => {
      it('detects Spanish text', () => {
        expect(detectLanguage('¿Cómo está el tiempo hoy?')).toBe('Spanish');
      });

      it('detects French text with accents', () => {
        expect(detectLanguage('Où est la bibliothèque?')).toBe('French');
      });

      it('detects German text with umlauts', () => {
        expect(detectLanguage('Ich möchte ein Bier für das Frühstück')).toBe('German');
      });
    });

    describe('English detection', () => {
      it('detects English text', () => {
        expect(detectLanguage('What is quantum computing?')).toBe('English');
      });

      it('detects English with numbers', () => {
        expect(detectLanguage('Top 10 programming languages 2024')).toBe('English');
      });

      it('defaults to English for plain ASCII without markers', () => {
        expect(detectLanguage('hello world')).toBe('English');
      });
    });

    describe('Spanish detection edge cases', () => {
      it('detects Spanish with accents', () => {
        expect(detectLanguage('¿Cuándo es la fecha?')).toBe('Spanish');
      });

      it('detects Spanish without accents using common words', () => {
        expect(detectLanguage('Fecha de lanzamiento del producto')).toBe('Spanish');
      });

      it('detects Spanish with suffix patterns', () => {
        expect(detectLanguage('La información está disponible')).toBe('Spanish');
      });
    });
  });

  describe('Constants - Search APIs', () => {
    it('has correct Google Search API URL', () => {
      expect(GOOGLE_SEARCH_API_URL).toBe('https://customsearch.googleapis.com/customsearch/v1');
    });

    it('has correct Jina Reader API URL', () => {
      expect(JINA_READER_API_URL).toBe('https://r.jina.ai');
    });
  });

  describe('isGoogleSearchAvailable', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    });

    it('returns false when no env vars set', () => {
      expect(isGoogleSearchAvailable()).toBe(false);
    });

    it('returns false when only API key is set', () => {
      process.env.GOOGLE_SEARCH_API_KEY = 'test-key';
      expect(isGoogleSearchAvailable()).toBe(false);
    });

    it('returns false when only engine ID is set', () => {
      process.env.GOOGLE_SEARCH_ENGINE_ID = 'test-engine';
      expect(isGoogleSearchAvailable()).toBe(false);
    });

    it('returns true when both are set', () => {
      process.env.GOOGLE_SEARCH_API_KEY = 'test-key';
      process.env.GOOGLE_SEARCH_ENGINE_ID = 'test-engine';
      expect(isGoogleSearchAvailable()).toBe(true);
    });
  });

  describe('isJinaApiKeyConfigured', () => {
    beforeEach(() => {
      delete process.env.JINA_API_KEY;
    });

    it('returns false when JINA_API_KEY is not set', () => {
      expect(isJinaApiKeyConfigured()).toBe(false);
    });

    it('returns true when JINA_API_KEY is set', () => {
      process.env.JINA_API_KEY = 'test-jina-key';
      expect(isJinaApiKeyConfigured()).toBe(true);
    });
  });

  describe('extractContentWithJina', () => {
    beforeEach(() => {
      delete process.env.JINA_API_KEY;
    });

    it('extracts content from URL', async () => {
      const mockContent = '# Test Page\n\nThis is the extracted content.';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockContent),
      });

      const result = await extractContentWithJina('https://example.com/page');

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com/page');
      expect(result.content).toBe(mockContent);
    });

    it('includes API key in header when configured', async () => {
      process.env.JINA_API_KEY = 'test-jina-key';
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('content'),
      });

      await extractContentWithJina('https://example.com');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jina-key',
          }),
        })
      );
    });

    it('does not include Authorization header without API key', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('content'),
      });

      await extractContentWithJina('https://example.com');

      const callArgs = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBeUndefined();
    });

    it('returns failure on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await extractContentWithJina('https://example.com/notfound');

      expect(result.success).toBe(false);
      expect(result.content).toBe('');
    });

    it('truncates content over 8000 characters', async () => {
      const longContent = 'a'.repeat(10000);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(longContent),
      });

      const result = await extractContentWithJina('https://example.com');

      expect(result.content.length).toBe(8000);
    });

    it('returns failure on timeout', async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        })
      );

      const result = await extractContentWithJina('https://example.com', 100);

      expect(result.success).toBe(false);
      expect(result.content).toBe('');
    });
  });

  describe('extractContentsWithJina', () => {
    it('extracts content from multiple URLs in parallel', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('Content 1') })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('Content 2') });

      const urls = ['https://example1.com', 'https://example2.com'];
      const results = await extractContentsWithJina(urls);

      expect(results.size).toBe(2);
      expect(results.get('https://example1.com')).toBe('Content 1');
      expect(results.get('https://example2.com')).toBe('Content 2');
    });

    it('handles partial failures gracefully', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('Content 1') })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const urls = ['https://success.com', 'https://fail.com'];
      const results = await extractContentsWithJina(urls);

      expect(results.size).toBe(1);
      expect(results.get('https://success.com')).toBe('Content 1');
      expect(results.has('https://fail.com')).toBe(false);
    });

    it('returns empty map for empty URL list', async () => {
      const results = await extractContentsWithJina([]);
      expect(results.size).toBe(0);
    });
  });

  describe('callGoogleSearch', () => {
    beforeEach(() => {
      resetAllCircuitBreakers();
      process.env.GOOGLE_SEARCH_API_KEY = 'test-google-key';
      process.env.GOOGLE_SEARCH_ENGINE_ID = 'test-engine-id';
    });

    afterEach(() => {
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    });

    it('throws error when API key is missing', async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY;

      await expect(callGoogleSearch('test query')).rejects.toThrow(
        'GOOGLE_SEARCH_API_KEY is not defined'
      );
    });

    it('throws error when engine ID is missing', async () => {
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;

      await expect(callGoogleSearch('test query')).rejects.toThrow(
        'GOOGLE_SEARCH_ENGINE_ID is not defined'
      );
    });

    it('makes request with correct parameters', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        });

      await callGoogleSearch('test query', 5, false);

      const url = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(url).toContain('key=test-google-key');
      expect(url).toContain('cx=test-engine-id');
      expect(url).toContain('q=test+query');
      expect(url).toContain('num=5');
    });

    it('converts Google results to Tavily format', async () => {
      const mockGoogleResults = {
        items: [
          {
            title: 'Test Result',
            link: 'https://example.com',
            snippet: 'This is a test snippet',
            displayLink: 'example.com',
          },
        ],
      };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGoogleResults),
        });

      const result = await callGoogleSearch('test', 10, false);

      expect(result.query).toBe('test');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test Result');
      expect(result.results[0].url).toBe('https://example.com');
      expect(result.results[0].content).toBe('This is a test snippet');
      expect(result.search_context?.retrieved_from).toBe('google');
    });

    it('extracts content with Jina when extractContent is true', async () => {
      const mockGoogleResults = {
        items: [
          { title: 'Test', link: 'https://example.com', snippet: 'Short snippet', displayLink: 'example.com' },
        ],
      };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGoogleResults),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('Full extracted content from Jina'),
        });

      const result = await callGoogleSearch('test', 10, true);

      expect(result.results[0].content).toBe('Full extracted content from Jina');
      expect(result.search_context?.content_extraction).toBe('jina');
    });

    it('falls back to snippet when Jina extraction fails', async () => {
      const mockGoogleResults = {
        items: [
          { title: 'Test', link: 'https://example.com', snippet: 'Fallback snippet', displayLink: 'example.com' },
        ],
      };
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGoogleResults),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const result = await callGoogleSearch('test', 10, true);

      expect(result.results[0].content).toBe('Fallback snippet');
    });
  });

  describe('callSearchWithFallback', () => {
    beforeEach(() => {
      // Reset circuit breakers to ensure clean state
      resetAllCircuitBreakers();
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.GOOGLE_SEARCH_API_KEY = 'test-google-key';
      process.env.GOOGLE_SEARCH_ENGINE_ID = 'test-engine-id';
    });

    afterEach(() => {
      delete process.env.TAVILY_API_KEY;
      delete process.env.GOOGLE_SEARCH_API_KEY;
      delete process.env.GOOGLE_SEARCH_ENGINE_ID;
    });

    it('uses Tavily as primary provider when available', async () => {
      const mockTavilyResults = { query: 'test', results: [{ title: 'Tavily Result', url: 'https://tavily.com', content: 'content' }] };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTavilyResults),
      });

      const result = await callSearchWithFallback('test query');

      expect(result.provider).toBe('tavily');
      expect(result.results.results[0].title).toBe('Tavily Result');
    });

    // Note: Full fallback testing is complex due to circuit breaker + retry logic
    // Those integration scenarios are better tested in e2e tests
    it('returns results with provider info', async () => {
      const mockResults = { query: 'test', results: [{ title: 'Result', url: 'https://test.com', content: 'content' }] };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResults),
      });

      const result = await callSearchWithFallback('test query');

      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('results');
      expect(result.results).toHaveProperty('query');
      expect(result.results).toHaveProperty('results');
    });
  });
});
